import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, Alert, Image, Platform, NativeModules, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeft, Camera, Check, X, Package, RefreshCw, AlertTriangle } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

// Helper to detect if running in iOS Simulator
const isSimulator = () => {
    if (Platform.OS === 'ios') {
        // In simulator, camera won't work
        return !!(NativeModules.PlatformConstants?.interfaceIdiom === 'pad' ||
            Platform.isPad === true ||
            __DEV__); // In dev mode on simulator, we show a fallback
    }
    return false;
};

interface CartItem {
    unitId: string;
    equipmentId: string;
    code: string;
    equipmentName: string;
    photoUri: string | null;
}

type FlowStep = 'scan' | 'confirm' | 'photo' | 'success';
type Mode = 'checkout' | 'checkin';

export default function CheckoutScreen() {
    const { studioId } = useLocalSearchParams();
    const router = useRouter();
    const { user } = useAuth();
    const [permission, requestPermission] = useCameraPermissions();

    const [mode, setMode] = useState<Mode>('checkout');
    const [step, setStep] = useState<FlowStep>('scan');
    const [cart, setCart] = useState<CartItem[]>([]);
    const [currentItem, setCurrentItem] = useState<CartItem | null>(null);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [scanned, setScanned] = useState(false);
    const [manualCode, setManualCode] = useState(''); // For simulator fallback

    // Request permission on mount
    useEffect(() => {
        if (permission && !permission.granted && permission.canAskAgain) {
            requestPermission();
        }
    }, [permission]);

    const handleBarCodeScanned = async ({ data }: { data: string }) => {
        if (scanned || processing) return;
        setScanned(true);
        setError(null);
        setProcessing(true);

        try {
            let unitId = data;
            try {
                const parsed = JSON.parse(data);
                if (parsed.item) unitId = parsed.item;
            } catch {
                // Raw code
            }

            const { data: unit, error: unitError } = await supabase
                .from('equipment_items')
                .select('*, equipment(id, name, studio_id)')
                .or(`id.eq.${unitId},code.eq.${data}`)
                .single();

            if (unitError || !unit) {
                setError('Item not found');
                setScanned(false);
                setProcessing(false);
                return;
            }

            // Check studio match
            if (studioId && unit.equipment.studio_id !== studioId) {
                setError('Item belongs to different studio');
                setScanned(false);
                setProcessing(false);
                return;
            }

            if (cart.some(c => c.unitId === unit.id)) {
                setError('Item already in cart');
                setScanned(false);
                setProcessing(false);
                return;
            }

            if (mode === 'checkout' && unit.status !== 'available') {
                setError('Item is already checked out');
                setScanned(false);
                setProcessing(false);
                return;
            }

            if (mode === 'checkin' && unit.status === 'available') {
                setError('Item is not checked out');
                setScanned(false);
                setProcessing(false);
                return;
            }

            setCurrentItem({
                unitId: unit.id,
                equipmentId: unit.equipment.id,
                code: unit.code,
                equipmentName: unit.equipment.name,
                photoUri: null,
            });
            setStep('confirm');
        } catch (e: any) {
            setError(e.message || 'Scan failed');
            setScanned(false);
        } finally {
            setProcessing(false);
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
                quality: 0.7,
                allowsEditing: true,
                aspect: [4, 3],
            });

            if (!result.canceled && currentItem) {
                setCurrentItem({ ...currentItem, photoUri: result.assets[0].uri });
                setStep('photo');
            }
        } catch (e: any) {
            Alert.alert('Error', 'Failed to open camera. Please try again.');
        }
    };

    const confirmAndSubmit = async () => {
        if (!currentItem || !user) return;
        setProcessing(true);

        try {
            // Upload photo if exists
            let photoUrl = null;
            if (currentItem.photoUri) {
                const response = await fetch(currentItem.photoUri);
                const blob = await response.blob();
                const fileName = `${studioId}/${currentItem.unitId}/${Date.now()}.jpg`;

                await supabase.storage
                    .from('transaction-photos')
                    .upload(fileName, blob);

                const { data: urlData } = supabase.storage
                    .from('transaction-photos')
                    .getPublicUrl(fileName);
                photoUrl = urlData.publicUrl;
            }

            // Create transaction
            await supabase.from('transactions').insert({
                studio_id: studioId,
                equipment_id: currentItem.equipmentId,
                equipment_item_id: currentItem.unitId,
                user_id: user.id,
                type: mode,
                quantity: 1,
                photo_url: photoUrl,
                approval_status: mode === 'checkout' ? 'pending' : null
            });

            // Update item status
            await supabase
                .from('equipment_items')
                .update({ status: mode === 'checkout' ? 'checked_out' : 'available' })
                .eq('id', currentItem.unitId);

            // Update equipment quantity
            const { data: equip } = await supabase
                .from('equipment')
                .select('available_quantity')
                .eq('id', currentItem.equipmentId)
                .single();

            if (equip) {
                const newQty = mode === 'checkout'
                    ? equip.available_quantity - 1
                    : equip.available_quantity + 1;
                await supabase
                    .from('equipment')
                    .update({ available_quantity: newQty })
                    .eq('id', currentItem.equipmentId);
            }

            setStep('success');
        } catch (e: any) {
            Alert.alert('Error', e.message);
        } finally {
            setProcessing(false);
        }
    };

    const skipPhotoAndSubmit = () => {
        confirmAndSubmit();
    };

    const resetScanner = () => {
        setCurrentItem(null);
        setScanned(false);
        setStep('scan');
        setError(null);
    };

    // Permission loading or not granted
    if (!permission) {
        // Still loading permission state
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <ArrowLeft size={22} color="#000" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Scan</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.permissionContainer}>
                    <ActivityIndicator size="large" color="#000" />
                    <Text style={styles.permissionText}>Checking camera permission...</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (!permission.granted) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <ArrowLeft size={22} color="#000" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Scan</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.permissionContainer}>
                    <Camera size={48} color="#ccc" />
                    <Text style={styles.permissionText}>Camera permission is required</Text>
                    <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                        <Text style={styles.permissionButtonText}>Grant Permission</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    // Success screen
    if (step === 'success') {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.successContainer}>
                    <View style={styles.successIcon}>
                        <Check size={48} color="#22c55e" />
                    </View>
                    <Text style={styles.successTitle}>
                        {mode === 'checkout' ? 'Checked Out!' : 'Returned!'}
                    </Text>
                    <Text style={styles.successText}>{currentItem?.equipmentName}</Text>
                    <View style={styles.successActions}>
                        <TouchableOpacity style={styles.scanAnotherButton} onPress={resetScanner}>
                            <Text style={styles.scanAnotherText}>Scan Another</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.doneButton} onPress={() => router.back()}>
                            <Text style={styles.doneButtonText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" />

            {/* Header */}
            <View style={styles.headerDark}>
                <TouchableOpacity style={styles.backButtonDark} onPress={() => router.back()}>
                    <ArrowLeft size={22} color="#fff" />
                </TouchableOpacity>
                <View style={styles.modeToggle}>
                    <TouchableOpacity
                        style={[styles.modeButton, mode === 'checkout' && styles.modeButtonActive]}
                        onPress={() => setMode('checkout')}
                    >
                        <Text style={[styles.modeText, mode === 'checkout' && styles.modeTextActive]}>
                            Checkout
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.modeButton, mode === 'checkin' && styles.modeButtonActive]}
                        onPress={() => setMode('checkin')}
                    >
                        <Text style={[styles.modeText, mode === 'checkin' && styles.modeTextActive]}>
                            Checkin
                        </Text>
                    </TouchableOpacity>
                </View>
                <View style={{ width: 40 }} />
            </View>

            {/* Scanner View */}
            {step === 'scan' && (
                <View style={styles.scannerContainer}>
                    <CameraView
                        style={styles.camera}
                        barcodeScannerSettings={{
                            barcodeTypes: ['qr', 'code128', 'code39', 'ean13'],
                        }}
                        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                    />
                    <View style={styles.scanOverlay}>
                        <View style={styles.scanFrame} />
                    </View>
                    {error && (
                        <View style={styles.errorBanner}>
                            <Text style={styles.errorText}>{error}</Text>
                            <TouchableOpacity onPress={() => setError(null)}>
                                <X size={18} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    )}
                    {processing && (
                        <View style={styles.processingOverlay}>
                            <ActivityIndicator size="large" color="#fff" />
                        </View>
                    )}
                    <View style={styles.scanInstructions}>
                        <Text style={styles.scanText}>Point camera at QR code</Text>
                    </View>
                </View>
            )}

            {/* Confirm Item */}
            {step === 'confirm' && currentItem && (
                <View style={styles.confirmContainer}>
                    <Package size={48} color="#000" />
                    <Text style={styles.confirmName}>{currentItem.equipmentName}</Text>
                    <Text style={styles.confirmCode}>{currentItem.code}</Text>

                    <View style={styles.confirmActions}>
                        <TouchableOpacity style={styles.photoButton} onPress={handleTakePhoto}>
                            <Camera size={24} color="#000" />
                            <Text style={styles.photoButtonText}>Take Photo</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.skipButton} onPress={skipPhotoAndSubmit}>
                            <Text style={styles.skipButtonText}>Skip Photo & Submit</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.cancelLink} onPress={resetScanner}>
                            <Text style={styles.cancelLinkText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Photo Preview */}
            {step === 'photo' && currentItem?.photoUri && (
                <View style={styles.photoContainer}>
                    <Image source={{ uri: currentItem.photoUri }} style={styles.photoPreview} />
                    <View style={styles.photoActions}>
                        <TouchableOpacity style={styles.retakeButton} onPress={handleTakePhoto}>
                            <RefreshCw size={20} color="#000" />
                            <Text style={styles.retakeButtonText}>Retake</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.usePhotoButton}
                            onPress={confirmAndSubmit}
                            disabled={processing}
                        >
                            {processing ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <>
                                    <Check size={20} color="#fff" />
                                    <Text style={styles.usePhotoButtonText}>Submit</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff',
    },
    backButton: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
    headerDark: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#000',
    },
    backButtonDark: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center',
    },
    modeToggle: {
        flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 10, padding: 4,
    },
    modeButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
    modeButtonActive: { backgroundColor: '#fff' },
    modeText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
    modeTextActive: { color: '#000' },
    scannerContainer: { flex: 1 },
    camera: { flex: 1 },
    scanOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center', justifyContent: 'center',
    },
    scanFrame: {
        width: 250, height: 250, borderWidth: 3, borderColor: '#fff',
        borderRadius: 20, backgroundColor: 'transparent',
    },
    errorBanner: {
        position: 'absolute', top: 20, left: 20, right: 20,
        backgroundColor: '#ef4444', padding: 12, borderRadius: 10,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    errorText: { color: '#fff', fontWeight: '600', flex: 1 },
    processingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
    },
    scanInstructions: {
        position: 'absolute', bottom: 80, left: 0, right: 0, alignItems: 'center',
    },
    scanText: { color: 'rgba(255,255,255,0.8)', fontSize: 16 },
    permissionContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
    permissionText: { color: '#666', fontSize: 16, marginTop: 16, marginBottom: 24 },
    permissionButton: { backgroundColor: '#000', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
    permissionButtonText: { color: '#fff', fontWeight: '700' },
    confirmContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 24 },
    confirmName: { fontSize: 24, fontWeight: '800', color: '#000', marginTop: 20 },
    confirmCode: { fontSize: 14, color: '#666', marginTop: 4 },
    confirmActions: { marginTop: 40, gap: 12, width: '100%' },
    photoButton: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        backgroundColor: '#f5f5f5', height: 54, borderRadius: 14,
    },
    photoButtonText: { fontSize: 16, fontWeight: '700', color: '#000' },
    skipButton: {
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#000', height: 54, borderRadius: 14,
    },
    skipButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
    cancelLink: { alignItems: 'center', paddingVertical: 12 },
    cancelLinkText: { fontSize: 14, color: '#666' },
    photoContainer: { flex: 1, backgroundColor: '#000' },
    photoPreview: { flex: 1, resizeMode: 'contain' },
    photoActions: {
        flexDirection: 'row', gap: 12, padding: 20, backgroundColor: '#000',
    },
    retakeButton: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: '#fff', height: 50, borderRadius: 12,
    },
    retakeButtonText: { fontSize: 15, fontWeight: '700', color: '#000' },
    usePhotoButton: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: '#22c55e', height: 50, borderRadius: 12,
    },
    usePhotoButtonText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 24 },
    successIcon: {
        width: 100, height: 100, borderRadius: 50, backgroundColor: '#f0fdf4',
        alignItems: 'center', justifyContent: 'center', marginBottom: 24,
    },
    successTitle: { fontSize: 28, fontWeight: '900', color: '#000' },
    successText: { fontSize: 16, color: '#666', marginTop: 8 },
    successActions: { marginTop: 40, gap: 12, width: '100%' },
    scanAnotherButton: {
        height: 50, borderRadius: 12, backgroundColor: '#f5f5f5',
        alignItems: 'center', justifyContent: 'center',
    },
    scanAnotherText: { fontSize: 15, fontWeight: '700', color: '#000' },
    doneButton: {
        height: 50, borderRadius: 12, backgroundColor: '#000',
        alignItems: 'center', justifyContent: 'center',
    },
    doneButtonText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    // Simulator fallback styles
    simulatorFallback: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#fff', padding: 24,
    },
    simulatorTitle: {
        fontSize: 20, fontWeight: '800', color: '#000', marginTop: 16,
    },
    simulatorText: {
        fontSize: 14, color: '#666', textAlign: 'center', marginTop: 8, marginBottom: 24,
    },
    manualInput: {
        width: '100%', height: 50, backgroundColor: '#f5f5f5', borderRadius: 12,
        paddingHorizontal: 16, fontSize: 15, color: '#000', marginBottom: 12,
    },
    manualSubmitButton: {
        width: '100%', height: 50, borderRadius: 12, backgroundColor: '#000',
        alignItems: 'center', justifyContent: 'center',
    },
    manualSubmitButtonDisabled: {
        backgroundColor: '#ccc',
    },
    manualSubmitText: {
        fontSize: 15, fontWeight: '700', color: '#fff',
    },
    errorBannerSimulator: {
        marginTop: 16, backgroundColor: '#fef2f2', padding: 12, borderRadius: 10,
        borderWidth: 1, borderColor: '#fecaca', width: '100%',
    },
    errorTextSimulator: {
        color: '#dc2626', fontWeight: '600', textAlign: 'center',
    },
});
