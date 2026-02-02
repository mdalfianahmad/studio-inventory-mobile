import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Package, ArrowRightCircle, ArrowLeftCircle, CheckCircle, XCircle, Clock } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

interface Transaction {
    id: string;
    type: 'checkout' | 'checkin';
    created_at: string;
    approval_status: string | null;
    equipment: { name: string };
}

export default function ActivityScreen() {
    const { studioId } = useLocalSearchParams();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [transactions, setTransactions] = useState<Transaction[]>([]);

    const loadData = useCallback(async () => {
        if (!studioId) return;
        try {
            const { data: trans } = await supabase
                .from('transactions')
                .select('id, type, created_at, approval_status, equipment(name)')
                .eq('studio_id', studioId)
                .order('created_at', { ascending: false })
                .limit(50);

            setTransactions(trans as Transaction[] || []);
        } catch (e) {
            console.error('Error loading activity:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [studioId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleRefresh = () => {
        setRefreshing(true);
        loadData();
    };

    const renderItem = ({ item }: { item: Transaction }) => (
        <View style={styles.activityCard}>
            <View style={[
                styles.typeIcon,
                item.type === 'checkout' && styles.typeIconOut,
                item.type === 'checkin' && styles.typeIconIn,
            ]}>
                {item.type === 'checkout' ? (
                    <ArrowRightCircle size={18} color="#ef4444" />
                ) : (
                    <ArrowLeftCircle size={18} color="#22c55e" />
                )}
            </View>
            <View style={styles.activityInfo}>
                <Text style={styles.activityEquipment}>
                    {(item.equipment as any)?.name || 'Unknown'}
                </Text>
                <Text style={styles.activityMeta}>
                    {item.type === 'checkout' ? 'Checked out' : 'Returned'} • {' '}
                    {new Date(item.created_at).toLocaleDateString()}
                </Text>
            </View>
            <View style={[
                styles.statusBadge,
                item.approval_status === 'approved' && styles.statusApproved,
                item.approval_status === 'pending' && styles.statusPending,
                item.approval_status === 'denied' && styles.statusDenied,
            ]}>
                {item.approval_status === 'approved' && <CheckCircle size={14} color="#22c55e" />}
                {item.approval_status === 'pending' && <Clock size={14} color="#f59e0b" />}
                {item.approval_status === 'denied' && <XCircle size={14} color="#ef4444" />}
            </View>
        </View>
    );

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
                <Text style={styles.headerTitle}>Activity</Text>
                <View style={{ width: 40 }} />
            </View>

            <FlatList
                data={transactions}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
                }
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Package size={48} color="#ddd" />
                        <Text style={styles.emptyText}>No activity yet</Text>
                        <Text style={styles.emptyHint}>Transactions will appear here</Text>
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
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
    listContent: { padding: 16 },
    activityCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#f9f9f9', padding: 14, borderRadius: 12, marginBottom: 10,
    },
    typeIcon: {
        width: 36, height: 36, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    typeIconOut: { backgroundColor: '#fef2f2' },
    typeIconIn: { backgroundColor: '#f0fdf4' },
    activityInfo: { flex: 1 },
    activityEquipment: { fontSize: 15, fontWeight: '700', color: '#000' },
    activityMeta: { fontSize: 12, color: '#666' },
    statusBadge: {
        width: 28, height: 28, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
    },
    statusApproved: { backgroundColor: '#f0fdf4' },
    statusPending: { backgroundColor: '#fffbeb' },
    statusDenied: { backgroundColor: '#fef2f2' },
    emptyState: { alignItems: 'center', padding: 60 },
    emptyText: { color: '#666', marginTop: 12, fontSize: 16, fontWeight: '600' },
    emptyHint: { color: '#999', marginTop: 4, fontSize: 13 },
});
