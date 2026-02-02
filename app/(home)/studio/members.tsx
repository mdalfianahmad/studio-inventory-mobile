import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, FlatList, TextInput, Alert, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { ArrowLeft, Users, UserPlus, Mail, X, Trash2 } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

interface Member {
    id: string;
    user_id: string;
    role: string;
}

interface Invitation {
    id: string;
    email: string;
    role: string;
    created_at: string;
}

export default function MembersScreen() {
    const { studioId } = useLocalSearchParams();
    const router = useRouter();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [members, setMembers] = useState<Member[]>([]);
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('colleague');
    const [sending, setSending] = useState(false);

    const loadData = useCallback(async () => {
        if (!studioId) return;
        try {
            // Fetch members
            const { data: memberData } = await supabase
                .from('studio_users')
                .select('*')
                .eq('studio_id', studioId);
            setMembers(memberData || []);

            // Fetch pending invitations
            const { data: inviteData } = await supabase
                .from('studio_invitations')
                .select('*')
                .eq('studio_id', studioId)
                .eq('status', 'pending');
            setInvitations(inviteData || []);
        } catch (e) {
            console.error('Error loading members:', e);
        } finally {
            setLoading(false);
        }
    }, [studioId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleInvite = async () => {
        if (!inviteEmail.trim()) {
            Alert.alert('Error', 'Please enter an email address');
            return;
        }

        setSending(true);
        try {
            // Check if already invited
            const { data: existing } = await supabase
                .from('studio_invitations')
                .select('id')
                .eq('studio_id', studioId)
                .eq('email', inviteEmail.toLowerCase())
                .single();

            if (existing) {
                Alert.alert('Error', 'This email has already been invited');
                return;
            }

            // Create invitation
            await supabase.from('studio_invitations').insert({
                studio_id: studioId,
                email: inviteEmail.toLowerCase(),
                role: inviteRole,
                invited_by: user?.id
            });

            setInviteEmail('');
            setShowInviteModal(false);
            loadData();
            Alert.alert('Success', 'Invitation sent!');
        } catch (e: any) {
            Alert.alert('Error', e.message);
        } finally {
            setSending(false);
        }
    };

    const handleRemoveMember = async (memberId: string) => {
        Alert.alert('Remove Member', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await supabase.from('studio_users').delete().eq('id', memberId);
                        loadData();
                    } catch (e) {
                        Alert.alert('Error', 'Failed to remove member');
                    }
                }
            }
        ]);
    };

    const handleCancelInvitation = async (invitationId: string) => {
        try {
            await supabase.from('studio_invitations').delete().eq('id', invitationId);
            loadData();
        } catch (e) {
            console.error('Error canceling invitation:', e);
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

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="dark" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <ArrowLeft size={22} color="#000" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Team</Text>
                <TouchableOpacity style={styles.inviteButton} onPress={() => setShowInviteModal(true)}>
                    <UserPlus size={20} color="#fff" />
                </TouchableOpacity>
            </View>

            <FlatList
                data={[...members, ...invitations.map(i => ({ ...i, isPending: true }))]}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                ListHeaderComponent={
                    <Text style={styles.sectionTitle}>
                        MEMBERS ({members.length})
                    </Text>
                }
                renderItem={({ item }) => {
                    if ('isPending' in item) {
                        // Pending invitation
                        return (
                            <View style={[styles.memberCard, styles.pendingCard]}>
                                <View style={styles.memberInfo}>
                                    <Text style={styles.memberEmail}>{item.email}</Text>
                                    <Text style={styles.memberRole}>
                                        Pending • {item.role}
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={() => handleCancelInvitation(item.id)}>
                                    <X size={20} color="#999" />
                                </TouchableOpacity>
                            </View>
                        );
                    }

                    // Active member
                    return (
                        <View style={styles.memberCard}>
                            <View style={styles.memberInfo}>
                                <Text style={styles.memberEmail}>
                                    {item.user_id === user?.id ? 'You' : `User ${item.user_id.substring(0, 8)}...`}
                                </Text>
                                <Text style={styles.memberRole}>{item.role}</Text>
                            </View>
                            {item.role !== 'owner' && item.user_id !== user?.id && (
                                <TouchableOpacity onPress={() => handleRemoveMember(item.id)}>
                                    <Trash2 size={18} color="#ef4444" />
                                </TouchableOpacity>
                            )}
                        </View>
                    );
                }}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Users size={48} color="#ddd" />
                        <Text style={styles.emptyText}>No team members yet</Text>
                    </View>
                }
            />

            {/* Invite Modal */}
            <Modal visible={showInviteModal} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Invite Member</Text>
                            <TouchableOpacity onPress={() => setShowInviteModal(false)}>
                                <X size={24} color="#000" />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.label}>Email</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="colleague@company.com"
                            placeholderTextColor="#999"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            value={inviteEmail}
                            onChangeText={setInviteEmail}
                        />

                        <Text style={styles.label}>Role</Text>
                        <View style={styles.roleOptions}>
                            <TouchableOpacity
                                style={[styles.roleOption, inviteRole === 'colleague' && styles.roleOptionActive]}
                                onPress={() => setInviteRole('colleague')}
                            >
                                <Text style={[styles.roleText, inviteRole === 'colleague' && styles.roleTextActive]}>
                                    Colleague
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.roleOption, inviteRole === 'admin' && styles.roleOptionActive]}
                                onPress={() => setInviteRole('admin')}
                            >
                                <Text style={[styles.roleText, inviteRole === 'admin' && styles.roleTextActive]}>
                                    Admin
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            style={styles.sendButton}
                            onPress={handleInvite}
                            disabled={sending}
                        >
                            {sending ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.sendButtonText}>Send Invitation</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
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
    inviteButton: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: '#000', alignItems: 'center', justifyContent: 'center',
    },
    listContent: { padding: 16 },
    sectionTitle: {
        fontSize: 12, fontWeight: '800', color: '#999', letterSpacing: 1, marginBottom: 12,
    },
    memberCard: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#f9f9f9', padding: 16, borderRadius: 12, marginBottom: 10,
    },
    pendingCard: { borderLeftWidth: 3, borderLeftColor: '#f59e0b' },
    memberInfo: { flex: 1 },
    memberEmail: { fontSize: 15, fontWeight: '700', color: '#000' },
    memberRole: { fontSize: 12, color: '#666', textTransform: 'capitalize' },
    emptyState: { alignItems: 'center', padding: 60 },
    emptyText: { color: '#999', marginTop: 12, fontSize: 14 },
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: 20, paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 24,
    },
    modalTitle: { fontSize: 20, fontWeight: '800', color: '#000' },
    label: { fontSize: 13, fontWeight: '700', color: '#666', marginBottom: 8 },
    input: {
        height: 50, backgroundColor: '#f5f5f5', borderRadius: 12, paddingHorizontal: 16,
        fontSize: 15, color: '#000', marginBottom: 16,
    },
    roleOptions: { flexDirection: 'row', gap: 10, marginBottom: 24 },
    roleOption: {
        flex: 1, height: 44, borderRadius: 10, backgroundColor: '#f5f5f5',
        alignItems: 'center', justifyContent: 'center',
    },
    roleOptionActive: { backgroundColor: '#000' },
    roleText: { fontSize: 14, fontWeight: '600', color: '#666' },
    roleTextActive: { color: '#fff' },
    sendButton: {
        height: 54, backgroundColor: '#000', borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
    },
    sendButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
