import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Animated, Dimensions, TouchableOpacity, Platform, ActivityIndicator, RefreshControl
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  Plus, ArrowUpRight, ArrowDownLeft, Wallet, 
  Target, TrendingUp, Sparkles, AlertCircle, ChevronRight,
  Flame, Clock, History, LayoutGrid, Info
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { normalize } from '../theme/theme';
import { CategoryIcon } from '../components/CategoryIcon';
import { Transaction } from '../types';
import { supabase } from '../lib/supabase';
import { useMonthlyState } from '../lib/useMonthlyState';

const { width } = Dimensions.get('window');

interface DashboardProps {
  transactions: Transaction[];
  pockets: any[];
  session: any;
  isDataReady: boolean;
  onOpenScanner: () => void;
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
  onViewAll,
  onOpenChat,
  userProfile, 
  onRefresh,
  isLoading = false 
}: DashboardProps) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [greeting, setGreeting] = useState('Hola');

  useEffect(() => {
    const hours = new Date().getHours();
    if (hours < 12) setGreeting('¡Buenos días! ☀️');
    else if (hours < 18) setGreeting('¡Buenas tardes! ☕');
    else setGreeting('¡Buenas noches! 🌙');

    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
  }, []);

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scrollContent: { paddingHorizontal: 24, paddingTop: Math.max(insets.top, 16) + 110, paddingBottom: 150 },
    
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

  const formatCurrency = (amt: number) => `$ ${Math.round(amt).toLocaleString('es-CO')}`;

  // Fuente ÚNICA de verdad — RPC get_monthly_state. Mismos números que
  // ven Pockets y el chat-advisor.
  const { state: monthState } = useMonthlyState();

  // Mes en curso. Si no cargó todavía, fallback a 0 (la UI muestra 0 en
  // lugar de números ficticios). Cuando state.income_month/spent_month
  // entran, todo se reactualiza con el dato real.
  const totalIncomeMonth = monthState?.income_month ?? 0;
  const totalSpentMonth = monthState?.spent_month ?? 0;
  const netFlowMonth = monthState?.net_month ?? 0;

  // FUENTE DE UNICIDAD — El usuario prefiere ver el Flujo del Mes (Ingresos - Gastos)
  // como el número principal, igual que en la pantalla de Gastos.
  const mainDisplayAmount = monthState?.net_month ?? 0;
  const saldoDisponible = monthState?.available_total ?? 0;

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
    // Todo viene del mismo monthState — sin recalcular desde transactions.
    const meta = monthState?.allocated_total ?? 0;
    const consumptionRatio = meta > 0 ? totalSpentMonth / meta : 0;

    const pocketStats = (monthState?.pockets ?? [])
      .map(mp => ({ ...mp, ratio: mp.pct_used !== null ? mp.pct_used / 100 : 0 }))
      .sort((a, b) => b.ratio - a.ratio);
    const mostCritical = pocketStats[0];

    if (mostCritical && mostCritical.ratio >= 1) {
      return `Presupuesto agotado: en ${mostCritical.name} excediste el plan por ${formatCurrency(mostCritical.spent_month - mostCritical.allocated)}.`;
    }
    if (consumptionRatio >= 1) {
      return `Alerta: gastaste el 100% del plan mensual (${formatCurrency(totalSpentMonth)}).`;
    }
    if (consumptionRatio >= 0.8) {
      return `Atención: llevas ${Math.round(consumptionRatio * 100)}% del plan del mes.`;
    }
    if (totalSpentMonth === 0) return 'Sin actividad este mes. Todo el plan está disponible.';
    return `Llevas ${formatCurrency(totalSpentMonth)} gastados este mes. Toca para ver el detalle.`;
  };

  const fmt = (n: number) => n.toLocaleString('es-CO');

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          
          {/* HEADER SIMPLE Y DIRECTO */}
          <View style={[styles.headerSection, { alignItems: 'center', paddingTop: 10 }]}>
            <Text style={{ ...theme.typography.bodyLarge, color: theme.colors.onSurfaceVariant, fontWeight: '600', marginBottom: 12 }}>
              {greeting}, {userProfile?.full_name?.split(' ')[0] || 'Usuario'}
            </Text>
            <Text style={{ fontSize: 13, color: theme.colors.primary, fontWeight: '800', letterSpacing: 1, marginBottom: 8, opacity: 0.8 }}>
              RESUMEN DE FLUJO
            </Text>
            <Text style={{ fontSize: 44, fontWeight: '900', color: theme.colors.onSurface, letterSpacing: -1 }}>
              {formatCurrency(mainDisplayAmount)}
            </Text>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <View style={{ backgroundColor: theme.colors.primary + '15', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.primary + '30' }}>
                <Text style={{ fontSize: 9, fontWeight: '900', color: theme.colors.primary, textTransform: 'uppercase', marginBottom: 2 }}>Ingresos Abril</Text>
                <Text style={{ fontSize: 13, fontWeight: '900', color: theme.colors.primary }}>$ {totalIncomeMonth.toLocaleString('es-CO')}</Text>
              </View>
              <View style={{ backgroundColor: theme.colors.error + '15', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.error + '30' }}>
                <Text style={{ fontSize: 9, fontWeight: '900', color: theme.colors.error, textTransform: 'uppercase', marginBottom: 2 }}>Gastos Abril</Text>
                <Text style={{ fontSize: 13, fontWeight: '900', color: theme.colors.error }}>$ {totalSpentMonth.toLocaleString('es-CO')}</Text>
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
                marginBottom: 32, 
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

          {/* QUICK ADD GIGANTE (EL REY) */}
          <TouchableOpacity 
            activeOpacity={0.8} 
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onOpenScanner(); }}
            style={{ backgroundColor: theme.colors.primary, borderRadius: theme.radius.xl, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 40, ...theme.shadows.md }}
          >
            <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: 10, borderRadius: theme.radius.full }}>
              <Plus size={24} color="#FFF" />
            </View>
            <Text style={{ ...theme.typography.h3, color: '#FFF' }}>Registrar Gasto</Text>
          </TouchableOpacity>

          {/* BOLSILLOS (Resumen Simple) */}
          <View style={{ marginBottom: 32 }}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitleOrganic}>Bolsillos</Text>
            </View>
            <View style={{ gap: 12 }}>
              {(() => {
                // Top 3 bolsillos con movimiento del mes — del RPC,
                // mismos números que ve Pockets y el chat.
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
                  const remaining = mp.available;        // disponible directo, sin doble resta
                  const isOver = remaining < 0 || (mp.allocated > 0 && mp.spent_month > mp.allocated);
                  const catColor = (theme.colors as any).chartColors?.[i % 5] || theme.colors.primary;

                  return (
                    <View key={`sim-${mp.id || i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.divider }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: isOver ? theme.colors.error : catColor }} />
                        <Text style={{ ...theme.typography.bodyMedium, fontWeight: '800', color: theme.colors.onSurface }} numberOfLines={1}>{mp.name}</Text>
                      </View>
                      <Text style={{ ...theme.typography.bodyMedium, fontWeight: '900', color: isOver ? theme.colors.error : theme.colors.onSurfaceVariant }}>
                        {isOver ? 'Exceso ' : ''} $ {Math.abs(isOver ? (mp.spent_month - mp.allocated) : remaining).toLocaleString('es-CO')} {!isOver ? 'disponibles' : ''}
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
              <Text style={{ marginTop: 12, fontWeight: '800', textAlign: 'center' }}>No hay movimientos recientes</Text>
            </View>
          ) : (
            transactions.slice(0, 3).map((tx) => {
              const catColor = (theme.colors.categoryColors[tx.category] || theme.colors.categoryColors['Otros'])[0];
              return (
                <TouchableOpacity key={tx.id} style={styles.txItem} activeOpacity={0.7}>
                  <View style={[styles.txIconBoxUI, { backgroundColor: catColor + '15' }]}>
                    <CategoryIcon iconName={tx.category === 'Ingreso' ? 'trending-up' : (tx as any).icon || 'tag'} size={20} color={catColor} />
                  </View>
                  <View style={styles.txMain}>
                    <Text style={styles.txMerchantUI} numberOfLines={1}>{tx.merchant}</Text>
                    <Text style={styles.txDateUI}>{tx.category} • {new Date((tx as any).date_string || tx.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</Text>
                  </View>
                  <Text style={[styles.txAmountUI, { color: tx.category === 'Ingreso' ? theme.colors.success : theme.colors.onSurface }]}>
                    {formatCurrency(Math.abs(tx.amount))}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}

        </Animated.View>
      </ScrollView>
    </View>
  );
};
