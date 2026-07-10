import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Animated, Dimensions, TouchableOpacity, Platform, ActivityIndicator, RefreshControl, SafeAreaView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowUpRight, TrendingUp, Sparkles, Tag, ShoppingBag, ShieldCheck, Zap, PlusCircle, Activity, Info, AlertTriangle, Coins, Plus, Wallet, Target, Flame, Clock, History, LayoutGrid, Briefcase, ChevronRight } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { normalize, getDeterministicColor } from '../theme/theme';
import { formatMoney } from '../lib/format';
import { useCycleState, useUserCycles } from '../lib/useCycleState';
import { supabase } from '../lib/supabase';
import { TourStep } from '../components/tour/TourStep';
import { useTour } from '../components/tour/TourContext';
import type { TourStepType } from '../components/tour/TourContext';
import { CategoryIcon } from '../components/CategoryIcon';
import { Transaction } from '../types';
import { TransactionDetailModal } from '../components/TransactionDetailModal';
import { MonthClosureModal } from '../components/MonthClosureModal';
import { CycleNav } from '../components/CycleNav';
import type { Session } from '@supabase/supabase-js';

const { width } = Dimensions.get('window');

interface DashboardProps {
  transactions: Transaction[];
  pockets: any[];
  session: Session;
  isDataReady: boolean;
  onOpenScanner: () => void;
  onOpenScannerDemo?: () => void;
  onViewAll: () => void;
  onOpenChat?: (initialMessage?: string) => void;
  userProfile?: { full_name: string; streak?: number };
  onRefresh?: () => void;
  isLoading?: boolean;
}

