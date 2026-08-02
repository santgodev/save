// =====================================================================
// /auth/callback — ruta real para los links de correo (confirmación de
// signup y recuperación de contraseña) y para el login de Google.
//
// Sin este archivo, expo-router no tiene ninguna ruta que matchee
// "auth/callback" y muestra su pantalla de "Unmatched Route" antes de
// que cualquier lógica de la app alcance a procesar el link.
//
// Flujo PKCE (ver src/lib/supabase.ts): el link llega como
// saveapp://auth/callback?code=...&type=recovery -- un query param
// normal, no un fragmento (#...). Se intentó primero con el flujo
// implicit (fragmento) y falló de forma consistente en pruebas reales:
// el fragmento se perdía entre el navegador y la app sin importar cómo
// se leyera del lado de Linking (getInitialURL, evento 'url', hook
// useURL, o capturarlo a nivel de módulo apenas carga el bundle -- se
// probaron las cuatro formas). El query string en cambio lo parsea
// expo-router de forma nativa como parte de matchear la ruta, así que
// useLocalSearchParams() lo entrega directo, sin ninguna carrera de
// timing con Linking.
// =====================================================================

import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../src/lib/supabase';
import { notify } from '../../src/lib/notify';

export default function AuthCallback() {
  const params = useLocalSearchParams<{ code?: string; type?: string }>();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const finish = async () => {
      const code = typeof params.code === 'string' ? params.code : undefined;
      const type = typeof params.type === 'string' ? params.type : undefined;

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          // Causa más probable: el link se "gasta" en la primera visita
          // -- si el cliente de correo lo pre-escanea por seguridad antes
          // de que el usuario lo toque (Gmail, Outlook, antivirus lo
          // hacen), el toque real ya llega con un código muerto.
          console.error('[auth/callback] exchangeCodeForSession falló:', error);
          notify.error(
            'Este link ya expiró o ya se usó. Pide un nuevo correo de recuperación e intenta de nuevo.',
            'No se pudo verificar el link'
          );
        } else if (type === 'recovery') {
          // Bandera leída por MainApp (app/index.tsx) al montar -- el
          // router.replace de abajo desmonta esta pantalla, así que
          // cualquier estado local se pierde; AsyncStorage es lo que ya
          // usa el resto de la app para pasar señales entre pantallas.
          await AsyncStorage.setItem('@save_password_recovery_pending', 'true');
        }
      } else {
        console.warn('[auth/callback] Sin `code` en los params:', params);
        notify.error(
          'Este link no es válido. Pide un nuevo correo e intenta de nuevo.',
          'No se pudo verificar el link'
        );
      }

      router.replace('/');
    };

    finish();
  }, [params.code, params.type]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#47ADA2" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F7F2' },
});
