import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme, Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTheme, ThemeMode } from './theme';
import { supabase } from '../lib/supabase';
import * as Haptics from 'expo-haptics';

export type ThemePreference = ThemeMode | 'system';

type ThemeContextType = {
  mode: ThemeMode;
  theme: any;
  preference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => void;
  // Mantenemos esto por retrocompatibilidad con componentes antiguos
  setThemeMode: (mode: ThemeMode) => void; 
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children, userId }: { children: React.ReactNode, userId?: string }) => {
  const systemColorScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>('system');

  // Resolved mode based on preference or system
  const mode: ThemeMode = preference === 'system' 
    ? (systemColorScheme === 'dark' ? 'sageDark' : 'sage')
    : preference;

  useEffect(() => {
    const initTheme = async () => {
      try {
        const cached = await AsyncStorage.getItem('theme_preference');
        if (cached) {
          setPreference(cached as ThemePreference);
        }

        if (userId) {
          const { data, error } = await supabase
            .from('profiles')
            .select('theme_preference')
            .eq('id', userId)
            .maybeSingle();
          
          if (data?.theme_preference && data.theme_preference !== cached) {
            setPreference(data.theme_preference as ThemePreference);
            await AsyncStorage.setItem('theme_preference', data.theme_preference);
          }
        }
      } catch (e) {
        console.error('Theme initialization error:', e);
      }
    };
    initTheme();
  }, [userId]);

  const setThemePreference = async (newPref: ThemePreference) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setPreference(newPref);
      await AsyncStorage.setItem('theme_preference', newPref);
      
      if (userId) {
        await supabase
          .from('profiles')
          .update({ theme_preference: newPref })
          .eq('id', userId);
      }
    } catch (e) {
      console.error('Error saving theme preference:', e);
    }
  };

  // Wrapper para componentes que usaban setThemeMode directamente
  const setThemeMode = (newMode: ThemeMode) => setThemePreference(newMode);

  const theme = getTheme(mode);

  return (
    <ThemeContext.Provider value={{ mode, theme, preference, setThemePreference, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};
