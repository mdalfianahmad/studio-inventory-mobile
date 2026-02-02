import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { ArrowLeft, Package, QrCode, Users, History, ChevronRight, Settings } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

export default function StudioScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [studio, setStudio] = useState<any>(null);
    const [isOwner, setIsOwner] = useState(false);
    const [equipmentCount, setEquipmentCount] = useState(0);
    const [memberCount, setMemberCount] = useState(0);

    const loadData = useCallback(async () => {
        if (!id) return;
        try {
            // Fetch studio
            const { data: studioData } = await supabase
                .from('studios')
                .select('*')
                .eq('id', id)
                .single();

            setStudio(studioData);
            setIsOwner(studioData?.owner_id === user?.id);

            // Get counts
            const { count: eqCount } = await supabase
                .from('equipment')
                .select('*', { count: 'exact', head: true })
                .eq('studio_id', id);
            setEquipmentCount(eqCount || 0);

            const { count: memCount } = await supabase
                .from('studio_users')
                .select('*', { count: 'exact', head: true })
                .eq('studio_id', id);
            setMemberCount(memCount || 0);

        } catch (e) {
            console.error('Error loading studio:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [id, user]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleRefresh = () => {
        setRefreshing(true);
        loadData();
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
                <Text style={styles.headerTitle}>{studio?.name || 'Studio'}</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                style={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
            >
                {/* Main Menu Grid */}
                <View style={styles.menuGrid}>
                    {/* Equipment */}
                    <TouchableOpacity
                        style={styles.menuCard}
                        onPress={() => router.push({
                            pathname: '/(home)/studio/equipment-list',
                            params: { studioId: id }
                        })}
                    >
                        <View style={[styles.menuIconBox, { backgroundColor: '#f0fdf4' }]}>
                            <Package size={28} color="#22c55e" />
                        </View>
                        <Text style={styles.menuLabel}>Equipment</Text>
                        <Text style={styles.menuCount}>{equipmentCount} items</Text>
                    </TouchableOpacity>

                    {/* Scan */}
                    <TouchableOpacity
                        style={styles.menuCard}
                        onPress={() => router.push({
                            pathname: '/(home)/checkout',
                            params: { studioId: id }
                        })}
                    >
                        <View style={[styles.menuIconBox, { backgroundColor: '#eff6ff' }]}>
                            <QrCode size={28} color="#3b82f6" />
                        </View>
                        <Text style={styles.menuLabel}>Scan</Text>
                        <Text style={styles.menuCount}>Checkout / Checkin</Text>
                    </TouchableOpacity>

                    {/* Activity */}
                    <TouchableOpacity
                        style={styles.menuCard}
                        onPress={() => router.push({
                            pathname: '/(home)/activity',
                            params: { studioId: id }
                        })}
                    >
                        <View style={[styles.menuIconBox, { backgroundColor: '#fef3c7' }]}>
                            <History size={28} color="#f59e0b" />
                        </View>
                        <Text style={styles.menuLabel}>Activity</Text>
                        <Text style={styles.menuCount}>Transaction log</Text>
                    </TouchableOpacity>

                    {/* Members */}
                    <TouchableOpacity
                        style={styles.menuCard}
                        onPress={() => router.push({
                            pathname: '/(home)/studio/members',
                            params: { studioId: id }
                        })}
                    >
                        <View style={[styles.menuIconBox, { backgroundColor: '#fce7f3' }]}>
                            <Users size={28} color="#ec4899" />
                        </View>
                        <Text style={styles.menuLabel}>Members</Text>
                        <Text style={styles.menuCount}>{memberCount} people</Text>
                    </TouchableOpacity>
                </View>

                {/* Role Badge */}
                <View style={styles.roleSection}>
                    <Text style={styles.roleLabel}>Your role</Text>
                    <View style={[
                        styles.roleBadge,
                        isOwner ? styles.roleBadgeOwner : styles.roleBadgeMember
                    ]}>
                        <Text style={styles.roleBadgeText}>
                            {isOwner ? 'Owner' : 'Member'}
                        </Text>
                    </View>
                </View>
            </ScrollView>
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
    content: { flex: 1, padding: 16 },
    menuGrid: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 12,
    },
    menuCard: {
        width: '48%', backgroundColor: '#fff', padding: 20, borderRadius: 16,
        borderWidth: 1, borderColor: '#eee',
    },
    menuIconBox: {
        width: 56, height: 56, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    },
    menuLabel: { fontSize: 16, fontWeight: '700', color: '#000', marginBottom: 2 },
    menuCount: { fontSize: 12, color: '#666' },
    roleSection: {
        marginTop: 24, padding: 16, backgroundColor: '#f9f9f9', borderRadius: 12,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    roleLabel: { fontSize: 14, color: '#666' },
    roleBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    roleBadgeOwner: { backgroundColor: '#000' },
    roleBadgeMember: { backgroundColor: '#e5e7eb' },
    roleBadgeText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
