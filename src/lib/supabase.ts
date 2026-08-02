import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';
import { Platform } from 'react-native';

// Full failsafe storage implementation for Supabase Auth
// This prevents "Native module is null" crashes in iOS/Android by falling back gracefully
const LargeSafeStorage = {
  getItem: (key: string) => {
    try {
      if (Platform.OS === 'web') return Promise.resolve(localStorage.getItem(key));
      return AsyncStorage.getItem(key).catch(() => null);
    } catch (e) { return Promise.resolve(null); }
  },
  setItem: (key: string, value: string) => {
    try {
      if (Platform.OS === 'web') { localStorage.setItem(key, value); return Promise.resolve(); }
      return AsyncStorage.setItem(key, value).catch(() => {});
    } catch (e) { return Promise.resolve(); }
  },
  removeItem: (key: string) => {
    try {
      if (Platform.OS === 'web') { localStorage.removeItem(key); return Promise.resolve(); }
      return AsyncStorage.removeItem(key).catch(() => {});
    } catch (e) { return Promise.resolve(); }
  },
  // Extra methods sometimes used by storage libraries
  getAllKeys: () => {
    try {
      if (Platform.OS === 'web') return Promise.resolve(Object.keys(localStorage));
      return AsyncStorage.getAllKeys().catch(() => []);
    } catch (e) { return Promise.resolve([]); }
  },
  clear: () => {
    try {
      if (Platform.OS === 'web') { localStorage.clear(); return Promise.resolve(); }
      return AsyncStorage.clear().catch(() => {});
    } catch (e) { return Promise.resolve(); }
  }
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: LargeSafeStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // PKCE en vez del 'implicit' de default: los links de correo
        // (confirmación de signup, recuperación de contraseña) y el OAuth
        // de Google vuelven con ?code=... en vez de #access_token=... en
        // el fragmento. El fragmento resultó no ser confiable para pasar
        // de un navegador a la app nativa vía deep link -- se perdía en
        // el camino en pruebas reales (ver app/auth/callback.tsx). El
        // query string sí lo lee expo-router de forma nativa y confiable.
        flowType: 'pkce',
    },
});
