import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Animated, StyleSheet, ScrollView, Dimensions, TextInput
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { PieChart, TrendingUp, Wallet, ArrowUpRight, Plus, Target, ChevronRight } from 'lucide-react-native';
import { theme, normalize } from '../theme/theme';
import { commonStyles } from '../theme/styles';
import { CategoryIcon } from '../components/CategoryIcon';
import { AnimatedProgressBar } from '../components/AnimatedProgressBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

export const Pockets = ({ pockets, transactions, onBudgetUpdate }: { pockets: any[], transactions: any[], onBudgetUpdate?: (id: string, amount: number) => void }) => {
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const [activePocket, setActivePocket] = useState<string | null>(null);

  const getPocketSpending = (category: string) => {
    return transactions
      .filter(tx => tx.category === category && tx.amount < 0)
      .reduce((acc, tx) => acc + Math.abs(tx.amount), 0);
  };

  const totalBudget = pockets.reduce((acc, p) => acc + (p.budget || 0), 0);
  const totalSpent = pockets.reduce((acc, p) => acc + getPocketSpending(p.category), 0);

  const POCKET_COLORS: Record<string, string[]> = {
    'Comida': ['#FFB300', '#FFA000'], // Solar Honey
    'Transporte': ['#935848', '#734439'], // Earth Clay
    'Ocio': ['#A2A182', '#868565'], // Muted Moss
    'Otros': ['#D4AF37', '#B8972E'], // Aged Gold
    'default': ['#FFB300', '#A06E5A']
  };

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        contentContainerStyle={[styles.scrollPadding, { paddingTop: Math.max(insets.top, 16) + normalize(100) }]}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      >
        <View style={styles.topStats}>
           <Text style={styles.topLabel}>PRESUPUESTO TOTAL</Text>
           <Text style={styles.topAmount}>$ {totalBudget.toLocaleString('es-CO')}</Text>
           <View style={styles.globalProgressWrapper}>
              <AnimatedProgressBar 
                percent={Math.min((totalSpent / (totalBudget || 1)) * 100, 100)} 
                color={theme.colors.primary} 
                bgColor="rgba(0,0,0,0.05)" 
              />
              <View style={styles.progressLabelRow}>
                 <Text style={styles.progressText}>$ {totalSpent.toLocaleString('es-CO')} usados</Text>
                 <Text style={styles.progressPct}>{Math.round((totalSpent / (totalBudget || 1)) * 100)}%</Text>
              </View>
           </View>
        </View>

        <View style={styles.gridHeader}>
           <Text style={styles.gridTitle}>Bolsillos</Text>
           <TouchableOpacity style={styles.addBtn}>
              <Plus size={normalize(20)} color="#FFF" />
           </TouchableOpacity>
        </View>

        <View style={styles.pocketGrid}>
           {pockets.map((pocket, i) => {
             const spent = getPocketSpending(pocket.category);
             const remaining = Math.max((pocket.budget || 0) - spent, 0);
             const colors = POCKET_COLORS[pocket.category] || POCKET_COLORS.default;
             
             return (
               <TouchableOpacity 
                 key={pocket.id || i} 
                 style={styles.pocketCardContainer}
                 activeOpacity={0.9}
                 onPress={() => {
                   Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                   setActivePocket(activePocket === pocket.id ? null : pocket.id);
                 }}
               >
                 <LinearGradient colors={colors as any} style={styles.pocketCard} start={{x:0, y:0}} end={{x:1, y:1}}>
                    <View style={styles.pocketIconBox}>
                       <CategoryIcon iconName={pocket.icon} size={normalize(18)} color="#FFF" />
                    </View>
                    <Text style={styles.pocketName}>{pocket.name}</Text>
                    <Text style={styles.pocketBudgetLabel}>Mensual</Text>
                    <Text style={styles.pocketBudgetValue}>$ {(pocket.budget || 0).toLocaleString('es-CO')}</Text>
                    
                    <BlurView intensity={20} tint="light" style={styles.pocketOverlayStatus}>
                       <Text style={styles.statusText} numberOfLines={1}>{remaining > 0 ? `$${remaining.toLocaleString('es-CO')}` : 'Full'}</Text>
                       <ChevronRight size={12} color="#FFF" />
                    </BlurView>
                 </LinearGradient>
               </TouchableOpacity>
             );
           })}
        </View>

        <View style={styles.insightBoxOrganicGold}>
           <Text style={styles.insightTitle}>💡 ANALÍTICA DE PREVISIÓN</Text>
           <Text style={styles.insightBody}>Tus bolsillos están sincronizados con tu flujo de ingresos.</Text>
        </View>
        <View style={{ height: normalize(180) }} />
      </Animated.ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollPadding: { paddingHorizontal: normalize(24), paddingBottom: 120 },
  topStats: { marginBottom: normalize(32) },
  topLabel: { fontSize: normalize(9), fontWeight: '900', color: theme.colors.primary, letterSpacing: 1.5, opacity: 0.8 },
  topAmount: { fontSize: normalize(44), fontWeight: '900', color: theme.colors.onSurface, letterSpacing: -2, marginVertical: normalize(8) },
  globalProgressWrapper: { marginTop: normalize(16) },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  progressText: { fontSize: normalize(13), color: 'rgba(0,0,0,0.3)', fontWeight: '600' },
  progressPct: { fontSize: normalize(13), color: theme.colors.primary, fontWeight: '900' },

  gridHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: normalize(20) },
  gridTitle: { fontSize: normalize(22), fontWeight: '900', color: theme.colors.onSurface },
  addBtn: { backgroundColor: theme.colors.primary, width: normalize(44), height: normalize(44), borderRadius: 22, alignItems: 'center', justifyContent: 'center', ...theme.shadows.premium },

  pocketGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: normalize(16) },
  pocketCardContainer: { width: (width - normalize(48) - normalize(16)) / 2 },
  pocketCard: { borderRadius: normalize(28), padding: normalize(18), height: normalize(185), justifyContent: 'flex-start', ...theme.shadows.soft },
  pocketIconBox: { width: normalize(40), height: normalize(40), borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: normalize(16) },
  pocketName: { fontSize: normalize(16), fontWeight: '900', color: '#FFF' },
  pocketBudgetLabel: { fontSize: normalize(8), fontWeight: '800', color: 'rgba(255,255,255,0.6)', marginTop: normalize(20), letterSpacing: 1, textTransform: 'uppercase' },
  pocketBudgetValue: { fontSize: normalize(14), fontWeight: '800', color: '#FFF' },
  pocketOverlayStatus: { position: 'absolute', bottom: 10, left: 10, right: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusText: { fontSize: normalize(9), color: '#FFF', fontWeight: '900' },

  insightBoxOrganicGold: { marginTop: normalize(32), backgroundColor: '#FFF', padding: normalize(24), borderRadius: normalize(32), borderWidth: 1, borderColor: theme.colors.outlineVariant, ...theme.shadows.soft },
  insightTitle: { fontSize: normalize(9), fontWeight: '900', color: theme.colors.primary, marginBottom: 8, letterSpacing: 1 },
  insightBody: { fontSize: normalize(14), color: theme.colors.onSurfaceVariant, lineHeight: normalize(22) }
});
