import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, Animated, StyleSheet, ScrollView, Dimensions, useWindowDimensions, Pressable, TextInput, Modal, ActivityIndicator, Platform, TouchableWithoutFeedback, Keyboard, KeyboardAvoidingView, LayoutAnimation, DeviceEventEmitter, RefreshControl
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import Slider from '@react-native-community/slider';
import {
  ChevronDown, Edit3,
  Plus, X, Trash2, AlertCircle, Clock, ArrowRight, Check, Pencil, Info, Sparkles, CheckCircle2,
  DollarSign, Percent
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme/ThemeContext';
import { normalize, getDeterministicColor } from '../theme/theme';
import { CategoryIcon } from '../components/CategoryIcon';
import { AnimatedProgressBar } from '../components/AnimatedProgressBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useCycleState, useUserCycles } from '../lib/useCycleState';
import { formatMoney } from '../lib/format';
import { useCurrency } from '../lib/CurrencyContext';
import { notify } from '../lib/notify';
import { CycleNav } from '../components/CycleNav';
import { TransactionDetailModal } from '../components/TransactionDetailModal';
import { CycleUndoModal } from '../components/CycleUndoModal';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { MiniAnimatedSaveLogo } from '../components/TopBar';
import { TourStep } from '../components/tour/TourStep';
import { useTour } from '../components/tour/TourContext';
import type { Session } from '@supabase/supabase-js';

export const Pockets = ({ pockets, transactions, session, onRefresh, isRefreshing: isRefreshingProp = false, onTransferPress }: { pockets: any[], transactions: any[], session: Session, onRefresh: () => void, isRefreshing?: boolean, onTransferPress: (params: { fromId?: string, toId?: string, amount?: number }) => void }) => {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const isFocused = useIsFocused();
  const { formatMoney: formatMoneyCurrency, config: currencyConfig } = useCurrency();

  const [selectedPocket, setSelectedPocket] = useState<any | null>(null);
  const [showIncomeSummary, setShowIncomeSummary] = useState(false);
  // Overrides locales: guarda las ediciones de bolsillos de inmediato,
  // antes de que onRefresh() complete el fetch del servidor.
  const [localPocketOverrides, setLocalPocketOverrides] = useState<Record<string, any>>({});

  const [showBreakdown, setShowBreakdown] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [showUndoModal, setShowUndoModal] = useState(false);
  const [undoWasReverted, setUndoWasReverted] = useState(true);
  const [deletingTx, setDeletingTx] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBudget, setNewBudget] = useState('');
  const [newIcon, setNewIcon] = useState('tag');

  // Edit existing pocket
  const [isEditingPocket, setIsEditingPocket] = useState(false);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('tag');
  const [editBudgetValue, setEditBudgetValue] = useState('');
  const [editBudgetType, setEditBudgetType] = useState<'fixed' | 'percentage'>('fixed');
  const [isSavingPocket, setIsSavingPocket] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showAllTxs, setShowAllTxs] = useState(false);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [showCycleInsight, setShowCycleInsight] = useState(false);

  // Regla de reparto recurrente (income_sources.distribution_rules) -- ahí
  // viven las metas en % ("Ahorro siempre el 10%"), no en pockets.planned_budget
  // (que solo guarda pesos fijos). Mismo query que usa AddIncome.tsx.
  const [incomeSource, setIncomeSource] = useState<{ id: string | null; amount: number; rules: any[] }>({ id: null, amount: 0, rules: [] });
  const [isIncomeSourceLoading, setIsIncomeSourceLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('income_sources')
          .select('id, amount, distribution_rules')
          .eq('user_id', session.user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1);
        if (data && data[0]) {
          setIncomeSource({ id: data[0].id, amount: data[0].amount || 0, rules: data[0].distribution_rules || [] });
        }
      } finally {
        setIsIncomeSourceLoading(false);
      }
    })();
  }, [session.user.id]);

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
  const [showDemoSuccess, setShowDemoSuccess] = useState(false);

  const sheetAnim = useRef(new Animated.Value(height)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;
  // Offset del teclado para el bottom sheet — sube el sheet suavemente
  // cuando aparece el teclado, sin el salto brusco del KeyboardAvoidingView.
  const keyboardOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const onShow = (e: any) => {
      // Solo subimos cuando hay un TextInput activo dentro del sheet (isEditingPocket)
      const kbHeight = e.endCoordinates?.height ?? 0;
      const safeBottom = insets.bottom;
      // Subimos justo la altura del teclado menos el safe area (ya cubierto por padding)
      const offset = Math.max(0, kbHeight - safeBottom - 24);
      Animated.timing(keyboardOffset, {
        toValue: -offset,
        duration: e.duration || 250,
        useNativeDriver: true,
      }).start();
    };
    const onHide = (e: any) => {
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: e.duration || 200,
        useNativeDriver: true,
      }).start();
    };

    // iOS usa 'Will' para que la animación sea sincronizada con el teclado.
    // Android usa 'Did' porque 'Will' no siempre dispara.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);
    return () => { subShow.remove(); subHide.remove(); };
  }, [keyboardOffset, insets.bottom]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -5, duration: 400, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ])
    ).start();
  }, []);

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

  // Limpiar overrides locales cuando el servidor confirma los datos frescos
  // (los pockets prop se actualizan con los valores reales).
  useEffect(() => {
    if (Object.keys(localPocketOverrides).length === 0) return;
    setLocalPocketOverrides(prev => {
      const next = { ...prev };
      pockets.forEach(p => {
        // Si el servidor ya devolvió el planned_budget correcto, el override ya no hace falta
        if (next[p.id] && next[p.id].planned_budget === p.planned_budget) {
          delete next[p.id];
        }
      });
      return next;
    });
  }, [pockets]);

  // Check and start tour when pockets load
  useEffect(() => {
    if (!isFocused || pockets.length === 0) return;

    const checkDemoTour = async () => {
      const demoExpenses = transactions.filter(t => (t as any).metadata?.is_demo);
      const isDemo = demoExpenses.length > 0;

      // --- PRIORIDAD 1: Flujo demo del Scanner ---
      if (isDemo) {
        const firstExp = demoExpenses[0];
        const triggeredId = await AsyncStorage.getItem('@save_demo_tour_triggered_id_v3');
        if (triggeredId === firstExp.id) return; // Ya se disparó esta sesión
        await AsyncStorage.setItem('@save_demo_tour_triggered_id_v3', firstExp.id);

        let targetPocket = pockets.find(p => p.name === firstExp.category) || pockets.find(p => p.is_default_free);
        if (!targetPocket) targetPocket = pockets[0];
        const stepName = targetPocket.is_default_free ? 'pockets_free' : `pocket_${targetPocket.id}`;
        
        setTimeout(() => {
          startTour([{
            name: stepName,
            title: 'Toca este bolsillo',
            description: 'Mira el detalle y cuánto presupuesto te queda.',
            iconName: 'Sparkles',
            order: 1,
            // Antes esto se cerraba con "Entendido" sin necesidad de tocar
            // el bolsillo de verdad. Ahora se obliga el toque real.
            allowTouches: true,
            hideNextButton: true,
          }], undefined, { step: 6, total: 6 });
          AsyncStorage.setItem('@save_tour_pockets_seen', 'true');
        }, 500);
        return;
      }
    };
    checkDemoTour();
  }, [isFocused, isMonthlyLoading, monthState, pockets, transactions, startTour]);

  const pocketTourTriggeredRef = useRef<string | null>(null);
  const txTourTriggeredRef = useRef<string | null>(null);

  // Tour dentro del Modal de Bolsillo (solo para el flujo demo)
  useEffect(() => {
    // ELIMINADO: TourOverlay no puede mostrarse sobre Modals nativos.
    // Usaremos una burbuja Animated local sobre el gasto en lugar de startTour.
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

  // Pull-to-refresh handler — delega al padre (handleGlobalRefresh en index.tsx)
  // que maneja el estado isRefreshing global. También fuerza el ciclo local.
  const handlePullRefresh = async () => {
    setIsRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      onRefresh();
      await refreshMonthly(true);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Traduce el choque contra el CHECK pockets_allocated_budget_non_negative
  // (RPC transfer_between_pockets) a un mensaje que la persona entienda --
  // mismo criterio que PocketTransfer.tsx para "Fondos Insuficientes".
  const isInsufficientFundsError = (e: any) =>
    e?.code === '23514' || String(e?.message || '').includes('pockets_allocated_budget_non_negative');

  // pockets tiene UNIQUE (user_id, category) y usamos el nombre como
  // categoría -- ya existe un bolsillo con ese mismo nombre.
  const isDuplicateNameError = (e: any) =>
    e?.code === '23505' || String(e?.message || '').includes('pockets_user_id_category_key');

  const syncPocketToCloud = async () => {
    if (!newName.trim()) return;
    
    const cleanName = newName.trim();
    const capitalizedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    const planned = parseInt(newBudget.replace(/\D/g, '')) || 0;

    // El bolsillo nace en 0 de dinero real. Si trae presupuesto de una, esa
    // plata se traslada desde Libre (mismo RPC que la pantalla de traslados
    // manuales) -- nunca se inventa dinero que ningún ingreso respalde.
    try {
      const { data: newPocket, error: insertError } = await supabase.from('pockets').insert({
        user_id: session.user.id,
        name: capitalizedName,
        category: capitalizedName,
        allocated_budget: 0,
        planned_budget: planned > 0 ? planned : null,
        icon: newIcon || 'tag'
      }).select().single();

      if (insertError) throw insertError;

      if (planned > 0 && newPocket) {
        const librePocket = pockets.find((p: any) => p.is_default_free);
        if (librePocket && monthIncome > 0) {
          const { error: transferError } = await supabase.rpc('transfer_between_pockets', {
            p_user_id: session.user.id,
            p_from_id: librePocket.id,
            p_to_id: newPocket.id,
            p_amount: planned,
          });
          if (transferError) throw transferError;
        }
      }

      setNewName('');
      setNewBudget('');
      setNewIcon('tag');
      setAddModalVisible(false);

      // Optimistic update: el nuevo bolsillo aparece de inmediato en la lista
      // sin esperar a que onRefresh() complete el fetch del servidor.
      if (newPocket) {
        DeviceEventEmitter.emit('pocket_created', newPocket);
      }

      // Refresca los datos reales del servidor en background
      onRefresh();
      refreshMonthly(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      console.error(e);
      notify.error(isDuplicateNameError(e)
        ? `Ya tienes un bolsillo "${capitalizedName}".`
        : isInsufficientFundsError(e)
          ? 'Te falta plata en Libre para eso.'
          : 'No se pudo crear el bolsillo.');
    }
  };

  // La meta en % vive en income_sources.distribution_rules (no en
  // pockets.planned_budget, que solo guarda pesos fijos) -- así
  // AddIncome.tsx la recomienda solo, sin tocar ese archivo para nada.
  const upsertPercentRule = async (pocketId: string, pct: number) => {
    const rules = incomeSource.rules.filter((r: any) => r.pocket_id !== pocketId);
    const maxPriority = rules.reduce((m: number, r: any) => Math.max(m, r.priority || 0), 0);
    rules.push({ pocket_id: pocketId, type: 'percentage', value: pct, priority: maxPriority + 1 });

    if (incomeSource.id) {
      const { error } = await supabase.from('income_sources').update({ distribution_rules: rules }).eq('id', incomeSource.id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from('income_sources').insert({
        user_id: session.user.id,
        name: 'Ingreso Principal',
        amount: monthIncome > 0 ? monthIncome : 0,
        frequency: 'monthly',
        next_date: new Date().toISOString().split('T')[0],
        distribution_rules: rules,
        is_active: true,
        metadata: { income_type: 'fixed' },
      }).select().single();
      if (error) throw error;
      setIncomeSource({ id: data.id, amount: data.amount, rules });
      return;
    }
    setIncomeSource(prev => ({ ...prev, rules }));
  };

  // Si el bolsillo vuelve a modo fijo, limpiamos una regla en % vieja para
  // que no reaparezca sola la próxima vez que se registre un ingreso.
  const removePercentRule = async (pocketId: string) => {
    if (!incomeSource.id) return;
    if (!incomeSource.rules.some((r: any) => r.pocket_id === pocketId && r.type === 'percentage')) return;
    const rules = incomeSource.rules.filter((r: any) => r.pocket_id !== pocketId);
    const { error } = await supabase.from('income_sources').update({ distribution_rules: rules }).eq('id', incomeSource.id);
    if (error) throw error;
    setIncomeSource(prev => ({ ...prev, rules }));
  };

  const saveEditPocket = async () => {
    if (!editName.trim() || !editIcon) return;
    const cleanName = editName.trim();
    const capitalizedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    try {
      setIsSavingPocket(true);

      const isPercentMode = editBudgetType === 'percentage';
      const pctValue = isPercentMode ? (parseInt(editBudgetValue.replace(/\D/g, '')) || 0) : 0;
      const fixedValue = !isPercentMode ? (parseInt(editBudgetValue.replace(/\D/g, '')) || 0) : 0;
      // Equivalente en pesos -- solo se usa para reconciliar la plata REAL
      // ya asignada (transfer_between_pockets), nunca para decidir qué se guarda.
      const targetPesos = isPercentMode
        ? (incomeSource.amount > 0 ? Math.round(incomeSource.amount * pctValue / 100) : 0)
        : fixedValue;

      const librePocket = pockets.find((p: any) => p.is_default_free);
      // Leer allocated_budget fresco desde la BD para evitar calcular diff sobre
      // un valor desactualizado (que generaría transferencias fantasma y descuadres).
      const { data: freshPocket } = await supabase
        .from('pockets')
        .select('allocated_budget')
        .eq('id', selectedPocket.id)
        .single();
      const currentAllocated = (freshPocket?.allocated_budget ?? selectedPocket.allocated_budget) ?? 0;
      const diff = targetPesos - currentAllocated;
      const hasIncome = incomeSource.amount > 0;

      if (hasIncome && diff !== 0 && librePocket && librePocket.id !== selectedPocket.id) {
        const { error: transferError } = await supabase.rpc('transfer_between_pockets', {
          p_user_id: session.user.id,
          p_from_id: diff > 0 ? librePocket.id : selectedPocket.id,
          p_to_id: diff > 0 ? selectedPocket.id : librePocket.id,
          p_amount: Math.abs(diff),
        });
        if (transferError) throw transferError;
      }

      const updates: any = {
        name: capitalizedName,
        category: capitalizedName,
        icon: editIcon,
        planned_budget: isPercentMode ? null : (fixedValue > 0 ? fixedValue : null),
      };

      const { error: updateError } = await supabase.from('pockets').update(updates).eq('id', selectedPocket.id);
      if (updateError) throw updateError;

      if (isPercentMode && pctValue > 0) {
        await upsertPercentRule(selectedPocket.id, pctValue);
      } else {
        await removePercentRule(selectedPocket.id);
      }

      // Optimistic update: refleja el cambio de inmediato en la UI
      // antes de que el refetch del servidor termine.
      const optimisticPocket = { ...selectedPocket, ...updates, allocated_budget: targetPesos };
      setSelectedPocket(optimisticPocket);
      // Guardar override para cuando el usuario cierre y vuelva a abrir el bolsillo
      setLocalPocketOverrides(prev => ({ ...prev, [selectedPocket.id]: optimisticPocket }));

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaveSuccess(true);

      // Refresca datos en paralelo — ambos son fire-and-forget;
      // el optimistic update ya mostró el valor correcto.
      onRefresh();
      refreshMonthly(true);

      setTimeout(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsEditingPocket(false);
        setIsSavingPocket(false);
        setSaveSuccess(false);
      }, 700);

    } catch (e: any) {
      console.error(e);
      notify.error(isDuplicateNameError(e)
        ? `Ya tienes un bolsillo "${capitalizedName}".`
        : isInsufficientFundsError(e)
          ? 'Te falta plata en Libre para eso.'
          : (e?.message || 'No se pudo guardar el presupuesto.'));
      setIsSavingPocket(false);
    }
  };

  const startEditPocket = () => {
    if (!selectedPocket) return;
    setEditName(selectedPocket.name);
    setEditIcon(selectedPocket.icon || 'tag');
    const plan = getPocketPlan(selectedPocket);
    if (plan?.type === 'percentage') {
      setEditBudgetType('percentage');
      setEditBudgetValue(String(plan.value));
    } else {
      setEditBudgetType('fixed');
      setEditBudgetValue(plan ? String(plan.value) : '');
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsEditingPocket(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const getPocketTransactions = (category: string, pocketId: string, limit?: number) => {
    const all = transactions.filter(tx => {
      if (tx.cycle_id !== selectedCycleId) return false;
      
      // Fix visual duplication of transfers
      if (tx.metadata?.type === 'internal_transfer_out') {
        return tx.metadata.from_id === pocketId;
      }
      if (tx.metadata?.type === 'internal_transfer_in') {
        return tx.metadata.to_id === pocketId;
      }
      
      if (tx.category === category) return true;
      if (tx.category === 'Ingreso' && tx.metadata?.distribution?.[pocketId] > 0) return true;
      if (tx.category === 'Traslado' && (tx.metadata?.from_pocket === pocketId || tx.metadata?.to_pocket === pocketId)) return true;
      return false;
    }).map(tx => {
      if (tx.category === 'Ingreso') {
        return { ...tx, amount: tx.metadata.distribution[pocketId], merchant: 'Ingreso: ' + (tx.merchant || 'General') };
      }
      if (tx.metadata?.type === 'internal_transfer_out' || tx.metadata?.type === 'internal_transfer_in') {
        const isOut = tx.metadata?.type === 'internal_transfer_out';
        return { ...tx, amount: isOut ? -Math.abs(tx.amount) : Math.abs(tx.amount) };
      }
      if (tx.category === 'Traslado') {
        const isOut = tx.metadata?.from_pocket === pocketId;
        return { ...tx, amount: isOut ? -Math.abs(tx.amount) : Math.abs(tx.amount) };
      }
      return tx;
    }).sort((a, b) => {
      const dateA = (a.date_string || a.created_at || '0').split('T')[0];
      const dateB = (b.date_string || b.created_at || '0').split('T')[0];
      if (dateA !== dateB) {
        return new Date(dateB + 'T12:00:00').getTime() - new Date(dateA + 'T12:00:00').getTime();
      }
      // Mismo día: desempatar por created_at exacto (más reciente primero)
      return new Date(b.created_at || '0').getTime() - new Date(a.created_at || '0').getTime();
    });
    return limit ? all.slice(0, limit) : all;
  };

  const incomeTransactions = transactions.filter(tx => {
    return tx.category === 'Ingreso' && tx.cycle_id === selectedCycleId;
  });
  // OJO: para el TOTAL de ingresos del mes usamos monthState.income_month
  // (la fuente única). incomeTransactions queda solo para listar los
  // registros individuales.
  const totalInvoicedIncome = monthState?.income_month || 0;

  // NUEVO: Calcular el total planeado sumando el planned_budget y reglas porcentuales de todos los bolsillos
  const getAbsolutePocketPlan = (p: any): number => {
    if (p.planned_budget > 0) return parseFloat(p.planned_budget as any);
    const pct = incomeSource.rules.find((r: any) => r.pocket_id === p.id && r.type === 'percentage')?.value;
    if (pct > 0 && incomeSource.amount > 0) {
      return Math.round(incomeSource.amount * (pct / 100));
    }
    return 0;
  };

  const totalPlanned = pockets.reduce((acc, p) => acc + getAbsolutePocketPlan(p), 0);

  const freePocketData = monthState?.pockets?.find(p => p.is_default_free);
  const freeAmountAvailable = freePocketData?.available ?? 0;

  const openPocket = (pocket: any) => {
    // Fusionar con override local si existe (edición reciente antes de que el servidor responda)
    const merged = localPocketOverrides[pocket.id]
      ? { ...pocket, ...localPocketOverrides[pocket.id] }
      : pocket;
    setSelectedPocket(merged);
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 50, friction: 8 }).start();
    if (isTourActive) {
      stopTour();
    }
  };

  useEffect(() => {
    if (selectedPocket) {
      Animated.timing(sheetAnim, { toValue: 0, duration: 0, useNativeDriver: true }).start();
    }
  }, [selectedPocket, isTourActive]);

  const closePocket = (force = false) => {
    if (isTourActive && !force) return;
    stopTour();
    Animated.timing(sheetAnim, { toValue: height, duration: 250, useNativeDriver: true }).start(async () => {
      setSelectedPocket(null);
      const demoProgress = await AsyncStorage.getItem('@save_demo_in_progress');
      if (demoProgress === 'true') {
        await AsyncStorage.removeItem('@save_demo_in_progress');
      }
    });
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

  // Plata REAL asignada este mes -- nunca cae a planned_budget. Antes esta
  // función sí caía a planned_budget cuando el valor real era 0 (0 es falsy
  // en JS), lo que hacía que un bolsillo con solo una meta (sin ingreso
  // todavía) se mostrara como si tuviera esa plata de verdad -- causando que
  // la tarjeta dijera "Asignado: $X" y "EXCESO" al mismo tiempo apenas
  // hubiera un gasto en esa categoría.
  const getPocketReal = (p: any) => {
    const mp = getMonthlyPocket(p.id);
    return mp?.allocated ?? p.allocated_budget ?? 0;
  };

  // Meta configurada por el usuario -- NO es plata real, solo referencia.
  // Fija (pesos, en pockets.planned_budget) O porcentaje (en
  // income_sources.distribution_rules) -- nunca las dos a la vez.
  type PocketPlan = { type: 'fixed' | 'percentage'; value: number };
  const getPocketPlan = (p: any): PocketPlan | null => {
    if (p.planned_budget > 0) return { type: 'fixed', value: p.planned_budget };
    const pct = incomeSource.rules.find((r: any) => r.pocket_id === p.id && r.type === 'percentage')?.value;
    return pct > 0 ? { type: 'percentage', value: pct } : null;
  };

  const formatPlanValue = (plan: PocketPlan) => plan.type === 'fixed'
    ? formatCOP(plan.value)
    : `${plan.value}%${incomeSource.amount > 0 ? ` (${formatCOP(Math.round(incomeSource.amount * plan.value / 100))})` : ''}`;

  // Sort: libre siempre último, el resto por % gastado (más lleno primero)
  // IMPORTANTE: Se usa la asignación real de la BD para el orden, de forma que al 
  // escribir en Ajustar (tempBudgets) no brinquen los bolsillos cerrando el teclado.
  const sorted = [...pockets].sort((a, b) => {
    if (a.is_default_free) return 1;
    if (b.is_default_free) return -1;
    const mpA = (monthState?.pockets || []).find(p => p.id === a.id);
    const mpB = (monthState?.pockets || []).find(p => p.id === b.id);
    
    const allocA = mpA?.allocated ?? (a as any).allocated_budget ?? 1;
    const allocB = mpB?.allocated ?? (b as any).allocated_budget ?? 1;
    
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

  // Mismo flujo de confirmación que Movimientos (Expenses.tsx) -- antes acá
  // se borraba directo al tocar "Eliminar" en el detalle, sin preguntar.
  const handleConfirmDelete = async () => {
    if (!deletingTx || isDeleting) return;
    setIsDeleting(true);
    const tx = deletingTx;
    try {
      const { data, error } = await supabase.rpc('delete_transaction_with_reversal', {
        p_tx_id: tx.id,
        p_user_id: session.user.id
      });

      if (error) throw error;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDeletingTx(null);

      if (data && data.cycle_deleted) {
        setUndoWasReverted(!!data.cycle_reverted);
        setShowUndoModal(true);
      } else {
        onRefresh();
      }

      if (tx.metadata?.is_demo) {
        setShowDemoSuccess(true);
      }
    } catch (e) {
      notify.error('Error al eliminar');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <View style={styles.container}>
        <View style={{ flex: 1 }}>
          {((isMonthlyLoading && !monthState) || isIncomeSourceLoading) ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={[styles.scrollPadding, { paddingTop: Math.max(insets.top, 16) + 104, paddingBottom: Math.max(insets.bottom, 16) + normalize(76) + 24 }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing || isRefreshingProp}
                  onRefresh={handlePullRefresh}
                  tintColor={theme.colors.primary}
                  colors={[theme.colors.primary]}
                  progressBackgroundColor={theme.colors.surface}
                  title="Actualizando..."
                  titleColor={theme.colors.onSurfaceVariant}
                  progressViewOffset={Math.max(insets.top, 16) + 104}
                />
              }
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
                      {formatCOP(pockets.filter(p => !p.is_default_free).reduce((acc, p) => acc + getPocketReal(p), 0))}
                    </Text>
                  </View>
                  <TourStep name="pockets_free">
                    <View style={{ flex: 1, alignItems: 'center', backgroundColor: theme.colors.primary + '12', borderRadius: 14, paddingVertical: 12 }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: theme.colors.primary, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>Libre</Text>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.primary, fontFamily: theme.fonts.headline }} numberOfLines={1} adjustsFontSizeToFit>
                        {formatCOP(pockets.find(p => p.is_default_free) ? getPocketReal(pockets.find(p => p.is_default_free)!) : 0)}
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

          {/* METAS PLANEADAS */}
          {totalPlanned > 0 && (
              <View style={{ marginBottom: 24, marginTop: totalInvoicedIncome > 0 ? 0 : 20 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: theme.colors.onSurfaceVariant }}>Metas planeadas</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: (theme.colors as any).pastel.teal }}>
                    {formatCOP(totalPlanned)} en total
                  </Text>
                </View>
              <View style={{ height: 14, backgroundColor: theme.colors.surfaceContainerHighest, borderRadius: 7, flexDirection: 'row', overflow: 'hidden' }}>
                {sorted.map((p, i) => {
                  const plan = getAbsolutePocketPlan(p);
                  if (plan <= 0) return null;
                  const pct = Math.min((plan / totalPlanned) * 100, 100);
                  
                  const premiumColors = theme.colors.chartColors as string[];
                  const color = p.is_default_free ? theme.colors.primary : premiumColors[i % premiumColors.length];
                  
                  return (
                    <View key={`plan-${p.id}`} style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRightWidth: 1, borderRightColor: theme.colors.background }} />
                  )
                })}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                {sorted.filter(p => getAbsolutePocketPlan(p) > 0).map((p) => {
                  const i = sorted.indexOf(p);
                  const premiumColors = theme.colors.chartColors as string[];
                  const color = p.is_default_free ? theme.colors.primary : premiumColors[i % premiumColors.length];

                  return (
                    <View 
                      key={`plan-legend-${p.id}`} 
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
                    >
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                      <Text style={{ fontSize: 10, color: theme.colors.onSurfaceVariant, fontWeight: '700' }}>
                        {p.name}
                      </Text>
                    </View>
                  )
                })}
              </View>
            </View>
          )}

          {/* Budget Distribution Bar (Dinero Real) */}
          {totalInvoicedIncome > 0 && (
              <View style={{ marginBottom: 24 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: theme.colors.onSurfaceVariant }}>Distribución del presupuesto</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.primary }}>
                    {formatCOP(sorted.filter(p => !p.is_default_free).reduce((acc, p) => acc + getPocketReal(p), 0))} asignados
                  </Text>
                </View>
              <View style={{ height: 14, backgroundColor: theme.colors.surfaceContainerHighest, borderRadius: 7, flexDirection: 'row', overflow: 'hidden' }}>
                {sorted.map((p, i) => {
                  const alloc = getPocketReal(p);
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
                {sorted.filter(p => getPocketReal(p) > 0).map((p) => {
                  const alloc = getPocketReal(p);
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
              // Plan y disponible vienen del RPC get_cycle_state.
              // NO restamos gasto otra vez — el RPC ya lo hizo.
              const mp = getMonthlyPocket(p.id);
              const allocated = getPocketReal(p);
              const plan = getPocketPlan(p);
              const spent = mp?.spent_month ?? 0;
              const available = mp?.available ?? 0;
              const remaining = available;             // ← lo que queda hoy, directo de la DB
              const isOver = remaining < 0 || (allocated > 0 && spent > allocated);
              const pctUsed = allocated > 0 ? Math.min((spent / allocated) * 100, 100) : 0;
              // Bolsillo con meta puesta pero todavía sin plata real detrás
              // (típico: la persona presupuestó antes de registrar ingreso).
              // No es "Libre" -- Libre siempre es plata real por definición.
              const isPlanOnly = !p.is_default_free && allocated <= 0 && !!plan;
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
                            <View style={{ marginBottom: 12 }}>
                              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                                <CategoryIcon iconName={p.icon} size={16} color="#FFF" />
                              </View>
                            </View>
                            <Text style={{ fontSize: 18, fontWeight: '900', color: '#FFF', marginBottom: 2 }} numberOfLines={1}>{p.name}</Text>
                            <Text style={{ fontSize: 24, fontWeight: '900', color: '#FFF', marginBottom: 6, letterSpacing: -0.5 }}>
                              {formatCOP(Math.abs(remaining))}
                            </Text>
                            <Text style={{ fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.9)', marginBottom: 20 }} numberOfLines={1}>
                              Sin asignar
                            </Text>
                            <View style={{ marginTop: 'auto' }}>
                              <AnimatedProgressBar percent={pctUsed} color="#FFF" bgColor="rgba(255,255,255,0.25)" height={6} />
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 }}>
                                <Text style={{ fontSize: 9, fontWeight: '900', color: 'rgba(255,255,255,0.8)', letterSpacing: 0.5, marginBottom: 2 }}>{remaining < 0 ? 'EXCESO' : 'DISPONIBLE'}</Text>
                                <Text style={{ fontSize: 15, fontWeight: '900', color: 'transparent' }} numberOfLines={1} adjustsFontSizeToFit>$0</Text>
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
                      <View style={[styles.card, { backgroundColor: cardBg, padding: 18, paddingTop: 20, paddingBottom: 22, minHeight: 150, opacity: isPlanOnly ? 0.7 : 1 }]}>
                        <View style={{ marginBottom: 12 }}>
                          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                            <CategoryIcon iconName={p.icon} size={16} color="#FFF" />
                          </View>
                        </View>
                        <Text style={{ fontSize: 18, fontWeight: '900', color: '#FFF', marginBottom: 2 }} numberOfLines={1}>{p.name}</Text>
                        
                        <Text style={{ fontSize: 24, fontWeight: '900', color: '#FFF', marginBottom: 6, letterSpacing: -0.5 }}>
                          {formatCOP(Math.abs(remaining))}
                        </Text>
                        {plan ? (
                          <View style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 20 }}>
                            <Text style={{ fontSize: 10, fontWeight: '900', color: '#FFF', letterSpacing: 0.5 }}>META {formatPlanValue(plan)}</Text>
                          </View>
                        ) : (
                          <Text style={{ fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.9)', marginBottom: 20 }}>
                            Asignado: {formatCOP(allocated)}
                          </Text>
                        )}
                        <View style={{ marginTop: 'auto' }}>
                          <AnimatedProgressBar percent={pctUsed} color="#FFF" bgColor="rgba(255,255,255,0.25)" height={6} />
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
            <Animated.View style={[styles.sheet, { paddingHorizontal: 0, paddingTop: 0, transform: [{ translateY: Animated.add(sheetAnim, keyboardOffset) }] }]}>
              {/* Colored top strip matching the pocket's card color */}
              {(() => {
                const i = sorted.findIndex(p => p.id === selectedPocket.id);
                const premiumColors = theme.colors.chartColors as string[];
                const flatColor = selectedPocket.is_default_free ? theme.colors.primary : premiumColors[i % premiumColors.length];
                const mp = getMonthlyPocket(selectedPocket.id);
                const planAlloc = getPocketReal(selectedPocket);
                const planVal = getPocketPlan(selectedPocket);
                const spent = mp?.spent_month ?? 0;
                const available = selectedPocket.is_default_free ? (planAlloc - spent) : (mp?.available ?? 0);
                const isOver = available < 0;
                const pctUsed = planAlloc > 0 ? Math.min((spent / planAlloc) * 100, 100) : 0;
                const pocketColor = isOver ? theme.colors.error : flatColor;
                // Sin plata real todavía pero con una meta puesta -- se lo
                // decimos claro en vez de mostrar "$0" o mezclar los dos.
                const headerSubtitle = selectedPocket.is_default_free
                  ? `Disponible sin asignar: ${formatCOP(planAlloc)}`
                  : planAlloc > 0
                    ? `Tienes: ${formatCOP(planAlloc)}`
                    : planVal
                      ? `Meta: ${formatPlanValue(planVal)} · sin fondear`
                      : 'Sin presupuesto';

                return (
                  <>
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 200, backgroundColor: pocketColor, borderTopLeftRadius: 36, borderTopRightRadius: 36 }} />
                    <View style={{ flex: 1 }}>
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
                          {headerSubtitle}
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

                            {/* Toggle $ / % — mismo estilo compacto que AddIncome */}
                            <View style={{ flexDirection: 'row', borderRadius: 12, padding: 4, backgroundColor: 'rgba(255,255,255,0.18)', marginBottom: 10, alignSelf: 'flex-start' }}>
                              <TouchableOpacity
                                onPress={() => { setEditBudgetType('fixed'); setEditBudgetValue(''); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                                style={[
                                  { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
                                  editBudgetType === 'fixed' && { backgroundColor: pocketColor }
                                ]}
                              >
                                <DollarSign size={16} color={editBudgetType === 'fixed' ? '#FFF' : 'rgba(255,255,255,0.7)'} strokeWidth={2.5} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => { setEditBudgetType('percentage'); setEditBudgetValue(''); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                                style={[
                                  { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
                                  editBudgetType === 'percentage' && { backgroundColor: pocketColor }
                                ]}
                              >
                                <Percent size={16} color={editBudgetType === 'percentage' ? '#FFF' : 'rgba(255,255,255,0.7)'} strokeWidth={2.5} />
                              </TouchableOpacity>
                            </View>

                            <TextInput
                              style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 20, fontWeight: '900', color: '#FFF', fontFamily: theme.fonts.headline, marginBottom: 4 }}
                              value={
                                editBudgetType === 'fixed'
                                  ? (editBudgetValue ? editBudgetValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '')
                                  : editBudgetValue
                              }
                              onChangeText={v => setEditBudgetValue(editBudgetType === 'fixed' ? v.replace(/\./g, '').replace(/\D/g, '') : v.replace(/\D/g, ''))}
                              keyboardType="numeric"
                              placeholder={editBudgetType === 'fixed' ? '0' : '0 – 100'}
                              placeholderTextColor="rgba(255,255,255,0.5)"
                            />

                            {/* Preview en tiempo real para el modo porcentaje */}
                            {editBudgetType === 'percentage' && editBudgetValue && monthIncome > 0 && (
                              <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.8)', marginBottom: 4 }}>
                                ≈ {formatCOP(Math.round(monthIncome * (parseInt(editBudgetValue) || 0) / 100))} del ingreso actual
                              </Text>
                            )}
                            <Text style={{ fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.9)', marginBottom: 8 }}>
                              Es tu meta — se hace plata real con tu próximo ingreso.
                            </Text>
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
                              {selectedPocket.is_default_free ? (available < 0 ? 'EXCESO' : 'DISPONIBLE') : (planAlloc > 0 ? 'TIENES' : (planVal ? 'META' : 'PRESUPUESTO'))}
                            </Text>
                            <Text style={{ fontSize: 20, fontWeight: '900', color: '#FFF', fontFamily: theme.fonts.headline }} numberOfLines={1} adjustsFontSizeToFit>
                              {planAlloc > 0 ? formatCOP(planAlloc) : (planVal ? formatPlanValue(planVal) : 'Sin definir')}
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
                              // Elegir el bolsillo de origen por el disponible REAL del
                              // ciclo (RPC get_cycle_state via getMonthlyPocket).
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
                            <View key={tx.id || idx}>
                              {txRow}
                              <Animated.View style={{ position: 'absolute', top: -35, alignSelf: 'center', transform: [{ translateY: bounceAnim }] }}>
                                <View style={{ backgroundColor: theme.colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
                                  <Text style={{ color: theme.colors.onPrimary, fontSize: 12, fontWeight: '800' }}>¡Toca el gasto!</Text>
                                </View>
                                <View style={{ width: 0, height: 0, backgroundColor: 'transparent', borderStyle: 'solid', borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 6, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: theme.colors.primary, alignSelf: 'center' }} />
                              </Animated.View>
                            </View>
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
          </View>
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
                      style={[styles.fieldInput, { marginBottom: 4 }]}
                      placeholder="Ej. 500.000"
                      keyboardType="numeric"
                      value={newBudget ? Number(newBudget).toLocaleString(currencyConfig.locale) : ''}
                      onChangeText={v => setNewBudget(v.replace(/\D/g, ''))}
                      placeholderTextColor={theme.colors.onSurfaceVariant + '60'}
                    />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.onSurfaceVariant, marginBottom: 20 }}>
                      Es tu meta — se hace plata real con tu próximo ingreso.
                    </Text>

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
          onDelete={(tx) => {
            setSelectedTx(null);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            setDeletingTx(tx);
          }}
        />

        <ConfirmDeleteModal
          visible={!!deletingTx}
          confirmLabel="Eliminar movimiento"
          merchant={deletingTx?.merchant}
          amountLabel={deletingTx ? formatMoney(Math.abs(deletingTx.amount)) : undefined}
          subtitle="Al borrarlo, el presupuesto de tus bolsillos se ajustará automáticamente."
          isDeleting={isDeleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingTx(null)}
          blockCancel={!!deletingTx?.metadata?.is_demo}
        />

        <CycleUndoModal visible={showUndoModal} reverted={undoWasReverted} />

        <Modal visible={showDemoSuccess} animationType="fade" transparent>
          <BlurView intensity={90} tint="dark" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <View style={{ backgroundColor: theme.colors.surface, borderRadius: 40, width: '100%', padding: 40, alignItems: 'center', ...theme.shadows.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
              
              {/* Check Icon matching WelcomeModal Play Icon layout */}
              <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: theme.colors.primary + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
                <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', ...theme.shadows.lg }}>
                  <Check size={36} color="#FFF" strokeWidth={3.5} />
                </View>
              </View>

              {/* SAVE Logo Matching Header */}
              <View style={{ transform: [{ scale: 1.2 }], marginBottom: 16 }}>
                <MiniAnimatedSaveLogo />
              </View>

              <Text style={{ fontFamily: theme.fonts.body, fontSize: 19, color: theme.colors.onSurface, textAlign: 'center', marginBottom: 40, lineHeight: 28 }}>
                ¡Felicidades! Has completado el <Text style={{ fontWeight: '900', color: theme.colors.primary, textDecorationLine: 'underline' }}>tutorial</Text> con éxito. Ya estás listo para controlar tus finanzas.
              </Text>

              <TouchableOpacity
                activeOpacity={0.8}
                style={{ width: '100%', backgroundColor: theme.colors.primary, paddingVertical: 22, borderRadius: 28, alignItems: 'center', ...theme.shadows.lg }}
                onPress={async () => {
                  setShowDemoSuccess(false);
                  closePocket(true);
                  await AsyncStorage.removeItem('@save_demo_in_progress');
                  DeviceEventEmitter.emit('demo_completed');
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <Text style={{ fontFamily: theme.fonts.headline, color: '#FFFFFF', fontSize: 20, fontWeight: '900', letterSpacing: 0.5 }}>Comenzar a usar Save</Text>
                  <ArrowRight size={22} color="#FFFFFF" strokeWidth={3} />
                </View>
              </TouchableOpacity>
            </View>
          </BlurView>
        </Modal>
      </View>
    </View>
  );
};
