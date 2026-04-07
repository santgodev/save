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
  MapPin, Clock, Calendar, CheckCircle2, ChevronDown, ArrowRight 
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

export const Pockets = ({ pockets, transactions, session, onRefresh, onTransferPress }: { pockets: any[], transactions: any[], session: any, onRefresh: () => void, onTransferPress: (params: { fromId?: string, amount?: number }) => void }) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scrollPadding: { paddingHorizontal: 24 },
    inlineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 32 },
    monthTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5, color: theme.colors.onSurface },
    arrow: { 
      width: 44, 
      height: 44, 
      borderRadius: 22, 
      backgroundColor: theme.colors.surface, 
      alignItems: 'center', 
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
      ...theme.shadows.soft 
    },
    cardHeader: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      backgroundColor: theme.colors.surface, 
      padding: 24, 
      borderRadius: 32, 
      marginBottom: 16, 
      borderWidth: 1, 
      borderColor: theme.colors.outlineVariant,
      ...theme.shadows.premium 
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
    
    incomeHistoryRow: { marginTop: 12, marginBottom: 24 },
    incomeMiniCard: { 
      backgroundColor: theme.colors.surface, 
      paddingHorizontal: 16, 
      paddingVertical: 12, 
      borderRadius: 20, 
      marginRight: 12, 
      flexDirection: 'row', 
      alignItems: 'center', 
      borderWidth: 1, 
      borderColor: theme.colors.outlineVariant,
      ...theme.shadows.soft 
    },
    miniCardIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.primaryContainer, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    miniCardAmt: { fontSize: 15, fontWeight: '900', color: theme.colors.onSurface },
    miniCardDate: { fontSize: 11, color: theme.colors.onSurfaceVariant, marginTop: 1, fontWeight: '700' },
    
    editModeBtn: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 8, 
      paddingHorizontal: 16, 
      paddingVertical: 12, 
      borderRadius: 16, 
      backgroundColor: theme.colors.surfaceContainerLow,
      borderWidth: 1, 
      borderColor: theme.colors.outlineVariant 
    },
    editModeTxt: { fontSize: 13, fontWeight: '900', color: theme.colors.onSurfaceVariant },
    
    diffAlert: { padding: 18, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24, borderWidth: 1 },
    diffError: { backgroundColor: theme.colors.error + '10', borderColor: theme.colors.error + '25' },
    diffSuccess: { backgroundColor: theme.colors.success + '10', borderColor: theme.colors.success + '25' },
    diffText: { fontSize: 13, fontWeight: '800', flex: 1 },
    
    autoLevelBtn: { 
      paddingHorizontal: 12, 
      paddingVertical: 8, 
      borderRadius: 12, 
      marginTop: 8, 
      alignSelf: 'flex-start', 
      borderWidth: 1, 
      borderColor: theme.colors.outlineVariant,
      backgroundColor: theme.colors.surface 
    },
    autoLevelTxt: { fontSize: 12, fontWeight: '800', color: theme.colors.primary },
    
    adjustActions: { flexDirection: 'row', gap: 12, marginTop: 16, paddingHorizontal: 4 },
    cancelAdjustBtn: { flex: 1, paddingVertical: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.outlineVariant },
    cancelAdjustTxt: { fontSize: 14, fontWeight: '800', color: theme.colors.onSurfaceVariant },
    saveAdjustBtn: { flex: 2, paddingVertical: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary, ...theme.shadows.soft },
    saveAdjustTxt: { fontSize: 14, fontWeight: '900', color: '#FFF' },
    
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    pocketCard: { 
      width: (width - 62) / 2, 
      borderRadius: 32, 
      padding: 20, 
      backgroundColor: theme.colors.surface, 
      borderWidth: 1, 
      borderColor: theme.colors.outlineVariant,
      ...theme.shadows.premium
    },
    pocketTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    iconCircle: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceContainerLow },
    weightBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: theme.colors.surfaceContainerHigh },
    weightTxt: { fontSize: 11, fontWeight: '900', color: theme.colors.primary },
    
    inlineEditPct: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: theme.colors.surfaceContainerHighest },
    editPctInput: { fontSize: 14, fontWeight: '900', minWidth: 28, textAlign: 'right' },
    editPctLabel: { fontSize: 11, fontWeight: '800', marginLeft: 2 },
    
    pocketName: { fontSize: 16, fontWeight: '900', color: theme.colors.onSurface, marginBottom: 4 },
    budgetLabel: { fontSize: 13, fontWeight: '700', color: theme.colors.onSurfaceVariant },
    editBudgetInput: { fontSize: 15, fontWeight: '900', color: theme.colors.onSurface },
    
    progressArea: { gap: 8 },
    remTxt: { fontSize: 11, fontWeight: '900' },
    
    addCard: { 
      borderStyle: 'dashed', 
      justifyContent: 'center', 
      alignItems: 'center', 
      gap: 10, 
      backgroundColor: 'transparent',
      borderColor: theme.colors.outlineVariant,
      minHeight: 180
    },
    addTxt: { fontSize: 13, fontWeight: '900' },
    
    bottomSheet: { 
      position: 'absolute', 
      bottom: 0, 
      left: 0, 
      right: 0, 
      height: height * 0.75, 
      borderTopLeftRadius: 40, 
      borderTopRightRadius: 40, 
      padding: 32, 
      backgroundColor: theme.colors.surface,
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
      backgroundColor: theme.colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant 
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
    
    txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant },
    txMerchant: { fontSize: 16, fontWeight: '800', color: theme.colors.onSurface },
    txDate: { fontSize: 12, color: theme.colors.onSurfaceVariant, marginTop: 2 },
    txAmt: { fontSize: 16, fontWeight: '900', color: theme.colors.onSurface },
    
    deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20, marginTop: 32 },
    delTxt: { fontSize: 14, fontWeight: '800' },
    
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalContent: { width: '100%', borderRadius: 36, padding: 32, backgroundColor: theme.colors.surface, ...theme.shadows.premium },
    modalTitle: { fontSize: 22, fontWeight: '900', marginBottom: 24, color: theme.colors.onSurface },
    modalIn: { 
      borderRadius: 20, 
      padding: 18, 
      fontSize: 16, 
      marginBottom: 16, 
      borderWidth: 1, 
      borderColor: theme.colors.outlineVariant, 
      backgroundColor: theme.colors.surfaceContainerLow,
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
      <ScrollView contentContainerStyle={[styles.scrollPadding, { paddingTop: Math.max(insets.top, 16) + 104, paddingBottom: Math.max(insets.bottom, 16) + normalize(76) + 24 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.inlineHeader}>
          <TouchableOpacity onPress={() => setSelectedMonth(prev => (prev - 1 + 12) % 12)} style={styles.arrow}><ChevronLeft size={18} color={theme.colors.onSurface} /></TouchableOpacity>
          <Text style={styles.monthTitle}>{MONTHS[selectedMonth].label}</Text>
          <TouchableOpacity onPress={() => setSelectedMonth(prev => (prev + 1) % 12)} style={styles.arrow}><ChevronRight size={18} color={theme.colors.onSurface} /></TouchableOpacity>
        </View>

        <View style={styles.cardHeader}>
           <View style={{flex: 1}}>
             <Text style={styles.topLabel}>TOTAL INGRESADO ESTE MES</Text>
             {isAdjustMode ? (
               <TextInput 
                 style={styles.incomeInput}
                 keyboardType="numeric"
                 value={tempIncome.toString()}
                 onChangeText={(v) => setTempIncome(parseInt(v.replace(/[^0-9]/g, '')) || 0)}
                 autoFocus
               />
             ) : (
               <Text style={styles.topAmount}>$ {totalInvoicedIncome.toLocaleString('es-CO')}</Text>
             )}
             {!isAdjustMode && totalInvoicedIncome !== monthlyIncome && (
               <Text style={styles.budgetCompareTxt}>Objetivo: ${monthlyIncome.toLocaleString('es-CO')}</Text>
             )}
           </View>
           <TouchableOpacity 
             style={[styles.editModeBtn, isAdjustMode && { backgroundColor: theme.colors.onSurface }]} 
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

        {incomeTransactions.length > 0 && !isAdjustMode && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.incomeHistoryRow} contentContainerStyle={{ paddingHorizontal: 20 }}>
            {incomeTransactions.map((tx, idx) => (
              <View key={tx.id || idx} style={styles.incomeMiniCard}>
                <View style={styles.miniCardIcon}><TrendingUp size={16} color={theme.colors.primary} /></View>
                <View>
                  <Text style={styles.miniCardAmt}>+${Math.abs(tx.amount).toLocaleString('es-CO')}</Text>
                  <Text style={styles.miniCardDate}>{new Date(tx.date_string || tx.created_at).toLocaleDateString()}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {isAdjustMode && (
          <View style={[styles.diffAlert, diff !== 0 ? styles.diffError : styles.diffSuccess]}>
             <AlertCircle size={20} color={diff === 0 ? theme.colors.success : theme.colors.error} />
             <Text style={[styles.diffText, { color: diff === 0 ? theme.colors.success : theme.colors.error }]}>
               {diff === 0 ? '¡Presupuesto equilibrado!' : diff > 0 ? `Quedan $${diff.toLocaleString('es-CO')} por asignar` : `Faltan $${Math.abs(diff).toLocaleString('es-CO')}`}
             </Text>
             
             {diff > 0 && (
                <TouchableOpacity style={styles.autoLevelBtn} onPress={() => {
                    const ahorros = pockets.find(p => p.category === 'Ahorros');
                    if (ahorros) setTempBudgets(prev => ({ ...prev, [ahorros.id]: (prev[ahorros.id] || 0) + diff }));
                }}>
                  <Text style={styles.autoLevelTxt}>Nivelar Ahorro</Text>
                </TouchableOpacity>
             )}
          </View>
        )}

        {isAdjustMode && (
          <View style={styles.adjustActions}>
            <TouchableOpacity style={styles.cancelAdjustBtn} onPress={() => setIsAdjustMode(false)}><Text style={styles.cancelAdjustTxt}>Cerrar</Text></TouchableOpacity>
            <TouchableOpacity 
              style={[styles.saveAdjustBtn, diff !== 0 && { opacity: 0.5 }]} 
              onPress={saveBatchBudget}
              disabled={isSaving || diff !== 0}
            >
              {isSaving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.saveAdjustTxt}>Guardar Presupuesto</Text>}
            </TouchableOpacity>
          </View>
        )}

        {totalInvoicedIncome === 0 && !isAdjustMode && (
          <TouchableOpacity style={styles.incomeAlert} onPress={startAdjustMode}>
            <PieChart size={20} color={theme.colors.primary} />
            <Text style={[styles.incomeAlertText, { color: theme.colors.onSurfaceVariant }]}>
              Define tu presupuesto ideal. Toca <Text style={{ fontWeight: '900', color: theme.colors.primary }}>Ajustar</Text> para organizar tu capital.
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.grid}>
           {[...pockets].sort((a,b) => (b.target_percentage || 0) - (a.target_percentage || 0)).map((p, i) => {
             const spent = getPocketSpending(p.category);
             const budget = isAdjustMode ? tempBudgets[p.id] : (p.budget || 0);
             const targetPct = isAdjustMode ? (tempPercentages[p.id] || 0) : (p.target_percentage || 0);
             const isOverspent = spent > budget;
             const pctUsage = Math.min((spent / (budget || 1)) * 100, 100);

             return (
               <TouchableOpacity key={p.id || i} style={styles.pocketCard} activeOpacity={0.9} onPress={() => openPocket(p)}>
                  <View style={styles.pocketTop}>
                    <View style={styles.iconCircle}><CategoryIcon iconName={p.icon} size={20} color={theme.colors.onSurface} /></View>
                    <View style={styles.weightBadge}><Text style={styles.weightTxt}>{targetPct}%</Text></View>
                  </View>
                  
                  <View style={{ marginBottom: 16 }}>
                    <Text style={styles.pocketName}>{p.name}</Text>
                    {isAdjustMode ? (
                      <View style={styles.inlineEditPct}>
                         <TextInput 
                           style={styles.editPctInput} keyboardType="numeric" value={targetPct.toString()}
                           onChangeText={(v) => {
                             const val = Math.min(parseInt(v.replace(/[^0-9]/g, '')) || 0, 100);
                             setTempPercentages(pvs => ({...pvs, [p.id]: val}));
                             if (tempIncome > 0) setTempBudgets(pvs => ({...pvs, [p.id]: Math.round(tempIncome * (val/100))}));
                           }}
                         />
                         <Text style={styles.editPctLabel}>%</Text>
                      </View>
                    ) : (
                      <Text style={styles.budgetLabel}>$ {budget.toLocaleString('es-CO')}</Text>
                    )}
                  </View>

                  <View style={styles.progressArea}>
                     <AnimatedProgressBar percent={pctUsage} color={isOverspent ? theme.colors.error : theme.colors.primary} bgColor={theme.colors.surfaceContainerLow} />
                     <Text style={[styles.remTxt, { color: isOverspent ? theme.colors.error : theme.colors.onSurfaceVariant }]}>
                       {isOverspent ? `-$${(spent - budget).toLocaleString('es-CO')}` : `$${(budget - spent).toLocaleString('es-CO')} libres`}
                     </Text>
                  </View>
               </TouchableOpacity>
             );
           })}
           <TouchableOpacity style={[styles.pocketCard, styles.addCard]} onPress={() => setAddModalVisible(true)}>
              <Plus size={32} color={theme.colors.onSurfaceVariant} strokeWidth={1} />
              <Text style={[styles.addTxt, { color: theme.colors.onSurfaceVariant }]}>Nueva Categoría</Text>
           </TouchableOpacity>
        </View>
      </ScrollView>

      {selectedPocket && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          <Pressable style={styles.backdrop} onPress={closePocket}>
             <Animated.View style={[styles.backdropTint, { opacity: sheetAnim.interpolate({ inputRange: [0, height], outputRange: [1, 0] }) }]} />
          </Pressable>
          <Animated.View style={[styles.bottomSheet, { transform: [{ translateY: sheetAnim }] }]}>
             <View style={styles.sheetHeader}>
                <CategoryIcon iconName={selectedPocket.icon} size={24} color={theme.colors.primary} />
                <Text style={styles.sheetTitle}>{selectedPocket.name}</Text>
                <TouchableOpacity onPress={closePocket} style={{ padding: 8 }}><X size={24} color={theme.colors.onSurfaceVariant} /></TouchableOpacity>
             </View>
             
             <View style={styles.quickStats}>
                <View style={styles.qStat}><Text style={styles.qLabel}>PAGOS REALIZADOS</Text><Text style={styles.qVal}>$ {getPocketSpending(selectedPocket.category).toLocaleString('es-CO')}</Text></View>
                <View style={styles.qStat}><Text style={styles.qLabel}>REMANENTE</Text><Text style={[styles.qVal, { color: theme.colors.primary }]}>$ {Math.max(0, selectedPocket.budget - getPocketSpending(selectedPocket.category)).toLocaleString('es-CO')}</Text></View>
             </View>

             {getPocketSpending(selectedPocket.category) > selectedPocket.budget && (
                <View style={styles.overspentAlertContainer}>
                  <View style={styles.overspentAlert}>
                    <AlertCircle size={22} color="#FFF" />
                    <View style={{flex:1}}>
                      <Text style={styles.overspentTitle}>Límite excedido</Text>
                      <Text style={styles.overspentMsg}>Has gastado ${(getPocketSpending(selectedPocket.category) - selectedPocket.budget).toLocaleString('es-CO')} por encima del presupuesto.</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.fixOverspentBtn} onPress={() => { closePocket(); onTransferPress({ fromId: selectedPocket.id, amount: getPocketSpending(selectedPocket.category) - selectedPocket.budget }); }}>
                    <Text style={styles.fixOverspentTxt}>Mover fondos ahora mismo</Text>
                    <ArrowRight size={18} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
             )}

             <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={false}>
                {getPocketTransactions(selectedPocket.category).map((tx, idx) => (
                  <View key={tx.id || idx} style={styles.txRow}>
                      <View style={{flex:1}}><Text style={styles.txMerchant}>{tx.merchant}</Text><Text style={styles.txDate}>{new Date(tx.date_string || tx.created_at).toLocaleDateString('es-CO')}</Text></View>
                      <Text style={styles.txAmt}>$ {Math.abs(tx.amount).toLocaleString('es-CO')}</Text>
                  </View>
                ))}
             </ScrollView>

             <TouchableOpacity style={styles.deleteBtn} onPress={() => deletePocket(selectedPocket.id)}>
                <Trash2 size={18} color={theme.colors.error} />
                <Text style={[styles.delTxt, { color: theme.colors.error }]}>Eliminar este bolsillo</Text>
             </TouchableOpacity>
          </Animated.View>
        </View>
      )}

      <Modal visible={addModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nuevo Bolsillo</Text>
            <TextInput style={styles.modalIn} placeholder="Nombre de categoría" value={newName} onChangeText={setNewName} placeholderTextColor={theme.colors.onSurfaceVariant + '80'} />
            <TextInput style={styles.modalIn} placeholder="Monto objetivo ($)" keyboardType="numeric" value={newBudget} onChangeText={setNewBudget} placeholderTextColor={theme.colors.onSurfaceVariant + '80'} />
            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={() => setAddModalVisible(false)} style={styles.modalCancel}><Text style={styles.cancelTxt}>Cerrar</Text></TouchableOpacity>
              <TouchableOpacity onPress={syncPocketToCloud} style={styles.save}><Text style={styles.saveTxt}>Confirmar</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};
