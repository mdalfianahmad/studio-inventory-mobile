import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, FlatList, TextInput, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { ArrowLeft, Search, Plus, Package, RefreshCw } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

export default function EquipmentListScreen() {
    const { studioId } = useLocalSearchParams();
    const router = useRouter();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [isOwner, setIsOwner] = useState(false);
    const [equipment, setEquipment] = useState<any[]>([]);
    const [search, setSearch] = useState('');

    const loadData = useCallback(async () => {
        if (!studioId) return;
        try {
            // Check ownership
            const { data: studio } = await supabase
                .from('studios')
                .select('owner_id')
                .eq('id', studioId)
                .single();
            setIsOwner(studio?.owner_id === user?.id);

            // Fetch equipment
            const { data: equip } = await supabase
                .from('equipment')
                .select('*')
                .eq('studio_id', studioId)
                .order('name');

            // Fetch unit photos for all equipment
            const equipIds = equip?.map(e => e.id) || [];
            const { data: unitPhotos } = await supabase
                .from('equipment_items')
                .select('equipment_id, photo_url')
                .in('equipment_id', equipIds)
                .not('photo_url', 'is', null);

            // Build a map of equipment_id -> first unit photo
            const photoMap: Record<string, string> = {};
            unitPhotos?.forEach(up => {
                if (!photoMap[up.equipment_id] && up.photo_url) {
                    photoMap[up.equipment_id] = up.photo_url;
                }
            });

            // Merge unit photos into equipment (use equipment photo if available, else unit photo)
            const enrichedEquip = equip?.map(e => ({
                ...e,
                display_photo: e.photo_url || photoMap[e.id] || null
            })) || [];

            setEquipment(enrichedEquip);
        } catch (e) {
            console.error('Error loading equipment:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [studioId, user]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleRefresh = () => {
        setRefreshing(true);
        loadData();
    };

    const filteredEquipment = equipment.filter(item =>
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.category?.toLowerCase().includes(search.toLowerCase())
    );

    const getStockStatus = (available: number, total: number) => {
        if (available === 0) return 'out';
        if (available <= total * 0.25) return 'low';
        return 'ok';
    };

    const renderItem = ({ item }: { item: any }) => {
        const status = getStockStatus(item.available_quantity, item.total_quantity);

        return (
            <TouchableOpacity
                style={styles.card}
                onPress={() => router.push({
                    pathname: '/(home)/studio/equipment/[equipmentId]',
                    params: { equipmentId: item.id, studioId }
                })}
            >
                <View style={styles.cardThumb}>
                    {item.display_photo ? (
                        <Image source={{ uri: item.display_photo }} style={styles.thumbImage} />
                    ) : (
                        <Package size={24} color="#999" />
                    )}
                </View>
                <View style={styles.cardInfo}>
                    <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.cardCategory}>{item.category || 'Uncategorized'}</Text>
                </View>
                <View style={styles.cardCount}>
                    <Text style={[
                        styles.cardAvailable,
                        status === 'out' && styles.textOut,
                        status === 'low' && styles.textLow,
                        status === 'ok' && styles.textOk,
                    ]}>
                        {item.available_quantity}/{item.total_quantity}
                    </Text>
                    <Text style={styles.cardTotal}>available</Text>
                </View>
            </TouchableOpacity>
        );
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

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar style="dark" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <ArrowLeft size={22} color="#000" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Equipment</Text>
                <TouchableOpacity onPress={handleRefresh}>
                    <RefreshCw size={20} color={refreshing ? '#ccc' : '#666'} />
                </TouchableOpacity>
            </View>

            {/* Add Equipment Button (Prominent) */}
            {isOwner && (
                <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => router.push({
                        pathname: '/(home)/studio/add-equipment',
                        params: { studioId }
                    })}
                >
                    <Plus size={22} color="#fff" />
                    <Text style={styles.addButtonText}>Add New Equipment</Text>
                </TouchableOpacity>
            )}

            {/* Search */}
            <View style={styles.searchContainer}>
                <Search size={18} color="#999" />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search equipment..."
                    placeholderTextColor="#999"
                    value={search}
                    onChangeText={setSearch}
                />
            </View>

            {/* Count */}
            <Text style={styles.countText}>{filteredEquipment.length} items</Text>

            {/* List */}
            <FlatList
                data={filteredEquipment}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                refreshing={refreshing}
                onRefresh={handleRefresh}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Package size={48} color="#ddd" />
                        <Text style={styles.emptyText}>
                            {search ? 'No matching equipment' : 'No equipment yet'}
                        </Text>
                        {isOwner && !search && (
                            <Text style={styles.emptyHint}>Tap "Add New Equipment" above</Text>
                        )}
                    </View>
                }
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
    },
    backButton: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#000' },
    addButton: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        marginHorizontal: 16, marginBottom: 16, height: 54, backgroundColor: '#000', borderRadius: 14,
    },
    addButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    searchContainer: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        marginHorizontal: 16, marginBottom: 12,
        height: 46, backgroundColor: '#f5f5f5', borderRadius: 12, paddingHorizontal: 14,
    },
    searchInput: { flex: 1, fontSize: 15, color: '#000' },
    countText: {
        fontSize: 13, color: '#666', fontWeight: '600',
        paddingHorizontal: 16, marginBottom: 12
    },
    listContent: { paddingHorizontal: 16, paddingBottom: 40 },
    card: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#fff', padding: 14, borderRadius: 14, marginBottom: 10,
        borderWidth: 1, borderColor: '#eee',
    },
    cardThumb: {
        width: 54, height: 54, borderRadius: 10,
        backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
    },
    thumbImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    cardInfo: { flex: 1 },
    cardName: { fontSize: 15, fontWeight: '700', color: '#000' },
    cardCategory: { fontSize: 12, color: '#666' },
    cardCount: { alignItems: 'flex-end' },
    cardAvailable: { fontSize: 18, fontWeight: '800' },
    cardTotal: { fontSize: 11, color: '#999' },
    textOk: { color: '#22c55e' },
    textLow: { color: '#f59e0b' },
    textOut: { color: '#ef4444' },
    emptyState: { alignItems: 'center', padding: 60 },
    emptyText: { color: '#999', marginTop: 12, fontSize: 14 },
    emptyHint: { color: '#ccc', marginTop: 4, fontSize: 12 },
});
