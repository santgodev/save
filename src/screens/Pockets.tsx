import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, Animated, StyleSheet, ScrollView, Dimensions, useWindowDimensions, Pressable, TextInput, Modal, ActivityIndicator, Platform, TouchableWithoutFeedback, Keyboard, KeyboardAvoidingView, LayoutAnimation
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import Slider from '@react-native-community/slider';
import {
  ChevronDown, Edit3,
  Plus, X, Trash2, AlertCircle, Clock, ArrowRight, Check, Pencil, Info, Sparkles
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
import { useCurrency } from '../lib/CurrencyContext';
import { notify } from '../lib/notify';
import { CycleNav } from '../components/CycleNav';
import { TransactionDetailModal } from '../components/TransactionDetailModal';
import { TourStep } from '../components/tour/TourStep';
import { useTour, TourStepType } from '../components/tour/TourContext';
import type { Session } from '@supabase/supabase-js';

export const Pockets = ({ pockets, transactions, session, onRefresh, onTransferPress }: { pockets: any[], transactions: any[], session: Session, onRefresh: () => void, onTransferPress: (params: { fromId?: string, toId?: string, amount?: number }) => void }) => {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { formatMoney: formatMoneyCurrency, config: currencyConfig } = useCurrency();

  const [selectedPocket, setSelectedPocket] = useState<any | null>(null);
  const [showIncomeSummary, setShowIncomeSummary] = useState(false);

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
  const [editIcon, setEditIcon] = useState('tag');
  const [editBudgetValue, setEditBudgetValue] = useState('');
  const [isSavingPocket, setIsSavingPocket] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showAllTxs, setShowAllTxs] = useState(false);
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

  const { startTour, stopTour, isActive: isTourActive } = useTour();

  const TOUR_STEPS: TourStepType[] = [
    {
      name: 'pockets_free',
      title: 'Tu Plata Libre',
      description: 'Este bolsillo es tu comodín. Todo el dinero que no asignes a los demás sobres, aterrizará aquí automáticamente como tu dinero libre para gastar.',
      iconName: 'Unlock',
      order: 1
    }
  ];

  const sheetAnim = useRef(new Animated.Value(height)).current;

  // 1. Fuente ÚNICA de verdad — RPC get_cycle_state (vía useCycleState)
  //    Contiene bolsillos (con .allocated, .spent_month, .available) y totales del ciclo.
  const { cycles, activeCycle } = useUserCycles();
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(activeCycle?.id || null);

  useEffect(() => {
    if (activeCycle && !selectedCycleId) {
      setSelectedCycleId(activeCycle.id);
    }
  }, [activeCycle]);

  const { state: monthState, refresh: refreshMonthly, loading: isMonthlyLoading } = useCycleState(selectedCycleId || undefined);

  // Reload cycle state (balances) automatically when transactions change
  useEffect(() => {
    if (transactions) refreshMonthly(true);
  }, [transactions, refreshMonthly]);

  // Ref para evitar re-disparar el tour demo en la misma sesión (el ID se guarda en AsyncStorage)

  // Check and start tour when pockets load
  useEffect(() => {
    if (!isMonthlyLoading && monthState && pockets.length > 0) {
      const demoExpenses = transactions.filter(t => (t as any).metadata?.is_demo);
      const isDemo = demoExpenses.length > 0;

      // --- PRIORIDAD 1: Flujo demo del Scanner ---
      if (isDemo) {
        const firstExp = demoExpenses[0];
        AsyncStorage.getItem('@save_demo_tour_triggered_id').then(triggeredId => {
          if (triggeredId === firstExp.id) return; // Ya se disparó esta sesión
          AsyncStorage.setItem('@save_demo_tour_triggered_id', firstExp.id);

          const targetPocket = pockets.find(p => p.category === firstExp.category) || pockets.find(p => p.is_default_free);
          if (targetPocket) {
            setTimeout(() => {
              startTour([{
                name: `pocket_${targetPocket.id}`,
                title: '¡Tu primer gasto está aquí!',
                description: 'Toca este bolsillo para ver el detalle y cuánto presupuesto te queda.',
                iconName: 'Sparkles',
                order: 1
              }], undefined, { step: 3, total: 4 });
              AsyncStorage.setItem('@save_tour_pockets_seen', 'true');
            }, 600);
          }
        });
        return;
      }

      // --- PRIORIDAD 2: Tour mágico de usuario nuevo (step 3/4) ---
      AsyncStorage.getItem('@save_magic_tour_pockets_pending').then(async (pending) => {
        if (pending === 'true') {
          await AsyncStorage.removeItem('@save_magic_tour_pockets_pending');
          await AsyncStorage.setItem('@save_tour_pockets_seen', 'true');

          // Step 3/4 → mostrar bolsillo Libre
          setTimeout(() => {
            startTour([{
              name: 'pockets_free',
              title: 'El Bolsillo Libre',
              description: 'Cuando registres un ingreso, el dinero que no asignes a otros bolsillos llega aquí automáticamente. Es tu plata flexible para gastos del día a día.',
              iconName: 'Unlock',
              order: 1
            }], () => {
              // Step 4/4 → mostrar el primer bolsillo personalizado
              const firstCustomPocket = pockets.find(p => !p.is_default_free);
              if (!firstCustomPocket) return;
              setTimeout(() => {
                startTour([{
                  name: `pocket_${firstCustomPocket.id}`,
                  title: 'Abre un Bolsillo',
                  description: 'Toca cualquier bolsillo para ver su historial, cuánto gastaste y cuánto te queda. ¡Así de simple es controlar tu plata con Save!',
                  iconName: 'PieChart',
                  order: 1
                }], undefined, { step: 4, total: 4 });
              }, 300);
            }, { step: 3, total: 4 });
          }, 600);
          return;
        }

        // --- PRIORIDAD 3: Tour básico de primera visita ---
        const seen = await AsyncStorage.getItem('@save_tour_pockets_seen');
        if (!seen) {
          setTimeout(() => {
            startTour(TOUR_STEPS);
            AsyncStorage.setItem('@save_tour_pockets_seen', 'true');
          }, 600);
        }
      });
    }
  }, [isMonthlyLoading, monthState, pockets, transactions, startTour]);

  const pocketTourTriggeredRef = useRef<string | null>(null);
  const txTourTriggeredRef = useRef<string | null>(null);

  // Tour dentro del Modal de Bolsillo (solo para el flujo demo)
  useEffect(() => {
    let tm: any;
    if (selectedPocket && !isMonthlyLoading && monthState) {
      const demoExpenses = transactions.filter(t => (t as any).metadata?.is_demo);
      if (demoExpenses.length > 0) {
        const firstExp = demoExpenses[0];
        if ((selectedPocket.category === firstExp.category || selectedPocket.is_default_free) && pocketTourTriggeredRef.current !== firstExp.id) {
          pocketTourTriggeredRef.current = firstExp.id;
          // Esperar a que el BottomSheet termine de animarse antes de medir posiciones
          tm = setTimeout(() => {
            if (!selectedPocket) return;
            startTour([{
              name: `demo_tx_${firstExp.id}`,
              title: 'Elimina tu gasto de prueba',
              description: 'Toca este movimiento para abrir el detalle y limpiar tu cuenta.',
              iconName: 'Trash2',
              order: 1,
              allowTouches: true,
              hideNextButton: true
            }], undefined, { step: 4, total: 4 });
          }, 1000);
        }
      }
    }
    return () => {
      if (tm) clearTimeout(tm);
    };
  }, [selectedPocket, isMonthlyLoading, monthState, transactions, startTour]);

  // We removed the Tour inside Transaction Modal because TourOverlay cannot overlay native Modals properly.
  // We will handle the demo UI directly inside TransactionDetailModal.

  // Lookup helper: bolsillo del mes con sus números (allocated, available,
  // spent_month, pct_used). Si todavía no cargó, fallback a la prop.
  const getMonthlyPocket = (id: string) =>
    (monthState?.pockets || []).find(p => p.id === id);

  // "Gastado en X categoría este mes" — lo da el RPC, no el cliente.
  const getPocketSpending = (category: string) => {
    const mp = (monthState?.pockets || []).find(p => p.category === category);
    return mp?.spent_month ?? 0;
  };



  const monthIncome = monthState?.income_month ?? 0;

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
    
    const cleanName = newName.trim();
    const capitalizedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    const allocated = parseInt(newBudget.replace(/\D/g, '')) || 0;
    
    // FIX BUG 8: El nuevo bolsillo parte con budget = 0 (saldo real vacío).
    // El plan (allocated_budget) sí refleja lo que el usuario asignó.
    // El saldo real (budget) crece solo cuando le llegan ingresos vía
    // register_income. Antes se inicializaba budget = allocated, lo que
    // inflaba el disponible sin que hubiera plata real.
    await supabase.from('pockets').insert({
      user_id: session.user.id,
      name: capitalizedName,
      category: capitalizedName,
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
    if (!editName.trim() || !editIcon) return;
    try {
      setIsSavingPocket(true);
      const cleanName = editName.trim();
      const capitalizedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
      
      const updates: any = { name: capitalizedName, category: capitalizedName, icon: editIcon };
      if (!selectedPocket.is_default_free) {
        updates.allocated_budget = parseInt(editBudgetValue.replace(/\D/g, '')) || 0;
      }
      
      await supabase.from('pockets').update(updates).eq('id', selectedPocket.id);
      
      // Update local state immediately so UI reflects it before refetch
      setSelectedPocket((prev: any) => prev ? { ...prev, ...updates } : null);
      
      onRefresh();
      refreshMonthly();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaveSuccess(true);
      
      setTimeout(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsEditingPocket(false);
        setIsSavingPocket(false);
        setSaveSuccess(false);
      }, 700);
      
    } catch (e) {
      console.error(e);
      setIsSavingPocket(false);
    }
  };

  const startEditPocket = () => {
    if (!selectedPocket) return;
    setEditName(selectedPocket.name);
    setEditIcon(selectedPocket.icon || 'tag');
    const mp = getMonthlyPocket(selectedPocket.id);
    const alloc = mp?.allocated ?? selectedPocket.allocated_budget ?? selectedPocket.budget ?? 0;
    setEditBudgetValue(alloc > 0 ? String(alloc) : '');
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsEditingPocket(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const getPocketTransactions = (category: string, pocketId: string, limit?: number) => {
    const all = transactions.filter(tx => {
      if (tx.cycle_id !== selectedCycleId) return false;
      if (tx.category === category) return true;
      if (tx.category === 'Ingreso' && tx.metadata?.distribution?.[pocketId] > 0) return true;
      if (tx.category === 'Traslado' && (tx.metadata?.from_pocket === pocketId || tx.metadata?.to_pocket === pocketId)) return true;
      return false;
    }).map(tx => {
      if (tx.category === 'Ingreso') {
        return { ...tx, amount: tx.metadata.distribution[pocketId], merchant: 'Ingreso: ' + (tx.merchant || 'General') };
      }
      if (tx.category === 'Traslado') {
        const isOut = tx.metadata?.from_pocket === pocketId;
        return { ...tx, amount: isOut ? -Math.abs(tx.amount) : Math.abs(tx.amount) };
      }
      return tx;
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
  const freeAmountAvailable = freePocketData?.available ?? 0;

  const openPocket = (pocket: any) => {
    setSelectedPocket(pocket);
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 50, friction: 8 }).start();
  };

  useEffect(() => {
    if (selectedPocket) {
      Animated.timing(sheetAnim, { toValue: 0, duration: 0, useNativeDriver: true }).start();
    }
  }, [selectedPocket, isTourActive]);

  const closePocket = (force = false) => {
    if (isTourActive && !force) return;
    stopTour();
    Animated.timing(sheetAnim, { toValue: height, duration: 250, useNativeDriver: true }).start(() => setSelectedPocket(null));
  };

  // formatMoney del CurrencyContext para que respete la moneda del usuario.
  // El alias formatCOP se mantiene igual para no tocar 12 callsites; renombrar cuando se haga un refactor mayor.
  const formatCOP = formatMoneyCurrency;

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scrollPadding: { paddingHorizontal: 14 },

    // Header del mes


    // Tarjeta de presupuesto
    budgetCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.glassWhite, paddingHorizontal: 20, paddingVertical: 22, borderRadius: theme.radius.xl, marginBottom: 20, borderWidth: 1.5, borderColor: theme.colors.divider, ...theme.shadows.md },
    budgetLabel: { fontSize: 10, fontWeight: '900', color: theme.colors.onSurfaceVariant, marginBottom: 6, letterSpacing: 1.2, textTransform: 'uppercase' },
    budgetAmount: { fontSize: 28, fontWeight: '900', letterSpacing: -1, color: theme.colors.onSurface },
    budgetInput: { fontSize: 28, fontWeight: '900', padding: 0, margin: 0, color: theme.colors.primary, minWidth: 100 },
    editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: theme.colors.primaryContainer, borderWidth: 1, borderColor: theme.colors.divider },
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
    card: { flex: 1, padding: 18, borderRadius: theme.radius.xl, borderWidth: 1, borderColor: theme.colors.divider },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    iconBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.3)' },
    
    pocketName: { fontSize: 16, fontWeight: '900', color: '#FFF', marginBottom: 2 },
    pocketBudget: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.75)', marginBottom: 14 },

    remainingLbl: { fontSize: 10, fontWeight: '900', color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5, marginBottom: 4 },
    remainingAmt: { fontSize: 16, fontWeight: '900', color: '#FFF' },

    // Modo edición
    adjustInput: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, fontSize: 15, fontWeight: '900', color: '#FFF', marginBottom: 10, textAlign: 'center' },

    // Tarjeta de agregar
    addCard: { width: (width - (14 * 2 + 12)) / 2, borderRadius: theme.radius.xl, minHeight: 150, justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: theme.colors.glassWhite, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.primary + '50', padding: 16, ...theme.shadows.sm },
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
  const getPocketAlloc = (p: any) => {
    if (p.is_default_free) {
      // Libre receives whatever is left from the monthIncome after other pockets are funded
      const othersAlloc = pockets.filter(x => !x.is_default_free).reduce((acc, x) => {
         const mp = getMonthlyPocket(x.id);
         const val = mp?.allocated ?? x.allocated_budget ?? x.budget ?? 0;
         return acc + val;
      }, 0);
      return Math.max(0, monthIncome - othersAlloc);
    }
    const mp = getMonthlyPocket(p.id);
    return mp?.allocated ?? p.allocated_budget ?? p.budget ?? 0;
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
    { key: 'Baby', label: 'Bebé/Hijos' },
    { key: 'Dog', label: 'Mascotas' },
    { key: 'CreditCard', label: 'Tarjetas' },
    { key: 'BusFront', label: 'Transporte' },
    { key: 'PartyPopper', label: 'Fiesta/Rumba' },
    { key: 'Dumbbell', label: 'Deporte' },
    { key: 'Scissors', label: 'Peluquería' },
    { key: 'Wrench', label: 'Arreglos' },
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
                    Mis ingresos de {monthState?.cycle_name || 'este mes'}
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
                  <TourStep name="pockets_free">
                    <View style={{ flex: 1, alignItems: 'center', backgroundColor: theme.colors.primary + '12', borderRadius: 14, paddingVertical: 12 }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: theme.colors.primary, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>Libre</Text>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.primary, fontFamily: theme.fonts.headline }} numberOfLines={1} adjustsFontSizeToFit>
                        {formatCOP(pockets.find(p => p.is_default_free) ? getPocketAlloc(pockets.find(p => p.is_default_free)!) : 0)}
                      </Text>
                    </View>
                  </TourStep>
                </View>
              </View>
            ) : (
              <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.xl, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: theme.colors.outlineVariant + '60', alignItems: 'center', opacity: 0.6 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.onSurfaceVariant }}>Sin ingresos registrados en {monthState?.cycle_name || 'este mes'}</Text>
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
                  
                  const premiumColors = theme.colors.chartColors as string[];
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
                  const premiumColors = theme.colors.chartColors as string[];
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
            <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.onSurface }}>Tus Bolsillos</Text>
          </View>
          <View style={styles.grid}>
            {sorted.map((p, i) => {
              // Plan (allocated_budget) y disponible (budget) vienen del RPC
              // o de la prop. NO restamos gasto otra vez — el RPC ya lo hizo.
              const mp = getMonthlyPocket(p.id);
              const allocated = getPocketAlloc(p);
              const spent = mp?.spent_month ?? 0;
              const available = p.is_default_free ? (allocated - spent) : (mp?.available ?? p.budget ?? 0);
              const remaining = available;             // ← lo que queda hoy, directo de la DB
              const isOver = remaining < 0 || (allocated > 0 && spent > allocated);
              const pctUsed = allocated > 0 ? Math.min((spent / allocated) * 100, 100) : 0;
              const premiumColors = theme.colors.chartColors as string[];
              const flatColor = p.is_default_free ? theme.colors.primary : premiumColors[i % premiumColors.length];
              const cardBg = isOver ? theme.colors.error : flatColor + 'E6';

              return (
                p.is_default_free ? (
                  <TourStep name={`pocket_${p.id}`} key={p.id || i}>
                    <View style={styles.cardWrap}>
                      <TourStep name="pockets_free">
                        <TouchableOpacity
                          style={{ flex: 1 }}
                          activeOpacity={0.88}
                          onPress={() => openPocket(p)}
                        >
                          <View style={[styles.card, { backgroundColor: cardBg, padding: 18, paddingTop: 20, paddingBottom: 22, minHeight: 150 }]}>
                            <View style={{ marginBottom: 20 }}>
                              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                                <CategoryIcon iconName={p.icon} size={16} color="#FFF" />
                              </View>
                            </View>
                            <Text style={{ fontSize: 18, fontWeight: '900', color: '#FFF', marginBottom: 4 }} numberOfLines={1}>{p.name}</Text>
                            <Text style={{ fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.9)', marginBottom: 20 }}>
                              Plan: {allocated > 0 ? formatCOP(allocated) : '$0'}
                            </Text>
                            <View style={{ marginTop: 'auto' }}>
                              <AnimatedProgressBar percent={pctUsed} color="#FFF" bgColor="rgba(255,255,255,0.25)" height={8} />
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 }}>
                                <Text style={{ fontSize: 9, fontWeight: '900', color: 'rgba(255,255,255,0.8)', letterSpacing: 0.5, marginBottom: 2 }}>{remaining < 0 ? 'EXCESO' : 'TE QUEDA'}</Text>
                                <Text style={{ fontSize: 15, fontWeight: '900', color: '#FFF' }} numberOfLines={1} adjustsFontSizeToFit>{formatCOP(Math.abs(remaining))}</Text>
                              </View>
                            </View>
                          </View>
                        </TouchableOpacity>
                      </TourStep>
                    </View>
                  </TourStep>
                ) : (
                  <TourStep name={`pocket_${p.id}`} key={p.id || i}>
                    <TouchableOpacity
                      style={styles.cardWrap}
                      activeOpacity={0.88}
                      onPress={() => openPocket(p)}
                    >
                      <View style={[styles.card, { backgroundColor: cardBg, padding: 18, paddingTop: 20, paddingBottom: 22, minHeight: 150 }]}>
                        <View style={{ marginBottom: 20 }}>
                          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                            <CategoryIcon iconName={p.icon} size={16} color="#FFF" />
                          </View>
                        </View>
                        <Text style={{ fontSize: 18, fontWeight: '900', color: '#FFF', marginBottom: 4 }} numberOfLines={1}>{p.name}</Text>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.9)', marginBottom: 20 }}>
                          Plan: {allocated > 0 ? formatCOP(allocated) : '$0'}
                        </Text>
                        <View style={{ marginTop: 'auto' }}>
                          <AnimatedProgressBar percent={pctUsed} color="#FFF" bgColor="rgba(255,255,255,0.25)" height={8} />
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 }}>
                            <Text style={{ fontSize: 9, fontWeight: '900', color: 'rgba(255,255,255,0.8)', letterSpacing: 0.5, marginBottom: 2 }}>{remaining < 0 ? 'EXCESO' : 'TE QUEDA'}</Text>
                            <Text style={{ fontSize: 15, fontWeight: '900', color: '#FFF' }} numberOfLines={1} adjustsFontSizeToFit>{formatCOP(Math.abs(remaining))}</Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  </TourStep>
                )
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

        {selectedPocket && (
          <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
            <Pressable style={styles.backdrop} onPress={isTourActive ? undefined : () => closePocket()} />
            <Animated.View style={[styles.backdropTint, { opacity: sheetAnim.interpolate({ inputRange: [0, height], outputRange: [1, 0] }) }]} pointerEvents="none" />
            <Animated.View style={[styles.sheet, { paddingHorizontal: 0, paddingTop: 0, transform: [{ translateY: sheetAnim }] }]}>
              {/* Colored top strip matching the pocket's card color */}
              {(() => {
                const i = sorted.findIndex(p => p.id === selectedPocket.id);
                const premiumColors = theme.colors.chartColors as string[];
                const flatColor = selectedPocket.is_default_free ? theme.colors.primary : premiumColors[i % premiumColors.length];
                const mp = getMonthlyPocket(selectedPocket.id);
                const planAlloc = getPocketAlloc(selectedPocket);
                const spent = mp?.spent_month ?? 0;
                const available = selectedPocket.is_default_free ? (planAlloc - spent) : (mp?.available ?? selectedPocket.budget ?? 0);
                const isOver = available < 0;
                const pctUsed = planAlloc > 0 ? Math.min((spent / planAlloc) * 100, 100) : 0;
                const pocketColor = isOver ? theme.colors.error : flatColor;

                return (
                  <>
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 200, backgroundColor: pocketColor, borderTopLeftRadius: 36, borderTopRightRadius: 36 }} />
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                      <ScrollView 
                        style={{ flex: 1 }} 
                        contentContainerStyle={{ flexGrow: 1, paddingBottom: Math.max(insets.bottom, 24) + 100 }}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                      >
                        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                          <View style={{ backgroundColor: pocketColor, padding: 20, paddingTop: 14, paddingBottom: 18, borderTopLeftRadius: 36, borderTopRightRadius: 36, paddingHorizontal: 28 }}>
                    {/* Handle */}
                    <View style={{ width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 2, alignSelf: 'center', marginBottom: 14 }} />

                    {/* Header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <View style={{ width: 48, height: 48, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                        <CategoryIcon iconName={isEditingPocket ? editIcon : selectedPocket.icon} size={26} color="#FFF" />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 22, fontWeight: '900', color: '#FFF', fontFamily: theme.fonts.headline }}>
                          {isEditingPocket ? 'Editar Bolsillo' : selectedPocket.name}
                        </Text>
                        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginTop: 2 }}>
                          {selectedPocket.is_default_free ? 'Disponible sin asignar: ' : 'Plan mensual: '}{formatCOP(planAlloc)}
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}
                          onPress={() => { closePocket(true); setShowAllTxs(false); setIsEditingPocket(false); }}
                        >
                          <X size={18} color="#FFF" strokeWidth={2.5} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {isEditingPocket ? (
                      <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 16, borderRadius: 20, marginTop: 4 }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', marginBottom: 8 }}>Ícono</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 10 }}>
                          {POCKET_ICONS.map(ic => (
                            <TouchableOpacity
                              key={ic.key}
                              onPress={() => setEditIcon(ic.key)}
                              style={{
                                width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                                backgroundColor: editIcon === ic.key ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)'
                              }}
                            >
                              <CategoryIcon iconName={ic.key} size={22} color={editIcon === ic.key ? pocketColor : '#FFF'} />
                            </TouchableOpacity>
                          ))}
                        </ScrollView>

                        <Text style={{ fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', marginBottom: 8 }}>Nombre</Text>
                        <TextInput
                          style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, fontWeight: '800', color: '#FFF', marginBottom: 16 }}
                          value={editName}
                          onChangeText={setEditName}
                          maxLength={30}
                          placeholderTextColor="rgba(255,255,255,0.5)"
                        />

                        {!selectedPocket.is_default_free && (
                          <>
                            <Text style={{ fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', marginBottom: 8 }}>Presupuesto (Plan)</Text>
                            <TextInput
                              style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 20, fontWeight: '900', color: '#FFF', fontFamily: theme.fonts.headline, marginBottom: 8 }}
                              value={editBudgetValue ? editBudgetValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''}
                              onChangeText={v => setEditBudgetValue(v.replace(/\./g, '').replace(/\D/g, ''))}
                              keyboardType="numeric"
                              placeholder="0"
                              placeholderTextColor="rgba(255,255,255,0.5)"
                            />
                          </>
                        )}
                        
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                          <TouchableOpacity 
                            style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center' }} 
                            onPress={() => {
                              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                              setIsEditingPocket(false);
                            }}
                            disabled={isSavingPocket}
                          >
                            <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFF' }}>Cancelar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#FFF', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }} 
                            onPress={saveEditPocket}
                            disabled={isSavingPocket}
                          >
                            {isSavingPocket && !saveSuccess ? (
                              <ActivityIndicator size="small" color={pocketColor} />
                            ) : saveSuccess ? (
                              <>
                                <Check size={16} color={pocketColor} strokeWidth={3} />
                                <Text style={{ fontSize: 14, fontWeight: '900', color: pocketColor }}>¡Guardado!</Text>
                              </>
                            ) : (
                              <Text style={{ fontSize: 14, fontWeight: '900', color: pocketColor }}>Guardar Cambios</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <>
                        <View style={{ flexDirection: 'row', gap: 12, marginBottom: planAlloc > 0 ? 14 : 8 }}>
                          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: 14 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                              {selectedPocket.is_default_free ? 'DISPONIBLE' : 'PRESUPUESTO'}
                            </Text>
                            <Text style={{ fontSize: 20, fontWeight: '900', color: '#FFF', fontFamily: theme.fonts.headline }} numberOfLines={1} adjustsFontSizeToFit>
                              {planAlloc > 0 ? formatCOP(planAlloc) : 'Sin definir'}
                            </Text>
                          </View>
                          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: 14 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Gastado</Text>
                            <Text style={{ fontSize: 20, fontWeight: '900', color: '#FFF', fontFamily: theme.fonts.headline }} numberOfLines={1} adjustsFontSizeToFit>
                              {formatCOP(spent)}
                            </Text>
                          </View>
                        </View>

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
                        
                        {isOver && (
                          <TouchableOpacity
                            onPress={() => {
                              closePocket(true);
                              // FIX: elegir el bolsillo de origen por el disponible REAL del
                              // ciclo (RPC get_cycle_state via getMonthlyPocket), no por
                              // pockets.budget -- esa columna no refleja el disponible actual.
                              const bestSource = [...pockets]
                                .filter(p => p.id !== selectedPocket.id)
                                .map(p => ({ pocket: p, avail: getMonthlyPocket(p.id)?.available ?? 0 }))
                                .filter(x => x.avail > 0)
                                .sort((a, b) => b.avail - a.avail)[0]?.pocket;
                              setTimeout(() => onTransferPress({ fromId: bestSource?.id, toId: selectedPocket.id, amount: Math.abs(available) }), 250);
                            }}
                            style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 14 }}
                          >
                            <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFF' }}>Mover fondos de otro bolsillo</Text>
                            <ArrowRight size={14} color="#FFF" />
                          </TouchableOpacity>
                        )}

                        <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                          <TouchableOpacity
                            style={{ flex: 1, paddingVertical: 14, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                            onPress={() => {
                              closePocket(true);
                              setTimeout(() => onTransferPress({ fromId: selectedPocket.id }), 250);
                            }}
                          >
                            <ArrowRight size={16} color="#FFF" />
                            <Text style={{ fontSize: 15, fontWeight: '900', color: '#FFF' }}>Transferir</Text>
                          </TouchableOpacity>

                          {!selectedPocket.is_default_free && (
                            <TouchableOpacity
                              style={{ flex: 1, paddingVertical: 14, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                              onPress={startEditPocket}
                            >
                              <Pencil size={16} color="#FFF" />
                              <Text style={{ fontSize: 15, fontWeight: '900', color: '#FFF' }}>Editar</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </>
                    )}
                  </View>
                </TouchableWithoutFeedback>

                <View style={{ backgroundColor: theme.colors.background, paddingHorizontal: 28, paddingTop: 20, flex: 1 }}>
                  {/* Últimos movimientos */}
                  {(() => {
                    const allTxs = getPocketTransactions(selectedPocket.category, selectedPocket.id);
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
                          const premiumColors = theme.colors.chartColors as string[];
                          const txColor = selectedPocket?.is_default_free ? theme.colors.primary : premiumColors[pockets.findIndex(p => p.id === selectedPocket?.id) % premiumColors.length];
                          
                          const txRow = (
                            <TouchableOpacity key={tx.id || idx} style={styles.txRow} activeOpacity={0.7} onPress={() => {
                              setSelectedTx(tx);
                              // Si tocan el gasto de prueba, cerramos el TourOverlay para que no haya 2 Modals abiertos en Android
                              if (tx.metadata?.is_demo) {
                                stopTour();
                              }
                            }}>
                              <View style={[{ width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 }, { backgroundColor: tx.amount < 0 ? txColor + '20' : theme.colors.primary + '20' }]}>
                                <CategoryIcon iconName={tx.amount < 0 ? (selectedPocket.icon || 'tag') : 'trending-up'} size={18} color={tx.amount < 0 ? txColor : theme.colors.primary} />
                              </View>
                              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 15, fontWeight: '800', color: theme.colors.onSurface, fontFamily: theme.fonts.body }}>{tx.merchant || tx.category}</Text>
                                  <Text style={[styles.txDate, { fontFamily: theme.fonts.body }]}>{new Date((tx.date_string || tx.created_at).split('T')[0] + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}</Text>
                                </View>
                                {tx.metadata?.is_demo && (
                                  <View style={{ backgroundColor: theme.colors.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginRight: 8 }}>
                                    <Text style={{ fontSize: 9, fontWeight: '900', color: theme.colors.onPrimary, letterSpacing: 0.5, textTransform: 'uppercase' }}>Prueba</Text>
                                  </View>
                                )}
                              </View>
                              <Text style={[styles.txAmt, { color: tx.amount < 0 ? theme.colors.error : theme.colors.primary, fontFamily: theme.fonts.headline }]}>
                                {tx.amount < 0 ? '- ' : '+ '}{formatCOP(Math.abs(tx.amount))}
                              </Text>
                            </TouchableOpacity>
                          );

                          return tx.metadata?.is_demo ? (
                            <TourStep key={tx.id || idx} name={`demo_tx_${tx.id}`}>
                              {txRow}
                            </TourStep>
                          ) : txRow;
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
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
                  </>
                );
              })()}
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
                      placeholder="Ej. 500.000"
                      keyboardType="numeric"
                      value={newBudget ? Number(newBudget).toLocaleString(currencyConfig.locale) : ''}
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
          onDelete={async (tx) => {
            setSelectedTx(null);
            try {
              await supabase.rpc('delete_transaction_with_reversal', { 
                p_tx_id: tx.id, 
                p_user_id: session.user.id 
              });
              onRefresh();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (e) {
              notify.error('Error al eliminar');
            }
          }}
        />
      </View>
    </KeyboardAvoidingView>
  );
};
