import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Image, Alert, Modal, Share } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../contexts/AuthContext';
import { ArrowLeft, Package, CheckCircle, Trash2, Clock, QrCode, X, Share2, Camera } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import QRCode from 'react-native-qrcode-svg';
import * as ImagePicker from 'expo-image-picker';

interface EquipmentItem {
    id: string;
    code: string;
    status: string;
    photo_url: string | null;
}

export default function EquipmentDetailScreen() {
    const { equipmentId, studioId } = useLocalSearchParams();
    const router = useRouter();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [equipment, setEquipment] = useState<any>(null);
    const [units, setUnits] = useState<EquipmentItem[]>([]);
    const [isOwner, setIsOwner] = useState(false);
    const [selectedUnit, setSelectedUnit] = useState<EquipmentItem | null>(null);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [previewUnit, setPreviewUnit] = useState<EquipmentItem | null>(null);

    const loadData = useCallback(async () => {
        if (!equipmentId) return;
        try {
            const { data: equip } = await supabase
                .from('equipment')
                .select('*')
                .eq('id', equipmentId)
                .single();
            setEquipment(equip);

            if (equip?.studio_id) {
                const { data: studio } = await supabase
                    .from('studios')
                    .select('owner_id')
                    .eq('id', equip.studio_id)
                    .single();
                setIsOwner(studio?.owner_id === user?.id);
            }

            const { data: unitData } = await supabase
                .from('equipment_items')
                .select('*')
                .eq('equipment_id', equipmentId)
                .order('code');
            setUnits(unitData || []);
        } catch (e) {
            console.error('Error loading equipment:', e);
        } finally {
            setLoading(false);
        }
    }, [equipmentId, user]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleDelete = async () => {
        Alert.alert('Delete Equipment', 'Are you sure? This will delete all units too.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await supabase.from('equipment').delete().eq('id', equipmentId);
                        router.back();
                    } catch (e: any) {
                        Alert.alert('Error', e.message);
                    }
                }
            }
        ]);
    };

    const handleShareCode = async (unit: EquipmentItem) => {
        const payload = JSON.stringify({
            studio: studioId,
            item: unit.id
        });

        try {
            await Share.share({
                message: `Equipment: ${equipment.name}\nCode: ${unit.code}\nScan payload: ${payload}`,
                title: `${equipment.name} - ${unit.code}`
            });
        } catch (e) {
            console.error('Share error:', e);
        }
    };

    const handleAddPhoto = async () => {
        if (!isOwner) return;

        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission Required', 'Camera permission is required to take photos.');
            return;
        }

        Alert.alert('Add Photo', 'Choose an option', [
            {
                text: 'Take Photo',
                onPress: async () => {
                    try {
                        const result = await ImagePicker.launchCameraAsync({
                            mediaTypes: ['images'],
                            quality: 0.8,
                            allowsEditing: true,
                            aspect: [4, 3],
                        });
                        if (!result.canceled) {
                            await uploadEquipmentPhoto(result.assets[0].uri);
                        }
                    } catch (e) {
                        Alert.alert('Error', 'Failed to take photo');
                    }
                },
            },
            {
                text: 'Choose from Gallery',
                onPress: async () => {
                    try {
                        const result = await ImagePicker.launchImageLibraryAsync({
                            mediaTypes: ['images'],
                            quality: 0.8,
                            allowsEditing: true,
                            aspect: [4, 3],
                        });
                        if (!result.canceled) {
                            await uploadEquipmentPhoto(result.assets[0].uri);
                        }
                    } catch (e) {
                        Alert.alert('Error', 'Failed to pick image');
                    }
                },
            },
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    const uploadEquipmentPhoto = async (uri: string) => {
        setUploadingPhoto(true);
        try {
            const response = await fetch(uri);
            const blob = await response.blob();
            const fileName = `${studioId}/${equipmentId}_${Date.now()}.jpg`;

            const { error: uploadError } = await supabase.storage
                .from('equipment-photos')
                .upload(fileName, blob);

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from('equipment-photos')
                .getPublicUrl(fileName);

            await supabase
                .from('equipment')
                .update({ photo_url: urlData.publicUrl })
                .eq('id', equipmentId);

            setEquipment({ ...equipment, photo_url: urlData.publicUrl });
            Alert.alert('Success', 'Photo updated!');
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to upload photo');
        } finally {
            setUploadingPhoto(false);
        }
    };

    const handleUnitPhoto = async (unit: EquipmentItem) => {
        if (!isOwner) return;

        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission Required', 'Camera permission is required.');
            return;
        }

        Alert.alert('Unit Photo', `Add photo for ${unit.code}`, [
            {
                text: 'Take Photo',
                onPress: async () => {
                    try {
                        const result = await ImagePicker.launchCameraAsync({
                            mediaTypes: ['images'],
                            quality: 0.7,
                            allowsEditing: true,
                            aspect: [1, 1],
                        });
                        if (!result.canceled) {
                            await uploadUnitPhoto(unit.id, result.assets[0].uri);
                        }
                    } catch (e) {
                        Alert.alert('Error', 'Failed to take photo');
                    }
                },
            },
            {
                text: 'Choose from Gallery',
                onPress: async () => {
                    try {
                        const result = await ImagePicker.launchImageLibraryAsync({
                            mediaTypes: ['images'],
                            quality: 0.7,
                            allowsEditing: true,
                            aspect: [1, 1],
                        });
                        if (!result.canceled) {
                            await uploadUnitPhoto(unit.id, result.assets[0].uri);
                        }
                    } catch (e) {
                        Alert.alert('Error', 'Failed to pick image');
                    }
                },
            },
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    const uploadUnitPhoto = async (unitId: string, uri: string) => {
        try {
            const response = await fetch(uri);
            const blob = await response.blob();
            const fileName = `${studioId}/units/${unitId}_${Date.now()}.jpg`;

            const { error: uploadError } = await supabase.storage
                .from('equipment-photos')
                .upload(fileName, blob);

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from('equipment-photos')
                .getPublicUrl(fileName);

            await supabase
                .from('equipment_items')
                .update({ photo_url: urlData.publicUrl })
                .eq('id', unitId);

            // Update local state
            setUnits(units.map(u =>
                u.id === unitId ? { ...u, photo_url: urlData.publicUrl } : u
            ));
            Alert.alert('Success', 'Unit photo added!');
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to upload');
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#000" />
                </View>
            </SafeAreaView>
        );
    }

    if (!equipment) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <Text style={styles.errorText}>Equipment not found</Text>
                </View>
            </SafeAreaView>
        );
    }

    const availableUnits = units.filter(u => u.status === 'available');
    const checkedOutUnits = units.filter(u => u.status !== 'available');

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar style="dark" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <ArrowLeft size={22} color="#000" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Details</Text>
                {isOwner && (
                    <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                        <Trash2 size={20} color="#ef4444" />
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Unit Photos Grid/Random Display */}
                {(() => {
                    const unitsWithPhotos = units.filter(u => u.photo_url);
                    if (unitsWithPhotos.length === 0) {
                        return (
                            <View style={styles.imageContainer}>
                                <View style={styles.imagePlaceholder}>
                                    <Package size={64} color="#ccc" />
                                    <Text style={{ marginTop: 8, color: '#999', fontSize: 13 }}>No unit photos yet</Text>
                                </View>
                            </View>
                        );
                    } else if (unitsWithPhotos.length === 1) {
                        return (
                            <TouchableOpacity
                                style={styles.imageContainer}
                                onPress={() => setPreviewUnit(unitsWithPhotos[0])}
                            >
                                <Image source={{ uri: unitsWithPhotos[0].photo_url! }} style={styles.image} />
                                <View style={styles.photoCountBadge}>
                                    <Text style={styles.photoCountText}>{unitsWithPhotos[0].code}</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    } else {
                        // Grid of up to 4 photos
                        const displayPhotos = unitsWithPhotos.slice(0, 4);
                        const remaining = unitsWithPhotos.length - 4;
                        return (
                            <View style={styles.photoGrid}>
                                {displayPhotos.map((unit, idx) => (
                                    <TouchableOpacity
                                        key={unit.id}
                                        style={[
                                            styles.gridPhoto,
                                            displayPhotos.length === 2 && { width: '50%' },
                                            displayPhotos.length === 3 && idx === 0 && { width: '100%', height: 120 },
                                            displayPhotos.length === 3 && idx > 0 && { width: '50%' },
                                        ]}
                                        onPress={() => setPreviewUnit(unit)}
                                    >
                                        <Image source={{ uri: unit.photo_url! }} style={styles.gridImage} />
                                        {idx === 3 && remaining > 0 && (
                                            <View style={styles.morePhotosOverlay}>
                                                <Text style={styles.morePhotosText}>+{remaining}</Text>
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                ))}
                            </View>
                        );
                    }
                })()}

                {/* Info */}
                <View style={styles.infoSection}>
                    <Text style={styles.equipmentName}>{equipment.name}</Text>
                    <Text style={styles.equipmentCategory}>{equipment.category || 'Uncategorized'}</Text>

                    {equipment.sku && (
                        <Text style={styles.sku}>SKU: {equipment.sku}</Text>
                    )}

                    <View style={styles.statsRow}>
                        <View style={styles.stat}>
                            <Text style={[
                                styles.statValue,
                                equipment.available_quantity === 0 && { color: '#ef4444' }
                            ]}>
                                {equipment.available_quantity}
                            </Text>
                            <Text style={styles.statLabel}>Available</Text>
                        </View>
                        <View style={styles.stat}>
                            <Text style={styles.statValue}>{equipment.total_quantity}</Text>
                            <Text style={styles.statLabel}>Total</Text>
                        </View>
                    </View>

                    {equipment.notes && (
                        <View style={styles.notesBox}>
                            <Text style={styles.notesLabel}>Notes</Text>
                            <Text style={styles.notesText}>{equipment.notes}</Text>
                        </View>
                    )}
                </View>

                {/* Available Units */}
                {availableUnits.length > 0 && (
                    <View style={styles.unitsSection}>
                        <Text style={styles.sectionTitle}>
                            AVAILABLE ({availableUnits.length})
                        </Text>
                        {availableUnits.map((unit) => (
                            <View key={unit.id} style={styles.unitCard}>
                                <TouchableOpacity
                                    style={styles.unitPhotoContainer}
                                    onPress={() => isOwner && handleUnitPhoto(unit)}
                                >
                                    {unit.photo_url ? (
                                        <Image source={{ uri: unit.photo_url }} style={styles.unitPhoto} />
                                    ) : (
                                        <View style={styles.unitPhotoPlaceholder}>
                                            {isOwner ? (
                                                <Camera size={16} color="#999" />
                                            ) : (
                                                <Package size={16} color="#ccc" />
                                            )}
                                        </View>
                                    )}
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.unitInfoArea}
                                    onPress={() => setSelectedUnit(unit)}
                                >
                                    <CheckCircle size={18} color="#22c55e" />
                                    <Text style={styles.unitCode}>{unit.code}</Text>
                                    <QrCode size={18} color="#999" />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                )}

                {/* Checked Out Units */}
                {checkedOutUnits.length > 0 && (
                    <View style={styles.unitsSection}>
                        <Text style={styles.sectionTitle}>
                            CHECKED OUT ({checkedOutUnits.length})
                        </Text>
                        {checkedOutUnits.map((unit) => (
                            <View key={unit.id} style={[styles.unitCard, styles.unitCardOut]}>
                                <TouchableOpacity
                                    style={styles.unitPhotoContainer}
                                    onPress={() => isOwner && handleUnitPhoto(unit)}
                                >
                                    {unit.photo_url ? (
                                        <Image source={{ uri: unit.photo_url }} style={styles.unitPhoto} />
                                    ) : (
                                        <View style={styles.unitPhotoPlaceholder}>
                                            {isOwner ? (
                                                <Camera size={16} color="#999" />
                                            ) : (
                                                <Package size={16} color="#ccc" />
                                            )}
                                        </View>
                                    )}
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.unitInfoArea}
                                    onPress={() => setSelectedUnit(unit)}
                                >
                                    <Clock size={18} color="#f59e0b" />
                                    <Text style={styles.unitCode}>{unit.code}</Text>
                                    <QrCode size={18} color="#999" />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>

            {/* QR Code Modal */}
            <Modal visible={!!selectedUnit} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={() => setSelectedUnit(null)}
                        >
                            <X size={24} color="#000" />
                        </TouchableOpacity>

                        <Text style={styles.modalTitle}>{equipment.name}</Text>
                        <Text style={styles.modalCode}>{selectedUnit?.code}</Text>

                        <View style={styles.qrContainer}>
                            {selectedUnit && (
                                <QRCode
                                    value={JSON.stringify({
                                        studio: studioId,
                                        item: selectedUnit.id
                                    })}
                                    size={200}
                                    backgroundColor="#fff"
                                    color="#000"
                                />
                            )}
                        </View>

                        <Text style={styles.qrHint}>
                            Scan this code to checkout/checkin this unit
                        </Text>

                        <TouchableOpacity
                            style={styles.shareButton}
                            onPress={() => selectedUnit && handleShareCode(selectedUnit)}
                        >
                            <Share2 size={18} color="#fff" />
                            <Text style={styles.shareButtonText}>Share Code</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Photo Preview Modal */}
            <Modal visible={!!previewUnit} animationType="fade" transparent>
                <View style={styles.previewOverlay}>
                    <TouchableOpacity
                        style={styles.previewCloseButton}
                        onPress={() => setPreviewUnit(null)}
                    >
                        <X size={28} color="#fff" />
                    </TouchableOpacity>

                    {previewUnit?.photo_url && (
                        <Image
                            source={{ uri: previewUnit.photo_url }}
                            style={styles.previewImage}
                            resizeMode="contain"
                        />
                    )}

                    <View style={styles.previewInfo}>
                        <Text style={styles.previewCode}>{previewUnit?.code}</Text>
                        {isOwner && (
                            <TouchableOpacity
                                style={styles.previewEditButton}
                                onPress={() => {
                                    if (previewUnit) {
                                        setPreviewUnit(null);
                                        handleUnitPhoto(previewUnit);
                                    }
                                }}
                            >
                                <Camera size={18} color="#fff" />
                                <Text style={styles.previewEditText}>Change Photo</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    errorText: { color: '#666', fontSize: 16 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
    },
    backButton: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
    deleteButton: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center',
    },
    content: { flex: 1 },
    imageContainer: {
        height: 200, marginHorizontal: 16, borderRadius: 16, overflow: 'hidden',
        backgroundColor: '#f5f5f5',
    },
    image: { width: '100%', height: '100%', resizeMode: 'cover' },
    imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    infoSection: { padding: 20 },
    equipmentName: { fontSize: 26, fontWeight: '900', color: '#000', marginBottom: 4 },
    equipmentCategory: { fontSize: 15, color: '#666', marginBottom: 4 },
    sku: { fontSize: 12, color: '#999', marginBottom: 16 },
    statsRow: { flexDirection: 'row', gap: 32, marginBottom: 20 },
    stat: { alignItems: 'center' },
    statValue: { fontSize: 36, fontWeight: '900', color: '#000' },
    statLabel: { fontSize: 13, color: '#666' },
    notesBox: {
        backgroundColor: '#f9f9f9', padding: 14, borderRadius: 12,
        borderLeftWidth: 3, borderLeftColor: '#ddd',
    },
    notesLabel: { fontSize: 11, fontWeight: '700', color: '#999', marginBottom: 4 },
    notesText: { fontSize: 14, color: '#555', fontStyle: 'italic', lineHeight: 20 },
    unitsSection: { paddingHorizontal: 20, marginBottom: 20 },
    sectionTitle: {
        fontSize: 12, fontWeight: '800', color: '#999', letterSpacing: 1, marginBottom: 10,
    },
    unitCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#f0fdf4', padding: 14, borderRadius: 10, marginBottom: 8,
    },
    unitCardOut: { backgroundColor: '#fffbeb' },
    unitPhotoContainer: {
        width: 40, height: 40, borderRadius: 8,
        backgroundColor: '#e5e7eb', overflow: 'hidden',
    },
    unitPhoto: { width: '100%', height: '100%', resizeMode: 'cover' },
    unitPhotoPlaceholder: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
    },
    unitInfoArea: {
        flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12,
    },
    unitCode: { flex: 1, fontSize: 15, fontWeight: '600', color: '#000' },
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center', alignItems: 'center', padding: 24,
    },
    modalContent: {
        backgroundColor: '#fff', borderRadius: 20, padding: 24,
        width: '100%', alignItems: 'center',
    },
    closeButton: { position: 'absolute', top: 16, right: 16, padding: 4 },
    modalTitle: { fontSize: 20, fontWeight: '800', color: '#000', marginTop: 20 },
    modalCode: { fontSize: 14, color: '#666', marginBottom: 24 },
    qrContainer: {
        padding: 20, backgroundColor: '#fff', borderRadius: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
    },
    qrHint: { fontSize: 13, color: '#999', textAlign: 'center', marginTop: 16, marginBottom: 20 },
    shareButton: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#000', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12,
    },
    shareButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    editPhotoOverlay: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: 'rgba(0,0,0,0.5)', flexDirection: 'row',
        alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 10,
    },
    editPhotoText: { color: '#fff', fontSize: 13, fontWeight: '600' },
    // Photo grid styles
    photoGrid: {
        flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 20, marginTop: 20,
        borderRadius: 16, overflow: 'hidden',
    },
    gridPhoto: {
        width: '50%', height: 100, position: 'relative',
    },
    gridImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    morePhotosOverlay: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
    },
    morePhotosText: { color: '#fff', fontSize: 24, fontWeight: '700' },
    photoCountBadge: {
        position: 'absolute', bottom: 12, left: 12,
        backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
    },
    photoCountText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    // Photo preview modal styles
    previewOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
        alignItems: 'center', justifyContent: 'center',
    },
    previewCloseButton: {
        position: 'absolute', top: 50, right: 20, zIndex: 10,
        padding: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20,
    },
    previewImage: {
        width: '100%', height: '70%',
    },
    previewInfo: {
        position: 'absolute', bottom: 50, alignItems: 'center',
    },
    previewCode: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 12 },
    previewEditButton: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24,
    },
    previewEditText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