export const Dashboard = ({ 
  transactions, 
  pockets, 
  session,
  isDataReady,
  onOpenScanner,
  onOpenScannerDemo,
  onViewAll,
  onOpenChat,
  userProfile, 
  onRefresh,
  isLoading = false 
}: DashboardProps) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [showGreeting, setShowGreeting] = useState(true);
  const greetingAnim = useRef(new Animated.Value(1)).current;
  const [greeting, setGreeting] = useState('Hola');
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [pendingIncomes, setPendingIncomes] = useState<any[]>([]);
  const [showClosureModal, setShowClosureModal] = useState(false); // set to true when unclosed cycle found
  const { startTour, stopTour } = useTour();

  const isFocused = useIsFocused();

  const TOUR_STEPS: TourStepType[] = [
    {
      name: 'bottom_add',
      title: 'Anota tus Gastos',
      description: 'Toca aquí para registrar un movimiento manual, o mantén presionado para escanear un recibo con la cámara.',
      iconName: 'PlusCircle',
      order: 1
    }
  ];

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    const checkTour = async () => {
      const done = await AsyncStorage.getItem('tour_dashboard_done');
      const demoTxs = transactions.filter(t => (t as any).metadata?.is_demo);
      const hasDemo = demoTxs.length > 0;

      if (!isDataReady || !isFocused) return;

      if (hasDemo) {
        timeout = setTimeout(() => {
          startTour([{
            name: 'bottom_pockets',
            title: 'Abre tus bolsillos',
            description: 'Ve a la pestaña de Bolsillos para ver cómo la Inteligencia Artificial organizó tu primer gasto mágico.',
            iconName: 'Sparkles',
            order: 1
          }], undefined, { step: 2, total: 4 });
        }, 800);
      } else if (!done) {
        timeout = setTimeout(() => {
          startTour(TOUR_STEPS);
          AsyncStorage.setItem('tour_dashboard_done', 'true');
        }, 1000);
      }
    };

    checkTour();

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [isDataReady, transactions, startTour, isFocused]);

  useEffect(() => {
    const hours = new Date().getHours();
    if (hours < 12) setGreeting('Buenos días');
    else if (hours < 18) setGreeting('Buenas tardes');
    else setGreeting('Buenas noches');

    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();

    // Auto-hide greeting after 4 seconds
    const timer = setTimeout(() => {
      Animated.timing(greetingAnim, { 
        toValue: 0, 
        duration: 500, 
        useNativeDriver: false 
      }).start(() => setShowGreeting(false));
    }, 4000);

    return () => clearTimeout(timer);
  }, []);

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scrollContent: { paddingHorizontal: 24, paddingTop: Math.max(insets.top, 16) + 104, paddingBottom: 150 },
    
    headerSection: { marginBottom: 32 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    sectionTitleOrganic: { ...theme.typography.h3, color: theme.colors.onSurface },
    viewAllAction: { ...theme.typography.bodySmall, fontWeight: '800', color: theme.colors.primary },
    
    txItem: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      padding: 16, 
      backgroundColor: theme.colors.surface, 
      borderRadius: theme.radius.lg, 
      marginBottom: 14, 
      borderWidth: 1, 
      borderColor: theme.colors.divider,
      ...theme.shadows.sm 
    },
    txIconBoxUI: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    txMain: { flex: 1, marginLeft: 16 },
    txDateUI: { ...theme.typography.label, color: theme.colors.onSurfaceVariant, marginTop: 4 },
    txMerchantUI: { ...theme.typography.bodyMedium, fontWeight: '800', color: theme.colors.onSurface },
    txAmountUI: { ...theme.typography.bodyLarge, fontWeight: '900' }
  }), [theme, insets.top]);

  const { cycles, activeCycle } = useUserCycles();
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);

  useEffect(() => {
    if (activeCycle && !selectedCycleId) {
      setSelectedCycleId(activeCycle.id);
    }
  }, [activeCycle]);

  const { state: monthState, loading: monthLoading, refresh: refreshMonthState } = useCycleState(selectedCycleId || undefined);

  // Detect unclosed previous cycle: query user_budget_cycles for one that has
  // end_date set (closed) but user_closed is false, meaning the user hasn't
  // formally gone through the closure flow yet.
  const [unclosedPrevCycle, setUnclosedPrevCycle] = useState<any>(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase
      .from('user_budget_cycles')
      .select('id, name')
      .eq('user_id', session.user.id)
      .not('end_date', 'is', null)      // cycle has ended
      .eq('user_closed', false)          // but user hasn't gone through closure flow
      .order('end_date', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const found = data && data.length > 0 ? data[0] : null;
        setUnclosedPrevCycle(found);
        if (found) setShowClosureModal(true);
      });
  }, [session?.user?.id, selectedCycleId]);

  const totalIncomeMonth = monthState?.income_month ?? 0;
  const totalSpentMonth = monthState?.spent_month ?? 0;
  const netFlowMonth = monthState?.net_month ?? 0;

  const mainDisplayAmount = monthState?.net_month ?? 0;
  const saldoDisponible = monthState?.available_total ?? 0;

  const cycleDays = useMemo(() => {
    if (!monthState) return { current: 1, total: 30, progress: 0 };
    const start = new Date(monthState.start_date);
    start.setHours(0,0,0,0);
    
    let totalDays = 30;
    if (monthState.end_date) {
      const end = new Date(monthState.end_date);
      end.setHours(0,0,0,0);
      totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    }
    
    const today = new Date();
    today.setHours(0,0,0,0);
    
    let currentDay = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    if (currentDay < 1) currentDay = 1;
    if (!monthState.end_date && currentDay > totalDays) {
       totalDays = currentDay; 
    } else if (monthState.end_date && currentDay > totalDays) {
       currentDay = totalDays;
    }
    
    return { current: currentDay, total: totalDays, progress: currentDay / totalDays };
  }, [monthState]);

  const [aiInsight, setAiInsight] = useState<{ title: string; body: string } | null>(null);

  useEffect(() => {
    if (isDataReady && session?.user?.id) {
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      supabase
        .from('user_insights')
        .select('title, body')
        .eq('user_id', session.user.id)
        .eq('status', 'active')
        .gt('created_at', twelveHoursAgo)
        .order('created_at', { ascending: false })
        .limit(1)
        .then(({ data }) => {
          if (data && data.length > 0) {
            setAiInsight(data[0]);
          }
        });

      // Load pending incomes
      const today = new Date().toISOString().split('T')[0];
      supabase
        .from('pending_income_events')
        .select(`id, expected_amount, expected_date, status, income_sources(name)`)
        .eq('user_id', session.user.id)
        .eq('status', 'pending')
        .lte('expected_date', today)
        .then(({ data }) => {
          if (data) setPendingIncomes(data);
        });
    }
  }, [isDataReady, session?.user?.id]);

  const confirmPending = async (eventId: string, amount: number) => {
    try {
      const { error } = await supabase.rpc('confirm_pending_income', {
        p_event_id: eventId,
        p_actual_amount: amount
      });
      if (error) throw error;
      setPendingIncomes(prev => prev.filter(p => p.id !== eventId));
      onRefresh?.();
    } catch (e) {
      console.error('Error confirming:', e);
    }
  };

  const dismissPending = async (eventId: string) => {
    try {
      const { error } = await supabase.rpc('dismiss_pending_income', { p_event_id: eventId });
      if (error) throw error;
      setPendingIncomes(prev => prev.filter(p => p.id !== eventId));
    } catch (e) {
      console.error('Error dismissing:', e);
    }
  };

  const getFallbackInsight = () => {
    // Todo viene del mismo monthState — sin recalcular desde transactions.
    const meta = monthState?.allocated_total ?? 0;
    const consumptionRatio = meta > 0 ? totalSpentMonth / meta : 0;

    const pocketStats = (monthState?.pockets ?? [])
      .map(mp => ({ ...mp, ratio: mp.pct_used !== null ? mp.pct_used / 100 : 0 }))
      .sort((a, b) => b.ratio - a.ratio);
    const mostCritical = pocketStats[0];

    if (mostCritical && mostCritical.ratio > 1) {
      return `¡Ojo! Te pasaste en ${mostCritical.name} por ${formatMoney(mostCritical.spent_month - mostCritical.allocated)}. Toca aquí y revisemos cómo podemos cuadrarlo.`;
    }
    if (mostCritical && mostCritical.ratio === 1) {
      return `¡Alerta! Gastaste exactamente el 100% de ${mostCritical.name}. Ya no tienes saldo disponible ahí.`;
    }
    if (consumptionRatio >= 1) {
      return `¡Cuidado! Ya te gastaste el 100% de tu plan mensual. Toca aquí para que descubramos a dónde se fue la plata.`;
    }
    if (consumptionRatio >= 0.8) {
      return `Pilas, ya gastaste el ${Math.round(consumptionRatio * 100)}% de tu plan mensual. Toca aquí y te digo cómo no pasarnos.`;
    }
    if (totalSpentMonth === 0) return 'Aún no hay gastos este mes. ¡Toca aquí cuando empieces a gastar y yo te ayudo a cuidarlos!';
    return `Llevas ${formatMoney(totalSpentMonth)} gastados este mes. Toca aquí y te cuento un par de curiosidades sobre tus gastos.`;
  };

  return (
    <View style={styles.container}>
      {(!selectedCycleId || monthLoading) ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={{ opacity: fadeAnim }}>
            
            {/* HEADER PREMIUM — BALANCE & BUDGET HEALTH */}
            <View style={[styles.headerSection, { paddingTop: 0 }]}>
              <CycleNav 
                cycles={cycles} 
                activeCycleId={selectedCycleId} 
                onChange={setSelectedCycleId} 
              />

            <View style={{ marginBottom: 20, marginTop: 12 }}>
              <View style={{ flexDirection: 'column', gap: 6 }}>
                <Text style={{ ...theme.typography.label, color: theme.colors.onSurfaceVariant, opacity: 0.8, letterSpacing: 1 }}>
                  DISPONIBLE DEL CICLO
                </Text>
                <Text style={{ ...theme.typography.display, color: netFlowMonth < 0 ? theme.colors.error : theme.colors.onSurface, lineHeight: 48 }} numberOfLines={1} adjustsFontSizeToFit>
                  {formatMoney(netFlowMonth)}
                </Text>
              </View>
            </View>

            {/* BUDGET PROGRESS BAR — ELEGANT & FUNCTIONAL */}
            <View style={{ backgroundColor: theme.colors.surface, padding: 20, borderRadius: 28, borderWidth: 1, borderColor: theme.colors.divider, ...theme.shadows.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
                <View>
                  <Text style={{ ...theme.typography.label, color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>GASTADO ESTE MES</Text>
                  <Text style={{ ...theme.typography.h3, color: theme.colors.onSurface }}>{formatMoney(totalSpentMonth)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ ...theme.typography.label, color: theme.colors.primary, marginBottom: 6 }}>INGRESOS DEL MES</Text>
                  <Text style={{ ...theme.typography.h3, color: theme.colors.primary }}>{formatMoney(totalIncomeMonth)}</Text>
                </View>
              </View>

              {/* THE BAR */}
              <View style={{ height: 14, backgroundColor: theme.colors.surfaceContainerHighest, borderRadius: 7, overflow: 'hidden', position: 'relative', marginBottom: 12 }}>
                <LinearGradient
                  colors={(theme.colors as any).brandGradient || ['#8AD6CE', '#B9E2A2', '#D2A9D1']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ 
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${Math.min(100, totalIncomeMonth > 0 ? (totalSpentMonth / totalIncomeMonth) * 100 : 0)}%`,
                    borderRadius: 7,
                    shadowColor: theme.colors.primary,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.5,
                    shadowRadius: 10,
                  }}
                />
                
                {/* DAY INDICATOR (The 'Pace' Dot) */}
                {(() => {
                  const monthProgress = cycleDays.progress * 100;
                  return (
                    <View style={{ 
                      position: 'absolute', 
                      left: `${monthProgress}%`, 
                      top: -2, 
                      bottom: -2, 
                      width: 4, 
                      backgroundColor: theme.colors.onSurface, 
                      borderRadius: 2,
                      zIndex: 20,
                      borderWidth: 1,
                      borderColor: theme.colors.surface
                    }} />
                  );
                })()}
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.onSurface, opacity: 0.2 }} />
                  <Text style={{ ...theme.typography.caption, color: theme.colors.onSurfaceVariant, fontWeight: '700' }}>DÍA {cycleDays.current} DE {cycleDays.total}</Text>
                </View>

                {(() => {
                  const monthProgress = cycleDays.progress;
                  // FIX BUG 6: usar income_month como denominador, no allocated_total
                  const spendingProgress = totalIncomeMonth > 0 ? (totalSpentMonth / totalIncomeMonth) : 0;
                  
                  // Inteligencia de sentido común: la mayoría de gastos fijos (arriendo, deudas, servicios) 
                  // se pagan en los primeros días del mes. Exigir un ritmo lineal es irrealista.
                  // Agregamos un "colchón" del 50% al inicio del mes, que se reduce gradualmente a 0% al final.
                  const frontLoadBuffer = 0.50 * (1 - monthProgress);
                  const isOnTrack = spendingProgress <= (monthProgress + frontLoadBuffer) && spendingProgress <= 1;

                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: isOnTrack ? theme.colors.primaryContainer : theme.colors.errorContainer + '30', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                      <Text style={{ ...theme.typography.caption, fontWeight: '900', color: isOnTrack ? theme.colors.primary : theme.colors.error }}>
                        {isOnTrack ? 'A BUEN RITMO' : 'SOBREPASADO'}
                      </Text>
                    </View>
                  );
                })()}
              </View>
            </View>
          </View>

          {/* SAGE PROACTIVO — INSIGHT RÁPIDO */}
          {isDataReady && (
            <TouchableOpacity 
              activeOpacity={0.9} 
              onPress={() => { 
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (onOpenChat) {
                  onOpenChat(aiInsight ? `Háblame más sobre: ${aiInsight.title}` : "Analiza mis gastos de este mes y dime dónde puedo recortar.");
                }
              }}
              style={{ 
                backgroundColor: theme.colors.glassWhite,
                padding: 18, 
                borderRadius: 24, 
                marginBottom: 24, 
                borderWidth: 1.5, 
                borderColor: theme.colors.divider,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                ...theme.shadows.soft
              }}
            >
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: theme.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={20} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                   <Text style={{ fontSize: 10, fontWeight: '900', color: theme.colors.primary, letterSpacing: 1 }}>
                     {aiInsight ? 'NUEVO INSIGHT' : 'ASISTENTE DE SAVE'}
                   </Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.onSurface, lineHeight: 18 }}>
                  {aiInsight ? `${aiInsight.title}: ${aiInsight.body}` : getFallbackInsight()}
                </Text>
              </View>
              <ChevronRight size={18} color={theme.colors.onSurfaceVariant} opacity={0.5} />
            </TouchableOpacity>
          )}

          {/* INGRESOS PENDIENTES */}
          {pendingIncomes.length > 0 && (
            <View style={{ marginBottom: 32 }}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitleOrganic}>Pagos Pendientes</Text>
              </View>
              {pendingIncomes.map(event => (
                <View key={event.id} style={{ backgroundColor: theme.colors.primaryContainer + '20', borderRadius: theme.radius.xl, padding: 20, borderWidth: 1.5, borderColor: theme.colors.primary, marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <View style={{ backgroundColor: theme.colors.primary, width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
                      <Briefcase size={20} color={theme.colors.onPrimary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.onSurface }}>{event.income_sources?.name || 'Salario'}</Text>
                      <Text style={{ fontSize: 11, color: theme.colors.primary, fontWeight: '800', letterSpacing: 1, marginTop: 2 }}>ESPERADO HOY</Text>
                    </View>
                    <Text style={{ fontSize: 20, fontWeight: '900', color: theme.colors.primary }}>{formatMoney(event.expected_amount)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                     <TouchableOpacity 
                       activeOpacity={0.8}
                       onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); confirmPending(event.id, event.expected_amount); }}
                       style={{ flex: 1, backgroundColor: theme.colors.primary, paddingVertical: 14, borderRadius: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                     >
                        <Text style={{ color: theme.colors.onPrimary, fontWeight: '900', fontSize: 15 }}>Confirmar</Text>
                     </TouchableOpacity>
                     <TouchableOpacity 
                       activeOpacity={0.8}
                       onPress={() => dismissPending(event.id)}
                       style={{ backgroundColor: theme.colors.surfaceContainerHigh, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 16, alignItems: 'center' }}
                     >
                        <Text style={{ color: theme.colors.onSurfaceVariant, fontWeight: '800', fontSize: 15 }}>Aún no</Text>
                     </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* QUICK ADD GIGANTE (EL REY) */}
          <TouchableOpacity 
            activeOpacity={0.8} 
            onPress={() => { 
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); 
              if (transactions.length === 0 && onOpenScannerDemo) {
                onOpenScannerDemo();
              } else {
                onOpenScanner(); 
              }
            }}
            style={{ backgroundColor: theme.colors.primary, borderRadius: theme.radius.xl, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 32, ...theme.shadows.md }}
          >
            <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: 10, borderRadius: theme.radius.full }}>
              {transactions.length === 0 ? (
                <Sparkles size={24} color={theme.colors.onPrimary} />
              ) : (
                <Plus size={24} color={theme.colors.onPrimary} />
              )}
            </View>
            <View style={{ alignItems: 'flex-start' }}>
              <Text style={{ ...theme.typography.h3, color: theme.colors.onPrimary }}>Registrar Gasto</Text>
              {transactions.length === 0 && (
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '800', marginTop: 2 }}>
                  ✨ Toca aquí para ver la magia
                </Text>
              )}
            </View>
          </TouchableOpacity>

          {/* BOTON TEMPORAL DE DEMO PARA EL USUARIO */}
          {onOpenScannerDemo && (
            <TouchableOpacity 
              activeOpacity={0.8} 
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onOpenScannerDemo(); }}
              style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.xl, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 32, borderWidth: 1, borderColor: theme.colors.primary + '40', borderStyle: 'dashed' }}
            >
              <Sparkles size={18} color={theme.colors.primary} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: theme.colors.primary }}>Probar Flujo de Onboarding Mágico</Text>
            </TouchableOpacity>
          )}

          {/* BOLSILLOS (Resumen Simple) */}
          <View style={{ marginBottom: 32 }}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitleOrganic}>Bolsillos</Text>
            </View>
            <View style={{ gap: 12 }}>
              {(() => {
                const activePockets = (monthState?.pockets || [])
                  .filter(mp => mp.spent_month > 0)
                  .sort((a, b) => b.spent_month - a.spent_month)
                  .slice(0, 3);

                if (activePockets.length === 0) {
                  return (
                    <Text style={{ textAlign: 'center', color: theme.colors.onSurfaceVariant, fontSize: 13, padding: 20, opacity: 0.6 }}>
                      Sin movimientos este mes
                    </Text>
                  );
                }

                return activePockets.map((mp, i) => {
                  const originalPocket = pockets.find(p => p.id === mp.id);
                  let planAlloc = mp.allocated;
                  
                  if (originalPocket?.is_default_free) {
                    const monthIncome = monthState?.income_month ?? 0;
                    const othersAlloc = pockets.filter(x => !x.is_default_free).reduce((acc, x) => {
                      const m = (monthState?.pockets || []).find(p => p.id === x.id);
                      return acc + (m?.allocated ?? (x as any).allocated_budget ?? x.budget ?? 0);
                    }, 0);
                    planAlloc = Math.max(0, monthIncome - othersAlloc);
                  }

                  const remaining = originalPocket?.is_default_free ? (planAlloc - mp.spent_month) : mp.available;
                  const isOver = remaining < 0 || (planAlloc > 0 && mp.spent_month > planAlloc);
                  const catColor = getDeterministicColor(mp.name, theme.colors.pocketFlatColors as string[]);

                  return (
                    <View key={`sim-${mp.id || i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.divider }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: isOver ? theme.colors.error : catColor }} />
                        <Text style={{ ...theme.typography.bodyMedium, fontWeight: '800', color: theme.colors.onSurface }} numberOfLines={1}>{mp.name}</Text>
                      </View>
                      <Text style={{ ...theme.typography.bodyMedium, fontWeight: '900', color: isOver ? theme.colors.error : theme.colors.onSurfaceVariant }}>
                        {isOver ? 'Excedido ' : ''}{formatMoney(Math.abs(isOver ? (mp.spent_month - planAlloc) : remaining))}{!isOver ? ' disponible' : ''}
                      </Text>
                    </View>
                  );
                });
              })()}
            </View>
          </View>

          {/* RECIENTES MINI */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitleOrganic}>Recientes</Text>
            <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onViewAll?.(); }}>
              <Text style={styles.viewAllAction}>Ver todo</Text>
            </TouchableOpacity>
          </View>

          {transactions.slice(0, 3).length === 0 ? (
            <View style={{ padding: 40, alignItems: 'center', opacity: 0.3 }}>
              <History size={48} color={theme.colors.onSurfaceVariant} strokeWidth={1} />
              <Text style={{ marginTop: 12, fontWeight: '800', textAlign: 'center' }}>Sin movimientos este mes</Text>
            </View>
          ) : (
              transactions.slice(0, 3).map((tx) => {
              const catColor = getDeterministicColor(tx.category, theme.colors.pocketFlatColors as string[]);
              return (
                <TouchableOpacity key={tx.id} style={styles.txItem} activeOpacity={0.7} onPress={() => setSelectedTx(tx)}>
                  <View style={[styles.txIconBoxUI, { backgroundColor: catColor + '15' }]}>
                    <CategoryIcon iconName={tx.category === 'Ingreso' ? 'trending-up' : (pockets?.find(p => p.name === tx.category)?.icon || (tx as any).icon || 'tag')} size={20} color={catColor} />
                  </View>
                  <View style={styles.txMain}>
                    <Text style={styles.txMerchantUI} numberOfLines={1}>{tx.merchant || tx.category}</Text>
                    <Text style={styles.txDateUI}>{tx.category} • {new Date(((tx as any).date_string || tx.created_at).split('T')[0] + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</Text>
                  </View>
                  <Text style={[styles.txAmountUI, { color: tx.category === 'Ingreso' ? theme.colors.primary : theme.colors.onSurface }]}>
                    {tx.category === 'Ingreso' ? '+ ' : ''}{formatMoney(Math.abs(tx.amount))}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}

        </Animated.View>
      </ScrollView>
      )}



      <TransactionDetailModal 
        visible={!!selectedTx}
        transaction={selectedTx}
        pockets={pockets}
        onClose={() => setSelectedTx(null)}
      />

      <MonthClosureModal
        visible={showClosureModal}
        pockets={pockets}
        cycleId={unclosedPrevCycle?.id ?? ''}
        cycleName={unclosedPrevCycle?.name ?? 'Mes anterior'}
        userId={session?.user?.id ?? ''}
        onClosed={() => {
          setShowClosureModal(false);
          // Invalidate cycle cache so next fetch gets fresh data
          onRefresh?.();
        }}
      />
    </View>
  );
};
