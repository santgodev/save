import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Animated, Dimensions, TouchableOpacity, Platform, ActivityIndicator
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

const { width } = Dimensions.get('window');

interface DashboardProps {
  transactions: Transaction[];
  pockets: any[];
  userProfile?: { full_name: string; streak?: number };
  onAddTransaction: () => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export const Dashboard = ({ 
  transactions, 
  pockets, 
  userProfile, 
  onAddTransaction,
  onRefresh,
  isLoading = false 
}: DashboardProps) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scrollContent: { paddingHorizontal: 24, paddingTop: Math.max(insets.top, 16) + 120, paddingBottom: 120 },
    
    // --- BALANCE CARD ---
    balanceCard: { 
      padding: 28, 
      borderRadius: 36, 
      backgroundColor: theme.colors.surface, 
      borderWidth: 1, 
      borderColor: theme.colors.outlineVariant, 
      overflow: 'hidden',
      ...theme.shadows.premium 
    },
    balanceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    balanceLabel: { fontSize: 13, fontWeight: '900', color: theme.colors.onSurfaceVariant, letterSpacing: 1, textTransform: 'uppercase' },
    balanceValue: { fontSize: 48, fontWeight: '900', color: theme.colors.onSurface, letterSpacing: -2, marginVertical: 6 },
    
