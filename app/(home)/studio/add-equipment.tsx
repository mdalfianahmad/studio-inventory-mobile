import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, TextInput, ScrollView, Alert, Image, ActivityIndicator, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { ArrowLeft, Camera, X, Info, Merge } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

const CATEGORIES = ['Camera', 'Lens', 'Lighting', 'Audio', 'Tripod', 'Accessory', 'Other'];

interface SimilarEquipment {
    id: string;
    name: string;
    category: string;
    total_quantity: number;
    available_quantity: number;
    photo_url: string | null;
}

export default function AddEquipmentScreen() {
    const { studioId } = useLocalSearchParams();
    const router = useRouter();
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [photoUri, setPhotoUri] = useState<string | null>(null);
    const [similarEquipment, setSimilarEquipment] = useState<SimilarEquipment[]>([]);
    const [showMergeModal, setShowMergeModal] = useState(false);
    const [selectedMergeTarget, setSelectedMergeTarget] = useState<SimilarEquipment | null>(null);

    const [form, setForm] = useState({
        name: '',
        category: 'Camera',
        quantity: '1',
        sku: '',
        notes: ''
    });

    // Search for similar equipment when name changes
    const searchSimilarEquipment = useCallback(async (searchName: string) => {
        if (searchName.trim().length < 3) {
            setSimilarEquipment([]);
            return;
        }

        try {
            const { data } = await supabase
                .from('equipment')
                .select('id, name, category, total_quantity, available_quantity, photo_url')
                .eq('studio_id', studioId)
                .ilike('name', `%${searchName.trim()}%`)
                .limit(5);

            setSimilarEquipment(data || []);
        } catch (e) {
            console.log('Search error:', e);
        }
    }, [studioId]);

    useEffect(() => {
        const timer = setTimeout(() => {
            searchSimilarEquipment(form.name);
        }, 300); // Debounce search

        return () => clearTimeout(timer);
    }, [form.name, searchSimilarEquipment]);

    const handlePickImage = async () => {
        // Request media library permission first
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert(
                'Permission Required',
                'Please allow photo library access in your device settings.',
                [{ text: 'OK' }]
            );
            return;
        }

        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                quality: 0.8,
                allowsEditing: true,
                aspect: [4, 3],
            });

            if (!result.canceled) {
                setPhotoUri(result.assets[0].uri);
            }
        } catch (e: any) {
            Alert.alert('Error', 'Failed to open gallery. Please try again.');
        }
    };

    const handleTakePhoto = async () => {
        // Request camera permission first
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert(
                'Camera Permission Required',
                'Please allow camera access in your device settings to take photos.',
                [{ text: 'OK' }]
            );
            return;
        }

        try {
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                quality: 0.8,
                allowsEditing: true,
                aspect: [4, 3],
            });

            if (!result.canceled) {
                setPhotoUri(result.assets[0].uri);
            }
        } catch (e: any) {
            Alert.alert('Error', 'Failed to open camera. Please try again.');
        }
    };

    const handleSubmit = async () => {
        if (!form.name.trim()) {
            Alert.alert('Error', 'Please enter equipment name');
            return;
        }

        if (!photoUri) {
            Alert.alert('Error', 'Please add a photo');
            return;
        }

        setLoading(true);

        try {
            // 1. Upload photo
            const response = await fetch(photoUri);
            const blob = await response.blob();
            const fileExt = 'jpg';
            const fileName = `${studioId}/${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('equipment-photos')
                .upload(fileName, blob);

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from('equipment-photos')
                .getPublicUrl(fileName);

            const photoUrl = urlData.publicUrl;

            // 2. Create equipment record
            const quantity = parseInt(form.quantity) || 1;
            const { data: equipment, error: equipError } = await supabase
                .from('equipment')
                .insert({
                    studio_id: studioId,
                    name: form.name.trim(),
                    category: form.category,
                    total_quantity: quantity,
                    available_quantity: quantity,
                    sku: form.sku.trim() || null,
                    photo_url: photoUrl,
                    notes: form.notes.trim() || null
                })
                .select()
                .single();

            if (equipError) throw equipError;

            // 3. Create equipment items with codes
            const items = Array.from({ length: quantity }).map((_, i) => {
                const idx = (i + 1).toString().padStart(3, '0');
                const base = form.sku || form.name.substring(0, 3).toUpperCase();
                return {
                    equipment_id: equipment.id,
                    studio_id: studioId,
                    code: `${base}-${idx}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
                    code_type: 'qr',
                    status: 'available'
                };
            });

            await supabase.from('equipment_items').insert(items);

            Alert.alert('Success', `Created ${form.name} with ${quantity} trackable unit${quantity > 1 ? 's' : ''}!`, [
                { text: 'OK', onPress: () => router.back() }
            ]);
        } catch (e: any) {
            Alert.alert('Error', e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleMergeConfirm = async () => {
        if (!selectedMergeTarget) return;

        setLoading(true);
        setShowMergeModal(false);

        try {
            const quantity = parseInt(form.quantity) || 1;
            const existingTotal = selectedMergeTarget.total_quantity;
            const existingAvailable = selectedMergeTarget.available_quantity;

            // Create new equipment items for the existing equipment
            const items = Array.from({ length: quantity }).map((_, i) => {
                const idx = (existingTotal + i + 1).toString().padStart(3, '0');
                const base = form.sku || selectedMergeTarget.name.substring(0, 3).toUpperCase();
                return {
                    equipment_id: selectedMergeTarget.id,
                    studio_id: studioId,
                    code: `${base}-${idx}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
                    code_type: 'qr',
                    status: 'available'
                };
            });

            await supabase.from('equipment_items').insert(items);

            // Update the equipment quantities
            await supabase
                .from('equipment')
                .update({
                    total_quantity: existingTotal + quantity,
                    available_quantity: existingAvailable + quantity
                })
                .eq('id', selectedMergeTarget.id);

            Alert.alert(
                'Merged Successfully',
                `Added ${quantity} unit${quantity > 1 ? 's' : ''} to "${selectedMergeTarget.name}". New total: ${existingTotal + quantity}`,
                [{ text: 'OK', onPress: () => router.back() }]
            );
        } catch (e: any) {
            Alert.alert('Error', e.message);
        } finally {
            setLoading(false);
            setSelectedMergeTarget(null);
        }
    };

    const quantity = parseInt(form.quantity) || 1;

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar style="dark" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <ArrowLeft size={22} color="#000" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Add Equipment</Text>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView
                    style={styles.content}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 120 }}
                >
                    {/* Photo */}
                    <Text style={styles.label}>Photo *</Text>
                    {photoUri ? (
                        <View style={styles.photoPreview}>
                            <Image source={{ uri: photoUri }} style={styles.previewImage} />
                            <TouchableOpacity
                                style={styles.removePhoto}
                                onPress={() => setPhotoUri(null)}
                            >
                                <X size={18} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.photoButtons}>
                            <TouchableOpacity style={styles.photoButton} onPress={handleTakePhoto}>
                                <Camera size={24} color="#000" />
                                <Text style={styles.photoButtonText}>Camera</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.photoButton} onPress={handlePickImage}>
                                <Text style={styles.photoButtonText}>Gallery</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Name */}
                    <Text style={styles.label}>Name *</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. Canon R6 Mark II"
                        placeholderTextColor="#999"
                        value={form.name}
                        onChangeText={(v) => setForm({ ...form, name: v })}
                    />

                    {/* Similar Equipment Warning */}
                    {similarEquipment.length > 0 && (
                        <View style={styles.similarBox}>
                            <View style={styles.similarHeader}>
                                <Merge size={16} color="#f59e0b" />
                                <Text style={styles.similarTitle}>Similar equipment found</Text>
                            </View>
                            <Text style={styles.similarHint}>
                                You may want to merge with an existing item:
                            </Text>
                            {similarEquipment.map((item) => (
                                <TouchableOpacity
                                    key={item.id}
                                    style={styles.similarItem}
                                    onPress={() => {
                                        setSelectedMergeTarget(item);
                                        setShowMergeModal(true);
                                    }}
                                >
                                    <View style={styles.similarItemInfo}>
                                        <Text style={styles.similarItemName}>{item.name}</Text>
                                        <Text style={styles.similarItemMeta}>
                                            {item.category} • {item.total_quantity} units
                                        </Text>
                                    </View>
                                    <Text style={styles.mergeLink}>Merge →</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {/* Category */}
                    <Text style={styles.label}>Category</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                        {CATEGORIES.map((cat) => (
                            <TouchableOpacity
                                key={cat}
                                style={[styles.categoryChip, form.category === cat && styles.categoryChipActive]}
                                onPress={() => setForm({ ...form, category: cat })}
                            >
                                <Text style={[styles.categoryText, form.category === cat && styles.categoryTextActive]}>
                                    {cat}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    {/* Quantity with Info */}
                    <View style={styles.quantityHeader}>
                        <Text style={styles.label}>Quantity</Text>
                        <View style={styles.infoBox}>
                            <Info size={14} color="#666" />
                            <Text style={styles.infoText}>
                                Each unit gets a unique trackable ID
                            </Text>
                        </View>
                    </View>
                    <TextInput
                        style={styles.input}
                        placeholder="1"
                        placeholderTextColor="#999"
                        keyboardType="number-pad"
                        value={form.quantity}
                        onChangeText={(v) => setForm({ ...form, quantity: v })}
                    />

                    {quantity > 1 && (
                        <View style={styles.quantityNote}>
                            <Text style={styles.quantityNoteText}>
                                📦 This will create {quantity} individual units, each with its own QR code for tracking checkouts.
                            </Text>
                        </View>
                    )}

                    {/* SKU */}
                    <Text style={styles.label}>SKU (Optional)</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. CAM-001"
                        placeholderTextColor="#999"
                        value={form.sku}
                        onChangeText={(v) => setForm({ ...form, sku: v })}
                    />

                    {/* Notes */}
                    <Text style={styles.label}>Notes (Optional)</Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder="Any additional notes..."
                        placeholderTextColor="#999"
                        multiline
                        numberOfLines={3}
                        value={form.notes}
                        onChangeText={(v) => setForm({ ...form, notes: v })}
                    />
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Fixed Bottom Button */}
            <View style={styles.bottomBar}>
                <TouchableOpacity
                    style={styles.submitButton}
                    onPress={handleSubmit}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.submitButtonText}>Add Equipment</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Merge Confirmation Modal */}
            <Modal visible={showMergeModal} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={() => {
                                setShowMergeModal(false);
                                setSelectedMergeTarget(null);
                            }}
                        >
                            <X size={24} color="#000" />
                        </TouchableOpacity>

                        <Merge size={40} color="#f59e0b" />
                        <Text style={styles.modalTitle}>Merge Equipment?</Text>

                        {selectedMergeTarget && (
                            <>
                                <Text style={styles.modalDescription}>
                                    Add {form.quantity || 1} unit{parseInt(form.quantity) > 1 ? 's' : ''} to:
                                </Text>
                                <View style={styles.mergeTargetBox}>
                                    <Text style={styles.mergeTargetName}>{selectedMergeTarget.name}</Text>
                                    <Text style={styles.mergeTargetMeta}>
                                        {selectedMergeTarget.category} • Currently {selectedMergeTarget.total_quantity} units
                                    </Text>
                                </View>
                                <Text style={styles.modalNote}>
                                    After merge: {selectedMergeTarget.total_quantity + (parseInt(form.quantity) || 1)} total units
                                </Text>
                            </>
                        )}

                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={styles.cancelButton}
                                onPress={() => {
                                    setShowMergeModal(false);
                                    setSelectedMergeTarget(null);
                                }}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.mergeButton}
                                onPress={handleMergeConfirm}
                            >
                                <Text style={styles.mergeButtonText}>Merge</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
    },
    backButton: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
    content: { flex: 1, paddingHorizontal: 20 },
    label: { fontSize: 13, fontWeight: '700', color: '#666', marginBottom: 8, marginTop: 16 },
    input: {
        height: 50, backgroundColor: '#f5f5f5', borderRadius: 12, paddingHorizontal: 16,
        fontSize: 15, color: '#000',
    },
    textArea: { height: 80, paddingTop: 14, textAlignVertical: 'top' },
    photoButtons: { flexDirection: 'row', gap: 12 },
    photoButton: {
        flex: 1, height: 100, backgroundColor: '#f5f5f5', borderRadius: 12,
        alignItems: 'center', justifyContent: 'center', gap: 8,
        borderWidth: 2, borderColor: '#eee', borderStyle: 'dashed',
    },
    photoButtonText: { fontSize: 14, fontWeight: '600', color: '#666' },
    photoPreview: { height: 180, borderRadius: 12, overflow: 'hidden', position: 'relative' },
    previewImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    removePhoto: {
        position: 'absolute', top: 10, right: 10,
        width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center', justifyContent: 'center',
    },
    categoryScroll: { marginBottom: 8 },
    categoryChip: {
        paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
        backgroundColor: '#f5f5f5', marginRight: 8,
    },
    categoryChipActive: { backgroundColor: '#000' },
    categoryText: { fontSize: 14, fontWeight: '600', color: '#666' },
    categoryTextActive: { color: '#fff' },
    quantityHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
    infoBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    infoText: { fontSize: 11, color: '#666' },
    quantityNote: {
        backgroundColor: '#fffbeb', padding: 12, borderRadius: 10, marginTop: 10,
        borderWidth: 1, borderColor: '#fef3c7',
    },
    quantityNoteText: { fontSize: 13, color: '#92400e', lineHeight: 18 },
    bottomBar: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: '#fff', padding: 20, paddingBottom: 34,
        borderTopWidth: 1, borderTopColor: '#f0f0f0',
    },
    submitButton: {
        height: 54, backgroundColor: '#000', borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
    },
    submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    // Similar equipment indicator styles
    similarBox: {
        backgroundColor: '#fffbeb', padding: 14, borderRadius: 12, marginTop: 12,
        borderWidth: 1, borderColor: '#fef3c7',
    },
    similarHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    similarTitle: { fontSize: 14, fontWeight: '700', color: '#92400e' },
    similarHint: { fontSize: 12, color: '#a16207', marginBottom: 10 },
    similarItem: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 6,
        borderWidth: 1, borderColor: '#fef3c7',
    },
    similarItemInfo: { flex: 1 },
    similarItemName: { fontSize: 14, fontWeight: '600', color: '#000' },
    similarItemMeta: { fontSize: 12, color: '#666', marginTop: 2 },
    mergeLink: { fontSize: 13, fontWeight: '700', color: '#f59e0b' },
    // Modal styles
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center', alignItems: 'center', padding: 24,
    },
    modalContent: {
        backgroundColor: '#fff', borderRadius: 20, padding: 24,
        width: '100%', alignItems: 'center',
    },
    closeButton: { position: 'absolute', top: 16, right: 16, padding: 4 },
    modalTitle: { fontSize: 22, fontWeight: '800', color: '#000', marginTop: 12, marginBottom: 8 },
    modalDescription: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 12 },
    mergeTargetBox: {
        backgroundColor: '#f5f5f5', padding: 16, borderRadius: 12, width: '100%',
        alignItems: 'center', marginBottom: 12,
    },
    mergeTargetName: { fontSize: 16, fontWeight: '700', color: '#000' },
    mergeTargetMeta: { fontSize: 13, color: '#666', marginTop: 4 },
    modalNote: { fontSize: 13, color: '#22c55e', fontWeight: '600', marginBottom: 20 },
    modalButtons: { flexDirection: 'row', gap: 12, width: '100%' },
    cancelButton: {
        flex: 1, height: 50, borderRadius: 12, backgroundColor: '#f5f5f5',
        alignItems: 'center', justifyContent: 'center',
    },
    cancelButtonText: { fontSize: 15, fontWeight: '700', color: '#666' },
    mergeButton: {
        flex: 1, height: 50, borderRadius: 12, backgroundColor: '#f59e0b',
        alignItems: 'center', justifyContent: 'center',
    },
    mergeButtonText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
