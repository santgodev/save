import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, Animated, StyleSheet, ScrollView, Dimensions, Pressable, TextInput, Modal, ActivityIndicator, Alert, Platform, TouchableWithoutFeedback, Keyboard, KeyboardAvoidingView
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import {
  ChevronLeft, ChevronRight, ChevronDown, Edit3,
  Plus, X, Trash2, AlertCircle, Clock, ArrowRight, Check
} from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { normalize } from '../theme/theme';
import { CategoryIcon } from '../components/CategoryIcon';
import { AnimatedProgressBar } from '../components/AnimatedProgressBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';
import { supabase } from '../lib/supabase';
import { useMonthlyState } from '../lib/useMonthlyState';

const { width, height } = Dimensions.get('window');

const MONTHS = [
  { label: 'Enero', value: 0 }, { label: 'Febrero', value: 1 }, { label: 'Marzo', value: 2 },
  { label: 'Abril', value: 3 }, { label: 'Mayo', value: 4 }, { label: 'Junio', value: 5 },
  { label: 'Julio', value: 6 }, { label: 'Agosto', value: 7 }, { label: 'Septiembre', value: 8 },
  { label: 'Octubre', value: 9 }, { label: 'Noviembre', value: 10 }, { label: 'Diciembre', value: 11 }
];

// Paleta pastel plana para las tarjetas (sin degradados)
const POCKET_FLAT_COLORS = [
  '#8AD6CE', // teal
  '#F0927B', // salmon
  '#D2A9D1', // lavender
  '#B9E2A2', // sage green
  '#8BD6DE', // sky blue
  '#F7C59F', // peach
  '#C5B4E3', // periwinkle
];

