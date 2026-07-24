import React, { useState, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Animated, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { ArrowRight, ArrowLeft, Wind, Tag, Info, Utensils, Car, Home, Zap, Heart, Gamepad, GraduationCap, PiggyBank, DollarSign, Percent, Sparkles, Check, Lightbulb } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { formatMoneyDigits, formatMoney } from '../lib/format';
import { notify } from '../lib/notify';
import { getCategoryColorPair } from '../theme/theme';
import { useCurrency } from '../lib/CurrencyContext';

const CATEGORIES = [
  { id: 'Alimentación', name: 'Alimentación', icon: 'Utensils' },
  { id: 'Transporte',   name: 'Transporte',   icon: 'Car'      },
  { id: 'Vivienda',     name: 'Vivienda',      icon: 'Home'     },
  { id: 'Servicios',   name: 'Servicios',     icon: 'Zap'      },
  { id: 'Salud',       name: 'Salud',         icon: 'Heart'    },
  { id: 'Ocio',        name: 'Ocio',          icon: 'Gamepad'  },
  { id: 'Ahorros',     name: 'Ahorro Seguro', icon: 'PiggyBank'},
  { id: 'Educación',   name: 'Educación',     icon: 'GraduationCap' },
];

const CatIcon = ({ id, color, size = 20 }: { id: string; color: string; size?: number }) => {
  const map: any = {
    Alimentación: Utensils, Transporte: Car, Vivienda: Home,
    Servicios: Zap, Salud: Heart, Ocio: Gamepad, Ahorros: PiggyBank, Educación: GraduationCap,
  };
  const Icon = map[id] || Tag;
  return <Icon size={size} color={color} />;
};

export const Onboarding = ({ session, onComplete }: { session: any; onComplete: () => void }) => {
  const { theme } = useTheme();
  const { currency, symbol, formatMoney, formatInput } = useCurrency();
  const [step, setStep]     = useState(1);
  const [loading, setLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const [selectedCats, setSelectedCats] = useState<string[]>(['Ahorros', 'Alimentación', 'Transporte']);
  const [incomeAmount, setIncomeAmount] = useState('');
  const [rules, setRules] = useState<Record<string, { type: 'fixed' | 'percentage'; value: number }>>({});

  const incomeNum = parseInt(incomeAmount.replace(/\D/g, '')) || 0;
  const totalSteps = 2;

  // Los mismos colores que usa la pantalla de Pockets
  const POCKET_COLORS = theme.colors.chartColors as string[];
  // Índice de color por categoría — mismo orden en que aparecen
  const colorOf = (id: string, idx: number): string =>
    id === 'Otros' ? theme.colors.primary : POCKET_COLORS[idx % POCKET_COLORS.length];

  const { preview, remainingCascade } = useMemo(() => {
    let remaining = incomeNum;
    const dist: Record<string, number> = {};
    selectedCats.forEach(id => {
      const rule = rules[id] || { type: 'fixed', value: 0 };
      let amt = 0;
      if (rule.type === 'fixed')      amt = Math.min(remaining, rule.value);
      else if (rule.type === 'percentage') amt = Math.round(remaining * (rule.value / 100));
      if (amt > 0) { dist[id] = amt; remaining -= amt; }
    });
    return { preview: dist, remainingCascade: remaining };
  }, [incomeNum, selectedCats, rules]);

  const isStepValid = step === 1 ? selectedCats.length > 0 : (incomeNum === 0 || remainingCascade >= 0);

  const transition = (to: number) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setStep(to);
      Animated.timing(fadeAnim, { toValue: 1, duration: 240, useNativeDriver: true }).start();
    });
  };

  const handleFinish = async () => {
    if (!session?.user) return;
    setLoading(true);
    try {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: session.user.id,
        full_name: session.user.user_metadata?.full_name || 'Usuario',
        preferred_currency: currency,
      });
      if (profileError) throw new Error('No se pudo inicializar tu perfil.');

      const pocketsToInsert = [
        { user_id: session.user.id, name: 'Libre', category: 'Otros', budget: 0, allocated_budget: 0, icon: 'Wind', is_default_free: true },
        ...selectedCats.map(id => {
          const cat = CATEGORIES.find(c => c.id === id);
          return { user_id: session.user.id, name: id === 'Ahorros' ? 'Ahorro Seguro' : (cat?.name || id), category: id, budget: 0, allocated_budget: 0, icon: cat?.icon || 'Tag', is_default_free: false };
        }),
      ];

      const { data: insertedPockets, error: pocketsError } = await supabase.from('pockets').upsert(pocketsToInsert, { onConflict: 'user_id, category' }).select();
      if (pocketsError || !insertedPockets) throw new Error('No se pudieron crear tus bolsillos.');

      if (incomeNum > 0) {
        const finalDistribution: Record<string, number> = {};
        selectedCats.forEach(id => {
          const val = preview[id] || 0;
          if (val > 0) { const p = insertedPockets.find(pocket => pocket.category === id); if (p) finalDistribution[p.id] = val; }
        });
        const librePocket = insertedPockets.find(p => p.is_default_free);
        if (librePocket && remainingCascade > 0) finalDistribution[librePocket.id] = remainingCascade;

        const { error: rpcError } = await supabase.rpc('register_income', { p_user_id: session.user.id, p_amount: incomeNum, p_distribution: finalDistribution, p_mode: 'manual', p_merchant: 'Saldo Inicial', p_cycle_mode: 'start_fresh' });
        if (rpcError) throw new Error('No se pudo asentar tu saldo inicial.');

        const dbRules = selectedCats.map((id, idx) => {
          const rule = rules[id] || { type: 'fixed', value: 0 };
          const p = insertedPockets.find(pocket => pocket.category === id);
          if (p && rule.value > 0) return { pocket_id: p.id, type: rule.type, value: rule.value, priority: idx + 1 };
          return null;
        }).filter(Boolean);

        await supabase.from('income_sources').insert({ user_id: session.user.id, name: 'Ingreso Principal', amount: incomeNum, frequency: 'monthly', next_date: new Date().toISOString().split('T')[0], distribution_rules: dbRules, is_active: true, metadata: { income_type: 'fixed' } });
      }

      await AsyncStorage.setItem('@save_magic_tour_pending', 'true');
      await AsyncStorage.removeItem('tour_dashboard_done');
      await AsyncStorage.removeItem('@save_tour_pockets_seen');
      onComplete();
    } catch (e: any) {
      notify.error(e.message || 'Error al guardar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[S.container, { backgroundColor: theme.colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

      {/* ── HEADER ── */}
      <View style={[S.header, { paddingTop: Platform.OS === 'ios' ? 60 : 40 }]}>
        {/* Indicador de pasos premium (Pills expandidas) */}
        <View style={S.progressRow}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <View 
              key={i} 
              style={[
                S.progressPill, 
                { 
                  flex: 1,
                  backgroundColor: (i + 1) <= step ? theme.colors.primary : theme.colors.surfaceContainerHighest,
                }
              ]} 
            />
          ))}
        </View>
      </View>

      {/* ── CONTENT ── */}
      <Animated.View style={[S.content, { opacity: fadeAnim }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">

          {/* ─── STEP 1 ─── */}
          {step === 1 && (
            <View>
              <Text style={[S.bigTitle, { color: theme.colors.onSurface, fontFamily: theme.fonts.headline, marginBottom: 16 }]}>
                Tus Bolsillos
              </Text>

              {/* Banner llamativo tipo anuncio premium */}
              <View style={[S.infoBanner, { backgroundColor: theme.isDark ? theme.colors.primary + '15' : theme.colors.primary + '10', borderColor: theme.colors.primary + '30' }]}>
                <View style={[S.infoBannerIcon, { backgroundColor: theme.colors.primaryContainer }]}>
                  <PiggyBank size={24} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[S.infoBannerTitle, { color: theme.colors.primary, fontFamily: theme.fonts.headline }]}>
                    ¿Qué es un bolsillo?
                  </Text>
                  <Text style={[S.infoBannerText, { color: theme.colors.onSurfaceVariant }]}>
                    Es como un sobrecito virtual donde separas la plata para tus gastos del mes. ¡Selecciona los tuyos para organizar tu dinero de una!
                  </Text>
                </View>
              </View>

              {/* Libre — fijo, color primario. Sin borde, solo fondo */}
              <View style={[S.pocketRow, {
                backgroundColor: theme.isDark ? theme.colors.primary + '22' : theme.colors.primaryContainer,
                shadowColor: theme.colors.primary,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.18,
                shadowRadius: 12,
                elevation: 4,
              }]}>
                <View style={[S.pocketColorDot, { backgroundColor: theme.colors.primary }]}>
                  <Wind size={18} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[S.pocketRowName, { color: theme.colors.onSurface, fontFamily: theme.fonts.headline }]}>Libre</Text>
                  <Text style={[S.pocketRowSub, { color: theme.colors.onSurfaceVariant }]}>El sobrante siempre cae aquí</Text>
                </View>
                {/* Checkmark compacto */}
                <View style={[S.checkDot, { backgroundColor: theme.colors.primary }]}>
                  <Check size={12} color="#FFF" strokeWidth={3} />
                </View>
              </View>

              {CATEGORIES.map((cat, idx) => {
                const active = selectedCats.includes(cat.id);
                const color = colorOf(cat.id, idx);
                return (
                  <TouchableOpacity
                    key={cat.id}
                    activeOpacity={0.8}
                    style={[S.pocketRow, active ? {
                      // SELECTED: relleno suave + sombra coloreada, cero bordes
                      backgroundColor: theme.isDark ? color + '28' : color + '1A',
                      shadowColor: color,
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.22,
                      shadowRadius: 14,
                      elevation: 5,
                    } : {
                      // NOT SELECTED: ghost — fondo muy sutil, sin borde, sin sombra
                      backgroundColor: theme.colors.surfaceContainerLow,
                      shadowOpacity: 0,
                      elevation: 0,
                    }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedCats(active ? selectedCats.filter(c => c !== cat.id) : [...selectedCats, cat.id]);
                    }}
                  >
                    <View style={[S.pocketColorDot, {
                      backgroundColor: active ? color : theme.colors.surfaceContainerHighest,
                    }]}>
                      <CatIcon id={cat.id} color={active ? '#FFF' : theme.colors.onSurfaceVariant} size={18} />
                    </View>
                    <Text style={[S.pocketRowName, { flex: 1, color: active ? theme.colors.onSurface : theme.colors.onSurfaceVariant, fontFamily: theme.fonts.headline }]}>
                      {cat.name}
                    </Text>
                    {/* Indicador compacto: dot sólido cuando activo, nada cuando no */}
                    {active
                      ? <View style={[S.checkDot, { backgroundColor: color }]}><Check size={12} color="#FFF" strokeWidth={3} /></View>
                      : <View style={[S.checkDot, { backgroundColor: theme.colors.surfaceContainerHighest }]} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* ─── STEP 2 ─── */}
          {step === 2 && (<>
            <View>
              {/* --- AMOUNT HERO --- */}
              <View style={{ alignItems: 'center', marginTop: 10, marginBottom: 32 }}>
                <Text style={{ fontSize: 12, color: theme.colors.primary, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>¿Cuánta plata vas a ingresar?</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                  <Text style={{ fontSize: 24, fontWeight: '700', color: theme.colors.onSurface, marginRight: 4 }}>{symbol}</Text>
                  <TextInput
                    style={{ fontSize: 52, fontWeight: '800', color: theme.colors.onSurface, textAlign: 'center', letterSpacing: -2, minWidth: 120 }}
                    value={incomeAmount}
                    onChangeText={(t) => setIncomeAmount(formatInput(t))}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={theme.colors.onSurfaceVariant + '40'}
                    autoFocus
                  />
                </View>
              </View>

              <View style={{ marginTop: 16, marginBottom: 16 }}>
                <View style={[S.statusBanner, { backgroundColor: remainingCascade < 0 ? theme.colors.errorContainer : theme.colors.surfaceContainerHighest }]}>
                   <View style={S.statusCol}>
                      <Text style={[S.statusLabel, { color: remainingCascade < 0 ? theme.colors.onErrorContainer : theme.colors.onSurfaceVariant }]}>
                        Restante (Va a Libre)
                      </Text>
                      <Text style={[S.statusValue, { color: remainingCascade < 0 ? theme.colors.error : theme.colors.primary }]}>
                        {formatMoney(remainingCascade)}
                      </Text>
                   </View>
                </View>

                {remainingCascade < 0 && (
                  <View style={[S.errorBanner, { backgroundColor: theme.colors.errorContainer, marginTop: -8, marginBottom: 16 }]}>
                     <Info size={16} color={theme.colors.error} />
                     <Text style={[S.errorText, { color: theme.colors.onErrorContainer }]}>No puedes repartir más plata de la que ingresaste.</Text>
                  </View>
                )}
              </View>

              {incomeNum > 0 && selectedCats.map((id, index) => {
                const rule = rules[id] || { type: 'fixed', value: 0 };
                const addValue = preview[id] || 0;
                // Usamos la MISMA función colorOf que en el paso 1
                const color = colorOf(id, index);
                return (
                  <View key={id} style={[S.ruleCard, { backgroundColor: theme.colors.surface, ...theme.shadows.sm }]}>
                    <View style={S.ruleHeader}>
                      <View style={[S.priorityBadge, { backgroundColor: theme.colors.primaryContainer }]}>
                        <Text style={{ color: theme.colors.primary, fontSize: 10, fontWeight: '900' }}>{index + 1}</Text>
                      </View>
                      <View style={[S.pocketColorDot, { backgroundColor: color, width: 34, height: 34, borderRadius: 10 }]}>
                        <CatIcon id={id} color="#FFF" size={16} />
                      </View>
                      <Text style={[S.ruleTitle, { color: theme.colors.onSurface }]}>{id === 'Ahorros' ? 'Ahorro Seguro' : id}</Text>

                      <View style={{ flexDirection: 'row', borderRadius: 12, padding: 4, backgroundColor: theme.colors.surfaceContainerLow }}>
                        <TouchableOpacity 
                          style={[{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, rule.type === 'fixed' && { backgroundColor: theme.colors.primary }]} 
                          onPress={() => setRules({...rules, [id]: { ...rule, type: 'fixed' }})}
                        >
                          <DollarSign size={14} color={rule.type === 'fixed' ? '#FFF' : theme.colors.onSurfaceVariant} />
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={[{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, rule.type === 'percentage' && { backgroundColor: theme.colors.primary }]} 
                          onPress={() => setRules({...rules, [id]: { ...rule, type: 'percentage' }})}
                        >
                          <Percent size={14} color={rule.type === 'percentage' ? '#FFF' : theme.colors.onSurfaceVariant} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={S.ruleInputRow}>
                      <Text style={[S.rulePrefix, { color: theme.colors.primary }]}>{rule.type === 'fixed' ? symbol : '%'}</Text>
                      <TextInput
                        style={[S.ruleInput, { color: theme.colors.onSurface }]}
                        value={rule.value > 0 ? (rule.type === 'fixed' ? formatInput(String(rule.value)) : String(rule.value)) : ''}
                        onChangeText={(t) => {
                          const num = parseInt(t.replace(/\D/g, '')) || 0;
                          setRules({...rules, [id]: { ...rule, value: num }});
                        }}
                        placeholder="0"
                        placeholderTextColor={theme.colors.onSurfaceVariant + '30'}
                        keyboardType="numeric"
                      />
                      
                      <View style={{ backgroundColor: theme.colors.primaryContainer, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14 }}>
                        <Text style={{ color: theme.colors.primary, fontSize: 14, fontWeight: '800' }}>+ {formatMoney(addValue)}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Hint para omitir si no tiene saldo */}
            {incomeNum === 0 && (
              <View style={{ 
                flexDirection: 'row', 
                alignItems: 'center', 
                backgroundColor: theme.colors.surfaceContainerHigh, 
                paddingVertical: 14, 
                paddingHorizontal: 16, 
                borderRadius: 16, 
                gap: 12,
                marginTop: 24,
                marginHorizontal: 4
              }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center', ...theme.shadows.sm }}>
                  <Info size={16} color={theme.colors.primary} />
                </View>
                <Text style={{ flex: 1, fontSize: 13, color: theme.colors.onSurfaceVariant, fontWeight: '600', lineHeight: 20 }}>
                  Puedes omitir este paso tocando <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>"¡Listo, empezar!"</Text>
                </Text>
              </View>
            )}
          </> )}

        </ScrollView>
      </Animated.View>

      {/* ── NAV ── */}
      <View style={[S.nav, { borderTopColor: theme.colors.divider }]}>
        {step > 1 && (
          <TouchableOpacity
            style={[S.btnBack, { backgroundColor: theme.colors.surfaceContainerHighest }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); transition(step - 1); }}
          >
            <ArrowLeft size={22} color={theme.colors.onSurface} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          activeOpacity={0.85}
          style={[S.btnNext, { backgroundColor: theme.colors.primary }, (!isStepValid || loading) && { opacity: 0.5 }]}
          onPress={() => {
            if (!isStepValid || loading) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            step < totalSteps ? transition(step + 1) : handleFinish();
          }}
          disabled={!isStepValid || loading}
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.onPrimary} />
          ) : (
            <>
              <Text style={[S.btnNextTxt, { color: theme.colors.onPrimary, fontFamily: theme.fonts.headline }]}>
                {step === totalSteps ? '¡Listo, empezar!' : 'Continuar'}
              </Text>
              <ArrowRight size={20} color={theme.colors.onPrimary} />
            </>
          )}
        </TouchableOpacity>
      </View>

    </KeyboardAvoidingView>
  );
};

const S = StyleSheet.create({
  container: { flex: 1 },
  header:    { paddingHorizontal: 24, paddingBottom: 16 },

  progressRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  progressPill: { height: 6, borderRadius: 3 },

  content:      { flex: 1, paddingHorizontal: 24 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 14 },
  // Título grande premium
  bigTitle: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5, marginBottom: 6, marginTop: 4 },
  
  // Banner llamativo
  infoBanner: { flexDirection: 'row', padding: 20, borderRadius: 24, marginBottom: 24, borderWidth: 1, gap: 16, alignItems: 'center' },
  infoBannerIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  infoBannerTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4, letterSpacing: -0.3 },
  infoBannerText: { fontSize: 13, fontWeight: '600', lineHeight: 19 },

  // Pocket row — sin border, selección vía sombra + fondo
  pocketRow:      { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 22, marginBottom: 8, gap: 14 },
  pocketColorDot: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pocketRowName:  { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  pocketRowSub:   { fontSize: 11, fontWeight: '500', marginTop: 2, opacity: 0.7 },
  // Indicador compacto de selección (dot con check)
  checkDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  statusBanner: { flexDirection: 'row', padding: 20, borderRadius: 24, gap: 16 },
  statusCol: { flex: 1, alignItems: 'center' },
  statusLabel: { marginBottom: 4, fontWeight: '700', textTransform: 'uppercase', fontSize: 11, letterSpacing: 1 },
  statusValue: { fontWeight: '900', fontSize: 22 },
  errorBanner: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, alignItems: 'center' },
  errorText: { flex: 1, fontWeight: '600', fontSize: 13 },

  ruleCard:    { borderRadius: 24, padding: 20, marginBottom: 14, borderWidth: 1, borderColor: 'transparent' },
  ruleHeader:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  priorityBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  ruleTitle:   { flex: 1, fontWeight: '700', fontSize: 16 },
  ruleInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rulePrefix:  { fontSize: 24, fontWeight: '800' },
  ruleInput:   { flex: 1, fontSize: 24, fontWeight: '900' },

  nav:      { padding: 20, paddingBottom: 32, flexDirection: 'row', gap: 12, borderTopWidth: 1 },
  btnBack:  { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  btnNext:  { flex: 1, height: 58, borderRadius: 29, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnNextTxt: { fontWeight: '800', fontSize: 17, letterSpacing: -0.3 },
});
