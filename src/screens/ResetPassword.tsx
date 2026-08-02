import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { notify } from '../lib/notify';
import { useTheme } from '../theme/ThemeContext';
import { Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react-native';

const MIN_PASSWORD_LENGTH = 8;

interface ResetPasswordProps {
  /** Se llama tanto al terminar con éxito como al cancelar -- en ambos
   * casos MainApp vuelve a evaluar `session` y decide a dónde mandar
   * al usuario (login si canceló, dashboard/onboarding si ya quedó
   * logueado con la contraseña nueva). */
  onDone: () => void;
}

export function ResetPassword({ onDone }: ResetPasswordProps) {
  const { theme } = useTheme();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
    iconBox: {
      width: 72, height: 72, borderRadius: 24,
      backgroundColor: theme.colors.primary + '15',
      alignItems: 'center', justifyContent: 'center',
      alignSelf: 'center', marginBottom: 24,
    },
    title: { fontSize: 24, fontWeight: '900', color: theme.colors.onBackground, textAlign: 'center', marginBottom: 8 },
    subtitle: { fontSize: 15, color: theme.colors.onSurfaceVariant, textAlign: 'center', marginBottom: 32, lineHeight: 22 },
    inputGroup: { gap: 16 },
    inputWrapper: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: theme.colors.surfaceContainerLow,
      borderRadius: 18, paddingHorizontal: 20, height: 60,
      borderWidth: 1, borderColor: theme.colors.outlineVariant + '40',
    },
    inputIcon: { marginRight: 12, opacity: 0.7 },
    input: { flex: 1, fontSize: 16, color: theme.colors.onSurface, fontWeight: '500' },
    mainBtn: {
      height: 60, borderRadius: 18, flexDirection: 'row',
      justifyContent: 'center', alignItems: 'center', marginTop: 24, gap: 10,
      shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25, shadowRadius: 12, elevation: 4,
    },
    mainBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
    cancelBtn: { marginTop: 20, alignItems: 'center' },
    cancelText: { color: theme.colors.onSurfaceVariant, fontSize: 14, fontWeight: '600' },
  }), [theme]);

  const handleSubmit = async () => {
    if (!password || !confirmPassword) {
      notify.error('Completa los dos campos.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      notify.error(`Usa al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmPassword) {
      notify.error('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      notify.success('Listo', 'Tu contraseña se actualizó correctamente.');
      onDone();
    } catch (error: any) {
      notify.error(error.message, 'No pudimos actualizar tu contraseña');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    // El link de recuperación ya dejó una sesión activa (setSession en
    // app/index.tsx) -- si el usuario cancela acá, esa sesión con la
    // contraseña VIEJA seguiría activa. La cerramos para no dejarlo
    // logueado "por accidente" sin haber elegido entrar.
    await supabase.auth.signOut().catch(() => {});
    onDone();
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.iconBox}>
            <ShieldCheck size={32} color={theme.colors.primary} />
          </View>
          <Text style={styles.title}>Nueva contraseña</Text>
          <Text style={styles.subtitle}>Elige una contraseña nueva para tu cuenta de Save.</Text>

          <View style={styles.inputGroup}>
            <View style={styles.inputWrapper}>
              <Lock size={20} color={theme.colors.primary} style={styles.inputIcon} />
              <TextInput
                placeholder="Nueva contraseña"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                style={styles.input}
                placeholderTextColor={theme.colors.onSurfaceVariant}
                returnKeyType="next"
              />
              <TouchableOpacity onPress={() => setShowPassword(p => !p)} style={{ padding: 6 }}>
                {showPassword
                  ? <EyeOff size={20} color={theme.colors.onSurfaceVariant} />
                  : <Eye size={20} color={theme.colors.onSurfaceVariant} />}
              </TouchableOpacity>
            </View>

            <View style={styles.inputWrapper}>
              <Lock size={20} color={theme.colors.primary} style={styles.inputIcon} />
              <TextInput
                placeholder="Confirmar contraseña"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                style={styles.input}
                placeholderTextColor={theme.colors.onSurfaceVariant}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>
          </View>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading}
            style={[styles.mainBtn, { backgroundColor: theme.colors.primary }]}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.mainBtnText}>Guardar contraseña</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleCancel} style={styles.cancelBtn} disabled={loading}>
            <Text style={styles.cancelText}>Cancelar y cerrar sesión</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}
