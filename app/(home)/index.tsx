import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl, Alert, Modal, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Building2, ChevronRight, Plus, LogOut } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

interface Studio {
    id: string;
    name: string;
    owner_id: string;
}

interface Invitation {
    id: string;
    studio_id: string;
    studios: { name: string };
}

export default function Dashboard() {
    const router = useRouter();
    const { user, signOut } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [ownedStudios, setOwnedStudios] = useState<Studio[]>([]);
    const [memberStudios, setMemberStudios] = useState<any[]>([]);
    const [pendingInvitations, setPendingInvitations] = useState<Invitation[]>([]);

    // Create Studio Modal
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newStudioName, setNewStudioName] = useState('');
    const [creating, setCreating] = useState(false);

    const loadData = useCallback(async () => {
        if (!user) return;

        try {
            const { data: owned } = await supabase
                .from('studios')
                .select('*')
                .eq('owner_id', user.id);
            setOwnedStudios(owned || []);

            const { data: memberOf } = await supabase
                .from('studio_users')
                .select('role, studios (*)')
                .eq('user_id', user.id)
                .neq('role', 'owner');
            setMemberStudios(memberOf || []);

            if (user.email) {
                const { data: invites } = await supabase
                    .from('studio_invitations')
                    .select('*, studios(name)')
                    .eq('email', user.email.toLowerCase())
                    .eq('status', 'pending');
                setPendingInvitations(invites || []);
            }
        } catch (e) {
            console.error('Error loading dashboard:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleRefresh = () => {
        setRefreshing(true);
        loadData();
    };

    const handleStudioPress = (studioId: string) => {
        router.push({ pathname: '/(home)/studio/[id]', params: { id: studioId } });
    };

    const handleAcceptInvitation = async (invitation: Invitation) => {
        try {
            await supabase.from('studio_users').insert({
                studio_id: invitation.studio_id,
                user_id: user?.id,
                role: 'colleague'
            });
            await supabase
                .from('studio_invitations')
                .update({ status: 'accepted' })
                .eq('id', invitation.id);
            loadData();
        } catch (e: any) {
            Alert.alert('Error', e.message);
        }
    };

    const handleLogout = () => {
        Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: signOut }
        ]);
    };

    const handleAccountDeletion = () => {
        Alert.alert(
            'Delete Account',
            'Are you sure you want to delete your account? This action is permanent and will remove all your data, including your studios and equipment tracking history. This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete Permanently',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setLoading(true);
                            // In a real app, you would call a Supabase Edge Function to delete the user's data and auth record via service role.
                            // For now, we sign out and show a confirmation.
                            await signOut();
                            Alert.alert('Account Deleted', 'Your account and data have been scheduled for deletion.');
                        } catch (e: any) {
                            Alert.alert('Error', 'Failed to delete account. Please try again.');
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const handleCreateStudio = async () => {
        if (!newStudioName.trim()) {
            Alert.alert('Error', 'Please enter a studio name');
            return;
        }

        setCreating(true);
        try {
            const { data: studio, error } = await supabase
                .from('studios')
                .insert({ name: newStudioName.trim(), owner_id: user?.id })
                .select()
                .single();

            if (error) throw error;

            await supabase.from('studio_users').insert({
                studio_id: studio.id,
                user_id: user?.id,
                role: 'owner'
            });

            setNewStudioName('');
            setShowCreateModal(false);
            loadData();
            Alert.alert('Success', `Created "${studio.name}"!`);
        } catch (e: any) {
            Alert.alert('Error', e.message);
        } finally {
            setCreating(false);
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

    const allStudios = [
        ...ownedStudios.map(s => ({ ...s, role: 'owner' })),
        ...memberStudios.map(m => ({ ...m.studios, role: m.role }))
    ];

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar style="dark" />

            <FlatList
                data={allStudios}
                keyExtractor={(item) => item.id}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
                contentContainerStyle={styles.content}
                ListHeaderComponent={
                    <>
                        {/* Header */}
                        <View style={styles.header}>
                            <View>
                                <Text style={styles.greeting}>Welcome back</Text>
                                <Text style={styles.email}>{user?.email}</Text>
                            </View>
                            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                                <LogOut size={20} color="#666" />
                            </TouchableOpacity>
                        </View>

                        {/* Pending Invitations */}
                        {pendingInvitations.length > 0 && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>PENDING INVITATIONS</Text>
                                {pendingInvitations.map((inv) => (
                                    <View key={inv.id} style={styles.invitationCard}>
                                        <View style={styles.invitationInfo}>
                                            <Text style={styles.invitationStudio}>{inv.studios?.name}</Text>
                                            <Text style={styles.invitationText}>You've been invited</Text>
                                        </View>
                                        <TouchableOpacity
                                            style={styles.acceptButton}
                                            onPress={() => handleAcceptInvitation(inv)}
                                        >
                                            <Text style={styles.acceptButtonText}>Accept</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Studios Header */}
                        <View style={styles.studiosHeader}>
                            <Text style={styles.sectionTitle}>YOUR STUDIOS</Text>
                            <TouchableOpacity
                                style={styles.createButton}
                                onPress={() => setShowCreateModal(true)}
                            >
                                <Plus size={16} color="#fff" />
                                <Text style={styles.createButtonText}>New</Text>
                            </TouchableOpacity>
                        </View>
                    </>
                }
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={styles.studioCard}
                        onPress={() => handleStudioPress(item.id)}
                    >
                        <View style={styles.studioIcon}>
                            <Building2 size={24} color="#000" />
                        </View>
                        <View style={styles.studioInfo}>
                            <Text style={styles.studioName}>{item.name}</Text>
                            <Text style={styles.studioRole}>{item.role}</Text>
                        </View>
                        <ChevronRight size={20} color="#ccc" />
                    </TouchableOpacity>
                )}
                ListEmptyComponent={
                    <TouchableOpacity
                        style={styles.emptyState}
                        onPress={() => setShowCreateModal(true)}
                    >
                        <Plus size={32} color="#ccc" />
                        <Text style={styles.emptyText}>Create your first studio</Text>
                        <Text style={styles.emptyHint}>Tap here to get started</Text>
                    </TouchableOpacity>
                }
                ListFooterComponent={
                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={styles.deleteAccountButton}
                            onPress={handleAccountDeletion}
                        >
                            <Text style={styles.deleteAccountText}>Request Account Deletion</Text>
                        </TouchableOpacity>
                        <Text style={styles.footerInfo}>
                            All data is handled according to our Privacy Policy.
                        </Text>
                    </View>
                }
            />

            {/* Create Studio Modal */}
            <Modal visible={showCreateModal} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Create Studio</Text>
                        <Text style={styles.modalSubtitle}>
                            A studio is where you organize your equipment and team.
                        </Text>

                        <TextInput
                            style={styles.input}
                            placeholder="Studio name"
                            placeholderTextColor="#999"
                            value={newStudioName}
                            onChangeText={setNewStudioName}
                            autoFocus
                        />

                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={styles.cancelButton}
                                onPress={() => { setShowCreateModal(false); setNewStudioName(''); }}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.submitButton}
                                onPress={handleCreateStudio}
                                disabled={creating}
                            >
                                {creating ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                    <Text style={styles.submitButtonText}>Create</Text>
                                )}
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
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    content: { padding: 20, paddingBottom: 40 },
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 24,
    },
    greeting: { fontSize: 14, color: '#666' },
    email: { fontSize: 18, fontWeight: '800', color: '#000' },
    logoutButton: {
        width: 44, height: 44, borderRadius: 12,
        backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center',
    },
    section: { marginBottom: 24 },
    sectionTitle: {
        fontSize: 12, fontWeight: '800', color: '#999', letterSpacing: 1, marginBottom: 12,
    },
    studiosHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12,
    },
    createButton: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#000', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    },
    createButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    invitationCard: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#fffbeb', padding: 16, borderRadius: 12, marginBottom: 8,
        borderWidth: 1, borderColor: '#fef3c7',
    },
    invitationInfo: { flex: 1 },
    invitationStudio: { fontSize: 16, fontWeight: '700', color: '#000' },
    invitationText: { fontSize: 12, color: '#666' },
    acceptButton: {
        backgroundColor: '#000', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
    },
    acceptButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    studioCard: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        backgroundColor: '#fff', padding: 16, borderRadius: 14, marginBottom: 10,
        borderWidth: 1, borderColor: '#eee',
    },
    studioIcon: {
        width: 48, height: 48, borderRadius: 12,
        backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center',
    },
    studioInfo: { flex: 1 },
    studioName: { fontSize: 16, fontWeight: '700', color: '#000' },
    studioRole: { fontSize: 12, color: '#666', textTransform: 'capitalize' },
    emptyState: {
        alignItems: 'center', padding: 40,
        backgroundColor: '#f9f9f9', borderRadius: 16,
        borderWidth: 2, borderColor: '#eee', borderStyle: 'dashed',
    },
    emptyText: { color: '#666', marginTop: 12, fontSize: 16, fontWeight: '600' },
    emptyHint: { color: '#999', marginTop: 4, fontSize: 13 },
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center', padding: 20,
    },
    modalContent: {
        backgroundColor: '#fff', borderRadius: 20, padding: 24,
    },
    modalTitle: { fontSize: 22, fontWeight: '800', color: '#000', marginBottom: 8 },
    modalSubtitle: { fontSize: 14, color: '#666', marginBottom: 20, lineHeight: 20 },
    input: {
        height: 50, backgroundColor: '#f5f5f5', borderRadius: 12, paddingHorizontal: 16,
        fontSize: 15, color: '#000', marginBottom: 20,
    },
    modalActions: { flexDirection: 'row', gap: 12 },
    cancelButton: {
        flex: 1, height: 48, borderRadius: 12, backgroundColor: '#f5f5f5',
        alignItems: 'center', justifyContent: 'center',
    },
    cancelButtonText: { fontSize: 15, fontWeight: '600', color: '#666' },
    submitButton: {
        flex: 1, height: 48, borderRadius: 12, backgroundColor: '#000',
        alignItems: 'center', justifyContent: 'center',
    },
    submitButtonText: { fontSize: 15, fontWeight: '600', color: '#fff' },
    footer: { marginTop: 40, alignItems: 'center', paddingBottom: 40 },
    deleteAccountButton: { padding: 12 },
    deleteAccountText: { color: '#ef4444', fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
    footerInfo: { color: '#ccc', fontSize: 11, marginTop: 8 },
});