export const Pockets = ({ pockets, transactions, session, onRefresh, onTransferPress }: { pockets: any[], transactions: any[], session: any, onRefresh: () => void, onTransferPress: (params: { fromId?: string, amount?: number }) => void }) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const [selectedPocket, setSelectedPocket] = useState<any | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [showIncomeSummary, setShowIncomeSummary] = useState(false);

  const [isAdjustMode, setIsAdjustMode] = useState(false);
  const [tempBudgets, setTempBudgets] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBudget, setNewBudget] = useState('');

  const sheetAnim = useRef(new Animated.Value(height)).current;

  // Fuente ÚNICA de verdad — RPC get_monthly_state. Mismos números que
  // ven Dashboard y el chat-advisor. selectedMonth es 0..11 (JS Date),
  // el RPC espera 1..12.
  const currentYear = new Date().getFullYear();
  const { state: monthState, refresh: refreshMonthly } = useMonthlyState({
    year: currentYear,
    month: selectedMonth + 1,
  });

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
  const totalAssigned = Object.values(tempBudgets).reduce(
    (a, b) => a + (parseInt(b.replace(/\D/g, '')) || 0),
    0,
  );
  const diff = monthIncome - totalAssigned;

  const saveBatchBudget = async () => {
    setIsSaving(true);
    try {
      const strictClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${session.access_token}` } }
      });
      // En "Ajustar" el usuario está re-fijando el PLAN del mes para
      // cada bolsillo. Actualizamos `allocated_budget` (plan) y NO
      // tocamos `budget` (saldo disponible que ya viene decrementado
      // por register_expense). Si el usuario quiere también resetear
      // el saldo, hay que pensar otro flujo de "iniciar nuevo ciclo".
      const updates = Object.entries(tempBudgets).map(([id, rawBudget]) => {
        const allocated = parseInt(rawBudget.replace(/\D/g, '')) || 0;
        return strictClient
          .from('pockets')
          .update({ allocated_budget: allocated })
          .eq('id', id);
      });
      await Promise.all(updates);
      setIsAdjustMode(false);
      onRefresh();
      refreshMonthly();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) { console.error(e); } finally { setIsSaving(false); }
  };

  const deletePocket = async (id: string) => {
    const pocket = pockets.find(p => p.id === id);
    Alert.alert(`Eliminar "${pocket?.name}"`, '¿Seguro? Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
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
    if (!newName.trim()) return;
    const budget = parseInt(newBudget.replace(/\D/g, '')) || 0;
    const strictClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${session.access_token}` } }
    });
    // Al crear un bolsillo nuevo: budget (disponible) = allocated_budget (plan).
    // Empieza el ciclo con plan == disponible (nada gastado).
    await strictClient.from('pockets').insert({
      user_id: session.user.id,
      name: newName.trim(),
      category: 'Otros',
      budget,
      allocated_budget: budget,
      icon: 'tag'
    });
    setNewName('');
    setNewBudget('');
    setAddModalVisible(false);
    onRefresh();
    refreshMonthly();
  };

  const getPocketTransactions = (category: string) => {
    return transactions.filter(tx => {
      const txDate = new Date(tx.date_string || tx.created_at);
      return tx.category === category && txDate.getMonth() === selectedMonth;
    }).sort((a, b) => new Date(b.date_string || b.created_at).getTime() - new Date(a.date_string || a.created_at).getTime()).slice(0, 5);
  };

  const incomeTransactions = transactions.filter(tx => {
    const txDate = new Date(tx.date_string || tx.created_at);
    return tx.category === 'Ingreso' && txDate.getMonth() === selectedMonth;
  });
  // OJO: para el TOTAL de ingresos del mes usamos monthState.income_month
  // (la fuente única). incomeTransactions queda solo para listar los
  // registros individuales.
  const totalInvoicedIncome = monthIncome;

  const openPocket = (pocket: any) => {
    if (isAdjustMode) return;
    setSelectedPocket(pocket);
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 50, friction: 8 }).start();
  };

  const closePocket = () => {
    Animated.timing(sheetAnim, { toValue: height, duration: 250, useNativeDriver: true }).start(() => setSelectedPocket(null));
  };

  const formatCOP = (n: number) => `$ ${Math.round(n).toLocaleString('es-CO')}`;

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scrollPadding: { paddingHorizontal: 20 },

    // Header del mes
    monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 28 },
    monthTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -0.3, color: theme.colors.onSurface },
    navBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.glassWhite, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)', ...theme.shadows.soft },

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
    cardWrap: { width: (width - (20 * 2 + 12)) / 2, borderRadius: theme.radius.xl, overflow: 'hidden', ...theme.shadows.md },
    
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
    addCard: { width: (width - (20 * 2 + 12)) / 2, borderRadius: theme.radius.xl, minHeight: 170, justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: theme.colors.glassWhite, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.primary + '50', padding: 16, ...theme.shadows.sm },
    addTxt: { fontSize: 13, fontWeight: '800', color: theme.colors.primary },

    // BottomSheet
    backdrop: { ...StyleSheet.absoluteFillObject },
    backdropTint: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
    sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.72, borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: 28, backgroundColor: theme.colors.background, borderTopWidth: 1, borderColor: theme.colors.divider, ...theme.shadows.premium },
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
    overspendWrap: { borderRadius: 20, overflow: 'hidden', marginBottom: 20, borderWidth: 1, borderColor: theme.colors.error + '30' },
    overspendHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: theme.colors.errorContainer },
    overspendTitle: { fontSize: 15, fontWeight: '900', color: theme.colors.error, flex: 1 },
    overspendCTA: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: theme.colors.surface },

    // Movimientos
    sectionLabel: { fontSize: 10, fontWeight: '900', color: theme.colors.onSurfaceVariant, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
    txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.divider },
    txMerchant: { fontSize: 15, fontWeight: '800', color: theme.colors.onSurface },
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
  }), [theme]);

  const sorted = [...pockets].sort((a, b) => (b.budget || 0) - (a.budget || 0));

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scrollPadding, { paddingTop: Math.max(insets.top, 16) + 104, paddingBottom: Math.max(insets.bottom, 16) + normalize(76) + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Navegación de Mes */}
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedMonth(p => (p - 1 + 12) % 12); }} style={styles.navBtn}>
              <ChevronLeft size={18} color={theme.colors.onSurface} />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>{MONTHS[selectedMonth].label}</Text>
            <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedMonth(p => (p + 1) % 12); }} style={styles.navBtn}>
              <ChevronRight size={18} color={theme.colors.onSurface} />
            </TouchableOpacity>
          </View>

          {/* Tarjeta colapsable de Ingresos */}
          <TouchableOpacity
            style={styles.budgetCard}
            activeOpacity={0.85}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowIncomeSummary(v => !v);
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.budgetLabel}>Ingresos del Mes</Text>
              <Text style={styles.budgetAmount}>{formatCOP(totalInvoicedIncome)}</Text>
              {incomeTransactions.length > 0 && (
                <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant, fontWeight: '700', marginTop: 4 }}>
                  {incomeTransactions.length} {incomeTransactions.length === 1 ? 'registro' : 'registros'}
                </Text>
              )}
            </View>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
              <ChevronDown
                size={18}
                color={theme.colors.primary}
                style={{ transform: [{ rotate: showIncomeSummary ? '180deg' : '0deg' }] }}
              />
            </View>
          </TouchableOpacity>

          {/* Lista desplegable de ingresos */}
          {showIncomeSummary && (
            <View style={{ marginTop: -12, marginBottom: 20, backgroundColor: theme.colors.glassWhite, borderRadius: theme.radius.xl, borderWidth: 1, borderColor: theme.colors.divider, overflow: 'hidden', ...theme.shadows.soft }}>
              {incomeTransactions.length === 0 ? (
                <View style={{ padding: 24, alignItems: 'center', opacity: 0.4 }}>
                  <Text style={{ fontWeight: '800', color: theme.colors.onSurfaceVariant }}>Sin ingresos registrados este mes</Text>
                </View>
              ) : (
                incomeTransactions
                  .sort((a, b) => new Date(b.date_string || b.created_at).getTime() - new Date(a.date_string || a.created_at).getTime())
                  .map((tx, idx) => (
                    <View
                      key={tx.id || idx}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 14,
                        paddingHorizontal: 20,
                        borderBottomWidth: idx < incomeTransactions.length - 1 ? 1 : 0,
                        borderBottomColor: theme.colors.divider,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: theme.colors.onSurface }}>
                          {tx.merchant || 'Ingreso'}
                        </Text>
                        <Text style={{ fontSize: 12, color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                          {new Date(tx.date_string || tx.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.success }}>
                        + {formatCOP(Math.abs(tx.amount))}
                      </Text>
                    </View>
                  ))
              )}
              {incomeTransactions.length > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: theme.colors.primaryContainer + '40' }}>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: theme.colors.onSurfaceVariant }}>TOTAL</Text>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: theme.colors.primary }}>{formatCOP(totalInvoicedIncome)}</Text>
                </View>
              )}
            </View>
          )}

          {/* Banner de diferencia (solo en modo ajuste) */}
          {isAdjustMode && (
            <>
              <View style={[styles.diffBanner, diff === 0 ? styles.diffOk : styles.diffErr]}>
                {diff === 0
                  ? <Check size={18} color={theme.colors.success} />
                  : <AlertCircle size={18} color={theme.colors.error} />
                }
                <Text style={[styles.diffTxt, { color: diff === 0 ? theme.colors.success : theme.colors.error }]}>
                  {diff === 0
                    ? '¡Todo equilibrado!'
                    : diff > 0
                      ? `Faltan ${formatCOP(diff)} por asignar`
                      : `Exceso de ${formatCOP(Math.abs(diff))}`
                  }
                </Text>
              </View>
              <View style={styles.adjustActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsAdjustMode(false)}>
                  <Text style={styles.cancelTxt}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, diff !== 0 && { opacity: 0.5 }]}
                  onPress={saveBatchBudget}
                  disabled={isSaving || diff !== 0}
                >
                  {isSaving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.saveTxt}>Confirmar</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Grid de Bolsillos */}
          <View style={styles.grid}>
            {sorted.map((p, i) => {
              // Plan (allocated_budget) y disponible (budget) vienen del RPC
              // o de la prop. NO restamos gasto otra vez — el RPC ya lo hizo.
              const mp = getMonthlyPocket(p.id);
              const allocated = mp?.allocated ?? (p as any).allocated_budget ?? p.budget ?? 0;
              const available = mp?.available ?? p.budget ?? 0;
              const spent = mp?.spent_month ?? 0;
              // En modo ajuste el card muestra el plan que se está editando.
              const planEditing = isAdjustMode
                ? (parseInt((tempBudgets[p.id] || '').replace(/\D/g, '')) || 0)
                : allocated;
              const remaining = available;             // ← lo que queda hoy, directo de la DB
              const isOver = remaining < 0 || (allocated > 0 && spent > allocated);
              const pctUsed = allocated > 0 ? Math.min((spent / allocated) * 100, 100) : 0;
              const flatColor = POCKET_FLAT_COLORS[i % POCKET_FLAT_COLORS.length];

              return (
                <TouchableOpacity
                  key={p.id || i}
                  style={styles.cardWrap}
                  activeOpacity={isAdjustMode ? 1 : 0.88}
                  onPress={() => openPocket(p)}
                >
                  <View style={[styles.card, { backgroundColor: isOver ? theme.colors.error : flatColor }]}>
                    <View style={styles.cardTop}>
                      <View style={styles.iconBox}>
                        <CategoryIcon iconName={p.icon} size={20} color="#FFF" />
                      </View>
                      {/* Sobreescritura directa del monto en modo ajuste */}
                      {isAdjustMode && (
                        <TextInput
                          style={styles.adjustInput}
                          keyboardType="numeric"
                          value={tempBudgets[p.id] || ''}
                          onChangeText={v => setTempBudgets(prev => ({ ...prev, [p.id]: v.replace(/\D/g, '') }))}
                          placeholder="$ 0"
                          placeholderTextColor="rgba(255,255,255,0.5)"
                        />
                      )}
                    </View>

                    <Text style={styles.pocketName} numberOfLines={1}>{p.name}</Text>
                    {!isAdjustMode && (
                      <Text style={styles.pocketBudget}>Plan: {formatCOP(allocated)}</Text>
                    )}

                    {!isAdjustMode && (
                      <>
                        <AnimatedProgressBar percent={pctUsed} color="#FFF" bgColor="rgba(255,255,255,0.25)" />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                          <Text style={styles.remainingLbl}>{isOver ? 'EXCEDIDO' : 'TE QUEDA'}</Text>
                          <Text style={styles.remainingAmt}>{formatCOP(Math.abs(remaining))}</Text>
                        </View>
                      </>
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

        {/* BottomSheet simplificado */}
        {selectedPocket && (
          <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
            <Pressable style={styles.backdrop} onPress={closePocket}>
              <Animated.View style={[styles.backdropTint, { opacity: sheetAnim.interpolate({ inputRange: [0, height], outputRange: [1, 0] }) }]} />
            </Pressable>
            <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetAnim }] }]}>
              <View style={styles.sheetHandle} />

              {/* Header */}
              <View style={styles.sheetHeader}>
                <View style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: theme.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
                  <CategoryIcon iconName={selectedPocket.icon} size={24} color={theme.colors.primary} />
                </View>
                <Text style={styles.sheetTitle}>{selectedPocket.name}</Text>
                <TouchableOpacity style={styles.closeBtn} onPress={closePocket}>
                  <X size={18} color={theme.colors.onSurface} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>

              {/* Stats: Plan vs Disponible vs Gastado del mes — todos del RPC.
                  Antes acá había DOBLE RESTA: budget − spent (cuando budget
                  ya venía decrementado por register_expense). Eso causaba
                  que "Te Queda" mostrara un número distinto al de la grid. */}
              {(() => {
                const mp = getMonthlyPocket(selectedPocket.id);
                const planAlloc = mp?.allocated ?? (selectedPocket as any).allocated_budget ?? selectedPocket.budget ?? 0;
                const available = mp?.available ?? selectedPocket.budget ?? 0;
                const spent = mp?.spent_month ?? 0;
                const isOver = available < 0 || (planAlloc > 0 && spent > planAlloc);
                const overshoot = planAlloc > 0 && spent > planAlloc ? spent - planAlloc : 0;
                return (
                  <>
                    <View style={styles.statsRow}>
                      <View style={[styles.statCard, { backgroundColor: theme.colors.primaryContainer }]}>
                        <Text style={styles.statLabel}>Disponible hoy</Text>
                        <Text style={[styles.statVal, { color: theme.colors.primary }]}>
                          {formatCOP(Math.max(0, available))}
                        </Text>
                      </View>
                      <View style={styles.statCard}>
                        <Text style={styles.statLabel}>Plan del mes</Text>
                        <Text style={styles.statVal}>{formatCOP(planAlloc)}</Text>
                      </View>
                      <View style={styles.statCard}>
                        <Text style={styles.statLabel}>Gastado del mes</Text>
                        <Text style={[styles.statVal, { color: isOver ? theme.colors.error : theme.colors.onSurface }]}>
                          {formatCOP(spent)}
                        </Text>
                      </View>
                    </View>

                    {isOver && (
                      <View style={styles.overspendWrap}>
                        <View style={styles.overspendHeader}>
                          <AlertCircle size={20} color={theme.colors.error} />
                          <Text style={styles.overspendTitle}>
                            {overshoot > 0
                              ? `Excediste el plan por ${formatCOP(overshoot)}`
                              : `Saldo en negativo: ${formatCOP(Math.abs(available))}`}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.overspendCTA}
                          onPress={() => { closePocket(); onTransferPress({ fromId: selectedPocket.id, amount: overshoot || Math.abs(available) }); }}
                        >
                          <Text style={{ fontSize: 14, fontWeight: '800', color: theme.colors.primary }}>Mover fondos de otro bolsillo</Text>
                          <ArrowRight size={16} color={theme.colors.primary} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                );
              })()}

              {/* Últimos movimientos */}
              <Text style={styles.sectionLabel}>Últimos movimientos</Text>
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                {getPocketTransactions(selectedPocket.category).length > 0 ? (
                  getPocketTransactions(selectedPocket.category).map((tx, idx) => (
                    <View key={tx.id || idx} style={styles.txRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.txMerchant}>{tx.merchant}</Text>
                        <Text style={styles.txDate}>{new Date(tx.date_string || tx.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}</Text>
                      </View>
                      <Text style={[styles.txAmt, { color: tx.amount < 0 ? theme.colors.onSurface : theme.colors.success }]}>
                        {tx.amount < 0 ? '- ' : '+ '}{formatCOP(Math.abs(tx.amount))}
                      </Text>
                    </View>
                  ))
                ) : (
                  <View style={{ padding: 32, alignItems: 'center', opacity: 0.35 }}>
                    <Clock size={28} color={theme.colors.onSurfaceVariant} />
                    <Text style={{ marginTop: 10, fontWeight: '700', color: theme.colors.onSurfaceVariant }}>Sin movimientos este mes</Text>
                  </View>
                )}

                <TouchableOpacity style={styles.deleteRow} onPress={() => deletePocket(selectedPocket.id)}>
                  <Trash2 size={16} color={theme.colors.error} />
                  <Text style={{ fontSize: 14, fontWeight: '800', color: theme.colors.error }}>Eliminar bolsillo</Text>
                </TouchableOpacity>
              </ScrollView>
            </Animated.View>
          </View>
        )}

        {/* Modal Nuevo Bolsillo */}
        <Modal visible={addModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <BlurView intensity={20} style={StyleSheet.absoluteFill} tint="dark" />
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Nuevo Bolsillo</Text>

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
                value={newBudget}
                onChangeText={v => setNewBudget(v.replace(/\D/g, ''))}
                placeholderTextColor={theme.colors.onSurfaceVariant + '60'}
              />

              <View style={styles.modalBtns}>
                <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAddModalVisible(false); }} style={styles.btnCancel}>
                  <Text style={{ color: theme.colors.onSurfaceVariant, fontWeight: '800', fontSize: 15 }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); syncPocketToCloud(); }} style={styles.btnSave}>
                  <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 15 }}>Crear Bolsillo</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
};
