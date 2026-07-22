import React, { useState, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Animated, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme/ThemeContext';
import { ArrowRight, ArrowLeft, Wind, Check, Tag, Info, Utensils, Car, Home, Zap, Heart, Gamepad, GraduationCap, Target, DollarSign, Percent } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { formatMoneyDigits, formatMoney } from '../lib/format';
import { notify } from '../lib/notify';
import { getCategoryColorPair } from '../theme/theme';
import { useCurrency } from '../lib/CurrencyContext';
import { SUPPORTED_CURRENCIES, SupportedCurrency } from '../lib/currency';

const CATEGORIES = [
  { id: 'Alimentación', name: 'Alimentación', icon: 'Utensils' },
  { id: 'Transporte', name: 'Transporte', icon: 'Car' },
  { id: 'Vivienda', name: 'Vivienda', icon: 'Home' },
  { id: 'Servicios', name: 'Servicios', icon: 'Zap' },
  { id: 'Salud', name: 'Salud', icon: 'Heart' },
  { id: 'Ocio', name: 'Ocio', icon: 'Gamepad' },
  { id: 'Ahorros', name: 'Ahorro Seguro', icon: 'Target' },
  { id: 'Educación', name: 'Educación', icon: 'GraduationCap' },
];

const CategoryIcon = ({ id, color, size = 24 }: { id: string, color: string, size?: number }) => {
  const icons: any = { Alimentación: Utensils, Transporte: Car, Vivienda: Home, Servicios: Zap, Salud: Heart, Ocio: Gamepad, Ahorros: Target, Educación: GraduationCap };
  const Icon = icons[id] || Tag;
  return <Icon size={size} color={color} />;
};

export const Onboarding = ({ session, onComplete }: { session: any, onComplete: () => void }) => {
  const { theme } = useTheme();
  const { currency, symbol, formatMoney, formatInput, setCurrency } = useCurrency();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Paso 1: Selección de bolsillos
  const [selectedCats, setSelectedCats] = useState<string[]>(['Ahorros', 'Alimentación', 'Transporte']);

  // Paso 2: Primer ingreso
  const [incomeAmount, setIncomeAmount] = useState('');
  const [rules, setRules] = useState<Record<string, { type: 'fixed' | 'percentage', value: number }>>({});

  const incomeNum = parseInt(incomeAmount.replace(/\D/g, '')) || 0;
  const totalSteps = 2;

  // Cálculo del remanente y distribución
  const { preview, remainingCascade } = useMemo(() => {
    let remaining = incomeNum;
    const dist: Record<string, number> = {};

    selectedCats.forEach(id => {
      const rule = rules[id] || { type: 'fixed', value: 0 };
      let amt = 0;
      if (rule.type === 'fixed') {
        amt = Math.min(remaining, rule.value);
      } else if (rule.type === 'percentage') {
        amt = Math.round(remaining * (rule.value / 100));
      }
      if (amt > 0) {
        dist[id] = amt;
        remaining -= amt;
      }
    });
    
    return { preview: dist, remainingCascade: remaining };
  }, [incomeNum, selectedCats, rules]);

  const getCurrentStepMeta = () => {
    if (step === 1) return { title: 'Tus Bolsillos', sub: 'Elige dónde va tu plata. Siempre puedes ajustar esto después.' };
    if (step === 2) return { title: 'Tu primer ingreso', sub: '¿Cuánta plata arrancas hoy? Puedes omitir esto y ajustarlo después.' };
    return { title: '', sub: '' };
  };

  const isStepValid = (() => {
    if (step === 1) return selectedCats.length > 0;
    // Paso 2: válido si no hay ingreso (omitir) O si hay ingreso y el remanente no es negativo
    if (step === 2) return incomeNum === 0 || remainingCascade >= 0;
    return false;
  })();

  const transition = (to: number) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setStep(to);
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    });
  };

  const handleFinish = async () => {
    if (!session?.user) return;
    setLoading(true);
    try {
      // 1. Inicializar Perfil
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: session.user.id,
        full_name: session.user.user_metadata?.full_name || 'Usuario',
        preferred_currency: currency
      });
      if (profileError) throw new Error('No se pudo inicializar tu perfil.');

      // 2. Preparar y crear Bolsillos
      const pocketsToInsert = [
        { user_id: session.user.id, name: 'Libre', category: 'Otros', budget: 0, allocated_budget: 0, icon: 'Wind', is_default_free: true },
        ...selectedCats.map(id => {
          const cat = CATEGORIES.find(c => c.id === id);
          return {
            user_id: session.user.id,
            name: id === 'Ahorros' ? 'Ahorro Seguro' : (cat?.name || id),
            category: id,
            budget: 0,
            allocated_budget: 0,
            icon: cat?.icon || (id === 'Ahorros' ? 'Target' : 'Tag'),
            is_default_free: false
          };
        })
      ];

      const { data: insertedPockets, error: pocketsError } = await supabase
        .from('pockets')
        .upsert(pocketsToInsert, { onConflict: 'user_id, category' })
        .select();
      
      if (pocketsError || !insertedPockets) throw new Error('No se pudieron crear tus bolsillos.');

      // 3. Registrar el primer ingreso (si hay dinero)
      if (incomeNum > 0) {
        // Preparar la distribución usando los IDs generados de los bolsillos
        const finalDistribution: Record<string, number> = {};
        
        selectedCats.forEach(id => {
          const val = preview[id] || 0;
          if (val > 0) {
            const p = insertedPockets.find(pocket => pocket.category === id);
            if (p) finalDistribution[p.id] = val;
          }
        });

        const librePocket = insertedPockets.find(p => p.is_default_free);
        if (librePocket && remainingCascade > 0) {
          finalDistribution[librePocket.id] = remainingCascade;
        }

        const { error: rpcError } = await supabase.rpc('register_income', {
          p_user_id: session.user.id,
          p_amount: incomeNum,
          p_distribution: finalDistribution,
          p_mode: 'manual',
          p_merchant: 'Saldo Inicial',
          p_cycle_mode: 'start_fresh'
        });

        if (rpcError) {
          console.error('Error registrando ingreso inicial:', rpcError);
          throw new Error('No se pudo asentar tu saldo inicial.');
        }

        // 4. Guardar regla base en income_sources
        const dbRules = selectedCats.map((id, idx) => {
          const rule = rules[id] || { type: 'fixed', value: 0 };
          const p = insertedPockets.find(pocket => pocket.category === id);
          if (p && rule.value > 0) {
             return {
               pocket_id: p.id,
               type: rule.type,
               value: rule.value,
               priority: idx + 1
             };
          }
          return null;
        }).filter(r => r !== null);

        await supabase.from('income_sources').insert({
          user_id: session.user.id,
          name: 'Ingreso Principal',
          amount: incomeNum,
          frequency: 'monthly',
          next_date: new Date().toISOString().split('T')[0],
          distribution_rules: dbRules,
          is_active: true,
          metadata: { income_type: 'fixed' }
        });
      }

      // 5. Activar el tour mágico de 4 pasos para el usuario nuevo
      await AsyncStorage.setItem('@save_magic_tour_pending', 'true');
      // Limpiar flags anteriores del tour por si acaso
      await AsyncStorage.removeItem('tour_dashboard_done');
      await AsyncStorage.removeItem('@save_tour_pockets_seen');

      onComplete();
    } catch (e: any) {
      notify.error(e.message || 'Error al guardar.');
    } finally {
      setLoading(false);
    }
  };

  const meta = getCurrentStepMeta();

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <View style={styles.progressLine}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <View key={i} style={[styles.progressStep, { backgroundColor: (i + 1) <= step ? theme.colors.primary : theme.colors.surfaceContainerHighest }]} />
          ))}
        </View>
        <Text style={[styles.title, { color: theme.colors.onSurface, ...theme.typography.h1 }]}>{meta.title}</Text>
        <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant, ...theme.typography.bodyLarge }]}>{meta.sub}</Text>
      </View>

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
          
          {step === 1 && (
            <View>
              <Text style={{ fontSize: 12, fontWeight: '800', color: theme.colors.onSurfaceVariant, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1.5 }}>Moneda Base</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 24 }}>
                  {SUPPORTED_CURRENCIES.map(c => (
                     <TouchableOpacity
                        key={c.code}
                        activeOpacity={0.8}
                        onPress={() => setCurrency(c.code as SupportedCurrency)}
                        style={[
                           { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, borderWidth: 1.5, borderColor: theme.colors.divider, backgroundColor: theme.colors.surface },
                           currency === c.code && { backgroundColor: theme.colors.primaryContainer, borderColor: theme.colors.primary }
                        ]}
                     >
                        <Text style={[
                           { fontSize: 13, fontWeight: '700', color: theme.colors.onSurfaceVariant },
                           currency === c.code && { color: theme.colors.primary, fontWeight: '900' }
                        ]}>
                           {c.symbol} {c.code}
                        </Text>
                     </TouchableOpacity>
                  ))}
               </ScrollView>

              <Text style={{ fontSize: 12, fontWeight: '800', color: theme.colors.onSurfaceVariant, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1.5 }}>Bolsillos Frecuentes</Text>
              
              <View style={[styles.pocketCard, { backgroundColor: theme.colors.surfaceContainerHigh, borderColor: theme.colors.primary, borderWidth: 1 }]}>
                <Wind size={24} color={theme.colors.primary} />
                <Text style={[styles.pocketName, { color: theme.colors.onSurface, flex: 1, ...theme.typography.title }]}>Libre (Sobrante)</Text>
                <Check size={18} color={theme.colors.primary} />
              </View>
              
              {CATEGORIES.map(cat => {
                const active = selectedCats.includes(cat.id);
                return (
                  <TouchableOpacity 
                    key={cat.id} 
                    style={[styles.pocketCard, { backgroundColor: active ? theme.colors.surfaceContainerHigh : theme.colors.surface, borderColor: active ? theme.colors.primary : theme.colors.outlineVariant, borderWidth: 1 }]} 
                    onPress={() => {
                      if (active) setSelectedCats(selectedCats.filter(c => c !== cat.id));
                      else setSelectedCats([...selectedCats, cat.id]);
                    }}
                  >
                    <CategoryIcon id={cat.id} color={active ? theme.colors.primary : theme.colors.onSurfaceVariant} />
                    <Text style={[styles.pocketName, { flex: 1, color: active ? theme.colors.onSurface : theme.colors.onSurfaceVariant, ...theme.typography.title }]}>{cat.name}</Text>
                    {active && <Check size={18} color={theme.colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

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
                <View style={[styles.statusBanner, { backgroundColor: remainingCascade < 0 ? theme.colors.errorContainer : theme.colors.surfaceContainerHighest }]}>
                   <View style={styles.statusCol}>
                      <Text style={[styles.statusLabel, { color: remainingCascade < 0 ? theme.colors.onErrorContainer : theme.colors.onSurfaceVariant, ...theme.typography.label }]}>
                        Restante (Va a Libre)
                      </Text>
                      <Text style={[styles.statusValue, { color: remainingCascade < 0 ? theme.colors.error : theme.colors.primary, ...theme.typography.h2 }]}>
                        {formatMoney(remainingCascade)}
                      </Text>
                   </View>
                </View>

                {remainingCascade < 0 && (
                  <View style={[styles.errorBanner, { backgroundColor: theme.colors.errorContainer, marginTop: -8, marginBottom: 16 }]}>
                     <Info size={16} color={theme.colors.error} />
                     <Text style={[styles.errorText, { color: theme.colors.onErrorContainer, ...theme.typography.bodySmall }]}>No puedes repartir más plata de la que ingresaste.</Text>
                  </View>
                )}
              </View>

              {incomeNum > 0 && selectedCats.map((id, index) => {
                const rule = rules[id] || { type: 'fixed', value: 0 };
                const addValue = preview[id] || 0;
                const [_, color] = getCategoryColorPair(id, theme.isDark);
                return (
                  <View key={id} style={[styles.ruleCard, { backgroundColor: theme.colors.surface, ...theme.shadows.sm }]}>
                    <View style={styles.ruleHeader}>
                      <View style={[styles.priorityBadge, { backgroundColor: theme.colors.primaryContainer }]}>
                        <Text style={{ color: theme.colors.onPrimaryContainer, fontSize: 10, fontWeight: '900' }}>{index + 1}</Text>
                      </View>
                      <CategoryIcon id={id} color={color} size={20} />
                      <Text style={[styles.ruleTitle, { color: theme.colors.onSurface, ...theme.typography.title }]}>{id === 'Ahorros' ? 'Ahorro Seguro' : id}</Text>

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

                    <View style={styles.ruleInputRow}>
                      <Text style={[styles.rulePrefix, { color: theme.colors.primary, fontSize: 24, fontWeight: '700' }]}>{rule.type === 'fixed' ? symbol : '%'}</Text>
                      <TextInput
                        style={[styles.ruleInput, { color: theme.colors.onSurface, fontSize: 24, fontWeight: '800' }]}
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
              <View style={{ alignItems: 'center', marginTop: 8, marginBottom: 8 }}>
                <Text style={{ fontSize: 12, color: theme.colors.onSurfaceVariant, fontWeight: '600', textAlign: 'center' }}>
                  💡 Si no tienes saldo ahora, puedes omitir este paso tocando "¡Listo, empezar!"
                </Text>
              </View>
            )}
          </> )}

        </ScrollView>
      </Animated.View>

      <View style={[styles.nav, { borderTopColor: theme.colors.divider }]}>
        {step > 1 && (
          <TouchableOpacity style={[styles.btnBack, { backgroundColor: theme.colors.surfaceContainerHighest }]} onPress={() => transition(step - 1)}>
            <ArrowLeft size={24} color={theme.colors.onSurface} />
          </TouchableOpacity>
        )}
        <TouchableOpacity 
          style={[styles.btnNext, { backgroundColor: theme.colors.primary }, (!isStepValid || loading) && { opacity: 0.5 }]} 
          onPress={() => step < totalSteps ? transition(step + 1) : handleFinish()} 
          disabled={!isStepValid || loading}
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.onPrimary} />
          ) : (
            <>
              <Text style={{ color: theme.colors.onPrimary, ...theme.typography.title, fontWeight: '700' }}>
                {step === totalSteps ? '¡Listo, empezar!' : 'Continuar'}
              </Text>
              <ArrowRight size={22} color={theme.colors.onPrimary} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 24, paddingTop: 60 },
  progressLine: { flexDirection: 'row', gap: 6, marginBottom: 24 },
  progressStep: { flex: 1, height: 4, borderRadius: 2 },
  title: { marginBottom: 8, fontWeight: '800' },
  subtitle: { lineHeight: 22 },
  content: { flex: 1, paddingHorizontal: 24 },
  label: { textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, fontWeight: '700' },
  inputBox: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 2, paddingBottom: 8 },
  amountInput: { flex: 1, fontWeight: '800' },
  pocketCard: { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 20, marginBottom: 12, gap: 16 },
  pocketName: { fontWeight: '700' },
  nav: { padding: 24, flexDirection: 'row', gap: 12, borderTopWidth: 1 },
  btnBack: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  btnNext: { flex: 1, height: 56, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  statusBanner: { flexDirection: 'row', padding: 20, borderRadius: 24, gap: 16 },
  statusCol: { flex: 1, alignItems: 'center' },
  statusLabel: { marginBottom: 4, fontWeight: '700', textTransform: 'uppercase', fontSize: 11, letterSpacing: 1 },
  statusValue: { fontWeight: '900' },
  errorBanner: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, alignItems: 'center' },
  errorText: { flex: 1, fontWeight: '600' },
  ruleCard: { borderRadius: 24, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'transparent' },
  ruleHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  priorityBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  ruleTitle: { flex: 1, fontWeight: '700' },
  ruleInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rulePrefix: { fontWeight: '800' },
  ruleInput: { flex: 1, fontWeight: '900' }
});
