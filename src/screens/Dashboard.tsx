import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Animated, ActivityIndicator, StyleSheet, Dimensions
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { RefreshCw, Sparkles, TrendingDown, Target, X, ChevronRight, ArrowUpRight } from 'lucide-react-native';
import { theme, normalize } from '../theme/theme';
import { AnimatedProgressBar } from '../components/AnimatedProgressBar';
import { CategoryIcon } from '../components/CategoryIcon';
import { INITIAL_TRANSACTIONS, OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';
import { createClient } from '@supabase/supabase-js';

const { width } = Dimensions.get('window');

export const Dashboard = ({ transactions }: { transactions: any[] }) => {
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const [recommendation, setRecommendation] = useState<any>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [spendingRules, setSpendingRules] = useState<any[]>([]);
  const [detectedPattern, setDetectedPattern] = useState<any>(null);
  const [greeting, setGreeting] = useState('Hola');

  useEffect(() => {
    const hours = new Date().getHours();
    if (hours < 12) setGreeting('¡Buenos días! ☀️');
    else if (hours < 18) setGreeting('¡Buenas tardes! ☕');
    else setGreeting('¡Buenas noches! 🌙');

    Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 7, useNativeDriver: true }).start();
    fetchRules();
    getAiRecommendation();
    analyzePatterns();
  }, [transactions]);

  const getStrictClient = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${session?.access_token}` } }
    });
  };

  const fetchRules = async () => {
    try {
      const client = await getStrictClient();
      const { data } = await client.from('user_spending_rules').select('*');
      if (data) { setSpendingRules(data); await AsyncStorage.setItem('@spending_rules', JSON.stringify(data)); }
    } catch (e) { console.log(e); }
  };

  const analyzePatterns = () => {
    if (transactions.length < 5) return;
    const counts: Record<string, any[]> = {};
    transactions.filter(t => t.amount < 0).forEach(tx => {
      const m = tx.merchant.toLowerCase().trim();
      if (!counts[m]) counts[m] = [];
      counts[m].push(tx);
    });
    for (const merchant in counts) {
      if (counts[merchant].length >= 3 && !spendingRules.some(r => r.pattern.toLowerCase() === merchant)) {
        setDetectedPattern({ merchant: counts[merchant][0].merchant, cleanMerchant: merchant, count: counts[merchant].length });
        break;
      }
    }
  };

  const saveRule = async (type: 'confidence' | 'monitor' | 'reduce') => {
    if (!detectedPattern) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const client = await getStrictClient();
      const { data: { session } } = await supabase.auth.getSession();
      await client.from('user_spending_rules').upsert({ user_id: session?.user.id, pattern: detectedPattern.merchant, type });
      setSpendingRules([...spendingRules, { pattern: detectedPattern.merchant, type }]);
      setDetectedPattern(null);
      getAiRecommendation(true);
    } catch (e) { console.log(e); }
  };

  const getAiRecommendation = async (forceRefresh = false) => {
    if (isAnalysing) return;
    setIsAnalysing(true);
    try {
      if (!forceRefresh) {
        const cached = await AsyncStorage.getItem('@ai_recomm');
        if (cached) {
          const { advice, timestamp } = JSON.parse(cached);
          if ((Date.now() - timestamp) / 3600000 < 6) { setRecommendation(advice); setIsAnalysing(false); return; }
        }
      }
      const prompt = transactions.length === 0 ? "Bienvenido" : `Analiza:\n${transactions.slice(0, 10).map(t => `${t.merchant}: $${Math.abs(t.amount)}`).join('\n')}`;
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: 'Asistente financiero personal "Organic Ledger". NO ES PARA NEGOCIOS. Habla a un ciudadano normal sobre sus gastos diarios (comida, bus, café). Usa tono cercano, empático y hogareño de Colombia. PROHIBIDO usar términos empresariales como "proveedores", "cartera", "clientes", "B2B", "flujo de caja empresarial". Habla de "lugares", "tiendas" o "marcas". JSON: mainInsight, reason, type (hormiga, optimizable, necesario), secondaryInsights (array strings).' }, { role: 'user', content: prompt }]
        })
      });
      const data = await response.json();
      const advice = JSON.parse(data.choices[0].message.content);
      setRecommendation(advice);
      await AsyncStorage.setItem('@ai_recomm', JSON.stringify({ advice, timestamp: Date.now() }));
    } catch (e) { setRecommendation({ mainInsight: "¡Vas por buen camino!", reason: "Analizaré tus gastos cuando tengas más registros.", type: "necesario" }); }
    finally { setIsAnalysing(false); }
  };

  const currentMonthTotal = transactions.reduce((acc, tx) => acc + (tx.amount < 0 ? Math.abs(tx.amount) : 0), 0);
  const todayTotal = transactions.filter(tx => new Date().toLocaleDateString() === new Date(tx.date_string || tx.date).toLocaleDateString() && tx.amount < 0).reduce((acc, tx) => acc + Math.abs(tx.amount), 0);
  const displayTransactions = transactions.length > 0 ? transactions : INITIAL_TRANSACTIONS;

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top, 16) + normalize(110) }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.headerSection, { transform: [{ translateY: slideAnim }] }]}>
          <Text style={styles.greetText}>{greeting}</Text>
          <View style={styles.mainSpendingRow}>
            <Text style={styles.currencySymbol}>$</Text>
            <Text style={styles.spendingAmount}>{currentMonthTotal.toLocaleString('es-CO')}</Text>
          </View>
          <Text style={styles.monthLabel}>GASTO TOTAL DE ESTE MES</Text>
          
          <View style={styles.todayHabitRow}>
            <View style={styles.habitBadge}>
               <Sparkles size={14} color={theme.colors.primary} />
               <Text style={styles.habitText}>Hoy: <Text style={{fontWeight: '900'}}>$ {todayTotal.toLocaleString('es-CO')}</Text></Text>
            </View>
          </View>
        </Animated.View>

        <BlurView intensity={95} tint="light" style={styles.organicAiCard}>
          <View style={styles.iaHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.iaLabel}>ANÁLISIS INTELIGENTE</Text>
            </View>
            <TouchableOpacity 
              activeOpacity={0.7} 
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); getAiRecommendation(true); }}
              style={styles.refreshWrapper}
            >
              <LinearGradient colors={theme.colors.brandGradient as any} style={styles.iaIconBox} start={{x:0, y:0}} end={{x:1, y:1}}>
                <RefreshCw size={18} color="#FFF" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
          {isAnalysing ? (
            <View style={styles.iaLoading}><ActivityIndicator size="small" color={theme.colors.primary} /></View>
          ) : recommendation && (
            <View>
              <Text style={styles.iaTitle}>{recommendation.mainInsight}</Text>
              <Text style={styles.iaReason}>{recommendation.reason}</Text>
              {recommendation.secondaryInsights?.length > 0 && (
                <View style={styles.iaTipBox}>
                  <Text style={[styles.iaTipBody, { backgroundColor: theme.colors.primaryContainer, color: theme.colors.onPrimaryContainer }]}>
                    ✨ TIP: {recommendation.secondaryInsights[0]}
                  </Text>
                </View>
              )}
            </View>
          )}
        </BlurView>

        {detectedPattern && (
          <View style={styles.patternBox}>
             <View style={{flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom:16}}>
                <View style={[styles.patternBrain, { backgroundColor: theme.colors.primaryContainer }]}>
                  <Target size={normalize(20)} color={theme.colors.primary} />
                </View>
                <View style={{flex: 1}}>
                  <Text style={styles.patternHead}>Nueva Regla 🌿</Text>
                  <Text style={styles.patternSub}>¿Cómo clasificas tus gastos en {detectedPattern.merchant}?</Text>
                </View>
             </View>
             <View style={styles.ruleActionGrid}>
                {['confidence', 'monitor', 'reduce'].map((type: any) => (
                  <TouchableOpacity key={type} onPress={() => saveRule(type)} style={styles.ruleBtn}>
                     <Text style={[styles.ruleBtnLabel, { color: type === 'confidence' ? theme.colors.primary : type === 'reduce' ? theme.colors.tertiary : theme.colors.onSurfaceVariant }]}>
                        {type === 'confidence' ? 'ESENCIAL' : type === 'monitor' ? 'VIGILAR' : 'REDUCIR'}
                     </Text>
                  </TouchableOpacity>
                ))}
             </View>
          </View>
        )}

        <View style={styles.sectionMargin}>
           <Text style={styles.sectionTitleOrganic}>Recientes</Text>
           {displayTransactions.slice(0, 5).map((tx, i) => (
             <TouchableOpacity key={tx.id || i} style={styles.organicTxCard}>
                <View style={[styles.txIconBoxUI, { backgroundColor: theme.colors.surfaceContainerHigh }]}><CategoryIcon iconName={tx.icon} size={20} color={theme.colors.primary} /></View>
                <View style={{flex: 1, marginLeft: 12}}>
                   <Text style={styles.txMerchantUI} numberOfLines={1}>{tx.merchant}</Text>
                   <Text style={styles.txDateUI}>{tx.date_string || tx.date}</Text>
                </View>
                <Text style={[styles.txAmountUI, { color: tx.amount < 0 ? theme.colors.onSurface : theme.colors.primary }]}>
                  $ {Math.abs(tx.amount).toLocaleString('es-CO')}
                </Text>
             </TouchableOpacity>
           ))}
        </View>

        <View style={{ height: normalize(200) }} />
      </Animated.ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: { paddingHorizontal: normalize(20) },
  headerSection: { marginBottom: normalize(32) },
  greetText: { fontSize: normalize(15), color: theme.colors.onSurfaceVariant, marginBottom: normalize(8), fontWeight: '600' },
  mainSpendingRow: { flexDirection: 'row', alignItems: 'flex-start' },
  currencySymbol: { fontSize: normalize(22), fontWeight: '700', color: theme.colors.onSurface, marginTop: normalize(6), marginRight: normalize(4) },
  spendingAmount: { fontSize: normalize(48), fontWeight: '900', color: theme.colors.onSurface, letterSpacing: -1.5 },
  monthLabel: { fontSize: normalize(10), fontWeight: '900', color: theme.colors.primary, letterSpacing: 1.5, marginTop: normalize(8) },
  todayHabitRow: { flexDirection: 'row', marginTop: normalize(20) },
  habitBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.primaryContainer, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  habitText: { fontSize: normalize(13), color: theme.colors.onPrimaryContainer, fontWeight: '700' },
  
  organicAiCard: { padding: normalize(24), borderRadius: normalize(32), marginBottom: normalize(24), borderWidth: 1, borderColor: theme.colors.outlineVariant, ...theme.shadows.soft },
  iaHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: normalize(16) },
  refreshWrapper: { padding: 4 },
  iaIconBox: { width: normalize(36), height: normalize(36), borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iaLabel: { fontSize: normalize(9), fontWeight: '900', color: theme.colors.primary, letterSpacing: 1.5 },
  iaTitle: { fontSize: normalize(20), fontWeight: '900', color: theme.colors.onSurface, lineHeight: normalize(26), marginBottom: normalize(8) },
  iaReason: { fontSize: normalize(14), color: theme.colors.onSurfaceVariant, lineHeight: normalize(20) },
  iaLoading: { paddingVertical: normalize(20), alignItems: 'center' },
  iaTipBox: { marginTop: normalize(16) },
  iaTipBody: { fontSize: normalize(12), fontWeight: '800', padding: 12, borderRadius: 12, overflow: 'hidden' },

  patternBox: { padding: normalize(24), borderRadius: normalize(32), backgroundColor: '#FFF', marginBottom: normalize(24), ...theme.shadows.soft, borderWidth: 1, borderColor: theme.colors.outlineVariant },
  patternBrain: { padding: 12, borderRadius: 16 },
  patternHead: { fontSize: normalize(16), fontWeight: '900', color: theme.colors.onSurface },
  patternSub: { fontSize: normalize(12), color: theme.colors.onSurfaceVariant, marginTop: 4 },
  ruleActionGrid: { flexDirection: 'row', gap: 8 },
  ruleBtn: { flex: 1, backgroundColor: theme.colors.surfaceContainerLow, paddingVertical: 12, borderRadius: 16, alignItems: 'center' },
  ruleBtnLabel: { fontSize: normalize(11), fontWeight: '900', letterSpacing: 0.5 },

  sectionMargin: { marginTop: normalize(8) },
  sectionTitleOrganic: { fontSize: normalize(18), fontWeight: '900', color: theme.colors.onSurface, marginBottom: normalize(16) },
  organicTxCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: normalize(16), borderRadius: normalize(24), marginBottom: normalize(12), ...theme.shadows.soft, borderWidth: 1, borderColor: theme.colors.outlineVariant },
  txIconBoxUI: { padding: 10, borderRadius: 14 },
  txMerchantUI: { fontSize: normalize(15), fontWeight: '800', color: theme.colors.onSurface },
  txDateUI: { fontSize: normalize(11), color: theme.colors.onSurfaceVariant, marginTop: 2, fontWeight: '500' },
  txAmountUI: { fontSize: normalize(16), fontWeight: '900' }
});
