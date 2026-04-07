import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTheme, ThemeMode } from './theme';
import { supabase } from '../lib/supabase';
import * as Haptics from 'expo-haptics';

type ThemeContextType = {
  mode: ThemeMode;
  theme: any;
  setThemeMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children, userId }: { children: React.ReactNode, userId?: string }) => {
  const [mode, setMode] = useState<ThemeMode>('sage');

  useEffect(() => {
    const initTheme = async () => {
      try {
        // 1. FAST: Try local cache first for instant UI responsiveness
        const cached = await AsyncStorage.getItem('theme_preference');
        if (cached) {
          setMode(cached as ThemeMode);
        }

        // 2. AUTH SYNC: Try DB if userId provided to ensure cross-device consistency
        if (userId) {
          const { data, error } = await supabase
            .from('profiles')
            .select('theme_preference')
            .eq('id', userId)
            .maybeSingle();
          
          if (data?.theme_preference && data.theme_preference !== cached) {
            setMode(data.theme_preference as ThemeMode);
            await AsyncStorage.setItem('theme_preference', data.theme_preference);
          }
        }
      } catch (e) {
        console.error('Theme initialization error:', e);
      }
    };
    initTheme();
  }, [userId]);

  const setThemeMode = async (newMode: ThemeMode) => {
    try {
      // Haptic feedback for the premium feel
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      
      setMode(newMode);
      
      // Update local storage immediately for next app launch
      await AsyncStorage.setItem('theme_preference', newMode);
      
      // Update DB in background if user is logged in
      if (userId) {
        await supabase
          .from('profiles')
          .update({ theme_preference: newMode })
          .eq('id', userId);
      }
    } catch (e) {
      console.error('Error saving theme preference:', e);
    }
  };

  const theme = getTheme(mode);

  return (
    <ThemeContext.Provider value={{ mode, theme, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};
