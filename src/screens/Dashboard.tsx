import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity, Platform, ActivityIndicator, RefreshControl, SafeAreaView, Modal, DeviceEventEmitter
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowUpRight, TrendingUp, Sparkles, Tag, ShoppingBag, ShieldCheck, Zap, PlusCircle, Activity, AlertTriangle, Coins, Plus, Wallet, Target, Flame, Clock, History, LayoutGrid, ChevronRight, Pointer, Lock, ArrowRight, Play, Map, Rocket } from 'lucide-react-native';
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
import { CycleNav } from '../components/CycleNav';
import { MiniAnimatedSaveLogo } from '../components/TopBar';
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
  /** Solo __DEV__ -- ver el botón "PROBAR CONFIRMACIÓN" más abajo. */
  onDevPreviewPurchaseConfirmation?: () => void;
  onAddIncome?: () => void;
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
  isLoading = false,
  onDevPreviewPurchaseConfirmation,
  onAddIncome,
}: DashboardProps) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showWelcomeCard, setShowWelcomeCard] = useState(true);
  const [devForceWelcomeCard, setDevForceWelcomeCard] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any>(null);

  const isFocused = useIsFocused();
  const { startTour } = useTour();

  useEffect(() => {
    if (isFocused) {
      AsyncStorage.getItem('@dev_force_welcome_card').then(val => {
        if (val === 'true') {
          setDevForceWelcomeCard(true);
          AsyncStorage.removeItem('@dev_force_welcome_card');
        }
      });
    }
  }, [isFocused]);

  const TOUR_STEPS: TourStepType[] = [
    {
      name: 'bottom_add',
      title: 'El botón que lo hace todo',
      description: (
        <View style={{ gap: 10, marginTop: 4 }}>
          {/* Acción 1: Toca */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 16, padding: 12 }}>
            <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }}>
              <Pointer size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900', marginBottom: 2 }}>Toca</Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' }}>Registra un gasto manualmente</Text>
            </View>
          </View>
          {/* Acción 2: Mantén presionado */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 16, padding: 12 }}>
            <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900', marginBottom: 2 }}>Mantén presionado</Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' }}>Escanea un ticket con la IA</Text>
            </View>
          </View>
        </View>
      ),
      iconName: 'PlusCircle',
      order: 1
    },
  ];

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    const checkTour = async () => {
      if (!isDataReady || !isFocused) return;

      const demoTxs = transactions.filter(t => (t as any).metadata?.is_demo);
      const hasDemo = demoTxs?.length > 0;

      // Prioridad 1: flujo demo del Scanner (ya tiene is_demo)
      // GUARD: solo se dispara si @save_demo_in_progress === 'true', es decir,
      // cuando el Scanner demo acaba de guardar el gasto en ESTA sesión.
      // Sin este guard, cualquier transacción is_demo vieja en la DB activa
      // el tour en cada visita al Dashboard (el bug de "se activa solo").
      if (hasDemo) {
        const demoInProgress = await AsyncStorage.getItem('@save_demo_in_progress');
        if (demoInProgress !== 'true') return; // flujo demo no activo → no disparar
        const firstDemoTx = demoTxs[0];
        AsyncStorage.getItem('@save_demo_dashboard_tour_seen').then(seenId => {
          if (seenId === firstDemoTx.id) return;
          AsyncStorage.setItem('@save_demo_dashboard_tour_seen', firstDemoTx.id);
          timeout = setTimeout(() => {
            startTour([{
              name: 'bottom_pockets',
              title: 'Toca "Bolsillos"',
              description: 'Mira cómo la IA organizó tu primer gasto mágico.',
              iconName: 'Sparkles',
              order: 1,
              // Antes se cerraba con "Entendido" sin tocar la pestaña real
              // -- la gente le daba a "Entendido" y nunca llegaba a
              // Bolsillos. Ahora se obliga el toque real.
              allowTouches: true,
              hideNextButton: true,
              showArrow: true,
            }], undefined, { step: 5, total: 6 });
          }, 800);
        });
        return;
      }

      // Prioridad 2: usuario nuevo que acaba de completar el Onboarding — tour de 4 pasos
      const magicPending = await AsyncStorage.getItem('@save_magic_tour_pending');
      if (magicPending === 'true') {
        // No removemos el flag aquí para que app/index.tsx no dispare el Paywall
        // bloqueando el WelcomeModal. Se remueve al hacer click en el botón del modal.
        //
        // FIX: antes esto también marcaba tour_dashboard_done = true de una
        // vez, antes de que el usuario nuevo llegara a ver TOUR_STEPS. Como
        // el flujo mágico (demo + bolsillos) no explica el botón + ni el de
        // "Registrar gasto", esa marca prematura dejaba a TODO usuario
        // nuevo sin ver nunca esta explicación. Ya no se marca aquí --
        // Prioridad 3 se encarga sola cuando corresponda, más adelante.
        setShowWelcomeModal(true);
        return;
      }

      // Prioridad 3: usuario existente / sin onboarding reciente -- se
      // muestra UNA sola vez la explicación básica del botón + (toca vs.
      // mantén presionado). FIX: este tour (TOUR_STEPS) ya estaba escrito
      // pero nunca se llamaba desde ningún lado -- solo los usuarios que
      // acababan de terminar el onboarding veían la explicación del +.
      const dashboardTourDone = await AsyncStorage.getItem('tour_dashboard_done');
      if (!dashboardTourDone) {
        timeout = setTimeout(() => {
          startTour(TOUR_STEPS);
          AsyncStorage.setItem('tour_dashboard_done', 'true');
        }, 800);
      }
    };

    checkTour();

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [isDataReady, transactions, startTour, isFocused]);

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

  const { cycles, activeCycle, loading: cyclesLoading, refetchCycles } = useUserCycles();
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);

  useEffect(() => {
    if (activeCycle && !selectedCycleId) {
      setSelectedCycleId(activeCycle.id);
    }
  }, [activeCycle]);

  const { state: monthState, loading: monthLoading, refresh: refreshMonthState } = useCycleState(selectedCycleId || undefined);

  // Mientras se carga el ciclo recién seleccionado, seguimos mostrando los
  // últimos números buenos (atenuados) en vez de blanquear toda la pantalla.
  const lastGoodMonthStateRef = useRef<typeof monthState>(null);
  if (monthState) lastGoodMonthStateRef.current = monthState;
  const displayMonthState = monthState ?? lastGoodMonthStateRef.current;
  const isBackgroundRefreshing = monthLoading && !!displayMonthState && !monthState;

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('force_dashboard_refresh', () => {
      refetchCycles(true);
      refreshMonthState(true);
    });
    return () => sub.remove();
  }, [refetchCycles, refreshMonthState]);

  const recentTransactions = useMemo(() => {
    if (!transactions || !selectedCycleId) return [];
    return transactions.filter(tx => tx.cycle_id === selectedCycleId).slice(0, 3);
  }, [transactions, selectedCycleId]);

  const totalIncomeMonth = displayMonthState?.income_month ?? 0;
  const totalSpentMonth = displayMonthState?.spent_month ?? 0;
  const netFlowMonth = displayMonthState?.net_month ?? 0;

  const cycleDays = useMemo(() => {
    if (!displayMonthState) return { current: 1, total: 30, progress: 0 };
    const start = new Date(displayMonthState.start_date);
    start.setHours(0,0,0,0);

    let totalDays = 30;
    if (displayMonthState.end_date) {
      const end = new Date(displayMonthState.end_date);
      end.setHours(0,0,0,0);
      totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    }

    const today = new Date();
    today.setHours(0,0,0,0);

    let currentDay = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    if (currentDay < 1) currentDay = 1;
    if (!displayMonthState.end_date && currentDay > totalDays) {
       totalDays = currentDay;
    } else if (displayMonthState.end_date && currentDay > totalDays) {
       currentDay = totalDays;
    }

    return { current: currentDay, total: totalDays, progress: currentDay / totalDays };
  }, [displayMonthState]);

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
    }
  }, [isDataReady, session?.user?.id]);

  const getFallbackInsight = () => {
    // Todo viene del mismo displayMonthState — sin recalcular desde transactions.
    const meta = displayMonthState?.allocated_total ?? 0;
    const consumptionRatio = meta > 0 ? totalSpentMonth / meta : 0;

    const pocketStats = (displayMonthState?.pockets ?? [])
      .map(mp => ({ ...mp, ratio: mp.pct_used !== null ? mp.pct_used / 100 : 0 }))
      .sort((a, b) => b.ratio - a.ratio);
      
    // Buscamos alarmas reales: sobregirados (>1) o a punto de agotarse (0.8 - 0.99)
    // Ignoramos los que están exactamente en 1, porque suelen ser gastos fijos (ej. arriendo) ya pagados.
    const overdrawn = pocketStats.find(p => p.ratio > 1);
    const almostEmpty = pocketStats.find(p => p.ratio >= 0.8 && p.ratio < 1);

    if (overdrawn) {
      return `¡Ojo! Te pasaste en ${overdrawn.name} por ${formatMoney(overdrawn.spent_month - overdrawn.allocated)}. Toca aquí y revisemos cómo podemos cuadrarlo.`;
    }
    if (almostEmpty) {
      return `Pilas, ya gastaste el ${Math.round(almostEmpty.ratio * 100)}% de ${almostEmpty.name}. Toca aquí y te digo cómo no pasarnos.`;
    }
    if (consumptionRatio > 1) {
      return `¡Cuidado! Ya te gastaste más del 100% de tu plan mensual. Toca aquí para descubrir a dónde se fue la plata.`;
    }
    if (consumptionRatio >= 0.8) {
      return `Llevas gastado el ${Math.round(consumptionRatio * 100)}% de tu presupuesto. Vamos a revisar que todo esté bajo control.`;
    }
    if (totalSpentMonth === 0) return 'Aún no hay gastos este mes. ¡Toca aquí cuando empieces a gastar y yo te ayudo a cuidarlos!';
    return `Llevas ${formatMoney(totalSpentMonth)} gastados este mes. Toca aquí y te cuento curiosidades sobre tus gastos.`;
  };

  // Solo bloqueamos toda la pantalla con un spinner cuando de verdad no hay
  // nada que mostrar todavía (primera carga). Si ya mostramos el dashboard
  // una vez, un cambio de ciclo NUNCA vuelve a blanquear la pantalla —
  // ver isBackgroundRefreshing para la carga "de fondo".
  const showFullScreenLoader = !displayMonthState && (
    (!selectedCycleId && cycles?.length > 0) ||
    monthLoading ||
    (cycles?.length === 0 && cyclesLoading)
  );

  return (
    <View style={styles.container}>
      {showFullScreenLoader ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={theme.colors.primary} progressViewOffset={Math.max(insets.top, 16) + 104} />}
          keyboardShouldPersistTaps="handled"
        >
          <View>

            {__DEV__ && onDevPreviewPurchaseConfirmation && (
              <TouchableOpacity onPress={onDevPreviewPurchaseConfirmation} style={{ alignSelf: 'flex-end', marginBottom: 8, opacity: 0.5 }}>
                <Text style={{ fontSize: 10, fontFamily: theme.fonts.headline, fontWeight: '800', color: theme.colors.warning }}>PROBAR CONFIRMACIÓN</Text>
              </TouchableOpacity>
            )}

            {__DEV__ && (
              <TouchableOpacity
                onPress={async () => {
                  // Pone el flag de flujo activo ANTES de ir al scanner,
                  // para que Dashboard sepa que debe disparar el tour al volver.
                  await Promise.all([
                    AsyncStorage.setItem('@save_demo_in_progress', 'true'),
                    AsyncStorage.removeItem('@save_demo_dashboard_tour_seen'),
                    AsyncStorage.removeItem('@save_demo_tour_triggered_id_v3'),
                  ]);
                  if (onOpenScannerDemo) onOpenScannerDemo();
                }}
                style={{ alignSelf: 'flex-end', marginBottom: 8, opacity: 0.5 }}
              >
                <Text style={{ fontSize: 10, fontFamily: theme.fonts.headline, fontWeight: '800', color: theme.colors.primary }}>▶ TUTORIAL</Text>
              </TouchableOpacity>
            )}

            {/* WELCOME CARD FOR NEW USERS */}
            {(devForceWelcomeCard || (showWelcomeCard && transactions.filter(t => !(t as any).metadata?.is_demo).length === 0)) && (
              <View style={{ backgroundColor: theme.colors.surface, borderRadius: 32, padding: 20, paddingVertical: 28, marginBottom: 24, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.divider, ...theme.shadows.sm }}>
                <Text style={{ fontSize: 24, fontWeight: '900', color: theme.colors.onSurface, marginBottom: 6, textAlign: 'center', letterSpacing: -0.5 }}>¡Tus bolsillos están listos!</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.onSurfaceVariant, marginBottom: 24, textAlign: 'center' }}>Completa estos pasos para dominar tus finanzas.</Text>
                
                {/* Paso 1 */}
                <View style={{ alignItems: 'center', marginBottom: 6 }}>
                  <View style={{ backgroundColor: (theme.colors as any).pastel.teal + '20', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, marginBottom: 12 }}>
                    <Text style={{ fontSize: 10, fontWeight: '900', color: (theme.colors as any).pastel.teal, letterSpacing: 1 }}>PASO 1</Text>
                  </View>
                  <View style={{ width: 64, height: 64, borderRadius: 24, backgroundColor: (theme.colors as any).pastel.teal, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                    <Plus size={28} color="#FFF" />
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.onSurface, marginBottom: 12 }}>Ingresa tu primer sueldo</Text>
                  
                  {/* Using the new onAddIncome prop */}
                  <TouchableOpacity 
                    activeOpacity={0.8}
                    onPress={() => onAddIncome && onAddIncome()}
                    style={{ backgroundColor: (theme.colors as any).pastel.teal, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 16 }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFF' }}>Hacerlo ahora</Text>
                  </TouchableOpacity>
                </View>

                {/* Line 1 */}
                <View style={{ width: 1.5, height: 18, backgroundColor: theme.colors.divider, marginVertical: 8 }} />

                {/* Paso 2 */}
                <View style={{ alignItems: 'center', marginBottom: 6 }}>
                  <View style={{ backgroundColor: theme.colors.surfaceContainerHighest, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, marginBottom: 12 }}>
                    <Text style={{ fontSize: 10, fontWeight: '900', color: theme.colors.onSurfaceVariant, letterSpacing: 1 }}>PASO 2</Text>
                  </View>
                  <View style={{ width: 64, height: 64, borderRadius: 24, backgroundColor: theme.colors.surfaceContainerHighest, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                    <Coins size={28} color={theme.colors.onSurfaceVariant} strokeWidth={2} />
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.onSurfaceVariant }}>Se distribuye solo</Text>
                </View>

                {/* Line 2 */}
                <View style={{ width: 1.5, height: 18, backgroundColor: theme.colors.divider, marginVertical: 8 }} />

                {/* Paso 3 */}
                <View style={{ alignItems: 'center', marginBottom: 24 }}>
                  <View style={{ backgroundColor: theme.colors.surfaceContainerHighest, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, marginBottom: 12 }}>
                    <Text style={{ fontSize: 10, fontWeight: '900', color: theme.colors.onSurfaceVariant, letterSpacing: 1 }}>PASO 3</Text>
                  </View>
                  <View style={{ width: 64, height: 64, borderRadius: 24, backgroundColor: theme.colors.surfaceContainerHighest, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                    <Activity size={28} color={theme.colors.onSurfaceVariant} strokeWidth={2} />
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.onSurfaceVariant }}>Empieza a gastar</Text>
                </View>

                <TouchableOpacity onPress={() => setShowWelcomeCard(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: (theme.colors as any).pastel.teal, textDecorationLine: 'underline' }}>Omitir por ahora</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* HEADER PREMIUM — BALANCE & BUDGET HEALTH */}
            <View style={[styles.headerSection, { paddingTop: 0 }]}>
              <CycleNav
                cycles={cycles}
                activeCycleId={selectedCycleId}
                onChange={setSelectedCycleId}
              />

            <View style={{ marginBottom: 20, marginTop: 12, opacity: isBackgroundRefreshing ? 0.5 : 1 }}>
              <View style={{ flexDirection: 'column', gap: 6 }}>
                <Text style={{ ...theme.typography.label, color: theme.colors.onSurfaceVariant, opacity: 0.8, letterSpacing: 1 }}>
                  DISPONIBLE DEL MES
                </Text>
                <Text style={{ ...theme.typography.display, color: netFlowMonth < 0 ? theme.colors.error : theme.colors.onSurface, lineHeight: 48 }} numberOfLines={1} adjustsFontSizeToFit>
                  {formatMoney(netFlowMonth)}
                </Text>
              </View>
            </View>

            {/* BUDGET PROGRESS BAR — ELEGANT & FUNCTIONAL */}
            <View style={{ backgroundColor: theme.colors.surface, padding: 20, borderRadius: 28, borderWidth: 1, borderColor: theme.colors.divider, opacity: isBackgroundRefreshing ? 0.5 : 1, ...theme.shadows.sm }}>
              {isBackgroundRefreshing && (
                <ActivityIndicator
                  size="small"
                  color={theme.colors.primary}
                  style={{ position: 'absolute', top: 16, right: 16, zIndex: 1 }}
                />
              )}
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
                   {aiInsight ? (
                     <Text style={{ fontSize: 10, fontWeight: '900', color: theme.colors.primary, letterSpacing: 1 }}>
                       NUEVO INSIGHT
                     </Text>
                   ) : (
                     <Text style={{ fontSize: 10, fontWeight: '900', color: theme.colors.primary, letterSpacing: 1 }}>CHAT IA</Text>
                   )}
                 </View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.onSurface, lineHeight: 18 }}>
                  {aiInsight ? `${aiInsight.title}: ${aiInsight.body}` : getFallbackInsight()}
                </Text>
              </View>
              <ChevronRight size={18} color={theme.colors.onSurfaceVariant} opacity={0.5} />
            </TouchableOpacity>
          )}

          {/* QUICK ADD GIGANTE */}
          <View style={{ marginBottom: 32 }}>
            <TourStep name="dashboard_quick_add">
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onOpenScanner();
                }}
                style={{ backgroundColor: theme.colors.primary, borderRadius: theme.radius.xl, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, ...theme.shadows.md }}
              >
                <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: 10, borderRadius: theme.radius.full }}>
                  <Plus size={24} color={theme.colors.onPrimary} />
                </View>
                <Text style={{ ...theme.typography.h3, color: theme.colors.onPrimary }}>Registrar Gasto</Text>
              </TouchableOpacity>
            </TourStep>
          </View>

          {/* BOLSILLOS (Resumen Simple) */}
          <View style={{ marginBottom: 32, opacity: isBackgroundRefreshing ? 0.5 : 1 }}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitleOrganic}>Bolsillos</Text>
            </View>
            <View style={{ gap: 12 }}>
              {(() => {
                const activePockets = (displayMonthState?.pockets || [])
                  .filter(mp => mp.spent_month > 0)
                  .sort((a, b) => b.spent_month - a.spent_month)
                  .slice(0, 3);

                if (!activePockets || activePockets.length === 0) {
                  return (
                    <Text style={{ textAlign: 'center', color: theme.colors.onSurfaceVariant, fontSize: 13, padding: 20, opacity: 0.6 }}>
                      Sin movimientos este mes
                    </Text>
                  );
                }

                return activePockets.map((mp, i) => {
                  const originalPocket = pockets.find(p => p.id === mp.id);
                  let planAlloc = mp.allocated;

                  const remaining = mp.available;
                  const isOver = remaining < 0 || (planAlloc > 0 && mp.spent_month > planAlloc);
                  const catColor = getDeterministicColor(mp.name || '', theme.colors.pocketFlatColors as string[]);

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

          {(!recentTransactions || recentTransactions.length === 0) ? (
            <View style={{ padding: 40, alignItems: 'center', opacity: 0.3 }}>
              <History size={48} color={theme.colors.onSurfaceVariant} strokeWidth={1} />
              <Text style={{ marginTop: 12, fontWeight: '800', textAlign: 'center' }}>Sin movimientos este mes</Text>
            </View>
          ) : (
              recentTransactions.map((tx) => {
              const catColor = getDeterministicColor(tx.category || '', theme.colors.pocketFlatColors as string[]);
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

          </View>
        </ScrollView>
        )}

      <TransactionDetailModal
        visible={!!selectedTx}
        transaction={selectedTx}
        pockets={pockets}
        onClose={() => setSelectedTx(null)}
      />

      <Modal visible={showWelcomeModal} animationType="fade" transparent>
        <BlurView intensity={90} tint="dark" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          
          <View style={{ backgroundColor: theme.colors.surface, borderRadius: 40, width: '100%', padding: 40, alignItems: 'center', ...theme.shadows.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
            
            {/* Tutorial Play Icon (YouTube style) */}
            <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: theme.colors.primary + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
              <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', ...theme.shadows.lg }}>
                <Play size={32} color="#FFF" fill="#FFF" style={{ marginLeft: 4 }} />
              </View>
            </View>

            {/* SAVE Logo Matching Header */}
            <View style={{ transform: [{ scale: 1.2 }], marginBottom: 16 }}>
              <MiniAnimatedSaveLogo />
            </View>

            <Text style={{ fontFamily: theme.fonts.body, fontSize: 19, color: theme.colors.onSurface, textAlign: 'center', marginBottom: 40, lineHeight: 28 }}>
              Acompáñanos por un <Text style={{ fontWeight: '900', color: theme.colors.primary, textDecorationLine: 'underline' }}>tutorial</Text> por Save, y ya estarás listo para controlar tus finanzas.
            </Text>
            
            <TouchableOpacity
              activeOpacity={0.8}
              style={{ width: '100%', backgroundColor: theme.colors.primary, paddingVertical: 22, borderRadius: 28, alignItems: 'center', ...theme.shadows.lg }}
              onPress={async () => {
                // IMPORTANT: set demo_in_progress FIRST, then remove magic_tour_pending.
                // The tourFlowPending poller in index.tsx runs every 1500ms and reads
                // both flags. If we removed magic_tour_pending first, the poller could
                // fire between the two ops and see both as null → tourFlowPending=false
                // → paywall appears mid-tutorial. By setting demo_in_progress first,
                // the poller always sees at least one flag as 'true'.
                await AsyncStorage.setItem('@save_demo_in_progress', 'true');
                await AsyncStorage.removeItem('@save_magic_tour_pending');
                setShowWelcomeModal(false);
                if (onOpenScannerDemo) {
                  setTimeout(() => {
                    onOpenScannerDemo();
                  }, 300);
                }
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Text style={{ fontFamily: theme.fonts.headline, color: '#FFFFFF', fontSize: 20, fontWeight: '900', letterSpacing: 0.5 }}>Iniciar tutorial</Text>
                <ArrowRight size={22} color="#FFFFFF" strokeWidth={3} />
              </View>
            </TouchableOpacity>
          </View>
        </BlurView>
      </Modal>
    </View>
  );
};
