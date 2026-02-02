import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://btadhbltkgjsgkfsgrjj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0YWRoYmx0a2dqc2drZnNncmpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDgyOTAsImV4cCI6MjA4MzUyNDI5MH0.tIUMkDZ9KcGneCZAKthIsBsyei0tzY5DpH7djnaEoME';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});
