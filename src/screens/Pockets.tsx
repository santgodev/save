import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, Animated, StyleSheet, ScrollView, Dimensions, useWindowDimensions, Pressable, TextInput, Modal, ActivityIndicator, Platform, TouchableWithoutFeedback, Keyboard, KeyboardAvoidingView
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import Slider from '@react-native-community/slider';
import {
  ChevronDown, Edit3,
  Plus, X, Trash2, AlertCircle, Clock, ArrowRight, Check, Pencil, Info
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme/ThemeContext';
import { normalize, getDeterministicColor } from '../theme/theme';
import { CategoryIcon } from '../components/CategoryIcon';
import { AnimatedProgressBar } from '../components/AnimatedProgressBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useCycleState, useUserCycles } from '../lib/useCycleState';
import { formatMoney } from '../lib/format';
import { notify } from '../lib/notify';
import { CycleNav } from '../components/CycleNav';
import { TransactionDetailModal } from '../components/TransactionDetailModal';
import type { Session } from '@supabase/supabase-js';

export const Pockets = ({ pockets, transactions, session, onRefresh, onTransferPress }: { pockets: any[], transactions: any[], session: Session, onRefresh: () => void, onTransferPress: (params: { fromId?: string, amount?: number }) => void }) => {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const [selectedPocket, setSelectedPocket] = useState<any | null>(null);
  const [showIncomeSummary, setShowIncomeSummary] = useState(false);

  const [isAdjustMode, setIsAdjustMode] = useState(false);
  const [tempBudgets, setTempBudgets] = useState<Record<string, string>>({});
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBudget, setNewBudget] = useState('');
  const [newIcon, setNewIcon] = useState('tag');

  // Edit existing pocket
  const [isEditingPocket, setIsEditingPocket] = useState(false);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showAllTxs, setShowAllTxs] = useState(false);
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [editBudgetValue, setEditBudgetValue] = useState('');
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [showCycleInsight, setShowCycleInsight] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('@save_cycle_insight_dismissed').then(val => {
      if (val !== 'true') setShowCycleInsight(true);
    });
  }, []);

  const dismissCycleInsight = async () => {
    setShowCycleInsight(false);
    await AsyncStorage.setItem('@save_cycle_insight_dismissed', 'true');
  };

  const sheetAnim = useRef(new Animated.Value(height)).current;

  // Fuente ÚNICA de verdad — RPC get_monthly_state. Mismos números que
  // ven Dashboard y el chat-advisor. selectedMonth es 0..11 (JS Date),
  // el RPC espera 1..12.
  const { cycles, activeCycle } = useUserCycles();
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);

  useEffect(() => {
    if (activeCycle && !selectedCycleId) {
      setSelectedCycleId(activeCycle.id);
    }
  }, [activeCycle]);

  const { state: monthState, refresh: refreshMonthly, loading: isMonthlyLoading } = useCycleState(selectedCycleId || undefined);

  // Lookup helper: bolsillo del mes con sus números (allocated, available,
  // spent_month, pct_used). Si todavía no cargó, fallback a la prop.
  const getMonthlyPocket = (id: string) =>
    (monthState?.pockets || []).find(p => p.id === id);

  // "Gastado en X categoría este mes" — lo da el RPC, no el cliente.
  const getPocketSpending = (category: string) => {
    const mp = (monthState?.pockets || []).find(p => p.category === category);
    return mp?.spent_month ?? 0;
  };

  const startAdjustMode = () => {
    const budgets: Record<string, string> = {};
    pockets.forEach(p => {
      if (p.is_default_free) return; // Libre pocket is not manually edited
      // En modo ajuste editamos el PLAN (allocated_budget), no el saldo.
      const alloc = (p as any).allocated_budget ?? p.budget ?? 0;
      budgets[p.id] = alloc.toString();
    });
    setTempBudgets(budgets);
    setIsAdjustMode(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // El total a asignar se compara con el ingreso real del mes (ya viene
  // sumado de transactions vía el RPC).
  const monthIncome = monthState?.income_month ?? 0;
  // El total a asignar de los demás bolsillos
  const totalAssigned = Object.values(tempBudgets).reduce(
    (a, b) => a + (parseInt(b.replace(/\D/g, '')) || 0),
    0,
  );
  // El bolsillo Libre recibe automáticamente el remanente
  const calculatedFreeBudget = monthIncome - totalAssigned;

  const saveBatchBudget = async () => {
    setIsSaving(true);
    try {
      // En "Ajustar" el usuario re-fija el PLAN del mes para cada bolsillo.
      // FIX BUG 2: Solo actualizamos `allocated_budget` (el plan).
      // NO tocamos `budget` (saldo disponible real) — ese campo solo lo
      // modifican los RPCs: register_income, register_expense,
      // transfer_between_pockets y delete_transaction_with_reversal.
      // Antes se aplicaba el delta del plan encima del saldo real,
      // corrompiendo el disponible con números inventados.
      const updates = Object.entries(tempBudgets).map(([id, rawBudget]) => {
        const allocated = parseInt(rawBudget.replace(/\D/g, '')) || 0;
        return supabase
          .from('pockets')
          .update({ allocated_budget: allocated })
          .eq('id', id);
      });
      
      const freePocket = pockets.find(p => p.is_default_free);
      if (freePocket) {
        const newAllocated = monthIncome - totalAssigned;
        updates.push(
          supabase.from('pockets').update({ allocated_budget: newAllocated }).eq('id', freePocket.id)
        );
      }
      
      await Promise.all(updates);
      setIsAdjustMode(false);
      onRefresh();
      refreshMonthly();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) { console.error(e); } finally { setIsSaving(false); }
  };

  const deletePocket = async (id: string) => {
    const pocket = pockets.find(p => p.id === id);
    if (pocket?.is_default_free) {
      notify.error('No puedes eliminar el bolsillo Libre por defecto.');
      return;
    }
    
    notify.confirm(
      `Eliminar "${pocket?.name}"`,
      'Esta acción no se puede deshacer.',
      {
        confirmLabel: 'Eliminar',
        destructive: true,
        onConfirm: async () => {
          const { error } = await supabase.rpc('delete_pocket_safe', { p_pocket_id: id, p_user_id: session.user.id });
          if (error) {
            notify.error('Error al eliminar bolsillo');
            return;
          }
          onRefresh();
          closePocket();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    );
  };

  const syncPocketToCloud = async () => {
    if (!newName.trim()) return;
    const allocated = parseInt(newBudget.replace(/\D/g, '')) || 0;
    // FIX BUG 8: El nuevo bolsillo parte con budget = 0 (saldo real vacío).
    // El plan (allocated_budget) sí refleja lo que el usuario asignó.
    // El saldo real (budget) crece solo cuando le llegan ingresos vía
    // register_income. Antes se inicializaba budget = allocated, lo que
    // inflaba el disponible sin que hubiera plata real.
    await supabase.from('pockets').insert({
      user_id: session.user.id,
      name: newName.trim(),
      category: newName.trim(),
      budget: 0,
      allocated_budget: allocated,
      icon: newIcon || 'tag'
    });
    setNewName('');
    setNewBudget('');
    setNewIcon('tag');
    setAddModalVisible(false);
    onRefresh();
    refreshMonthly();
  };

  const saveEditPocket = async () => {
    if (!selectedPocket || !editName.trim()) return;
    await supabase.from('pockets')
      .update({ name: editName.trim(), category: editName.trim(), icon: editIcon })
      .eq('id', selectedPocket.id);
    setIsEditingPocket(false);
    setShowIconPicker(false);
    onRefresh();
    refreshMonthly();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const saveBudgetInline = async () => {
    if (!selectedPocket) return;
    const newBudget = parseInt(editBudgetValue.replace(/\D/g, '')) || 0;
    // FIX BUG 3: Solo actualizar el plan (allocated_budget).
    // Antes sobreescribía budget (saldo real) con el valor del plan,
    // borrando completamente el historial de gastos del bolsillo.
    await supabase.from('pockets')
      .update({ allocated_budget: newBudget })
      .eq('id', selectedPocket.id);
    setIsEditingBudget(false);
    setEditBudgetValue('');
    onRefresh();
    refreshMonthly();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const startEditPocket = () => {
    if (!selectedPocket) return;
    setEditName(selectedPocket.name);
    setEditIcon(selectedPocket.icon || 'tag');
    setIsEditingPocket(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const getPocketTransactions = (category: string, limit?: number) => {
    const all = transactions.filter(tx => {
      return tx.category === category && tx.cycle_id === selectedCycleId;
    }).sort((a, b) => new Date((b.date_string || b.created_at).split('T')[0] + 'T12:00:00').getTime() - new Date((a.date_string || a.created_at).split('T')[0] + 'T12:00:00').getTime());
    return limit ? all.slice(0, limit) : all;
  };

  const incomeTransactions = transactions.filter(tx => {
    return tx.category === 'Ingreso' && tx.cycle_id === selectedCycleId;
  });
  // OJO: para el TOTAL de ingresos del mes usamos monthState.income_month
  // (la fuente única). incomeTransactions queda solo para listar los
  // registros individuales.
  const totalInvoicedIncome = monthIncome;

  const freePocketData = monthState?.pockets?.find(p => p.is_default_free);
  const freeAmountAvailable = isAdjustMode 
    ? calculatedFreeBudget 
    : (freePocketData?.available ?? freePocketData?.budget ?? 0);

  const openPocket = (pocket: any) => {
    if (isAdjustMode) return;
    setSelectedPocket(pocket);
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 50, friction: 8 }).start();
  };

  const closePocket = () => {
    Animated.timing(sheetAnim, { toValue: height, duration: 250, useNativeDriver: true }).start(() => setSelectedPocket(null));
  };

  // formatMoney importado de lib/format. Se mantiene alias formatCOP=formatMoney
  // local para no tocar 12 callsites; señalado para futuro borrado.
  const formatCOP = formatMoney;

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scrollPadding: { paddingHorizontal: 14 },

    // Header del mes
    // monthNav/monthTitle/navBtn migrados a <MonthNav> compartido.

    // Tarjeta de presupuesto
    budgetCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.glassWhite, paddingHorizontal: 20, paddingVertical: 22, borderRadius: theme.radius.xl, marginBottom: 20, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)', ...theme.shadows.md },
    budgetLabel: { fontSize: 10, fontWeight: '900', color: theme.colors.onSurfaceVariant, marginBottom: 6, letterSpacing: 1.2, textTransform: 'uppercase' },
    budgetAmount: { fontSize: 28, fontWeight: '900', letterSpacing: -1, color: theme.colors.onSurface },
    budgetInput: { fontSize: 28, fontWeight: '900', padding: 0, margin: 0, color: theme.colors.primary, minWidth: 100 },
    editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: theme.colors.primaryContainer, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
    editBtnTxt: { fontSize: 13, fontWeight: '900', color: theme.colors.primary },

    // Alerta diff
    diffBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, marginBottom: 16, borderWidth: 1 },
    diffOk: { backgroundColor: theme.colors.successContainer, borderColor: theme.colors.success + '30' },
    diffErr: { backgroundColor: theme.colors.errorContainer, borderColor: theme.colors.error + '30' },
    diffTxt: { flex: 1, fontSize: 14, fontWeight: '800' },

    adjustActions: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    cancelBtn: { flex: 1, paddingVertical: 15, borderRadius: 18, alignItems: 'center', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.outlineVariant },
    cancelTxt: { fontSize: 14, fontWeight: '800', color: theme.colors.onSurfaceVariant },
    saveBtn: { flex: 2, paddingVertical: 15, borderRadius: 18, alignItems: 'center', backgroundColor: theme.colors.primary, ...theme.shadows.soft },
    saveTxt: { fontSize: 14, fontWeight: '900', color: '#FFF' },

    // Grid de bolsillos
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    cardWrap: { width: (width - (14 * 2 + 12)) / 2, borderRadius: theme.radius.xl, overflow: 'hidden', ...theme.shadows.md },
    
    // Tarjeta plana (sin gradiente)
    card: { flex: 1, padding: 18, borderRadius: theme.radius.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    iconBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.3)' },
    
    pocketName: { fontSize: 16, fontWeight: '900', color: '#FFF', marginBottom: 2 },
    pocketBudget: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.75)', marginBottom: 14 },

    remainingLbl: { fontSize: 10, fontWeight: '900', color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5, marginBottom: 4 },
    remainingAmt: { fontSize: 16, fontWeight: '900', color: '#FFF' },

    // Modo edición
    adjustInput: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, fontSize: 15, fontWeight: '900', color: '#FFF', marginBottom: 10, textAlign: 'center' },

    // Tarjeta de agregar
    addCard: { width: (width - (14 * 2 + 12)) / 2, borderRadius: theme.radius.xl, minHeight: 170, justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: theme.colors.glassWhite, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.primary + '50', padding: 16, ...theme.shadows.sm },
    addTxt: { fontSize: 13, fontWeight: '800', color: theme.colors.primary },

    // BottomSheet
    backdrop: { ...StyleSheet.absoluteFillObject },
    backdropTint: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
    sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.72, borderTopLeftRadius: 36, borderTopRightRadius: 36, paddingTop: 28, paddingHorizontal: 28, backgroundColor: theme.colors.background, borderTopWidth: 1, borderColor: theme.colors.divider, ...theme.shadows.premium },
    sheetHandle: { width: 40, height: 4, backgroundColor: theme.colors.outlineVariant, borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24 },
    sheetTitle: { flex: 1, fontSize: 22, fontWeight: '900', color: theme.colors.onSurface },
    closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' },

    // Stats del sheet
    statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    statCard: { flex: 1, padding: 16, borderRadius: 18, backgroundColor: theme.colors.surfaceContainerLow },
    statLabel: { fontSize: 10, fontWeight: '900', color: theme.colors.onSurfaceVariant, letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' },
    statVal: { fontSize: 20, fontWeight: '900', color: theme.colors.onSurface },

    // Overspend banner
    overspendWrap: { borderRadius: 24, overflow: 'hidden', marginBottom: 24, borderWidth: 1.5, borderColor: theme.colors.error + '40', backgroundColor: theme.colors.error + '0A' },
    overspendHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, paddingBottom: 10 },
    overspendTitle: { fontSize: 15, fontWeight: '900', color: theme.colors.error, flex: 1 },
    overspendCTA: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, backgroundColor: 'transparent' },

    // Movimientos
    sectionLabel: { fontSize: 10, fontWeight: '900', color: theme.colors.onSurfaceVariant, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
    txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.divider },
    txDate: { fontSize: 12, color: theme.colors.onSurfaceVariant, marginTop: 1 },
    txAmt: { fontSize: 15, fontWeight: '900' },
    deleteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 18, marginTop: 12 },

    // Modal nuevo bolsillo
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalBox: { width: '100%', borderRadius: 32, padding: 28, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.divider, ...theme.shadows.premium },
    modalTitle: { fontSize: 22, fontWeight: '900', marginBottom: 24, color: theme.colors.onSurface },
    fieldLabel: { fontSize: 10, fontWeight: '900', color: theme.colors.onSurfaceVariant, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
    fieldInput: { borderRadius: 18, paddingHorizontal: 20, paddingVertical: 16, fontSize: 16, marginBottom: 20, borderWidth: 1.5, borderColor: theme.colors.outlineVariant, backgroundColor: theme.colors.glassWhite, color: theme.colors.onSurface, fontWeight: '700' },
    modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 14, marginTop: 4 },
    btnCancel: { paddingVertical: 14, paddingHorizontal: 20 },
    btnSave: { paddingVertical: 14, paddingHorizontal: 28, borderRadius: 18, backgroundColor: theme.colors.primary, ...theme.shadows.soft },
  }), [theme, width, height]);

  // Centralized helper to get the precise allocated budget for this month
  const getPocketAlloc = (p: Pocket) => {
    if (p.is_default_free) {
      // Libre receives whatever is left from the monthIncome after other pockets are funded
      const othersAlloc = pockets.filter(x => !x.is_default_free).reduce((acc, x) => {
         const mp = getMonthlyPocket(x.id);
         const val = isAdjustMode ? (parseInt((tempBudgets[x.id] || '').replace(/\D/g, '')) || 0) : (mp?.allocated ?? (x as any).allocated_budget ?? x.budget ?? 0);
         return acc + val;
      }, 0);
      return Math.max(0, monthIncome - othersAlloc);
    }
    if (isAdjustMode) {
      return parseInt((tempBudgets[p.id] || '').replace(/\D/g, '')) || 0;
    }
    const mp = getMonthlyPocket(p.id);
    return mp?.allocated ?? (p as any).allocated_budget ?? p.budget ?? 0;
  };

  // Sort: libre siempre último, el resto por % gastado (más lleno primero)
  // IMPORTANTE: Se usa la asignación real de la BD para el orden, de forma que al 
  // escribir en Ajustar (tempBudgets) no brinquen los bolsillos cerrando el teclado.
  const sorted = [...pockets].sort((a, b) => {
    if (a.is_default_free) return 1;
    if (b.is_default_free) return -1;
    const mpA = (monthState?.pockets || []).find(p => p.id === a.id);
    const mpB = (monthState?.pockets || []).find(p => p.id === b.id);
    
    const allocA = mpA?.allocated ?? (a as any).allocated_budget ?? a.budget ?? 1;
    const allocB = mpB?.allocated ?? (b as any).allocated_budget ?? b.budget ?? 1;
    
    const pctA = (mpA?.spent_month ?? 0) / (allocA || 1);
    const pctB = (mpB?.spent_month ?? 0) / (allocB || 1);
    return pctB - pctA;
  });

  const POCKET_ICONS = [
    { key: 'tag', label: 'Etiqueta' },
    { key: 'Home', label: 'Casa' },
    { key: 'Car', label: 'Carro' },
    { key: 'Utensils', label: 'Comida' },
    { key: 'Coffee', label: 'Café' },
    { key: 'ShoppingBasket', label: 'Mercado' },
    { key: 'ShoppingBag', label: 'Ropa' },
    { key: 'Smartphone', label: 'Tecnología' },
    { key: 'Zap', label: 'Servicios' },
    { key: 'Plane', label: 'Viajes' },
    { key: 'Theater', label: 'Ocio' },
    { key: 'PiggyBank', label: 'Ahorro' },
    { key: 'health', label: 'Salud' },
    { key: 'education', label: 'Educación' },
    { key: 'Banknote', label: 'Dinero' },
    { key: 'Shield', label: 'Seguro' },
    { key: 'Briefcase', label: 'Trabajo' },
  ];

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1 }}>
          {isMonthlyLoading && !monthState ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={[styles.scrollPadding, { paddingTop: Math.max(insets.top, 16) + 104, paddingBottom: Math.max(insets.bottom, 16) + normalize(76) + 24 }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            >
              {/* Navegación de Ciclo — componente compartido */}
              <CycleNav cycles={cycles} activeCycleId={selectedCycleId} onChange={setSelectedCycleId} />

              {/* Cycle Educational Insight */}
              {showCycleInsight && (
                <View style={{ backgroundColor: theme.colors.primaryContainer, borderRadius: theme.radius.lg, padding: 16, marginBottom: 20, flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderColor: theme.colors.primary + '30' }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
                    <Info size={18} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: theme.colors.primary, marginBottom: 4 }}>Tus meses son Ciclos</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.onSurfaceVariant, lineHeight: 18, marginBottom: 12 }}>
                      En Save, tu mes no termina el día 30, termina cuando te vuelve a entrar plata. Así, si pagas algo el 4 de julio con tu sueldo de junio, la app sabrá que ese dinero pertenece a tu ciclo de junio.
                    </Text>
                    <TouchableOpacity onPress={dismissCycleInsight} style={{ alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.colors.primary, borderRadius: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFF' }}>Entendido</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Tarjeta de resumen de ingresos — rediseñada */}
          {totalInvoicedIncome > 0 ? (
            <View
              style={{
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.xl,
                padding: 20,
                marginBottom: 20,
                borderWidth: 1,
                borderColor: theme.colors.outlineVariant + '60',
                ...theme.shadows.sm,
              }}
            >
              {/* Header */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '900', color: theme.colors.onSurfaceVariant, letterSpacing: 1, textTransform: 'uppercase' }}>
                  Mis ingresos de {monthState?.cycle_name || 'este ciclo'}
                </Text>
              </View>

              {/* 3 métricas en fila */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1, alignItems: 'center', backgroundColor: theme.colors.primary + '12', borderRadius: 14, paddingVertical: 12 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: theme.colors.primary, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>Ingresé</Text>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.primary, fontFamily: theme.fonts.headline }} numberOfLines={1} adjustsFontSizeToFit>
                    {formatCOP(totalInvoicedIncome)}
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', backgroundColor: theme.colors.surfaceContainerLow, borderRadius: 14, paddingVertical: 12 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: theme.colors.onSurfaceVariant, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>Asignado</Text>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.onSurface, fontFamily: theme.fonts.headline }} numberOfLines={1} adjustsFontSizeToFit>
                    {formatCOP(pockets.filter(p => !p.is_default_free).reduce((acc, p) => acc + getPocketAlloc(p), 0))}
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', backgroundColor: theme.colors.primary + '12', borderRadius: 14, paddingVertical: 12 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: theme.colors.primary, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>Libre</Text>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.primary, fontFamily: theme.fonts.headline }} numberOfLines={1} adjustsFontSizeToFit>
                    {formatCOP(pockets.find(p => p.is_default_free) ? getPocketAlloc(pockets.find(p => p.is_default_free)!) : 0)}
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.xl, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: theme.colors.outlineVariant + '60', alignItems: 'center', opacity: 0.6 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.onSurfaceVariant }}>Sin ingresos registrados en {monthState?.cycle_name || 'este ciclo'}</Text>
            </View>
          )}

          {/* Budget Distribution Bar */}
          {totalInvoicedIncome > 0 && (
            <View style={{ marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: theme.colors.onSurfaceVariant }}>Distribución del presupuesto</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.primary }}>
                  {formatCOP(sorted.filter(p => !p.is_default_free).reduce((acc, p) => acc + getPocketAlloc(p), 0))} asignados
                </Text>
              </View>
              <View style={{ height: 14, backgroundColor: theme.colors.surfaceContainerHighest, borderRadius: 7, flexDirection: 'row', overflow: 'hidden' }}>
                {sorted.map((p, i) => {
                  const alloc = getPocketAlloc(p);
                  if (alloc <= 0) return null;
                  const pct = Math.min((alloc / totalInvoicedIncome) * 100, 100);
                  
                  const premiumColors = theme.colors.pocketFlatColors as string[];
                  const color = p.is_default_free ? theme.colors.primary : premiumColors[i % premiumColors.length];
                  
                  const isSelected = selectedSegmentId === p.id;
                  const opacity = selectedSegmentId ? (isSelected ? 1 : 0.2) : 1;
                  
                  return (
                    <View key={p.id} style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRightWidth: 1, borderRightColor: theme.colors.background, opacity }} />
                  )
                })}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                {sorted.filter(p => getPocketAlloc(p) > 0).map((p) => {
                  const alloc = getPocketAlloc(p);
                  const i = sorted.indexOf(p);
                  const premiumColors = theme.colors.pocketFlatColors as string[];
                  const color = p.is_default_free ? theme.colors.primary : premiumColors[i % premiumColors.length];
                  const isSelected = selectedSegmentId === p.id;
                  const opacity = selectedSegmentId ? (isSelected ? 1 : 0.3) : 1;

                  return (
                    <TouchableOpacity 
                      key={p.id} 
                      activeOpacity={0.7}
                      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                      onPress={() => setSelectedSegmentId(isSelected ? null : p.id)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity, paddingVertical: 4 }}
                    >
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                      <Text style={{ fontSize: 10, color: isSelected ? theme.colors.onSurface : theme.colors.onSurfaceVariant, fontWeight: isSelected ? '900' : '700' }}>
                        {p.name} ({Math.round((alloc / totalInvoicedIncome) * 100)}%)
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          )}


          {/* Banner de diferencia eliminado de aquí */}
          {/* El bloque de adjustActions se movió al final de la grilla */}

          {/* Grid de Bolsillos */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.onSurface }}>Tus Bolsillos</Text>
              {isAdjustMode && calculatedFreeBudget < 0 && (
                <View style={[styles.diffBanner, styles.diffErr, { marginBottom: 0, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, flex: 0 }]}>
                  <AlertCircle size={14} color={theme.colors.error} />
                  <Text style={[styles.diffTxt, { color: theme.colors.error, fontSize: 11, flex: 0 }]}>Excedido</Text>
                </View>
              )}
            </View>
            {!isAdjustMode ? (
              <TouchableOpacity style={styles.editBtn} onPress={startAdjustMode}>
                <Text style={styles.editBtnTxt}>Ajustar</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.outlineVariant }} onPress={() => setIsAdjustMode(false)}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: theme.colors.onSurfaceVariant }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.colors.primary, borderRadius: 12 }, calculatedFreeBudget < 0 && { opacity: 0.5 }]}
                  onPress={saveBatchBudget}
                  disabled={isSaving || calculatedFreeBudget < 0}
                >
                  {isSaving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ fontSize: 12, fontWeight: '900', color: '#FFF' }}>Confirmar</Text>}
                </TouchableOpacity>
              </View>
            )}
          </View>
          <View style={styles.grid}>
            {sorted.map((p, i) => {
              // Plan (allocated_budget) y disponible (budget) vienen del RPC
              // o de la prop. NO restamos gasto otra vez — el RPC ya lo hizo.
              const mp = getMonthlyPocket(p.id);
              const allocated = getPocketAlloc(p);
              const spent = mp?.spent_month ?? 0;
              const available = p.is_default_free ? (allocated - spent) : (mp?.available ?? p.budget ?? 0);
              
              // En modo ajuste el card muestra el plan que se está editando.
              const planEditing = isAdjustMode
                ? (parseInt((tempBudgets[p.id] || '').replace(/\D/g, '')) || 0)
                : allocated;
                
              const remaining = available;             // ← lo que queda hoy, directo de la DB
              const isOver = remaining < 0 || (allocated > 0 && spent > allocated);
              const pctUsed = allocated > 0 ? Math.min((spent / allocated) * 100, 100) : 0;
              
              const premiumColors = theme.colors.pocketFlatColors as string[];
              const flatColor = p.is_default_free ? theme.colors.primary : premiumColors[i % premiumColors.length];

              return (
                <TouchableOpacity
                  key={p.id || i}
                  style={styles.cardWrap}
                  activeOpacity={isAdjustMode ? 1 : 0.88}
                  onPress={() => openPocket(p)}
                >
                  <View style={[styles.card, { backgroundColor: isOver ? theme.colors.error : flatColor, padding: 18, paddingTop: 20, paddingBottom: 22, minHeight: 180 }]}>
                    <View style={{ marginBottom: 20 }}>
                      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                        <CategoryIcon iconName={p.icon} size={16} color="#FFF" />
                      </View>
                    </View>

                    <Text style={{ fontSize: 18, fontWeight: '900', color: '#FFF', marginBottom: 4 }} numberOfLines={1}>{p.name}</Text>
                    
                    {!isAdjustMode ? (
                      <Text style={{ fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.9)', marginBottom: 20 }}>
                        Plan: {allocated > 0 ? formatCOP(allocated) : '$0'}
                      </Text>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.9)' }}>Plan: </Text>
                        {!p.is_default_free ? (
                          <TextInput
                            style={{ fontSize: 12, fontWeight: '800', color: '#FFF', padding: 0, margin: 0, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.5)', minWidth: 40 }}
                            keyboardType="numeric"
                            value={tempBudgets[p.id] ? Number(tempBudgets[p.id]).toLocaleString('es-CO') : ''}
                            onChangeText={v => setTempBudgets(prev => ({ ...prev, [p.id]: v.replace(/\D/g, '') }))}
                            placeholder="0"
                            placeholderTextColor="rgba(255,255,255,0.4)"
                          />
                        ) : (
                          <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFF' }}>
                            {formatCOP(calculatedFreeBudget)}
                          </Text>
                        )}
                      </View>
                    )}

                    {!isAdjustMode && (
                      <View style={{ marginTop: 'auto' }}>
                        <AnimatedProgressBar percent={pctUsed} color="#FFF" bgColor="rgba(255,255,255,0.25)" height={8} />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 }}>
                          <Text style={{ fontSize: 9, fontWeight: '900', color: 'rgba(255,255,255,0.8)', letterSpacing: 0.5, marginBottom: 2 }}>{remaining < 0 ? 'EXCESO' : 'TE QUEDA'}</Text>
                          <Text style={{ fontSize: 15, fontWeight: '900', color: '#FFF' }} numberOfLines={1} adjustsFontSizeToFit>{formatCOP(Math.abs(remaining))}</Text>
                        </View>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Agregar bolsillo */}
            <TouchableOpacity style={styles.addCard} onPress={() => setAddModalVisible(true)}>
              <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: theme.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
                <Plus size={22} color={theme.colors.primary} strokeWidth={2.5} />
              </View>
              <Text style={styles.addTxt}>Nuevo Bolsillo</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
          )}
        </View>

      {/* BottomSheet simplificado */}
        {selectedPocket && (
          <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
            <Pressable style={styles.backdrop} onPress={closePocket}>
              <Animated.View style={[styles.backdropTint, { opacity: sheetAnim.interpolate({ inputRange: [0, height], outputRange: [1, 0] }) }]} />
            </Pressable>
            <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetAnim }] }]}>
              {/* Colored top strip matching the pocket's card color */}
              {(() => {
                const i = sorted.findIndex(p => p.id === selectedPocket.id);
                const premiumColors = theme.colors.pocketFlatColors as string[];
                const flatColor = selectedPocket.is_default_free ? theme.colors.primary : premiumColors[i % premiumColors.length];
                const mp = getMonthlyPocket(selectedPocket.id);
                const planAlloc = getPocketAlloc(selectedPocket);
                const spent = mp?.spent_month ?? 0;
                const available = selectedPocket.is_default_free ? (planAlloc - spent) : (mp?.available ?? selectedPocket.budget ?? 0);
                const isOver = available < 0;
                const pctUsed = planAlloc > 0 ? Math.min((spent / planAlloc) * 100, 100) : 0;
                const pocketColor = isOver ? theme.colors.error : flatColor;

                return (
                  <View style={{ backgroundColor: pocketColor, marginHorizontal: -28, marginTop: -28, padding: 20, paddingTop: 14, paddingBottom: 18, borderTopLeftRadius: 36, borderTopRightRadius: 36 }}>
                    {/* Handle */}
                    <View style={{ width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 2, alignSelf: 'center', marginBottom: 14 }} />

                    {/* Header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      {isEditingPocket ? (
                        <TouchableOpacity
                          style={{ width: 48, height: 48, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}
                          onPress={() => setShowIconPicker(v => !v)}
                        >
                          <CategoryIcon iconName={editIcon} size={26} color="#FFF" />
                        </TouchableOpacity>
                      ) : (
                        <View style={{ width: 48, height: 48, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                          <CategoryIcon iconName={selectedPocket.icon} size={26} color="#FFF" />
                        </View>
                      )}

                      <View style={{ flex: 1 }}>
                        {isEditingPocket ? (
                          <TextInput
                            style={{ fontSize: 22, fontWeight: '900', color: '#FFF', borderBottomWidth: 2, borderBottomColor: 'rgba(255,255,255,0.7)', paddingBottom: 4, fontFamily: theme.fonts.headline }}
                            value={editName}
                            onChangeText={setEditName}
                            autoFocus
                            maxLength={30}
                            placeholderTextColor="rgba(255,255,255,0.6)"
                          />
                        ) : (
                          <Text style={{ fontSize: 22, fontWeight: '900', color: '#FFF', fontFamily: theme.fonts.headline }}>{selectedPocket.name}</Text>
                        )}
                        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginTop: 2 }}>
                          {selectedPocket.is_default_free ? 'Disponible sin asignar: ' : 'Plan mensual: '}{formatCOP(planAlloc)}
                        </Text>
                      </View>

                      {isEditingPocket ? (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity
                            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}
                            onPress={saveEditPocket}
                          >
                            <Check size={18} color={pocketColor} strokeWidth={2.5} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}
                            onPress={() => { setIsEditingPocket(false); setShowIconPicker(false); }}
                          >
                            <X size={18} color="#FFF" strokeWidth={2.5} />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {!selectedPocket.is_default_free && (
                            <TouchableOpacity
                              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}
                              onPress={startEditPocket}
                            >
                              <Pencil size={16} color="#FFF" strokeWidth={2.5} />
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}
                            onPress={() => { closePocket(); setShowAllTxs(false); }}
                          >
                            <X size={18} color="#FFF" strokeWidth={2.5} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    {/* Icon Picker in edit mode */}
                    {showIconPicker && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
                        {POCKET_ICONS.map(ic => (
                          <TouchableOpacity
                            key={ic.key}
                            onPress={() => { setEditIcon(ic.key); setShowIconPicker(false); }}
                            style={{
                              width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                              backgroundColor: editIcon === ic.key ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)',
                              borderWidth: 2, borderColor: editIcon === ic.key ? '#FFF' : 'transparent'
                            }}
                          >
                            <CategoryIcon iconName={ic.key} size={24} color={editIcon === ic.key ? pocketColor : '#FFF'} />
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}

                    {/* Stats: dos columnas claras */}
                    <View style={{ flexDirection: 'row', gap: 12, marginBottom: planAlloc > 0 ? 14 : 8 }}>
                      {/* Presupuesto — editable inline */}
                      <TouchableOpacity
                        style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: 14 }}
                        activeOpacity={isEditingBudget ? 1 : 0.7}
                        onPress={() => {
                          if (!isEditingBudget && !selectedPocket.is_default_free) {
                            setEditBudgetValue(planAlloc > 0 ? String(planAlloc) : '');
                            setIsEditingBudget(true);
                          }
                        }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            {selectedPocket.is_default_free ? 'DISPONIBLE' : 'PRESUPUESTO'}
                          </Text>
                          {!selectedPocket.is_default_free && !isEditingBudget && (
                            <Pencil size={12} color="rgba(255,255,255,0.7)" />
                          )}
                          {isEditingBudget && (
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                              <TouchableOpacity onPress={saveBudgetInline}>
                                <Check size={14} color="#FFF" strokeWidth={2.5} />
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => { setIsEditingBudget(false); setEditBudgetValue(''); }}>
                                <X size={14} color="rgba(255,255,255,0.7)" strokeWidth={2.5} />
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                        {isEditingBudget ? (
                          <TextInput
                            style={{ fontSize: 20, fontWeight: '900', color: '#FFF', fontFamily: theme.fonts.headline, padding: 0, borderBottomWidth: 1.5, borderBottomColor: 'rgba(255,255,255,0.7)', paddingBottom: 2 }}
                            value={editBudgetValue ? editBudgetValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''}
                            onChangeText={v => setEditBudgetValue(v.replace(/\./g, '').replace(/\D/g, ''))}
                            keyboardType="numeric"
                            autoFocus
                            placeholder="0"
                            placeholderTextColor="rgba(255,255,255,0.4)"
                          />
                        ) : (
                          <Text style={{ fontSize: 20, fontWeight: '900', color: '#FFF', fontFamily: theme.fonts.headline }} numberOfLines={1} adjustsFontSizeToFit>
                            {planAlloc > 0 ? formatCOP(planAlloc) : 'Sin definir'}
                          </Text>
                        )}
                      </TouchableOpacity>

                      <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: 14 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Gastado</Text>
                        <Text style={{ fontSize: 20, fontWeight: '900', color: '#FFF', fontFamily: theme.fonts.headline }} numberOfLines={1} adjustsFontSizeToFit>
                          {formatCOP(spent)}
                        </Text>
                      </View>
                    </View>

                    {/* Barra de progreso — solo si hay presupuesto definido */}
                    {planAlloc > 0 && (
                      <>
                        <AnimatedProgressBar percent={pctUsed} color="#FFF" bgColor="rgba(255,255,255,0.25)" />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)' }}>
                            {isOver ? `Excediste por ${formatCOP(Math.abs(available))}` : `Te queda ${formatCOP(available)}`}
                          </Text>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)' }}>{Math.round(pctUsed)}%</Text>
                        </View>
                      </>
                    )}

                    {/* Mover fondos CTA */}
                    {isOver && (
                      <TouchableOpacity
                        onPress={() => {
                          closePocket();
                          const bestSource = [...pockets]
                            .filter(p => p.id !== selectedPocket.id && (p.budget || 0) > 0)
                            .sort((a, b) => (b.budget || 0) - (a.budget || 0))[0];
                          onTransferPress({ fromId: bestSource?.id, toId: selectedPocket.id, amount: Math.abs(available) });
                        }}
                        style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 14 }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFF' }}>Mover fondos de otro bolsillo</Text>
                        <ArrowRight size={14} color="#FFF" />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })()}


              <ScrollView 
                style={{ flex: 1, marginHorizontal: -28 }} 
                contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 20, paddingBottom: Math.max(insets.bottom, 24) + 100 }}
                showsVerticalScrollIndicator={false}
              >
                {/* Últimos movimientos */}
                {(() => {
                  const allTxs = getPocketTransactions(selectedPocket.category);
                  const visibleTxs = showAllTxs ? allTxs : allTxs.slice(0, 5);
                  return (
                    <>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Text style={styles.sectionLabel}>Movimientos</Text>
                        {allTxs.length > 5 && (
                          <TouchableOpacity onPress={() => setShowAllTxs(v => !v)}>
                            <Text style={{ fontSize: 12, fontWeight: '800', color: theme.colors.primary }}>
                              {showAllTxs ? 'Ver menos' : `Ver todos (${allTxs.length})`}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      {visibleTxs.length > 0 ? (
                        visibleTxs.map((tx, idx) => {
                          const premiumColors = theme.colors.pocketFlatColors as string[];
                          const txColor = selectedPocket?.is_default_free ? theme.colors.primary : premiumColors[pockets.findIndex(p => p.id === selectedPocket?.id) % premiumColors.length];
                          return (
                            <TouchableOpacity key={tx.id || idx} style={styles.txRow} activeOpacity={0.7} onPress={() => setSelectedTx(tx)}>
                              <View style={[{ width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 }, { backgroundColor: tx.amount < 0 ? txColor + '20' : theme.colors.primary + '20' }]}>
                                <CategoryIcon iconName={tx.amount < 0 ? (selectedPocket.icon || 'tag') : 'trending-up'} size={18} color={tx.amount < 0 ? txColor : theme.colors.primary} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 15, fontWeight: '800', color: theme.colors.onSurface, fontFamily: theme.fonts.body }}>{tx.merchant || tx.category}</Text>
                                <Text style={[styles.txDate, { fontFamily: theme.fonts.body }]}>{new Date((tx.date_string || tx.created_at).split('T')[0] + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}</Text>
                              </View>
                              <Text style={[styles.txAmt, { color: tx.amount < 0 ? theme.colors.error : theme.colors.primary, fontFamily: theme.fonts.headline }]}>
                                {tx.amount < 0 ? '- ' : '+ '}{formatCOP(Math.abs(tx.amount))}
                              </Text>
                            </TouchableOpacity>
                          );
                        })
                      ) : (
                        <View style={{ padding: 32, alignItems: 'center', opacity: 0.35 }}>
                          <Clock size={28} color={theme.colors.onSurfaceVariant} />
                          <Text style={{ marginTop: 10, fontWeight: '700', color: theme.colors.onSurfaceVariant }}>Sin movimientos este mes</Text>
                        </View>
                      )}
                    </>
                  );
                })()}

                {!selectedPocket.is_default_free && (
                  <TouchableOpacity style={styles.deleteRow} onPress={() => deletePocket(selectedPocket.id)}>
                    <Trash2 size={16} color={theme.colors.error} />
                    <Text style={{ fontSize: 14, fontWeight: '800', color: theme.colors.error }}>Eliminar bolsillo</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </Animated.View>
          </View>
        )}

        {/* Modal Nuevo Bolsillo */}
        <Modal visible={addModalVisible} transparent animationType="fade">
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <BlurView intensity={20} style={StyleSheet.absoluteFill} tint="dark" />
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', alignItems: 'center' }}>
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                  <View style={styles.modalBox}>
                    <Text style={styles.modalTitle}>Nuevo Bolsillo</Text>

                    {/* Icon Picker for new pocket */}
                    <Text style={styles.fieldLabel}>Ícono</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
                      {POCKET_ICONS.map(ic => (
                        <TouchableOpacity
                          key={ic.key}
                          onPress={() => setNewIcon(ic.key)}
                          style={{
                            width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                            backgroundColor: newIcon === ic.key ? theme.colors.primaryContainer : theme.colors.surfaceContainerLow,
                            borderWidth: 2, borderColor: newIcon === ic.key ? theme.colors.primary : 'transparent'
                          }}
                        >
                          <CategoryIcon iconName={ic.key} size={24} color={newIcon === ic.key ? theme.colors.primary : theme.colors.onSurfaceVariant} />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    <Text style={styles.fieldLabel}>Nombre del bolsillo</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="Ej: Mercado, Salidas, Viajes"
                      value={newName}
                      onChangeText={setNewName}
                      placeholderTextColor={theme.colors.onSurfaceVariant + '60'}
                      maxLength={30}
                    />

                    <Text style={styles.fieldLabel}>Presupuesto mensual</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="$ 200.000"
                      keyboardType="numeric"
                      value={newBudget ? Number(newBudget).toLocaleString('es-CO') : ''}
                      onChangeText={v => setNewBudget(v.replace(/\D/g, ''))}
                      placeholderTextColor={theme.colors.onSurfaceVariant + '60'}
                    />

                    <View style={styles.modalBtns}>
                      <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAddModalVisible(false); }} style={styles.btnCancel}>
                        <Text style={{ color: theme.colors.onSurfaceVariant, fontWeight: '800', fontSize: 15 }}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); syncPocketToCloud(); }} style={styles.btnSave}>
                        <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 15 }}>Crear bolsillo</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableWithoutFeedback>
              </KeyboardAvoidingView>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        <TransactionDetailModal 
          visible={!!selectedTx}
          transaction={selectedTx}
          pockets={pockets}
          onClose={() => setSelectedTx(null)}
        />
    </KeyboardAvoidingView>
  );
};