    streakBadge: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 5, 
      paddingHorizontal: 12, 
      paddingVertical: 6, 
      borderRadius: 14, 
      backgroundColor: theme.colors.primaryContainer + '50',
      borderWidth: 1,
      borderColor: theme.colors.primary + '20'
    },
    streakText: { fontSize: 13, fontWeight: '900', color: theme.colors.primary },

    statsRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
    statItem: { 
      flex: 1, 
      padding: 16, 
      borderRadius: 24, 
      backgroundColor: theme.colors.surfaceContainerLow, 
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 10,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant
    },
    statIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    statLabel: { fontSize: 11, fontWeight: '900', color: theme.colors.onSurfaceVariant, textTransform: 'uppercase' },
    statValue: { fontSize: 16, fontWeight: '900', color: theme.colors.onSurface, marginTop: 2 },

    // --- AI ANALYSIS CARD ---
    aiAnalysisCard: { 
      marginTop: 24, 
      borderRadius: 32, 
      overflow: 'hidden', 
      ...theme.shadows.premium,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant
    },
    aiGradient: { padding: 24 },
    aiHeader: { flexDirection: 'row', justify: 'space-between', alignItems: 'center', marginBottom: 16 },
    aiTitle: { fontSize: 15, fontWeight: '900', color: theme.colors.primary, letterSpacing: -0.3 },
    aiBadge: { 
      backgroundColor: theme.colors.primaryContainer, 
      paddingHorizontal: 10, 
      paddingVertical: 4, 
      borderRadius: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4
    },
    aiBadgeText: { fontSize: 10, fontWeight: '900', color: theme.colors.primary, textTransform: 'uppercase' },
    aiAdvice: { fontSize: 14, color: theme.colors.onSurface, lineHeight: 22, fontWeight: '600' },
    aiFooter: { marginTop: 16, flexDirection: 'row', justify: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: theme.colors.outlineVariant, paddingTop: 16 },
    aiNextBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    aiNextText: { fontSize: 13, fontWeight: '800', color: theme.colors.primary },

    // --- SECTION TITLES ---
    sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 32, marginBottom: 16 },
    sectionTitle: { fontSize: 18, fontWeight: '900', color: theme.colors.onSurface, letterSpacing: -0.5 },
    seeAll: { fontSize: 13, fontWeight: '800', color: theme.colors.primary },

    // --- TRANSACTION ITEM ---
    txItem: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      padding: 16, 
      backgroundColor: theme.colors.surface, 
      borderRadius: 28, 
      marginBottom: 12, 
      borderWidth: 1, 
      borderColor: theme.colors.outlineVariant,
      ...theme.shadows.soft 
    },
    txIconArea: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceContainerLow },
    txMain: { flex: 1, marginLeft: 16 },
    txMerchant: { fontSize: 16, fontWeight: '900', color: theme.colors.onSurface, letterSpacing: -0.3 },
    txSub: { fontSize: 11, fontWeight: '800', color: theme.colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
    txAmt: { fontSize: 16, fontWeight: '900', letterSpacing: -0.5 },

    // --- QUICK ACTION FAB ---
    fab: { 
      position: 'absolute', 
      bottom: normalize(150), 
      right: 24, 
      width: 68, 
      height: 68, 
      borderRadius: 34, 
      justify_content: 'center', 
      align_items: 'center', 
      ...theme.shadows.premium 
    },
    fabGradient: { width: '100%', height: '100%', borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  }), [theme]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true })
    ]).start();
  }, []);

  // Calculate stats based on transactions
  const totalBalance = pockets.reduce((acc, p) => acc + (p.budget || 0), 0);
  const monthlyExpenses = transactions
    .filter(tx => tx.category !== 'Ingreso')
    .reduce((acc, tx) => acc + Math.abs(tx.amount), 0);
  const monthlySavings = transactions
    .filter(tx => tx.category === 'Saving' || tx.category === 'Ahorro' || tx.category === 'Ahorros')
    .reduce((acc, tx) => acc + Math.abs(tx.amount), 0);

  const formatCurrency = (amt: number) => `$ ${amt.toLocaleString('es-CO')}`;

  const renderRecentTransactions = () => {
    if (transactions.length === 0) {
      return (
        <View style={{ padding: 40, alignItems: 'center', opacity: 0.3 }}>
          <History size={48} color={theme.colors.onSurfaceVariant} strokeWidth={1} />
          <Text style={{ marginTop: 12, fontWeight: '800', textAlign: 'center' }}>No hay movimientos recientes</Text>
        </View>
      );
    }

    return transactions.slice(0, 5).map((tx) => (
      <TouchableOpacity key={tx.id} style={styles.txItem} activeOpacity={0.7}>
        <View style={styles.txIconArea}>
          <CategoryIcon iconName={tx.category === 'Ingreso' ? 'trending-up' : tx.icon || 'tag'} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.txMain}>
          <Text style={styles.txMerchant} numberOfLines={1}>{tx.merchant}</Text>
          <Text style={styles.txSub}>{tx.category} • {new Date(tx.date_string || tx.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</Text>
        </View>
        <Text style={[styles.txAmt, { color: tx.category === 'Ingreso' ? theme.colors.success : theme.colors.onSurface }]}>
          {tx.category === 'Ingreso' ? '+' : '-'} {formatCurrency(Math.abs(tx.amount))}
        </Text>
      </TouchableOpacity>
    ));
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scrollContent}
        onScrollEndDrag={onRefresh}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          
          {/* Main Balance Header */}
          <View style={styles.balanceCard}>
            <View style={styles.balanceHeader}>
              <Text style={styles.balanceLabel}>Capital Resguardado</Text>
              <View style={styles.streakBadge}>
                <Flame size={16} color={theme.colors.primary} fill={theme.colors.primary} />
                <Text style={styles.streakText}>{userProfile?.streak || 0} DÍAS</Text>
              </View>
            </View>
            <Text style={styles.balanceValue}>{formatCurrency(totalBalance)}</Text>
            
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <View style={[styles.statIcon, { backgroundColor: theme.colors.error + '15' }]}>
                  <ArrowDownLeft size={18} color={theme.colors.error} />
                </View>
                <View>
                  <Text style={styles.statLabel}>Egresos</Text>
                  <Text style={styles.statValue}>{formatCurrency(monthlyExpenses)}</Text>
                </View>
              </View>
              <View style={styles.statItem}>
                <View style={[styles.statIcon, { backgroundColor: theme.colors.success + '15' }]}>
                  <ArrowUpRight size={18} color={theme.colors.success} />
                </View>
                <View>
                  <Text style={styles.statLabel}>Ahorro</Text>
                  <Text style={styles.statValue}>{formatCurrency(monthlySavings || 0)}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* AI Advisor Preview */}
          <View style={styles.aiAnalysisCard}>
            <View style={styles.aiGradient}>
              <View style={styles.aiHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Sparkles size={18} color={theme.colors.primary} fill={theme.colors.primary} />
                  <Text style={styles.aiTitle}>Asistente Patrimonial</Text>
                </View>
                <View style={styles.aiBadge}>
                  <Text style={styles.aiBadgeText}>Optimizado</Text>
                </View>
              </View>
              
              <Text style={styles.aiAdvice}>
                Tu patrón de gastos en <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Alimentación</Text> ha bajado un 12% esta semana. 
                Si mantienes este ritmo, podrías blindar tu fondo de emergencia 2 meses antes de lo previsto.
              </Text>

              <View style={styles.aiFooter}>
                 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Info size={14} color={theme.colors.onSurfaceVariant} />
                    <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant, fontWeight: '800' }}>BASADO EN TUS REGLAS</Text>
                 </View>
                 <TouchableOpacity style={styles.aiNextBtn}>
                    <Text style={styles.aiNextText}>Ver Análisis</Text>
                    <ChevronRight size={16} color={theme.colors.primary} />
                 </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Recent Activity Header */}
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Movimientos de Capital</Text>
            <TouchableOpacity><Text style={styles.seeAll}>VER TODO</Text></TouchableOpacity>
          </View>

          {/* List Content */}
          <View>
            {isLoading ? (
              <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 24 }} />
            ) : (
              renderRecentTransactions()
            )}
          </View>

        </Animated.View>
      </ScrollView>

      {/* FAB - Adjusted for BottomNav visibility */}
      <TouchableOpacity 
        style={styles.fab} 
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          onAddTransaction();
        }}
        activeOpacity={0.9}
      >
        <LinearGradient colors={theme.colors.brandGradient as any} style={styles.fabGradient} start={{x:0, y:0}} end={{x:1, y:1}}>
          <Plus size={32} color="#FFF" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
};
