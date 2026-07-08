import React, { useState, useRef, useMemo } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform, 
  ScrollView,
  Image,
  Dimensions,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard
} from 'react-native';
import { supabase } from '../lib/supabase';
import { notify } from '../lib/notify';
import { useTheme } from '../theme/ThemeContext';
import { Mail, Lock, LogIn, UserPlus, Eye, EyeOff, User } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp, Layout } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

WebBrowser.maybeCompleteAuthSession();

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
let GoogleSignin: any = null;

if (!isExpoGo) {
  GoogleSignin = require('@react-native-google-signin/google-signin').GoogleSignin;
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || 'TU_WEB_CLIENT_ID.apps.googleusercontent.com',
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || 'TU_IOS_CLIENT_ID.apps.googleusercontent.com',
  });
}

const { width, height } = Dimensions.get('window');

const GoogleIcon = ({ size = 24 }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.73 17.74 9.5 24 9.5z"/>
    <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </Svg>
);

const AppleIcon = ({ size = 24, color = "#000" }) => (
  <Svg width={size} height={size} viewBox="0 0 384 512">
    <Path fill={color} d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
  </Svg>
);

interface AuthProps {
  onLoginSuccess: () => void;
}

export function Auth({ onLoginSuccess }: AuthProps) {
  const { theme } = useTheme();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 40,
    },
    headerContainer: {
      alignItems: 'center',
      marginBottom: 56,
    },
    appNameContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    appNameChar: {
      fontSize: 64,
      fontWeight: '900',
      fontFamily: theme.fonts.headline,
      letterSpacing: -2,
    },
    tagline: {
      fontSize: 16,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
      marginTop: 4,
      fontWeight: '500',
    },
    formCard: {
      width: '100%',
    },
    formTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: theme.colors.onBackground,
      marginBottom: 28,
      textAlign: 'center',
    },
    inputGroup: {
      gap: 16,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surfaceContainerLow,
      borderRadius: 18,
      paddingHorizontal: 20,
      height: 60,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant + '40',
    },
    inputIcon: {
      marginRight: 12,
      opacity: 0.7,
    },
    input: {
      flex: 1,
      fontSize: 16,
      color: theme.colors.onSurface,
      fontWeight: '500',
    },
    forgotBtn: {
      alignSelf: 'flex-end',
      marginTop: 12,
    },
    forgotText: {
      color: theme.colors.primary,
      fontSize: 14,
      fontWeight: '700',
    },
    mainBtn: {
      height: 60,
      borderRadius: 18,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 24,
      gap: 10,
      shadowColor: theme.colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 4,
    },
    mainBtnText: {
      color: '#fff',
      fontSize: 17,
      fontWeight: '800',
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 32,
    },
    line: {
      flex: 1,
      height: 1,
      backgroundColor: theme.colors.outlineVariant,
      opacity: 0.5,
    },
    dividerText: {
      marginHorizontal: 16,
      color: theme.colors.onSurfaceVariant,
      fontSize: 14,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    socialGroup: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 20,
    },
    socialBtn: {
      width: 60,
      height: 60,
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    toggleBtn: {
      marginTop: 32,
      alignItems: 'center',
    },
    toggleText: {
      fontSize: 15,
      color: theme.colors.onSurfaceVariant,
    },
    toggleAction: {
      color: theme.colors.primary,
      fontWeight: '900',
    }
  }), [theme]);

  const toggleMode = () => setMode(mode === 'login' ? 'signup' : 'login');

  const handleAuth = async () => {
    if (!email || !password) {
      notify.error('Faltan campos por llenar.');
      return;
    }
    if (mode === 'signup' && !fullName.trim()) {
      notify.error('Falta tu nombre.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ 
            email, 
            password,
            options: {
              data: {
                full_name: fullName.trim(),
              }
            }
        });
        if (error) throw error;
        notify.success('¡Cuenta creada!', 'Revisa tu correo para confirmar.');
        setMode('login');
      }
      if (mode === 'login') onLoginSuccess();
    } catch (error: any) {
      notify.error(error.message, 'No pudimos autenticarte');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      notify.error('Ingresa tu email para recuperar la contraseña.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: Linking.createURL('/auth/callback'),
      });
      if (error) throw error;
      notify.success('Correo enviado', 'Revisa tu bandeja para restablecer tu contraseña.');
    } catch (error: any) {
      notify.error(error.message, 'No pudimos enviar el correo');
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      if (isExpoGo || !GoogleSignin) {
        // Fallback al método antiguo web para Expo Go
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: Linking.createURL('/auth/callback'),
            skipBrowserRedirect: true,
          },
        });
        if (error) throw error;
        
        if (data.url) {
          const res = await WebBrowser.openAuthSessionAsync(data.url, Linking.createURL('/auth/callback'));
          if (res.type === 'success' && res.url) {
            const params = res.url.split('#')[1];
            if (params) {
              const urlParams = params.split('&').reduce((acc: any, current) => {
                const [name, value] = current.split('=');
                acc[name] = value;
                return acc;
              }, {});
              
              if (urlParams.access_token && urlParams.refresh_token) {
                await supabase.auth.setSession({
                  access_token: urlParams.access_token,
                  refresh_token: urlParams.refresh_token,
                });
                onLoginSuccess();
              }
            }
          }
        }
        return;
      }

      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      if (userInfo.data?.idToken) {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: userInfo.data.idToken,
        });
        if (error) throw error;
        onLoginSuccess();
      } else {
        throw new Error('No se recibió el ID token de Google');
      }
    } catch (error: any) {
      if (error.code === 'SIGN_IN_CANCELLED') {
        // Usuario canceló, no hacer nada
      } else if (error.code === 'IN_PROGRESS') {
        notify.error('Inicio de sesión en progreso');
      } else {
        notify.error(error.message || 'Error desconocido', 'Error de Google Sign-In');
      }
    } finally {
      setLoading(false);
    }
  };

  const signInWithApple = async () => {
    if (Platform.OS !== 'ios') {
      notify.error('Apple Sign-In solo está disponible en dispositivos iOS', 'Plataforma no soportada');
      return;
    }
    setLoading(true);
    try {
      const csrf = Math.random().toString(36).substring(2, 15);
      const nonce = Math.random().toString(36).substring(2, 10);
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        nonce
      );
      
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        state: csrf,
        nonce: hashedNonce,
      });

      if (credential.identityToken) {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
          nonce,
        });

        if (error) throw error;
        onLoginSuccess();
      } else {
        throw new Error('No se recibió el Identity Token de Apple');
      }
    } catch (error: any) {
      if (error.code !== 'ERR_REQUEST_CANCELED') {
        notify.error(error.message || 'Error desconocido', 'Error de Apple Sign-In');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        <Animated.View 
          entering={FadeInDown.delay(100).duration(800).springify()}
          style={styles.headerContainer}
        >
          <View style={styles.appNameContainer}>
            <Text style={[styles.appNameChar, { color: theme.colors.primary }]}>S</Text>
            <Text style={[styles.appNameChar, { color: (theme.colors as any).pastel?.salmon || '#F0927B' }]}>A</Text>
            <Text style={[styles.appNameChar, { color: (theme.colors as any).pastel?.teal || '#8AD6CE' }]}>V</Text>
            <Text style={[styles.appNameChar, { color: (theme.colors as any).pastel?.lavender || '#D2A9D1' }]}>E</Text>
          </View>
          <Text style={styles.tagline}>
            0 fricción. 100% control.
          </Text>
        </Animated.View>

        <Animated.View 
          entering={FadeInUp.delay(300).duration(800).springify()}
          layout={Layout.springify()}
          style={styles.formCard}
        >
            <Text style={styles.formTitle}>
              {mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
            </Text>

            <View style={styles.inputGroup}>
              {mode === 'signup' && (
                <View style={styles.inputWrapper}>
                  <User size={20} color={theme.colors.primary} style={styles.inputIcon} />
                  <TextInput
                    placeholder="Tu nombre"
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                    style={styles.input}
                    placeholderTextColor={theme.colors.onSurfaceVariant}
                    returnKeyType="next"
                    onSubmitEditing={() => emailRef.current?.focus()}
                  />
                </View>
              )}

              <View style={styles.inputWrapper}>
                <Mail size={20} color={theme.colors.primary} style={styles.inputIcon} />
                <TextInput
                  placeholder="Email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={styles.input}
                  placeholderTextColor={theme.colors.onSurfaceVariant}
                  ref={emailRef}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
              </View>

              <View style={styles.inputWrapper}>
                <Lock size={20} color={theme.colors.primary} style={styles.inputIcon} />
                <TextInput
                  placeholder="Contraseña"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  style={styles.input}
                  placeholderTextColor={theme.colors.onSurfaceVariant}
                  ref={passwordRef}
                  returnKeyType="done"
                  onSubmitEditing={handleAuth}
                />
                <TouchableOpacity onPress={() => setShowPassword(p => !p)} style={{ padding: 6 }}>
                  {showPassword
                    ? <EyeOff size={20} color={theme.colors.onSurfaceVariant} />
                    : <Eye size={20} color={theme.colors.onSurfaceVariant} />}
                </TouchableOpacity>
              </View>
            </View>

            {mode === 'login' && (
              <TouchableOpacity style={styles.forgotBtn} onPress={handleForgotPassword}>
                <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              onPress={handleAuth} 
              disabled={loading}
              style={[styles.mainBtn, { backgroundColor: theme.colors.primary }]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Text style={styles.mainBtnText}>
                    {mode === 'login' ? 'Entrar' : 'Registrarse'}
                  </Text>
                  {mode === 'login' ? <LogIn size={20} color="#fff" /> : <UserPlus size={20} color="#fff" />}
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.line} />
              <Text style={styles.dividerText}>o continúa con</Text>
              <View style={styles.line} />
            </View>

            <View style={styles.socialGroup}>
              <TouchableOpacity onPress={signInWithApple} style={styles.socialBtn}>
                <AppleIcon size={24} color={theme.colors.onSurface} />
              </TouchableOpacity>
              <TouchableOpacity onPress={signInWithGoogle} style={styles.socialBtn}>
                <GoogleIcon size={24} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={toggleMode} style={styles.toggleBtn}>
              <Text style={styles.toggleText}>
                {mode === 'login' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
                <Text style={styles.toggleAction}>
                  {mode === 'login' ? 'Regístrate' : 'Inicia Sesión'}
                </Text>
              </Text>
            </TouchableOpacity>
        </Animated.View>
      </ScrollView>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}
