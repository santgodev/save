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
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');

interface DashboardProps {
  transactions: Transaction[];
  pockets: any[];
  session: any;
  isDataReady: boolean;
  onOpenScanner: () => void;
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
  userProfile, 
  onRefresh,
  isLoading = false 
}: DashboardProps) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  
  const [healthData, setHealthData] = useState<any>(null);
  const [isHealthLoading, setIsHealthLoading] = useState(false);
  const [greeting, setGreeting] = useState('Hola');
  const lastFetchRef = useRef<number>(0);

  useEffect(() => {
    const hours = new Date().getHours();
    if (hours < 12) setGreeting('¡Buenos días! ☀️');
    else if (hours < 18) setGreeting('¡Buenas tardes! ☕');
    else setGreeting('¡Buenas noches! 🌙');

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true })
    ]).start();

    // Initial fetch only if we haven't fetched in the last 5 minutes
    const now = Date.now();
    if (now - lastFetchRef.current > 300000) {
      fetchHealthData();
    }
  }, []);

  const fetchHealthData = async (force = false) => {
    const now = Date.now();
    const canFetch = force || !healthData || (now - lastFetchRef.current > 300000);
    
    if (!canFetch || isHealthLoading) return;
    
    setIsHealthLoading(true);
    try {
      if (!session?.user?.id) return;
      
      const { data, error } = await supabase.rpc('get_financial_health', {
        p_user_id: session.user.id
      });
      if (data) {
        setHealthData(data);
        lastFetchRef.current = Date.now();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsHealthLoading(false);
    }
  };

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scrollContent: { paddingHorizontal: 24, paddingTop: Math.max(insets.top, 16) + 110, paddingBottom: 150 },
    
    headerSection: { marginBottom: 32 },
    greetText: { ...theme.typography.bodyLarge, color: theme.colors.onSurfaceVariant, marginBottom: 8, fontWeight: '600', opacity: 0.8 },
    
    streakBadge: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 6, 
      paddingHorizontal: 12, 
      paddingVertical: 6, 
      borderRadius: theme.radius.full, 
      backgroundColor: (theme.colors as any).pastel.teal + '10',
      borderWidth: 1,
      borderColor: (theme.colors as any).pastel.teal + '20',
    },
    streakText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

    organicAiCard: { 
      padding: 24, 
      borderRadius: theme.radius.xl, 
      marginBottom: 32, 
      backgroundColor: theme.colors.glassWhite,
      borderWidth: 1.5, 
      borderColor: 'rgba(255, 255, 255, 1)', 
      ...theme.shadows.soft,
      overflow: 'hidden'
    },
    iaHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    iaIconBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    iaLabel: { ...theme.typography.label, color: theme.colors.primary },
    iaTitle: { ...theme.typography.h3, color: theme.colors.onSurface, marginBottom: 10, lineHeight: 28 },
    iaReason: { ...theme.typography.bodyMedium, color: theme.colors.onSurfaceVariant, lineHeight: 22, opacity: 0.85 },
    iaLoading: { paddingVertical: 32, alignItems: 'center' },

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
    txMerchantUI: { ...theme.typography.bodyLarge, fontWeight: '800', color: theme.colors.onSurface, letterSpacing: -0.3 },
    txDateUI: { ...theme.typography.bodySmall, color: theme.colors.onSurfaceVariant, marginTop: 2, opacity: 0.7 },
    txAmountUI: { ...theme.typography.title, fontWeight: '900' },

    statsCard: {
      padding: 24,
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      marginBottom: 32,
      borderWidth: 1,
      borderColor: theme.colors.divider,
      ...theme.shadows.md,
    },
    chartLabel: {
      ...theme.typography.label,
      color: theme.colors.onSurfaceVariant,
      marginBottom: 0,
      opacity: 0.6,
    },
    visualBarsRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      height: 100,
      marginBottom: 32,
      paddingHorizontal: 8,
    },
    vBarContainer: {
      alignItems: 'center',
      flex: 1,
    },
    vBar: {
      width: 18,
      borderRadius: 9,
      backgroundColor: theme.colors.primary,
    },
    vBarGlow: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 9,
      opacity: 0.3,
    },
    vBarLabel: {
      ...theme.typography.label,
      fontSize: 8,
      marginTop: 12,
      color: theme.colors.onSurfaceVariant,
      opacity: 0.8,
      fontWeight: '900',
    },
    distributionContainer: {
      marginTop: 8,
    },
    distributionRow: {
      height: 12,
      flexDirection: 'row',
      borderRadius: 6,
      overflow: 'hidden',
      backgroundColor: theme.colors.surfaceContainerLow,
      marginBottom: 20,
    },
    distSegment: {
      height: '100%',
    },
    distInfoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    distItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    distDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    distLabel: {
      ...theme.typography.bodySmall,
      fontWeight: '800',
      color: theme.colors.onSurfaceVariant,
    },
  }), [theme, insets]);

  const currentMonthExpenses = transactions
    .filter(tx => tx.category !== 'Ingreso')
    .reduce((acc, tx) => acc + Math.abs(tx.amount), 0);

  const formatCurrency = (amt: number) => `$ ${amt.toLocaleString('es-CO')}`;

  return (
    <View style={styles.container}>
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scrollContent}
        onScrollEndDrag={() => { onRefresh?.(); }}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          
          <View style={styles.headerSection}>
            <View style={{ position: 'absolute', top: -100, right: -50, width: 250, height: 250, borderRadius: 125, backgroundColor: (theme.colors as any).pastel.teal + '15', zIndex: -1 }} />
            <View style={{ position: 'absolute', top: -40, right: 100, width: 120, height: 120, borderRadius: 60, backgroundColor: (theme.colors as any).pastel.lavender + '10', zIndex: -1 }} />
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View>
                <Text style={styles.greetText}>{greeting}</Text>
                <Text style={{ ...theme.typography.h2, color: theme.colors.onSurface, letterSpacing: -0.5 }}>{userProfile?.full_name?.split(' ')[0] || 'Usuario'}</Text>
              </View>
              <View style={styles.streakBadge}>
                {healthData && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 8, borderRightWidth: 1, borderRightColor: theme.colors.divider, paddingRight: 8 }}>
                    <Target size={14} color={theme.colors.primary} />
                    <Text style={[styles.streakText, { fontSize: 14, color: theme.colors.primary }]}>{healthData.score}</Text>
                  </View>
                )}
                <Flame size={16} color={(theme.colors as any).pastel.salmon} fill={(theme.colors as any).pastel.salmon} />
                <Text style={[styles.streakText, { color: theme.colors.primary }]}>{userProfile?.streak || 0} DÍAS</Text>
              </View>
            </View>
          </View>

          <BlurView intensity={Platform.OS === 'ios' ? 80 : 100} tint="light" style={styles.organicAiCard}>
            <LinearGradient colors={['rgba(255,255,255,0.6)', 'transparent']} style={StyleSheet.absoluteFill} />
            <View style={styles.iaHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.iaLabel, { color: theme.colors.primary, fontWeight: '900' }]}>ANÁLISIS INTELIGENTE</Text>
              </View>
              <TouchableOpacity 
                activeOpacity={0.7} 
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); fetchHealthData(true); }}
                style={styles.iaIconBox}
              >
                <LinearGradient colors={(theme.colors as any).chartColors as any} style={styles.iaIconBox} start={{x:0, y:0}} end={{x:1, y:1}}>
                  <Sparkles size={18} color="#FFF" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
            
            {healthData?.insights?.length > 0 ? (
              <View>
                <Text style={[styles.iaTitle, { color: theme.colors.onSurface }]}>{healthData.insights[0].message}</Text>
                <Text style={[styles.iaReason, { color: theme.colors.onSurfaceVariant }]}>Basado en tu comportamiento de este mes y tus objetivos de ahorro.</Text>
                {healthData.insights.length > 1 && (
                  <View style={{ marginTop: 20, backgroundColor: (theme.colors as any).pastel.teal + '15', padding: 18, borderRadius: theme.radius.md, borderWidth: 1, borderColor: (theme.colors as any).pastel.teal + '30' }}>
                    <Text style={{ fontSize: 13, color: theme.colors.primary, fontWeight: '800', lineHeight: 20 }}>
                      ✨ {healthData.insights[1].message}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <View>
                <Text style={[styles.iaTitle, { color: theme.colors.onSurface }]}>¡Estamos analizando tus datos!</Text>
                <Text style={[styles.iaReason, { color: theme.colors.onSurfaceVariant }]}>
                  {isHealthLoading ? 'Generando consejos financieros personalizados...' : 'Sigue registrando tus gastos para obtener consejos sobre tu salud financiera.'}
                </Text>
              </View>
            )}
          </BlurView>

          <View style={styles.statsCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
              <View>
                <Text style={[styles.chartLabel, { marginBottom: 4 }]}>FLUJO SEMANAL</Text>
                <Text style={{ ...theme.typography.h3, color: theme.colors.primary, fontWeight: '900' }}>{formatCurrency(currentMonthExpenses)}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <TrendingUp size={12} color={theme.colors.success} />
                <Text style={{ ...theme.typography.label, color: theme.colors.success, fontSize: 10 }}>+12%</Text>
              </View>
            </View>

            <View style={styles.visualBarsRow}>
              {[0.4, 0.7, 0.3, 0.9, 0.5, 0.8, 0.6].map((h, i) => (
                <View key={i} style={styles.vBarContainer}>
                  <View 
                    style={[
                      styles.vBar, 
                      { 
                        height: h * 100, 
                        backgroundColor: (theme.colors as any).chartColors[i % 5] || theme.colors.primary 
                      }
                    ]} 
                  >
                    <LinearGradient 
                      colors={['rgba(255,255,255,0.4)', 'transparent']} 
                      style={styles.vBarGlow} 
                    />
                  </View>
                  <Text style={styles.vBarLabel}>
                    {['L', 'M', 'M', 'J', 'V', 'S', 'D'][i]}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.distributionContainer}>
              <View style={styles.distributionRow}>
                <View style={[styles.distSegment, { width: '45%', backgroundColor: (theme.colors as any).pastel.teal }]} />
                <View style={[styles.distSegment, { width: '25%', backgroundColor: (theme.colors as any).pastel.lavender }]} />
                <View style={[styles.distSegment, { width: '20%', backgroundColor: (theme.colors as any).pastel.salmon }]} />
                <View style={[styles.distSegment, { width: '10%', backgroundColor: (theme.colors as any).pastel.teal + '80' }]} />
              </View>
              <View style={styles.distInfoRow}>
                <View style={styles.distItem}>
                  <View style={[styles.distDot, { backgroundColor: (theme.colors as any).pastel.teal }]} />
                  <Text style={styles.distLabel}>Indispensable</Text>
                </View>
                <View style={styles.distItem}>
                  <View style={[styles.distDot, { backgroundColor: (theme.colors as any).pastel.lavender }]} />
                  <Text style={styles.distLabel}>Lifestyle</Text>
                </View>
                <View style={styles.distItem}>
                  <View style={[styles.distDot, { backgroundColor: (theme.colors as any).pastel.salmon }]} />
                  <Text style={styles.distLabel}>Inversión</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitleOrganic}>Recientes</Text>
            <TouchableOpacity onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
              <Text style={styles.viewAllAction}>Ver todo</Text>
            </TouchableOpacity>
          </View>

          {transactions.slice(0, 5).length === 0 ? (
            <View style={{ padding: 40, alignItems: 'center', opacity: 0.3 }}>
              <History size={48} color={theme.colors.onSurfaceVariant} strokeWidth={1} />
              <Text style={{ marginTop: 12, fontWeight: '800', textAlign: 'center' }}>No hay movimientos recientes</Text>
            </View>
          ) : (
            transactions.slice(0, 5).map((tx) => {
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
