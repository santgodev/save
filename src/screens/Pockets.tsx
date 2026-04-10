import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, Animated, StyleSheet, ScrollView, Dimensions, Pressable, TextInput, Modal, ActivityIndicator, Alert, Platform
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { 
  ChevronLeft, ChevronRight, Edit3, Save, TrendingUp,
  Plus, X, Trash2, PieChart, AlertCircle, ShoppingBag, 
  MapPin, Clock, Calendar, CheckCircle2, ChevronDown, ArrowRight, Target, Sparkles 
} from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { normalize } from '../theme/theme';
import { CategoryIcon } from '../components/CategoryIcon';
import { AnimatedProgressBar } from '../components/AnimatedProgressBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';
import { supabase } from '../lib/supabase';

const { width, height } = Dimensions.get('window');

const MONTHS = [
  { label: 'Enero', value: 0 }, { label: 'Febrero', value: 1 }, { label: 'Marzo', value: 2 },
  { label: 'Abril', value: 3 }, { label: 'Mayo', value: 4 }, { label: 'Junio', value: 5 },
  { label: 'Julio', value: 6 }, { label: 'Agosto', value: 7 }, { label: 'Septiembre', value: 8 },
  { label: 'Octubre', value: 9 }, { label: 'Noviembre', value: 10 }, { label: 'Diciembre', value: 11 }
];

// Replaced hardcoded POCKET_COLORS with theme-aware colors from ThemeContext

