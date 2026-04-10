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
  Alert
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/ThemeContext';
import { Mail, Lock, LogIn, UserPlus, Apple, Chrome, Eye, EyeOff, User } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp, Layout } from 'react-native-reanimated';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

WebBrowser.maybeCompleteAuthSession();

const { width, height } = Dimensions.get('window');

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
      paddingHorizontal: 24,
      paddingTop: height * 0.1,
      paddingBottom: 40,
    },
    bgCircle1: {
      position: 'absolute',
      top: -50,
      right: -50,
      width: 250,
      height: 250,
      borderRadius: 125,
      backgroundColor: theme.colors.primaryContainer,
      opacity: 0.1,
    },
    bgCircle2: {
      position: 'absolute',
      bottom: 50,
      left: -50,
      width: 300,
      height: 300,
      borderRadius: 150,
      backgroundColor: theme.colors.secondaryContainer,
      opacity: 0.05,
    },
    headerContainer: {
      alignItems: 'center',
      marginBottom: 40,
    },
    appNameContainer: {
      alignItems: 'center',
      marginBottom: 10,
    },
    logoImage: {
      width: 120,
      height: 120,
      marginBottom: 20,
    },
    appName: {
      fontSize: 48,
      fontWeight: '900',
      color: theme.colors.primary,
      fontFamily: theme.fonts.headline,
      letterSpacing: 10,
      textTransform: 'uppercase',
    },
    appNameUnderline: {
      width: 44,
      height: 6,
      backgroundColor: (theme.colors as any).pastel.yellow,
      borderRadius: 10,
      marginTop: 2,
    },
    tagline: {
      fontSize: 16,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
      marginTop: 8,
      lineHeight: 22,
      maxWidth: '80%',
    },
    formCard: {
      borderRadius: 32,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.5)',
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.05,
      shadowRadius: 30,
    },
    blurContainer: {
      padding: 32,
    },
    formTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: theme.colors.onBackground,
      marginBottom: 32,
      textAlign: 'center',
    },
    inputGroup: {
      gap: 16,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#fff',
      borderRadius: 16,
      paddingHorizontal: 16,
      height: 60,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
    },
    inputIcon: {
      marginRight: 12,
    },
    input: {
      flex: 1,
      fontSize: 16,
      color: theme.colors.onSurface,
    },
    forgotBtn: {
      alignSelf: 'flex-end',
      marginTop: 12,
    },
    forgotText: {
      color: theme.colors.primary,
      fontSize: 13,
      fontWeight: '600',
    },
    mainBtn: {
      height: 60,
      borderRadius: 16,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 32,
      gap: 12,
      elevation: 4,
      shadowColor: theme.colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 15,
    },
    mainBtnText: {
      color: '#fff',
      fontSize: 18,
      fontWeight: '700',
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
      fontSize: 13,
    },
    socialGroup: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 20,
    },
    socialBtn: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: '#fff',
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
      justifyContent: 'center',
      alignItems: 'center',
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
      Alert.alert('Error', 'Por favor ingresa todos los campos.');
      return;
    }
    if (mode === 'signup' && !fullName.trim()) {
      Alert.alert('Error', 'Por favor ingresa tu nombre.');
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
        Alert.alert('Éxito', '¡Cuenta creada! Revisa tu correo para confirmar.');
        setMode('login');
      }
      if (mode === 'login') onLoginSuccess();
    } catch (error: any) {
      Alert.alert('Error de Autenticación', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: 'google' | 'apple') => {
    setLoading(true);
    try {
      const redirectTo = Linking.createURL('/auth/callback');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type === 'success') {
          const { url } = result;
          
          const params: any = {};
          const parts = url.split(/[#?]/);
          parts.forEach(part => {
            if (part && part.includes('=')) {
              part.split('&').forEach(pair => {
                const [key, value] = pair.split('=');
                params[key] = value;
              });
            }
          });

          const access_token = params.access_token;
          const refresh_token = params.refresh_token;

          if (access_token && refresh_token) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (sessionError) throw sessionError;
            onLoginSuccess();
          } else {
             Alert.alert('Sesión no encontrada', 'No se pudieron extraer las llaves de acceso.');
          }
        }
      }
    } catch (error: any) {
      Alert.alert('Error de Autenticación', error.message);
    } finally {
      setLoading(false);
    }
  };

  const signInWithApple = () => handleOAuthLogin('apple');
  const signInWithGoogle = () => handleOAuthLogin('google');

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.bgCircle1} />
        <View style={styles.bgCircle2} />

        <Animated.View 
          entering={FadeInDown.delay(200).duration(800)}
          style={styles.headerContainer}
        >
          <Image 
            source={require('../../assets/images/logo.png')} 
            style={styles.logoImage} 
            resizeMode="contain" 
          />
          <View style={styles.appNameContainer}>
            <Text style={styles.appName}>SAVE</Text>
            <View style={styles.appNameUnderline} />
          </View>
          <Text style={styles.tagline}>
            {mode === 'login' ? 'Bienvenido de nuevo a tu paz financiera.' : 'Tu viaje hacia la libertad financiera comienza aquí.'}
          </Text>
        </Animated.View>

        <Animated.View 
          entering={FadeInUp.delay(400).duration(800)}
          layout={Layout.springify()}
          style={styles.formCard}
        >
          <BlurView intensity={80} tint="light" style={styles.blurContainer}>
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
                    ? <EyeOff size={18} color={theme.colors.onSurfaceVariant} />
                    : <Eye size={18} color={theme.colors.onSurfaceVariant} />}
                </TouchableOpacity>
              </View>
            </View>

            {mode === 'login' && (
              <TouchableOpacity style={styles.forgotBtn}>
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
                <Apple size={24} color="#000" />
              </TouchableOpacity>
              <TouchableOpacity onPress={signInWithGoogle} style={styles.socialBtn}>
                <Chrome size={24} color="#DB4437" />
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
          </BlurView>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
