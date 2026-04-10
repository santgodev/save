import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Animated, Dimensions, Alert, Image, Platform
} from 'react-native';
import { 
  Settings, LogOut, Trash2, Bell, ShieldCheck, 
  TrendingUp, Target, Sparkles, ChevronRight,
  Shield, Eye, Octagon, Fingerprint, Info,
  Palette, Heart
} from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { normalize } from '../theme/theme';
import { supabase } from '../lib/supabase';
import { calculateFinancialProfile, ProfileData } from '../utils/profileUtils';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

export const Profile = ({ session, transactions, pockets, onRefresh }: { session: any, transactions: any[], pockets: any[], onRefresh: () => void }) => {
  const insets = useSafeAreaInsets();
  const { theme, mode, setThemeMode } = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scrollContent: { 
      paddingTop: Math.max(insets.top, 16) + 120, 
      paddingBottom: 120,
      paddingHorizontal: 24 
    },
    
    // --- INSIGHT SECTION ---
    aiBriefSection: { marginBottom: 28 },
    aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    aiLabel: { fontSize: 10, fontWeight: '900', color: theme.colors.primary, letterSpacing: 1.5, textTransform: 'uppercase' },
    aiBriefText: { fontSize: 18, fontWeight: '800', color: theme.colors.onSurface, lineHeight: 26, letterSpacing: -0.3 },

    // --- SCORE CARD ---
    section: { marginTop: 24 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
    sectionTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.onSurface, letterSpacing: -0.5 },

    premiumScoreCard: { 
      backgroundColor: theme.colors.glassWhite, 
      borderRadius: 32, 
      padding: 24, 
      borderWidth: 1.5, 
      borderColor: 'rgba(255,255,255,0.8)',
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
    habitsWrapper: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    pillHabit: { 
      backgroundColor: theme.colors.primaryContainer, 
      paddingHorizontal: 18, 
      paddingVertical: 10, 
      borderRadius: 16,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.5)'
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
      borderColor: 'rgba(255,255,255,0.5)'
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
      borderColor: 'rgba(255,255,255,0.7)',
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
      borderColor: 'rgba(255,255,255,0.8)',
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
      borderWidth: 1, 
      borderColor: theme.colors.error + '25',
      marginTop: 16
    },
    dangerText: { fontSize: 16, fontWeight: '900', color: theme.colors.error },
    versionLabel: { alignSelf: 'center', marginTop: 32, fontSize: 11, fontWeight: '800', color: theme.colors.primary, opacity: 0.4 }
  }), [theme, mode]);

  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [notifs, setNotifs] = useState({ alerts_high: true, alerts_hormiga: true, daily_tips: true });

  useEffect(() => {
    fetchRules();
    const data = calculateFinancialProfile(transactions, rules, pockets);
    setProfileData(data);
  }, [transactions, pockets]);

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

  const scoreColor = (score: number) => {
    if (score > 80) return theme.colors.success;
    if (score > 50) return theme.colors.primary;
    return theme.colors.error;
  };

  const capitalize = (text: string) => text?.toLowerCase().split(' ').map(s => s.charAt(0).toUpperCase() + s.substring(1)).join(' ');

  return (
    <ScrollView 
      style={styles.container} 
      showsVerticalScrollIndicator={false} 
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.aiBriefSection}>
         <View style={styles.aiBadge}>
            <Sparkles size={16} color={theme.colors.primary} fill={theme.colors.primary} />
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
                    Tu disciplina de registro y control de gastos hormiga define esta métrica.
                  </Text>
                  <View style={styles.metricItem}>
                     <View style={styles.metricLabelRow}>
                        <Text style={styles.miniLabel}>DISCIPLINA</Text>
                        <Text style={styles.miniVal}>{profileData?.score}%</Text>
                     </View>
                     <View style={styles.metricBarContainer}>
                        <View style={[styles.metricBar, { backgroundColor: scoreColor(profileData?.score || 0), width: `${profileData?.score ?? 0}%` }]} />
                     </View>
                  </View>
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
            {(!profileData || profileData.topHabits.length === 0) && (
              <Text style={{ fontStyle: 'italic', color: theme.colors.onSurfaceVariant, fontSize: 13 }}>Escaneando hábitos...</Text>
            )}
         </View>
      </View>

      <View style={styles.section}>
         <View style={styles.sectionHeader}>
            <Settings size={18} color={theme.colors.primary} strokeWidth={2.5} />
            <Text style={styles.sectionTitle}>Configuración de Cuenta</Text>
         </View>
         <View style={styles.settingsCard}>
            <View style={styles.settingRow}>
               <View style={styles.settingTitleCol}>
                  <Bell size={20} color={theme.colors.onSurfaceVariant} />
                  <Text style={styles.settingText}>Guardian de Gastos</Text>
               </View>
               <Switch 
                 value={notifs.alerts_high} 
                 onValueChange={(val) => setNotifs({...notifs, alerts_high: val})} 
                 trackColor={{ true: theme.colors.primary, false: theme.colors.surfaceContainerHighest }}
                 thumbColor="#FFF"
               />
            </View>
            <View style={styles.divider} />
            <View style={styles.settingRow}>
               <View style={styles.settingTitleCol}>
                  <Fingerprint size={20} color={theme.colors.onSurfaceVariant} />
                  <Text style={styles.settingText}>Seguridad Biométrica</Text>
               </View>
               <View style={{ backgroundColor: theme.colors.surfaceContainerHigh, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 }}>
                 <Text style={{ fontSize: 9, fontWeight: '900', color: theme.colors.onSurfaceVariant }}>PRÓXIMAMENTE</Text>
               </View>
            </View>
         </View>
      </View>

      <View style={[styles.section, { paddingBottom: 40 }]}>
         <TouchableOpacity 
           activeOpacity={0.7}
           style={styles.dangerAction} 
           onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              Alert.alert("Cerrar Sesión", "¿Seguro que quieres salir?", [
                { text: "Cancelar", style: "cancel" },
                { text: "Salir", style: "destructive", onPress: () => supabase.auth.signOut() }
              ]);
           }}
         >
            <LogOut size={18} color={theme.colors.error} />
            <Text style={styles.dangerText}>Finalizar Sesión</Text>
         </TouchableOpacity>
         <Text style={styles.versionLabel}>SAVE FINTECH v1.2.0 • PREMIUM EDITION</Text>
      </View>
    </ScrollView>
  );
};