export const Pockets = ({ pockets, transactions, session, onRefresh, onTransferPress }: { pockets: any[], transactions: any[], session: any, onRefresh: () => void, onTransferPress: (params: { fromId?: string, amount?: number }) => void }) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scrollPadding: { paddingHorizontal: 24 },
    inlineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 32 },
    monthTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5, color: theme.colors.onSurface, fontFamily: theme.fonts.headline },
    arrow: { 
      width: 44, 
      height: 44, 
      borderRadius: 22, 
      backgroundColor: theme.colors.glassWhite, 
      alignItems: 'center', 
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.8)',
      ...theme.shadows.soft 
    },
    title: { 
      ...theme.typography.title, 
      fontSize: 15,
      fontWeight: '900',
      color: theme.colors.onSurface,
      opacity: 0.9,
    },
    userBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: theme.colors.glassWhite,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.6)',
    },
    userName: {
      ...theme.typography.label,
      fontSize: 10,
      color: theme.colors.primary,
    },
    cardHeader: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      backgroundColor: theme.colors.glassWhite, 
      paddingHorizontal: 24, 
      paddingVertical: 28, 
      borderRadius: theme.radius.xl, 
      marginBottom: 24, 
      borderWidth: 1.5, 
      borderColor: 'rgba(255,255,255,0.8)',
      ...theme.shadows.md 
    },
    topLabel: { 
      fontSize: 10, 
      fontWeight: '900', 
      color: theme.colors.onSurfaceVariant, 
      marginBottom: 8, 
      letterSpacing: 1.2, 
      textTransform: 'uppercase' 
    },
    topAmount: { fontSize: 32, fontWeight: '900', letterSpacing: -1, color: theme.colors.onSurface },
    incomeInput: { fontSize: 32, fontWeight: '900', padding: 0, margin: 0, color: theme.colors.primary },
    budgetCompareTxt: { fontSize: 13, color: theme.colors.onSurfaceVariant, marginTop: 4, fontWeight: '700' },
    
    editModeBtn: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 8, 
      paddingHorizontal: 16, 
      paddingVertical: 12, 
      borderRadius: 16, 
      backgroundColor: theme.colors.primaryContainer,
      borderWidth: 1, 
      borderColor: 'rgba(255,255,255,0.5)' 
    },
    editModeTxt: { fontSize: 13, fontWeight: '900', color: theme.colors.primary },
    
    diffAlert: { padding: theme.spacing.md, borderRadius: theme.radius.lg, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.lg, borderWidth: 1 },
    diffError: { backgroundColor: theme.colors.errorContainer, borderColor: theme.colors.error + '25' },
    diffSuccess: { backgroundColor: theme.colors.successContainer, borderColor: theme.colors.success + '25' },
    diffText: { ...theme.typography.bodyMedium, fontWeight: '800', flex: 1 },
    
    adjustActions: { flexDirection: 'row', gap: 12, marginTop: 16, paddingHorizontal: 4 },
    cancelAdjustBtn: { flex: 1, paddingVertical: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.outlineVariant },
    cancelAdjustTxt: { fontSize: 14, fontWeight: '800', color: theme.colors.onSurfaceVariant },
    saveAdjustBtn: { flex: 2, paddingVertical: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary, ...theme.shadows.soft },
    saveAdjustTxt: { fontSize: 14, fontWeight: '900', color: '#FFF' },
    
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    pocketCard: { 
      width: (width - (24 * 2 + 14)) / 2, 
      borderRadius: theme.radius.xl, 
      padding: 0, 
      backgroundColor: theme.colors.glassWhite, 
      borderWidth: 1.5, 
      borderColor: 'rgba(255,255,255,0.8)',
      overflow: 'hidden',
      ...theme.shadows.md
    },
    cardGradient: { flex: 1, padding: 20 },
    pocketTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    iconCircle: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },
    weightBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)' },
    weightTxt: { fontSize: 11, fontWeight: '900', color: '#FFF' },
    
    inlineEditPct: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)' },
    editPctInput: { fontSize: 14, fontWeight: '900', minWidth: 28, textAlign: 'right', color: '#FFF' },
    editPctLabel: { fontSize: 11, fontWeight: '800', marginLeft: 2, color: '#FFF' },
    
    pocketName: { fontSize: 16, fontWeight: '900', color: '#FFF', marginBottom: 4 },
    budgetLabel: { fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.8)' },
    
    progressArea: { gap: 8 },
    remTxt: { fontSize: 11, fontWeight: '900', color: 'rgba(255,255,255,0.9)' },
    
    addCard: { 
      borderStyle: 'dashed', 
      justifyContent: 'center', 
      alignItems: 'center', 
      gap: 10, 
      backgroundColor: 'rgba(255,255,255,0.2)',
      borderColor: theme.colors.primary + '40',
      minHeight: 180,
      padding: 20
    },
    addTxt: { fontSize: 13, fontWeight: '900', color: theme.colors.primary },
    
    bottomSheet: { 
      position: 'absolute', 
      bottom: 0, 
      left: 0, 
      right: 0, 
      height: height * 0.75, 
      borderTopLeftRadius: 40, 
      borderTopRightRadius: 40, 
      padding: 32, 
      backgroundColor: theme.colors.background,
      borderTopWidth: 1,
      borderColor: theme.colors.divider,
      ...theme.shadows.premium 
    },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 32 },
    sheetTitle: { flex: 1, fontSize: 24, fontWeight: '900', color: theme.colors.onSurface, letterSpacing: -0.5 },
    
    quickStats: { 
      flexDirection: 'row', 
      gap: 20, 
      padding: 24, 
      borderRadius: 28, 
      marginBottom: 32, 
      backgroundColor: theme.colors.primaryContainer,
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.6)' 
    },
    qStat: { flex: 1 },
    qLabel: { fontSize: 10, fontWeight: '900', color: theme.colors.onSurfaceVariant, marginBottom: 6, letterSpacing: 1 },
    qVal: { fontSize: 18, fontWeight: '900', color: theme.colors.onSurface },
    
    overspentAlertContainer: { marginBottom: 32, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.error + '30' },
    overspentAlert: { padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: theme.colors.error },
    overspentTitle: { color: '#FFF', fontSize: 16, fontWeight: '900' },
    overspentMsg: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600', marginTop: 4, lineHeight: 18 },
    fixOverspentBtn: { paddingVertical: 18, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.surface },
    fixOverspentTxt: { fontSize: 14, fontWeight: '900', color: theme.colors.primary },
    
    txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1.5, borderBottomColor: theme.colors.divider },
    txMerchant: { fontSize: 16, fontWeight: '800', color: theme.colors.onSurface },
    txDate: { fontSize: 12, color: theme.colors.onSurfaceVariant, marginTop: 2 },
    txAmt: { fontSize: 16, fontWeight: '900', color: theme.colors.onSurface },
    
    deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20, marginTop: 32 },
    delTxt: { fontSize: 14, fontWeight: '800' },
    
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalContent: { width: '100%', borderRadius: 36, padding: 32, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.divider, ...theme.shadows.premium },
    modalTitle: { fontSize: 22, fontWeight: '900', marginBottom: 24, color: theme.colors.onSurface },
    modalIn: { 
      borderRadius: 20, 
      padding: 18, 
      fontSize: 16, 
      marginBottom: 16, 
      borderWidth: 1.5, 
      borderColor: theme.colors.outlineVariant, 
      backgroundColor: theme.colors.glassWhite,
      color: theme.colors.onSurface,
      fontWeight: '700'
    },
    modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 12 },
    modalCancel: { padding: 16 },
    cancelTxt: { color: theme.colors.onSurfaceVariant, fontWeight: '800' },
    save: { paddingVertical: 14, paddingHorizontal: 32, borderRadius: 20, backgroundColor: theme.colors.primary, ...theme.shadows.soft },
    saveTxt: { color: '#FFF', fontWeight: '900' },
    
    incomeAlert: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 12, 
      padding: 20, 
      borderRadius: 24, 
      marginBottom: 24, 
      borderWidth: 1.5,
      backgroundColor: theme.colors.primaryContainer + '20',
      borderColor: theme.colors.primary + '30'
    },
    incomeAlertText: { flex: 1, fontSize: 13, lineHeight: 20 },
    backdrop: { ...StyleSheet.absoluteFillObject },
    backdropTint: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  }), [theme]);

  const [selectedPocket, setSelectedPocket] = useState<any | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  
  const [isAdjustMode, setIsAdjustMode] = useState(false);
  const [tempBudgets, setTempBudgets] = useState<Record<string, number>>({});
  const [tempPercentages, setTempPercentages] = useState<Record<string, number>>({});
  const [tempIncome, setTempIncome] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBudget, setNewBudget] = useState('100000');

  const sheetAnim = useRef(new Animated.Value(height)).current;

  useEffect(() => { fetchMonthlyIncome(); }, [selectedMonth]);

  const fetchMonthlyIncome = async () => {
    const currentYear = new Date().getFullYear();
    const { data } = await supabase
      .from('user_monthly_income')
      .select('income')
      .eq('user_id', session.user.id)
      .eq('year', currentYear)
      .eq('month', selectedMonth)
      .single();
    
    if (!data?.income) {
      const { data: recent } = await supabase
        .from('user_monthly_income')
        .select('income')
        .eq('user_id', session.user.id)
        .eq('year', currentYear)
        .order('month', { ascending: false })
        .limit(1)
        .single();
      const val = recent?.income || 0;
      setMonthlyIncome(0);
      setTempIncome(val);
    } else {
      setMonthlyIncome(data.income);
      setTempIncome(data.income);
    }
  };

  const startAdjustMode = () => {
    const budgets: Record<string, number> = {};
    const percents: Record<string, number> = {};
    pockets.forEach(p => {
      budgets[p.id] = p.budget;
      percents[p.id] = p.target_percentage || 0;
    });
    setTempBudgets(budgets);
    setTempPercentages(percents);
    setTempIncome(monthlyIncome || 0);
    setIsAdjustMode(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const saveBatchBudget = async () => {
    setIsSaving(true);
    try {
      const strictClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${session.access_token}` } }
      });
      await strictClient.from('user_monthly_income').upsert({
        user_id: session.user.id,
        year: new Date().getFullYear(),
        month: selectedMonth,
        income: tempIncome
      });
      const updates = Object.entries(tempBudgets).map(([id, budget]) => {
        const pct = tempPercentages[id] || 0;
        return strictClient.from('pockets').update({ budget, target_percentage: pct }).eq('id', id);
      });
      await Promise.all(updates);
      setIsAdjustMode(false);
      onRefresh();
      fetchMonthlyIncome();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) { console.error(e); } finally { setIsSaving(false); }
  };

  const deletePocket = async (id: string) => {
    const pocket = pockets.find(p => p.id === id);
    Alert.alert(`Eliminar "${pocket?.name}"`, "¿Seguro? Esta acción ajustará tus balances.", [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
          const strictClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${session.access_token}` } }
          });
          await strictClient.from('pockets').delete().eq('id', id);
          onRefresh();
          closePocket();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
      }
    ]);
  };

  const syncPocketToCloud = async () => {
    if(!newName) return;
    const budget = parseFloat(newBudget.replace(/[^0-9]/g, '')) || 0;
    const strictClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${session.access_token}` } }
    });
    await strictClient.from('pockets').insert({
      user_id: session.user.id,
      name: newName,
      category: 'Otros',
      budget,
      icon: 'tag'
    });
    setNewName('');
    setAddModalVisible(false);
    onRefresh();
  };

  const getPocketSpending = (category: string) => {
    return transactions
      .filter(tx => {
        const txDate = new Date(tx.date_string || tx.created_at);
        return tx.category === category && txDate.getMonth() === selectedMonth;
      })
      .reduce((acc, tx) => acc + Math.abs(parseFloat(tx.amount || 0)), 0);
  };

  const getPocketTransactions = (category: string) => {
    return transactions.filter(tx => {
      const txDate = new Date(tx.date_string || tx.created_at);
      return tx.category === category && txDate.getMonth() === selectedMonth;
    }).sort((a, b) => new Date(b.date_string || b.created_at).getTime() - new Date(a.date_string || a.created_at).getTime());
  };

  const incomeTransactions = transactions.filter(tx => {
    const txDate = new Date(tx.date_string || tx.created_at);
    return tx.category === 'Ingreso' && txDate.getMonth() === selectedMonth;
  });

  const totalInvoicedIncome = incomeTransactions.reduce((acc, tx) => acc + Math.abs(parseFloat(tx.amount || 0)), 0);
  const diff = tempIncome - Object.values(tempBudgets).reduce((a, b) => a + b, 0);

  const openPocket = (pocket: any) => {
    if (isAdjustMode) return;
    setSelectedPocket(pocket);
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 50, friction: 8 }).start();
  };

  const closePocket = () => {
    Animated.timing(sheetAnim, { toValue: height, duration: 250, useNativeDriver: true }).start(() => setSelectedPocket(null));
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={[styles.scrollPadding, { paddingTop: Math.max(insets.top, 16) + 104, paddingBottom: Math.max(insets.bottom, 16) + normalize(76) + 24 }]} 
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inlineHeader}>
          <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedMonth(prev => (prev - 1 + 12) % 12); }} style={styles.arrow}><ChevronLeft size={18} color={theme.colors.onSurface} /></TouchableOpacity>
          <Text style={styles.monthTitle}>{MONTHS[selectedMonth].label}</Text>
          <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedMonth(prev => (prev + 1) % 12); }} style={styles.arrow}><ChevronRight size={18} color={theme.colors.onSurface} /></TouchableOpacity>
        </View>

        <View style={styles.cardHeader}>
           <View style={{flex: 1}}>
             <Text style={styles.topLabel}>PRESUPUESTO DISPONIBLE</Text>
             {isAdjustMode ? (
               <TextInput 
                 style={styles.incomeInput}
                 keyboardType="numeric"
                 value={tempIncome.toLocaleString('es-CO')}
                 onChangeText={(v) => {
                   const val = parseInt(v.replace(/[^0-9]/g, '')) || 0;
                   setTempIncome(val);
                 }}
                 autoFocus
               />
             ) : (
               <Text style={styles.topAmount}>$ {totalInvoicedIncome.toLocaleString('es-CO')}</Text>
             )}
             {!isAdjustMode && totalInvoicedIncome !== monthlyIncome && (
               <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <Target size={12} color={theme.colors.onSurfaceVariant} />
                  <Text style={styles.budgetCompareTxt}>Meta: ${monthlyIncome.toLocaleString('es-CO')}</Text>
               </View>
             )}
           </View>
           <TouchableOpacity 
             style={[styles.editModeBtn, isAdjustMode && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]} 
             onPress={isAdjustMode ? saveBatchBudget : startAdjustMode}
             disabled={isSaving || (isAdjustMode && diff !== 0)}
           >
              {isSaving ? <ActivityIndicator size="small" color="#FFF" /> : (
                <>
                  {isAdjustMode ? <Save size={18} color="#FFF" /> : <Edit3 size={18} color={theme.colors.primary} />}
                  <Text style={[styles.editModeTxt, isAdjustMode && { color: "#FFF" }]}>{isAdjustMode ? 'Guardar' : 'Ajustar'}</Text>
                </>
              )}
           </TouchableOpacity>
        </View>

        {isAdjustMode && (
          <View style={[styles.diffAlert, diff !== 0 ? styles.diffError : styles.diffSuccess]}>
             <AlertCircle size={20} color={diff === 0 ? theme.colors.success : theme.colors.error} />
             <View style={{ flex: 1 }}>
               <Text style={[styles.diffText, { color: diff === 0 ? theme.colors.success : theme.colors.error }]}>
                 {diff === 0 ? '¡Presupuesto perfectamente equilibrado!' : diff > 0 ? `Quedan $${diff.toLocaleString('es-CO')} sin asignar` : `Exceso de $${Math.abs(diff).toLocaleString('es-CO')} en la distribución`}
               </Text>
               
               {diff > 0 && (
                 <TouchableOpacity 
                   style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}
                   onPress={() => {
                     Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                     const ahorros = pockets.find(p => p.category === 'Ahorros' || p.name.includes('Ahorro'));
                     if (ahorros) {
                       setTempBudgets(prev => ({ ...prev, [ahorros.id]: (prev[ahorros.id] || 0) + diff }));
                     } else if (pockets.length > 0) {
                       setTempBudgets(prev => ({ ...prev, [pockets[0].id]: (prev[pockets[0].id] || 0) + diff }));
                     }
                   }}
                 >
                   <Sparkles size={14} color={theme.colors.primary} />
                   <Text style={{ fontSize: 12, fontWeight: '900', color: theme.colors.primary }}>Sugerencia AI: Blindar Ahorros</Text>
                 </TouchableOpacity>
               )}
             </View>
          </View>
        )}

        {isAdjustMode && (
          <View style={styles.adjustActions}>
            <TouchableOpacity style={styles.cancelAdjustBtn} onPress={() => setIsAdjustMode(false)}><Text style={styles.cancelAdjustTxt}>Cancelar todo</Text></TouchableOpacity>
            <TouchableOpacity 
              style={[styles.saveAdjustBtn, diff !== 0 && { opacity: 0.5 }]} 
              onPress={saveBatchBudget}
              disabled={isSaving || diff !== 0}
            >
              {isSaving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.saveAdjustTxt}>Confirmar Estructura</Text>}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.grid}>
           {[...pockets].sort((a,b) => (b.target_percentage || 0) - (a.target_percentage || 0)).map((p, i) => {
             const spent = getPocketSpending(p.category);
             const budget = isAdjustMode ? tempBudgets[p.id] : (p.budget || 0);
             const targetPct = isAdjustMode ? (tempPercentages[p.id] || 0) : (p.target_percentage || 0);
             const isOverspent = spent > budget;
             const pctUsage = Math.min((spent / (Math.max(budget, 1))) * 100, 100);

             return (
               <TouchableOpacity 
                 key={p.id || i} 
                 style={[styles.pocketCard, isOverspent && !isAdjustMode && { borderColor: theme.colors.error + '40' }]} 
                 activeOpacity={0.9} 
                 onPress={() => openPocket(p)}
               >
                 <LinearGradient 
                   colors={(theme.colors.categoryColors[p.category] || theme.colors.categoryColors['Otros']) as any} 
                   style={styles.cardGradient}
                   start={{x: 0, y: 0}}
                   end={{x: 1, y: 1}}
                 >
                   <View style={styles.pocketTop}>
                     <View style={styles.iconCircle}>
                       <CategoryIcon iconName={p.icon} size={20} color="#FFF" />
                     </View>
                     {isAdjustMode ? (
                       <View style={styles.inlineEditPct}>
                          <TextInput 
                            style={styles.editPctInput} 
                            keyboardType="numeric" 
                            value={targetPct.toString()}
                            onChangeText={(v) => {
                              const val = Math.min(parseInt(v.replace(/[^0-9]/g, '')) || 0, 100);
                              setTempPercentages(pvs => ({...pvs, [p.id]: val}));
                              if (tempIncome > 0) setTempBudgets(pvs => ({...pvs, [p.id]: Math.round(tempIncome * (val/100))}));
                            }}
                          />
                          <Text style={styles.editPctLabel}>%</Text>
                       </View>
                     ) : (
                       <View style={styles.weightBadge}><Text style={styles.weightTxt}>{targetPct}%</Text></View>
                     )}
                   </View>
                   
                   <View style={{ marginBottom: 16 }}>
                     <Text style={styles.pocketName} numberOfLines={1}>{p.name}</Text>
                     <Text style={styles.budgetLabel}>
                       $ {budget.toLocaleString('es-CO')}
                     </Text>
                   </View>
 
                   <View style={styles.progressArea}>
                      <AnimatedProgressBar percent={pctUsage} color="#FFF" bgColor="rgba(255,255,255,0.2)" />
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={styles.remTxt}>
                          {isOverspent ? `Exceso` : `Libre`}
                        </Text>
                        <Text style={[styles.remTxt, { fontWeight: '900' }]}>
                          $ {Math.abs(budget - spent).toLocaleString('es-CO')}
                        </Text>
                      </View>
                   </View>
                 </LinearGradient>
               </TouchableOpacity>
             );
           })}
           <TouchableOpacity style={[styles.pocketCard, styles.addCard]} onPress={() => setAddModalVisible(true)}>
              <View style={[styles.iconCircle, { backgroundColor: theme.colors.surfaceContainerHighest }]}>
                <Plus size={24} color={theme.colors.onSurfaceVariant} strokeWidth={2.5} />
              </View>
              <Text style={[styles.addTxt, { color: theme.colors.onSurfaceVariant }]}>Crear Pocket</Text>
           </TouchableOpacity>
        </View>

        {isAdjustMode && (
          <View style={styles.adjustActions}>
            <TouchableOpacity style={styles.cancelAdjustBtn} onPress={() => setIsAdjustMode(false)}><Text style={styles.cancelAdjustTxt}>Cancelar todo</Text></TouchableOpacity>
            <TouchableOpacity 
              style={[styles.saveAdjustBtn, diff !== 0 && { opacity: 0.5 }]} 
              onPress={saveBatchBudget}
              disabled={isSaving || diff !== 0}
            >
              {isSaving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.saveAdjustTxt}>Confirmar Estructura</Text>}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {selectedPocket && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          <Pressable style={styles.backdrop} onPress={closePocket}>
             <Animated.View style={[styles.backdropTint, { opacity: sheetAnim.interpolate({ inputRange: [0, height], outputRange: [1, 0] }) }]} />
          </Pressable>
          <Animated.View style={[styles.bottomSheet, { transform: [{ translateY: sheetAnim }] }]}>
             <View style={styles.sheetHeader}>
                <View style={[styles.iconCircle, { backgroundColor: theme.colors.primaryContainer + '40' }]}>
                  <CategoryIcon iconName={selectedPocket.icon} size={24} color={theme.colors.primary} />
                </View>
                <Text style={styles.sheetTitle}>{selectedPocket.name}</Text>
                <TouchableOpacity onPress={closePocket} style={{ padding: 12, backgroundColor: theme.colors.surfaceContainerHighest, borderRadius: 20 }}>
                  <X size={20} color={theme.colors.onSurface} strokeWidth={3} />
                </TouchableOpacity>
             </View>
             
             <View style={styles.quickStats}>
                <View style={styles.qStat}>
                  <Text style={styles.qLabel}>USADO</Text>
                  <Text style={[styles.qVal, getPocketSpending(selectedPocket.category) > selectedPocket.budget && { color: theme.colors.error }]}>
                    $ {getPocketSpending(selectedPocket.category).toLocaleString('es-CO')}
                  </Text>
                </View>
                <View style={styles.qStat}>
                  <Text style={styles.qLabel}>REMANENTE</Text>
                  <Text style={[styles.qVal, { color: theme.colors.primary }]}>
                    $ {Math.max(0, selectedPocket.budget - getPocketSpending(selectedPocket.category)).toLocaleString('es-CO')}
                  </Text>
                </View>
             </View>

             {getPocketSpending(selectedPocket.category) > selectedPocket.budget && (
                <View style={styles.overspentAlertContainer}>
                  <View style={styles.overspentAlert}>
                    <AlertCircle size={22} color="#FFF" />
                    <View style={{flex:1}}>
                      <Text style={styles.overspentTitle}>Límite Superado</Text>
                      <Text style={styles.overspentMsg}>Has excedido tu presupuesto por ${(getPocketSpending(selectedPocket.category) - selectedPocket.budget).toLocaleString('es-CO')}.</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.fixOverspentBtn} onPress={() => { closePocket(); onTransferPress({ fromId: selectedPocket.id, amount: getPocketSpending(selectedPocket.category) - selectedPocket.budget }); }}>
                    <Text style={styles.fixOverspentTxt}>Inyectar fondos de otro bolsillo</Text>
                    <ArrowRight size={18} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
             )}

             <Text style={[styles.topLabel, { marginBottom: 16, paddingLeft: 4 }]}>ÚLTIMOS MOVIMIENTOS</Text>
             <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={false}>
                {getPocketTransactions(selectedPocket.category).length > 0 ? (
                  getPocketTransactions(selectedPocket.category).map((tx, idx) => (
                    <View key={tx.id || idx} style={styles.txRow}>
                        <View style={{flex:1}}>
                          <Text style={styles.txMerchant}>{tx.merchant}</Text>
                          <Text style={styles.txDate}>{new Date(tx.date_string || tx.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}</Text>
                        </View>
                        <Text style={[styles.txAmt, { color: tx.amount < 0 ? theme.colors.onSurface : theme.colors.success }]}>
                          {tx.amount < 0 ? '-' : '+'} $ {Math.abs(tx.amount).toLocaleString('es-CO')}
                        </Text>
                    </View>
                  ))
                ) : (
                  <View style={{ padding: 40, alignItems: 'center', opacity: 0.3 }}>
                    <Clock size={32} color={theme.colors.onSurfaceVariant} />
                    <Text style={{ marginTop: 12, fontWeight: '800' }}>Sin movimientos este mes</Text>
                  </View>
                )}
             </ScrollView>

             <TouchableOpacity style={styles.deleteBtn} onPress={() => deletePocket(selectedPocket.id)}>
                <Trash2 size={18} color={theme.colors.error} />
                <Text style={[styles.delTxt, { color: theme.colors.error }]}>Eliminar Categoría</Text>
             </TouchableOpacity>
          </Animated.View>
        </View>
      )}

      <Modal visible={addModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <BlurView intensity={20} style={StyleSheet.absoluteFill} tint="dark" />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nuevo Pocket</Text>
            <Text style={styles.topLabel}>IDENTIFICADOR</Text>
            <TextInput 
              style={styles.modalIn} 
              placeholder="Ej. Viajes, Cine, etc." 
              value={newName} 
              onChangeText={setNewName} 
              placeholderTextColor={theme.colors.onSurfaceVariant + '80'} 
            />
            <Text style={styles.topLabel}>MONTO OBJETIVO MENSUAL</Text>
            <TextInput 
              style={styles.modalIn} 
              placeholder="$ 0" 
              keyboardType="numeric" 
              value={newBudget} 
              onChangeText={(v) => setNewBudget(v.replace(/[^0-9]/g, ''))} 
              placeholderTextColor={theme.colors.onSurfaceVariant + '80'} 
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAddModalVisible(false); }} style={styles.modalCancel}><Text style={styles.cancelTxt}>Cerrar</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); syncPocketToCloud(); }} style={styles.save}><Text style={styles.saveTxt}>Crear Ahora</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};
