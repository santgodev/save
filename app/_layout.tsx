import "./global.css";
import React, { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { LogBox } from 'react-native';
import { useFonts, Inter_400Regular, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import { Outfit_400Regular, Outfit_700Bold, Outfit_900Black } from '@expo-google-fonts/outfit';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

// Mismos colores que el splash nativo en app.json (plugin expo-splash-screen)
// -- si este Stack usara un color distinto al del splash que se acaba de
// ocultar, se ve un flash entre el splash nativo y el primer paint de JS.
const SPLASH_BG_LIGHT = '#F7F7F2';
const SPLASH_BG_DARK = '#09090B';

LogBox.ignoreLogs([
  'No native splash screen registered',
  'expo-splash-screen'
]);

const originalConsoleError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('No native splash screen registered')) return;
  if (args[0] && args[0].message && args[0].message.includes('No native splash screen registered')) return;
  originalConsoleError(...args);
};

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const splashBg = colorScheme === 'dark' ? SPLASH_BG_DARK : SPLASH_BG_LIGHT;
  const [loaded] = useFonts({
    Inter: Inter_400Regular,
    'Inter-Bold': Inter_700Bold,
    'Inter-Black': Inter_900Black,
    Outfit: Outfit_400Regular,
    'Outfit-Bold': Outfit_700Bold,
    'Outfit-Black': Outfit_900Black,
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync().catch(() => {
        // Silenciar error inofensivo de Expo Go al recargar
      });
    }
  }, [loaded]);

  if (!loaded) return null;

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: splashBg } }}>
        <Stack.Screen name="index" />
      </Stack>
    </>
  );
}
