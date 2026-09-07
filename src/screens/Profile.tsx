import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Animated, Dimensions, Image, Platform, ActivityIndicator, LayoutAnimation, UIManager, Linking, DeviceEventEmitter
} from 'react-native';
import {
  Settings, LogOut, Trash2, Bell, ShieldCheck,
  TrendingUp, Target, Sparkles, ChevronRight, ChevronDown,
  Shield, Eye, EyeOff, Octagon, Fingerprint, Info,
  Palette, Heart, History, User, Check, Lock
} from 'lucide-react-native';
import { TextInput, KeyboardAvoidingView, Modal } from 'react-native';
import { ConfirmModal } from '../components/ConfirmModal';
import { useTheme } from '../theme/ThemeContext';
import { normalize } from '../theme/theme';
import { supabase } from '../lib/supabase';
import { notify } from '../lib/notify';
import { calculateFinancialProfile, ProfileData, CycleDates } from '../utils/profileUtils';
import { useUserCycles } from '../lib/useCycleState';
import type { Session } from '@supabase/supabase-js';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

export const Profile = ({ session, transactions, pockets, onRefresh, onBack, onOpenPaywall }: { session: Session, transactions: any[], pockets: any[], onRefresh: () => void, onBack?: () => void, onOpenPaywall?: () => void }) => {
  const insets = useSafeAreaInsets();
  const { theme, mode, setThemePreference } = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scrollContent: { 
      paddingTop: Math.max(insets.top, 16) + 120, 
      paddingBottom: 120,
      paddingHorizontal: 24 
    },
    // --- HEADER ---
    headerContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
      position: 'relative'
    },
    backButton: {
      position: 'absolute',
      left: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: theme.colors.onSurface,
      letterSpacing: 0.5
    },

    // --- INSIGHT SECTION ---
    aiBriefCard: { 
      backgroundColor: theme.colors.glassWhite, 
      borderRadius: 28, 
      padding: 24, 
      marginBottom: 24,
      borderWidth: 1.5, 
      borderColor: theme.colors.divider,
      ...theme.shadows.soft 
    },
    aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
    aiLabel: { fontSize: 11, fontWeight: '900', color: theme.colors.primary, letterSpacing: 2, textTransform: 'uppercase' },
    aiBriefText: { fontSize: 18, fontWeight: '700', color: theme.colors.onSurface, lineHeight: 26, letterSpacing: -0.3 },

    // --- SCORE CARD ---
    section: { marginBottom: 24 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
    sectionTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.onSurface, letterSpacing: -0.5 },

    premiumScoreCard: { 
      backgroundColor: theme.colors.glassWhite, 
      borderRadius: 32, 
      padding: 24, 
      borderWidth: 1.5, 
      borderColor: theme.colors.divider,
      ...theme.shadows.premium 
    },
    scoreHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    scoreTitle: { fontSize: 13, fontWeight: '900', color: theme.colors.primary, textTransform: 'uppercase', letterSpacing: 1 },
    statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
    statusText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },

    scoreMainRow: { flexDirection: 'row', alignItems: 'center', gap: 24 },
    scoreCircle: { 
      width: 80, 
      height: 80, 
      borderRadius: 40, 
      borderWidth: 8, 
      borderColor: 'rgba(71, 173, 162, 0.1)', 
      alignItems: 'center', 
      justifyContent: 'center' 
    },
    scoreValue: { fontSize: 24, fontWeight: '900' },
    scoreMax: { fontSize: 10, color: theme.colors.onSurfaceVariant, fontWeight: '800', marginTop: -2 },
    
    scoreInfoBox: { flex: 1, gap: 12 },
    scoreExplanation: { fontSize: 13, color: theme.colors.onSurfaceVariant, lineHeight: 18, fontWeight: '600' },
    
    metricItem: { gap: 8 },
    metricLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    miniLabel: { fontSize: 10, fontWeight: '900', color: theme.colors.onSurfaceVariant, letterSpacing: 1 },
    miniVal: { fontSize: 12, fontWeight: '900', color: theme.colors.primary },
    metricBarContainer: { height: 8, borderRadius: 4, backgroundColor: 'rgba(71, 173, 162, 0.1)', overflow: 'hidden' },
    metricBar: { height: '100%', borderRadius: 4 },

    // --- HABITS ---
    habitsWrapper: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-start' },
    pillHabit: { 
      backgroundColor: theme.colors.primaryContainer, 
      paddingHorizontal: 18, 
      paddingVertical: 10, 
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.divider
    },
    pillHabitText: { fontSize: 13, fontWeight: '800', color: theme.colors.primary },

    // --- RULES ---
    compactRuleCard: { 
      backgroundColor: theme.colors.glassWhite, 
      borderRadius: 24, 
      padding: 16, 
      flexDirection: 'row', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      marginBottom: 12, 
      borderWidth: 1, 
      borderColor: theme.colors.divider,
      ...theme.shadows.soft 
    },
    ruleBrandInfo: { flex: 1, gap: 4 },
    ruleBrandName: { fontSize: 15, fontWeight: '900', color: theme.colors.onSurface, letterSpacing: -0.2 },
    ruleTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    typeIndicator: { width: 8, height: 8, borderRadius: 4 },
    ruleTypeText: { fontSize: 11, color: theme.colors.onSurfaceVariant, fontWeight: '800', textTransform: 'uppercase' },
    
    ruleActionContainer: { flexDirection: 'row', gap: 8 },
    actionBtnLabeled: { 
      paddingHorizontal: 10, 
      paddingVertical: 8, 
      borderRadius: 12, 
      alignItems: 'center', 
      justifyContent: 'center', 
      backgroundColor: theme.colors.primaryContainer, 
      gap: 4, 
      minWidth: 64,
      borderWidth: 1,
      borderColor: theme.colors.divider
    },
    actionBtnLabelText: { fontSize: 9, fontWeight: '900', color: theme.colors.primary, textTransform: 'uppercase' },

    // --- THEME SELECTOR ---
    themeSelectorGrid: { flexDirection: 'row', gap: 16 },
    themeCard: { 
      flex: 1, 
      backgroundColor: theme.colors.glassWhite, 
      borderRadius: 28, 
      padding: 20, 
      alignItems: 'center', 
      borderWidth: 1.5, 
      borderColor: theme.colors.divider,
      ...theme.shadows.soft
    },
    themeCardActive: { 
      borderColor: theme.colors.primary, 
      borderWidth: 2, 
      backgroundColor: theme.colors.primaryContainer
    },
    colorCircle: { 
      width: 48, 
      height: 48, 
      borderRadius: 24, 
      marginBottom: 14, 
      borderWidth: 3, 
      borderColor: '#FFF', 
      ...theme.shadows.soft
    },
    themeCardName: { fontSize: 15, fontWeight: '900', marginBottom: 4 },
    themeCardDesc: { fontSize: 11, fontWeight: '700', color: theme.colors.onSurfaceVariant, opacity: 0.6 },

    // --- SETTINGS LIST ---
    settingsCard: { 
      backgroundColor: theme.colors.glassWhite, 
      borderRadius: 28, 
      paddingVertical: 10, 
      paddingHorizontal: 16, 
      borderWidth: 1.5,
      borderColor: theme.colors.divider,
      ...theme.shadows.soft 
    },
    settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 },
    settingTitleCol: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    settingText: { fontSize: 15, fontWeight: '800', color: theme.colors.onSurface },
    divider: { height: 1.5, backgroundColor: theme.colors.divider },

    // --- FOOTER ---
    dangerAction: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 12, 
      padding: 20, 
      backgroundColor: theme.colors.errorContainer, 
      borderRadius: 24, 
      justifyContent: 'center', 
      marginTop: 16
    },
    dangerText: { fontSize: 16, fontWeight: '900', color: theme.colors.error },
    versionLabel: { alignSelf: 'center', marginTop: 32, fontSize: 11, fontWeight: '800', color: theme.colors.primary, opacity: 0.4 },

    // --- MODALS ---
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
    modalContent: { backgroundColor: theme.colors.surface, borderRadius: 28, padding: 24, ...theme.shadows.medium },
    modalTitle: { fontSize: 20, fontWeight: '900', color: theme.colors.onSurface, marginBottom: 16 },
    modalInput: { backgroundColor: theme.colors.surfaceContainerLow, borderRadius: 16, padding: 16, fontSize: 16, color: theme.colors.onSurface, marginBottom: 24, borderWidth: 1, borderColor: theme.colors.outlineVariant },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
    modalBtnCancel: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16 },
    modalBtnSave: { backgroundColor: theme.colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16 },
    modalBtnSaveTxt: { color: theme.colors.onPrimary, fontWeight: '800', fontSize: 15 },
  }), [theme, mode]);

  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [notifs, setNotifs] = useState({ alerts_high: true, alerts_hormiga: true, daily_tips: true });
  const [activeModal, setActiveModal] = useState<'delete' | 'logout' | 'edit_name' | 'change_password' | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);

  const MIN_PASSWORD_LENGTH = 8;
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const { activeCycle } = useUserCycles();

  useEffect(() => {
    fetchRules();
    const cycleDates: CycleDates | undefined = activeCycle
      ? { start: activeCycle.start_date, end: activeCycle.end_date ?? null }
      : undefined;
    const data = calculateFinancialProfile(transactions, rules, pockets, undefined, cycleDates);
    setProfileData(data);
  }, [transactions, pockets, activeCycle]);

  const fetchRules = async () => {
    try {
      const { data } = await supabase.from('user_spending_rules').select('*');
      if (data) setRules(data);
    } catch (e) { console.log(e); }
  };

  const updateRule = async (id: string, newType: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await supabase.from('user_spending_rules').update({ type: newType }).eq('id', id);
      fetchRules();
      onRefresh();
    } catch (e) { console.log(e); }
  };

  const handleSaveName = async () => {
    const trimmed = editNameValue.trim();
    if (!trimmed) return;
    setIsSavingName(true);
    try {
      await supabase.auth.updateUser({ data: { full_name: trimmed, name: trimmed } });
      setActiveModal(null);
      // Wait a moment for session update propagation
      setTimeout(() => onRefresh(), 500);
    } catch (e) {
      console.log(e);
      notify.error("No se pudo actualizar el nombre");
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSavePassword = async () => {
    if (!newPassword || !confirmNewPassword) {
      notify.error('Completa los dos campos.');
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      notify.error(`Usa al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (newPassword !== confirmNewPassword) {
      notify.error('Las contraseñas no coinciden.');
      return;
    }

    setIsSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      notify.success('Listo', 'Tu contraseña se actualizó correctamente.');
      setActiveModal(null);
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (e: any) {
      notify.error(e.message, 'No pudimos actualizar tu contraseña');
    } finally {
      setIsSavingPassword(false);
    }
  };


  const scoreColor = (score: number) => {
    if (score > 80) return theme.colors.primary;
    if (score > 40) return theme.colors.onSurfaceVariant;
    return theme.colors.error;
  };

  const capitalize = (text: string) => text?.toLowerCase().split(' ').map(s => s.charAt(0).toUpperCase() + s.substring(1)).join(' ');

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        <View style={styles.headerContainer}>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <ChevronRight size={28} color={theme.colors.onSurface} style={{ transform: [{ rotate: '180deg' }], marginLeft: -8 }} />
              <Text style={{ fontSize: 17, color: theme.colors.onSurface, fontWeight: '600', marginLeft: -4 }}>Cerrar</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>Mi Perfil</Text>
        </View>

      <View style={styles.aiBriefCard}>
         <View style={styles.aiBadge}>
            <Sparkles size={18} color={theme.colors.primary} fill={theme.colors.primary} />
            <Text style={styles.aiLabel}>SAVE INSIGHT</Text>
         </View>
         <Text style={styles.aiBriefText}>{profileData?.scoreMessage}</Text>
      </View>

      <View style={styles.section}>
         <View style={styles.premiumScoreCard}>
            <View style={styles.scoreHeader}>
               <Text style={styles.scoreTitle}>Salud Patrimonial</Text>
               <View style={[styles.statusBadge, { backgroundColor: scoreColor(profileData?.score || 0) + '20' }]}>
                  <Text style={[styles.statusText, { color: scoreColor(profileData?.score || 0) }]}>
                    { (profileData?.score || 0) > 80 ? 'Excelente' : (profileData?.score || 0) > 40 ? 'Progresando' : 'Crítico' }
                  </Text>
               </View>
            </View>
            
            <View style={styles.scoreMainRow}>
               <View style={[styles.scoreCircle, { borderColor: scoreColor(profileData?.score || 0) + '30' }]}>
                  <Text style={[styles.scoreValue, { color: scoreColor(profileData?.score || 0) }]}>{profileData?.score}</Text>
                  <Text style={styles.scoreMax}>/ 100</Text>
               </View>
               <View style={styles.scoreInfoBox}>
                  <Text style={styles.scoreExplanation}>
                    Tu constancia en el registro de gastos define esta métrica.
                  </Text>
               </View>
            </View>
         </View>
      </View>

      <View style={styles.section}>
         <View style={styles.sectionHeader}>
            <Target size={18} color={theme.colors.primary} strokeWidth={2.5} />
            <Text style={styles.sectionTitle}>Patrones Detectados</Text>
         </View>
         <View style={styles.habitsWrapper}>
            {profileData?.topHabits.map((habit, i) => (
               <View key={i} style={styles.pillHabit}>
                  <Text style={styles.pillHabitText}>{capitalize(habit)}</Text>
               </View>
            ))}
            {!profileData ? (
              <Text style={{ fontStyle: 'italic', color: theme.colors.onSurfaceVariant, fontSize: 13 }}>Escaneando hábitos...</Text>
            ) : profileData.topHabits.length === 0 ? (
              <Text style={{ fontStyle: 'italic', color: theme.colors.onSurfaceVariant, fontSize: 13 }}>Aún no hay suficientes datos.</Text>
            ) : null}
         </View>
      </View>

      <View style={styles.section}>
         <View style={styles.sectionHeader}>
            <User size={18} color={theme.colors.primary} strokeWidth={2.5} />
            <Text style={styles.sectionTitle}>Tu Cuenta</Text>
         </View>
         <View style={styles.settingsCard}>
            <TouchableOpacity 
              style={[styles.settingRow, { paddingVertical: 14 }]}
              onPress={() => {
                const currentName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || '';
                setEditNameValue(currentName);
                setActiveModal('edit_name');
              }}
            >
               <View style={styles.settingTitleCol}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: theme.colors.surfaceContainerHighest, alignItems: 'center', justifyContent: 'center' }}>
                     <User size={18} color={theme.colors.onSurfaceVariant} />
                  </View>
                  <View>
                    <Text style={styles.settingText}>Nombre</Text>
                    <Text style={{ fontSize: 12, color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
                      {session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'Toca para agregar tu nombre'}
                    </Text>
                  </View>
               </View>
               <ChevronRight size={18} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>

            <View style={{ height: 1, backgroundColor: theme.colors.divider, marginLeft: 52 }} />

            <TouchableOpacity
              style={[styles.settingRow, { paddingVertical: 14 }]}
              onPress={() => {
                setNewPassword('');
                setConfirmNewPassword('');
                setActiveModal('change_password');
              }}
            >
               <View style={styles.settingTitleCol}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: theme.colors.surfaceContainerHighest, alignItems: 'center', justifyContent: 'center' }}>
                     <Lock size={18} color={theme.colors.onSurfaceVariant} />
                  </View>
                  <Text style={styles.settingText}>Cambiar contraseña</Text>
               </View>
               <ChevronRight size={18} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>

            <View style={{ height: 1, backgroundColor: theme.colors.divider, marginLeft: 52 }} />

            <TouchableOpacity
              style={[styles.settingRow, { paddingVertical: 14 }]}
              onPress={() => {
                if (onOpenPaywall) onOpenPaywall();
              }}
            >
               <View style={styles.settingTitleCol}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: theme.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
                     <Sparkles size={18} color={theme.colors.primary} />
                  </View>
                  <Text style={[styles.settingText, { color: theme.colors.primary }]}>Suscripción PRO</Text>
               </View>
               <ChevronRight size={18} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>
         </View>
      </View>

      <View style={styles.section}>
         <View style={styles.sectionHeader}>
            <Palette size={18} color={theme.colors.primary} strokeWidth={2.5} />
            <Text style={styles.sectionTitle}>Apariencia</Text>
         </View>
         <View style={styles.settingsCard}>
            <View style={[styles.settingRow, { paddingHorizontal: 4 }]}>
               <View style={styles.settingTitleCol}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: theme.colors.surfaceContainerHighest, alignItems: 'center', justifyContent: 'center' }}>
                     <Eye size={18} color={theme.colors.onSurfaceVariant} />
                  </View>
                  <Text style={styles.settingText}>Modo Oscuro</Text>
               </View>
               <Switch 
                  value={mode === 'sageDark'}
                  onValueChange={(val) => setThemePreference(val ? 'sageDark' : 'sage')}
                  trackColor={{ false: theme.colors.surfaceContainerHighest, true: theme.colors.primary }}
                  thumbColor={theme.colors.onPrimary}
               />
            </View>
         </View>
      </View>

      <View style={styles.section}>
         <View style={styles.sectionHeader}>
            <ShieldCheck size={18} color={theme.colors.primary} strokeWidth={2.5} />
            <Text style={styles.sectionTitle}>Legal y Privacidad</Text>
         </View>
         <View style={styles.settingsCard}>
            <TouchableOpacity 
              style={[styles.settingRow, { paddingVertical: 14 }]}
              onPress={() => Linking.openURL('https://eveenia.com/es/save/terms')}
            >
               <View style={styles.settingTitleCol}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: theme.colors.surfaceContainerHighest, alignItems: 'center', justifyContent: 'center' }}>
                     <Info size={18} color={theme.colors.onSurfaceVariant} />
                  </View>
                  <Text style={styles.settingText}>Términos de Servicio</Text>
               </View>
               <ChevronRight size={18} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>
            
            <View style={{ height: 1, backgroundColor: theme.colors.divider, marginLeft: 52 }} />
            
            <TouchableOpacity 
              style={[styles.settingRow, { paddingVertical: 14 }]}
              onPress={() => Linking.openURL('https://eveenia.com/es/save/privacy')}
            >
               <View style={styles.settingTitleCol}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: theme.colors.surfaceContainerHighest, alignItems: 'center', justifyContent: 'center' }}>
                     <Shield size={18} color={theme.colors.onSurfaceVariant} />
                  </View>
                  <Text style={styles.settingText}>Política de Privacidad</Text>
               </View>
               <ChevronRight size={18} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>
         </View>
      </View>

      <View style={[styles.section, { paddingBottom: 40 }]}>
         <TouchableOpacity 
           activeOpacity={0.7}
           style={[styles.dangerAction, { marginBottom: 12 }]} 
           onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              setActiveModal('delete');
           }}
         >
            <Trash2 size={18} color={theme.colors.error} />
            <Text style={[styles.dangerText, { color: theme.colors.error }]}>Eliminar Cuenta y Datos</Text>
         </TouchableOpacity>

         <TouchableOpacity 
           activeOpacity={0.7}
           style={styles.dangerAction} 
           onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              setActiveModal('logout');
           }}
         >
            <LogOut size={20} color={theme.colors.error} strokeWidth={2.5} />
            <Text style={styles.dangerText}>Cerrar sesión</Text>
         </TouchableOpacity>

         {__DEV__ && (
           <>
             <TouchableOpacity 
               activeOpacity={0.7}
               style={[styles.dangerAction, { backgroundColor: theme.colors.primaryContainer }]} 
               onPress={async () => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  await AsyncStorage.setItem('@dev_force_welcome_card', 'true');
                  alert("Tarjeta de bienvenida activada. Ve a la pestaña 'Resumen' para verla.");
               }}
             >
               <Sparkles size={20} color={theme.colors.primary} strokeWidth={2.5} />
               <Text style={[styles.dangerText, { color: theme.colors.primary }]}>[DEV] Ver Tarjeta de Bienvenida</Text>
             </TouchableOpacity>

             <TouchableOpacity 
               activeOpacity={0.7}
               style={[styles.dangerAction, { backgroundColor: (theme.colors as any).pastel.lavender + '30', marginTop: 12 }]} 
               onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  DeviceEventEmitter.emit('force_show_intro_tour');
               }}
             >
               <TrendingUp size={20} color={(theme.colors as any).pastel.lavender} strokeWidth={2.5} />
               <Text style={[styles.dangerText, { color: (theme.colors as any).pastel.lavender }]}>[DEV] Ver Intro (SAVE)</Text>
             </TouchableOpacity>
           </>
         )}

         <Text style={styles.versionLabel}>SAVE v{Constants.expoConfig?.version ?? '—'} • PREMIUM EDITION</Text>
      </View>
    </ScrollView>

    <ConfirmModal
        visible={activeModal === 'delete'}
        title="Eliminar cuenta"
        message="Esta acción es irreversible. Se borrarán todos tus datos financieros, bolsillos y movimientos de forma permanente."
        confirmText={isDeleting ? "Borrando..." : "Eliminar Todo"}
        requireInputToConfirm="ELIMINAR"
        cancelText="Cancelar"
        icon={Trash2}
        isDestructive={true}
        onCancel={() => {
          if (!isDeleting) setActiveModal(null);
        }}
        onConfirm={async () => {
          if (isDeleting) return;
          setIsDeleting(true);
          console.log('Borrar cuenta solicitado...');
          try {
            // Pasar el access_token explícito: sin esto, si la sesión no
            // terminó de cargar, supabase-js puede caer al anon key y la
            // Edge Function responde 401 (mismo patrón que Scanner.tsx/TopBar.tsx).
            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData?.session?.access_token;
            if (!accessToken) {
              throw new Error('No hay sesión activa. Vuelve a iniciar sesión.');
            }

            const { error } = await supabase.functions.invoke('delete-account', {
              body: {},
              headers: { Authorization: `Bearer ${accessToken}` },
            });

            if (error) {
              console.error("Error al borrar cuenta:", error);
              notify.error("No se pudo eliminar la cuenta. Intenta nuevamente.");
              setIsDeleting(false);
              setActiveModal(null);
              return;
            }
            
            await supabase.auth.signOut(); 
          } catch (e) {
            console.error("Excepción al borrar cuenta:", e);
            notify.error("Ocurrió un error inesperado al eliminar la cuenta.");
            setIsDeleting(false);
            setActiveModal(null);
          }
        }}
     />

     <ConfirmModal
        visible={activeModal === 'logout'}
        title="Cerrar sesión"
        message="¿Estás seguro que quieres salir de tu cuenta?"
        confirmText="Salir"
        cancelText="Cancelar"
        icon={LogOut}
        isDestructive={true}
        onCancel={() => setActiveModal(null)}
        onConfirm={async () => {
          await supabase.auth.signOut();
        }}
    />

    <Modal visible={activeModal === 'edit_name'} transparent animationType="fade">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Editar Nombre</Text>
          <TextInput
            style={styles.modalInput}
            value={editNameValue}
            onChangeText={setEditNameValue}
            placeholder="Tu nombre"
            placeholderTextColor={theme.colors.onSurfaceVariant}
            autoFocus
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={handleSaveName}
          />
          <View style={styles.modalActions}>
            <TouchableOpacity 
              style={styles.modalBtnCancel} 
              onPress={() => setActiveModal(null)}
              disabled={isSavingName}
            >
              <Text style={{ color: theme.colors.onSurfaceVariant, fontWeight: '800' }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.modalBtnSave, { opacity: (editNameValue.trim() && !isSavingName) ? 1 : 0.5 }]} 
              onPress={handleSaveName}
              disabled={!editNameValue.trim() || isSavingName}
            >
              {isSavingName ? (
                <ActivityIndicator color={theme.colors.onPrimary} size="small" />
              ) : (
                <Text style={styles.modalBtnSaveTxt}>Guardar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    <Modal visible={activeModal === 'change_password'} transparent animationType="fade">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Cambiar contraseña</Text>

          <View style={{ position: 'relative', marginBottom: 16 }}>
            <TextInput
              style={[styles.modalInput, { marginBottom: 0, paddingRight: 48 }]}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Nueva contraseña"
              placeholderTextColor={theme.colors.onSurfaceVariant}
              secureTextEntry={!showNewPassword}
              autoFocus
              returnKeyType="next"
            />
            <TouchableOpacity
              onPress={() => setShowNewPassword(p => !p)}
              style={{ position: 'absolute', right: 16, top: 0, bottom: 0, justifyContent: 'center' }}
            >
              {showNewPassword
                ? <EyeOff size={20} color={theme.colors.onSurfaceVariant} />
                : <Eye size={20} color={theme.colors.onSurfaceVariant} />}
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.modalInput}
            value={confirmNewPassword}
            onChangeText={setConfirmNewPassword}
            placeholder="Confirmar contraseña"
            placeholderTextColor={theme.colors.onSurfaceVariant}
            secureTextEntry={!showNewPassword}
            returnKeyType="done"
            onSubmitEditing={handleSavePassword}
          />

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.modalBtnCancel}
              onPress={() => setActiveModal(null)}
              disabled={isSavingPassword}
            >
              <Text style={{ color: theme.colors.onSurfaceVariant, fontWeight: '800' }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtnSave, { opacity: (newPassword && confirmNewPassword && !isSavingPassword) ? 1 : 0.5 }]}
              onPress={handleSavePassword}
              disabled={!newPassword || !confirmNewPassword || isSavingPassword}
            >
              {isSavingPassword ? (
                <ActivityIndicator color={theme.colors.onPrimary} size="small" />
              ) : (
                <Text style={styles.modalBtnSaveTxt}>Guardar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    </View>
  );
};
