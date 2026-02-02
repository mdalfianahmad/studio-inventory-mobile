import React, { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthContextType {
    session: Session | null
    user: User | null
    loading: boolean
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        console.log('[Auth] Initializing...')

        // Get initial session
        supabase.auth.getSession().then(({ data: { session: initialSession }, error }) => {
            console.log('[Auth] Initial session:', initialSession ? 'Found' : 'None', error ? `Error: ${error.message}` : '')
            setSession(initialSession)
            setLoading(false)
        })

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
            console.log('[Auth] State changed:', event, newSession ? 'Has session' : 'No session')
            setSession(newSession)

            // Don't set loading to false on INITIAL_SESSION as getSession already handles it
            if (event !== 'INITIAL_SESSION') {
                setLoading(false)
            }
        })

        return () => {
            console.log('[Auth] Cleaning up subscription')
            subscription.unsubscribe()
        }
    }, [])

    const signOut = async () => {
        console.log('[Auth] Signing out...')
        setLoading(true)
        await supabase.auth.signOut()
        setSession(null)
        setLoading(false)
    }

    const value = {
        session,
        user: session?.user ?? null,
        loading,
        signOut,
    }

    console.log('[Auth] Current state - loading:', loading, 'session:', session ? 'exists' : 'null')

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
