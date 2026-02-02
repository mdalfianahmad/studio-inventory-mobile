import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Box } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

import * as AppleAuthentication from 'expo-apple-authentication';

WebBrowser.maybeCompleteAuthSession();

// The redirect URL that Supabase will send users back to
const REDIRECT_URL = 'studio-inventory://auth/callback';

export default function LoginScreen() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Apple Sign In logic
    async function signInWithApple() {
        setError(null);
        setLoading(true);
        try {
            const credential = await AppleAuthentication.signInAsync({
                requestedScopes: [
                    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                    AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
            });

            if (credential.identityToken) {
                const { error: appleError } = await supabase.auth.signInWithIdToken({
                    token: credential.identityToken,
                    provider: 'apple',
                });
                if (appleError) throw appleError;
            } else {
                throw new Error('No identityToken received');
            }
        } catch (e: any) {
            if (e.code === 'ERR_CANCELED') {
                // User cancelled
            } else {
                console.error('Apple Sign In Error:', e);
                setError(e.message || 'Apple authentication failed');
            }
        } finally {
            setLoading(false);
        }
    }

    // Listen for the OAuth callback URL
    useEffect(() => {
        const handleUrl = async ({ url }: { url: string }) => {
            console.log('Received deep link:', url);

            if (url.includes('access_token')) {
                try {
                    // Extract tokens from the URL fragment
                    const hashIndex = url.indexOf('#');
                    if (hashIndex !== -1) {
                        const fragment = url.substring(hashIndex + 1);
                        const params = new URLSearchParams(fragment);
                        const access_token = params.get('access_token');
                        const refresh_token = params.get('refresh_token');

                        if (access_token) {
                            console.log('Setting session from deep link...');
                            await supabase.auth.setSession({
                                access_token,
                                refresh_token: refresh_token || '',
                            });
                            console.log('Session set!');
                        }
                    }
                } catch (e) {
                    console.error('Error handling callback:', e);
                }
            }
        };

        // Listen for URL changes
        const subscription = Linking.addEventListener('url', handleUrl);

        // Check if app was opened with a URL
        Linking.getInitialURL().then((url) => {
            if (url) {
                console.log('Initial URL:', url);
                handleUrl({ url });
            }
        });

        return () => subscription.remove();
    }, []);

    async function signInWithProvider(provider: 'google' | 'azure') {
        setError(null);
        setLoading(true);

        try {
            console.log('Starting OAuth with redirect:', REDIRECT_URL);

            const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
                provider: provider,
                options: {
                    redirectTo: REDIRECT_URL,
                    skipBrowserRedirect: true,
                },
            });

            if (oauthError) throw oauthError;

            if (data?.url) {
                console.log('Opening auth URL...');

                // Use openAuthSessionAsync - this will auto-close when redirect happens
                const result = await WebBrowser.openAuthSessionAsync(
                    data.url,
                    REDIRECT_URL
                );

                console.log('Browser result:', result.type);

                if (result.type === 'success' && result.url) {
                    console.log('Got callback URL:', result.url);

                    // Parse the tokens from the callback URL
                    const hashIndex = result.url.indexOf('#');
                    if (hashIndex !== -1) {
                        const fragment = result.url.substring(hashIndex + 1);
                        const params = new URLSearchParams(fragment);
                        const access_token = params.get('access_token');
                        const refresh_token = params.get('refresh_token');

                        if (access_token) {
                            console.log('Setting session...');
                            await supabase.auth.setSession({
                                access_token,
                                refresh_token: refresh_token || '',
                            });
                            console.log('Session set, auth complete!');
                        }
                    }
                } else if (result.type === 'cancel' || result.type === 'dismiss') {
                    console.log('Browser was closed');
                    // Check if auth actually succeeded
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session) {
                        console.log('Session exists after browser close!');
                    }
                }
            }
        } catch (e: any) {
            console.error('OAuth Error:', e);
            setError(e.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    }

    async function checkSession() {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            console.log('Session found!');
        } else {
            setError('No session found. Please sign in.');
        }
        setLoading(false);
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="dark" />
            <View style={styles.content}>
                <View style={styles.header}>
                    <View style={styles.logoContainer}>
                        <Box size={32} color="#fff" strokeWidth={2.5} />
                    </View>
                    <Text style={styles.brandText}>
                        STUDIO<Text style={{ color: '#888' }}>INVENTORY</Text>
                    </Text>
                </View>

                <View style={styles.heroSection}>
                    <Text style={styles.title}>Organize your{'\n'}gear with ease.</Text>
                    <Text style={styles.subtitle}>
                        Track, manage, and share your studio equipment seamlessly across your team.
                    </Text>
                </View>

                {error && (
                    <View style={styles.infoContainer}>
                        <Text style={styles.infoText}>{error}</Text>
                    </View>
                )}

                <View style={styles.buttonContainer}>
                    {Platform.OS === 'ios' && (
                        <AppleAuthentication.AppleAuthenticationButton
                            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                            cornerRadius={14}
                            style={styles.appleButton}
                            onPress={signInWithApple}
                        />
                    )}

                    <TouchableOpacity
                        style={[styles.button, styles.googleButton]}
                        onPress={() => signInWithProvider('google')}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#000" />
                        ) : (
                            <>
                                <Text style={styles.googleIcon}>G</Text>
                                <Text style={styles.buttonText}>Continue with Google</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.button, styles.azureButton]}
                        onPress={() => signInWithProvider('azure')}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Text style={styles.azureIcon}>M</Text>
                                <Text style={[styles.buttonText, { color: '#fff' }]}>Continue with Microsoft</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.button, styles.checkButton]}
                        onPress={checkSession}
                        disabled={loading}
                    >
                        <Text style={styles.buttonText}>I've signed in → Check now</Text>
                    </TouchableOpacity>
                </View>

                <Text style={styles.footerText}>
                    Redirect: {REDIRECT_URL}
                </Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    content: { flex: 1, padding: 24, justifyContent: 'center' },
    header: { alignItems: 'center', marginBottom: 48 },
    logoContainer: {
        width: 64, height: 64, backgroundColor: '#000', borderRadius: 16,
        alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    },
    brandText: { fontSize: 20, fontWeight: '800', color: '#000' },
    heroSection: { marginBottom: 40 },
    title: {
        fontSize: 38, fontWeight: '900', color: '#000', letterSpacing: -1.5,
        lineHeight: 42, marginBottom: 12, textAlign: 'center',
    },
    subtitle: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22 },
    buttonContainer: { gap: 12, marginBottom: 24 },
    appleButton: { height: 50, width: '100%', marginBottom: 4 },
    button: {
        height: 54, borderRadius: 14, flexDirection: 'row',
        alignItems: 'center', justifyContent: 'center', gap: 10,
    },
    googleButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
    azureButton: { backgroundColor: '#0078D4' },
    checkButton: { backgroundColor: '#f0f0f0', marginTop: 8 },
    googleIcon: { fontSize: 18, fontWeight: '700', color: '#4285F4' },
    azureIcon: { fontSize: 18, fontWeight: '700', color: '#fff' },
    buttonText: { fontSize: 15, fontWeight: '600', color: '#000' },
    footerText: { textAlign: 'center', fontSize: 11, color: '#bbb', lineHeight: 20 },
    infoContainer: {
        backgroundColor: '#fff8e6', padding: 12, borderRadius: 8,
        marginBottom: 16, borderWidth: 1, borderColor: '#ffe0a0',
    },
    infoText: { color: '#996600', fontSize: 13, fontWeight: '500', textAlign: 'center' },
});
