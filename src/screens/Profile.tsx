import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Animated, Dimensions, Alert
} from 'react-native';
import { 
  Settings, LogOut, Trash2, Bell, ShieldCheck, 
  TrendingUp, Target, Sparkles, ChevronRight,
  Shield, Eye, Octagon, Fingerprint, Info
} from 'lucide-react-native';
import { theme, normalize } from '../theme/theme';
import { supabase } from '../lib/supabase';
import { calculateFinancialProfile, ProfileData } from '../utils/profileUtils';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

export const Profile = ({ session, transactions, pockets, onRefresh }: { session: any, transactions: any[], pockets: any[], onRefresh: () => void }) => {
  const insets = useSafeAreaInsets();
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

  const handleLogout = () => {
    Alert.alert("Cerrar Sesión", "¿Seguro que quieres salir de Save?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Salir", style: "destructive", onPress: () => supabase.auth.signOut() }
    ]);
  };

  const scoreColor = (score: number) => {
    if (score > 80) return theme.colors.primary;
    if (score > 50) return theme.colors.warning;
    return theme.colors.error;
  };

  const capitalize = (text: string) => text.toLowerCase().split(' ').map(s => s.charAt(0).toUpperCase() + s.substring(1)).join(' ');

  return (
    <ScrollView 
      style={styles.container} 
      showsVerticalScrollIndicator={false} 
      contentContainerStyle={{ paddingTop: normalize(140), paddingBottom: 140 }}
    >
      {/* 1. MENSAJE INTELIGENTE (Sutil) */}
      <View style={styles.aiBriefSection}>
         <View style={styles.aiBadge}>
            <Sparkles size={14} color={theme.colors.primary} />
            <Text style={styles.aiLabel}>SAVE INSIGHT</Text>
         </View>
         <Text style={styles.aiBriefText}>{profileData?.scoreMessage}</Text>
      </View>

      {/* 2. CORE SCORE CARD (Interpretada) */}
      <View style={styles.section}>
         <View style={styles.premiumScoreCard}>
            <View style={styles.scoreHeader}>
               <Text style={styles.scoreTitle}>Tu Salud de Ahorro</Text>
               <View style={[styles.trendRow, { backgroundColor: scoreColor(profileData?.score || 0) + '20' }]}>
                  <Text style={[styles.trendText, { color: scoreColor(profileData?.score || 0) }]}>
                    { (profileData?.score || 0) > 80 ? 'Excelente' : (profileData?.score || 0) > 40 ? 'Estable' : 'Por Mejorar' }
                  </Text>
               </View>
            </View>
            
            <View style={styles.scoreMainRow}>
               <View style={styles.scoreCircle}>
                  <Text style={[styles.scoreValue, { color: scoreColor(profileData?.score || 0) }]}>{profileData?.score}</Text>
                  <Text style={styles.scoreMax}>puntos</Text>
               </View>
               <View style={styles.scoreInfoBox}>
                  <Text style={styles.scoreExplanation}>
                    Métrica calculada por tu disciplina de registro y control de gastos hormiga.
                  </Text>
                  <View style={styles.metricItem}>
                     <View style={styles.metricLabelRow}>
                        <Text style={styles.miniLabel}>DISCIPLINA</Text>
                        <Text style={styles.miniVal}>{profileData?.score}%</Text>
                     </View>
                     <View style={[styles.metricBar, { backgroundColor: theme.colors.primary, width: `${profileData?.score ?? 0}%` }]} />
                  </View>
               </View>
            </View>
         </View>
      </View>

      {/* 3. HABITS (Chips Premium) */}
      <View style={styles.section}>
         <View style={styles.sectionHeader}>
            <Target size={18} color={theme.colors.onSurface} strokeWidth={2} />
            <Text style={styles.sectionTitle}>Hábitos Frecuentes</Text>
         </View>
         <View style={styles.habitsWrapper}>
            {profileData?.topHabits.map((habit, i) => (
               <View key={i} style={styles.pillHabit}>
                  <Text style={styles.pillHabitText}>{capitalize(habit)}</Text>
               </View>
            ))}
            {profileData?.topHabits.length === 0 && <Text style={styles.emptyText}>Registra gastos para detectar patrones.</Text>}
         </View>
      </View>

      {/* 4. RULES (Simplified) */}
      <View style={styles.section}>
         <View style={styles.sectionHeader}>
            <Settings size={18} color={theme.colors.onSurface} strokeWidth={2} />
            <Text style={styles.sectionTitle}>Reglas de Consumo</Text>
         </View>
         {rules.slice(0, 4).map((rule) => (
            <View key={rule.id} style={styles.compactRuleCard}>
               <View style={styles.ruleBrandInfo}>
                  <Text style={styles.ruleBrandName} numberOfLines={1}>{capitalize(rule.display_name || rule.pattern)}</Text>
                  <View style={styles.ruleTypeRow}>
                     <View style={[styles.typeIndicator, { backgroundColor: rule.type === 'reduce' ? theme.colors.error : rule.type === 'monitor' ? theme.colors.warning : theme.colors.primary }]} />
                     <Text style={styles.ruleTypeText}>{rule.type === 'confidence' ? 'Confianza' : rule.type === 'monitor' ? 'Vigilar' : 'Reducir'}</Text>
                  </View>
               </View>
               <View style={styles.ruleActionContainer}>
                  <TouchableOpacity onPress={() => updateRule(rule.id, 'confidence')} style={[styles.actionBtn, rule.type === 'confidence' && styles.actionConfActive]}>
                     <Shield size={14} color={rule.type === 'confidence' ? '#FFF' : theme.colors.onSurfaceVariant} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => updateRule(rule.id, 'monitor')} style={[styles.actionBtn, rule.type === 'monitor' && styles.actionMonActive]}>
                     <Eye size={14} color={rule.type === 'monitor' ? '#FFF' : theme.colors.onSurfaceVariant} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => updateRule(rule.id, 'reduce')} style={[styles.actionBtn, rule.type === 'reduce' && styles.actionRedActive]}>
                     <Octagon size={14} color={rule.type === 'reduce' ? '#FFF' : theme.colors.onSurfaceVariant} />
                  </TouchableOpacity>
               </View>
            </View>
         ))}
      </View>

      {/* 5. APP SETTINGS */}
      <View style={styles.section}>
         <View style={styles.settingsSheet}>
            <View style={styles.settingRow}>
               <View style={styles.settingTitleCol}>
                  <Bell size={18} color={theme.colors.onSurface} strokeWidth={2} />
                  <Text style={styles.settingText}>Alertas Predicativas</Text>
               </View>
               <Switch 
                 value={notifs.alerts_high} 
                 onValueChange={(val) => setNotifs({...notifs, alerts_high: val})} 
                 trackColor={{ true: theme.colors.primary }}
                 ios_backgroundColor="#E9E9EB"
               />
            </View>
            <View style={styles.divider} />
            <View style={styles.settingRow}>
               <View style={styles.settingTitleCol}>
                  <Fingerprint size={18} color={theme.colors.onSurface} strokeWidth={2} />
                  <Text style={styles.settingText}>Seguridad Biométrica</Text>
               </View>
               <Switch value={true} trackColor={{ true: theme.colors.primary }} />
            </View>
         </View>
      </View>

      {/* 6. LOGOUT SECTION */}
      <View style={[styles.section, { marginTop: 40 }]}>
         <TouchableOpacity style={styles.dangerAction} onPress={handleLogout}>
            <LogOut size={18} color={theme.colors.error} />
            <Text style={styles.dangerText}>Cerrar Sesión</Text>
         </TouchableOpacity>
         
         <TouchableOpacity style={styles.ghostAction}>
            <Text style={styles.ghostText}>Versión 1.0.4 Premium</Text>
         </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  aiBriefSection: { paddingHorizontal: 25, marginBottom: 20 },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  aiLabel: { fontSize: normalize(9), fontWeight: '900', color: theme.colors.primary, letterSpacing: 1 },
  aiBriefText: { fontSize: normalize(15), fontWeight: '700', color: theme.colors.onSurface, lineHeight: 22 },

  section: { paddingHorizontal: 20, marginTop: normalize(20) },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15, paddingHorizontal: 5 },
  sectionTitle: { fontSize: normalize(15), fontWeight: '900', color: theme.colors.onSurface, letterSpacing: -0.3 },

  premiumScoreCard: { backgroundColor: '#FFF', borderRadius: 28, padding: 22, ...theme.shadows.soft, borderWidth: 1, borderColor: theme.colors.surfaceContainerHigh },
  scoreHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  scoreTitle: { fontSize: normalize(13), fontWeight: '800', color: theme.colors.onSurfaceVariant },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.colors.surfaceContainerLow, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  trendText: { fontSize: normalize(10), fontWeight: '700', color: theme.colors.primary },

  scoreMainRow: { flexDirection: 'row', alignItems: 'center', gap: 25 },
  scoreCircle: { width: 74, height: 74, borderRadius: 37, borderWidth: 6, borderColor: theme.colors.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' },
  scoreValue: { fontSize: normalize(22), fontWeight: '900' },
  scoreMax: { fontSize: normalize(9), color: theme.colors.onSurfaceVariant, fontWeight: '700' },
  
  scoreInfoBox: { flex: 1, gap: 10 },
  scoreExplanation: { fontSize: normalize(11), color: theme.colors.onSurfaceVariant, lineHeight: 16, opacity: 0.8 },
  
  metricItem: { gap: 6, marginTop: 4 },
  metricLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  miniLabel: { fontSize: normalize(9), fontWeight: '900', color: theme.colors.onSurfaceVariant, letterSpacing: 0.5 },
  miniVal: { fontSize: normalize(10), fontWeight: '800', color: theme.colors.primary },
  metricBar: { height: 6, borderRadius: 3 },

  habitsWrapper: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pillHabit: { backgroundColor: theme.colors.primaryContainer, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  pillHabitText: { fontSize: normalize(11), fontWeight: '800', color: theme.colors.onPrimaryContainer },

  compactRuleCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: theme.colors.surfaceContainerHigh },
  ruleBrandInfo: { flex: 1, gap: 4 },
  ruleBrandName: { fontSize: normalize(14), fontWeight: '800', color: theme.colors.onSurface },
  ruleTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeIndicator: { width: 6, height: 6, borderRadius: 3 },
  ruleTypeText: { fontSize: normalize(10), color: theme.colors.onSurfaceVariant, fontWeight: '700' },
  ruleActionContainer: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceContainerLow },
  actionConfActive: { backgroundColor: theme.colors.primary },
  actionMonActive: { backgroundColor: theme.colors.warning },
  actionRedActive: { backgroundColor: theme.colors.error },

  settingsSheet: { backgroundColor: '#FFF', borderRadius: 24, paddingVertical: 10, paddingHorizontal: 16, ...theme.shadows.soft },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  settingTitleCol: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingText: { fontSize: normalize(14), fontWeight: '700', color: theme.colors.onSurface },
  divider: { height: 1, backgroundColor: theme.colors.surfaceContainerHigh },

  dangerAction: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, backgroundColor: '#FFF', borderRadius: 20, justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.error + '20' },
  dangerText: { fontSize: normalize(15), fontWeight: '900', color: theme.colors.error },
  ghostAction: { alignSelf: 'center', marginTop: 20 },
  ghostText: { fontSize: normalize(10), fontWeight: '700', color: theme.colors.onSurfaceVariant, opacity: 0.4 },
  emptyText: { fontStyle: 'italic', color: theme.colors.onSurfaceVariant, fontSize: normalize(12), padding: 10 }
});
