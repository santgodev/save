import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Animated, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { 
  ArrowRight, ArrowLeft, Landmark, Wallet, Calendar, Check, Wind, Target, Tag, Info, Percent, DollarSign,
  Utensils, Car, Home, Zap, Heart, Gamepad, GraduationCap
} from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { formatMoneyDigits, formatMoney } from '../lib/format';
import { notify } from '../lib/notify';
import { getCategoryColorPair } from '../theme/theme';

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
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // State
  const [incomeType, setIncomeType] = useState<'fixed' | 'variable' | null>(null);
  const [incomeAmount, setIncomeAmount] = useState('');
  const [frequency, setFrequency] = useState<'monthly' | 'bi_weekly' | 'weekly' | 'one_time'>('monthly');
  const [payDays, setPayDays] = useState<number[]>([]);
  const [selectedCats, setSelectedCats] = useState<string[]>(['Ahorros']);
  const [distributions, setDistributions] = useState<Record<string, { value: number, type: 'fixed' | 'percentage' }>>({});

  const incomeNum = parseInt(incomeAmount.replace(/\D/g, '')) || 0;
  const totalSteps = incomeType === 'variable' ? 3 : 5;

  // 🧠 Cálculo de la Cascada (UI Sync)
  const cascade = useMemo(() => {
    let remaining = incomeType === 'fixed' ? incomeNum : 0;
    let totalFixed = 0;
    let totalPct = 0;
    const results: Record<string, number> = {};

    selectedCats.forEach(id => {
      const dist = distributions[id] || { value: 0, type: 'fixed' };
      let amt = 0;
      if (dist.type === 'fixed') {
        amt = Math.min(remaining, dist.value);
        totalFixed += dist.value;
      } else {
        amt = Math.round(remaining * (dist.value / 100));
        totalPct += dist.value;
      }
      results[id] = amt;
      remaining -= amt;
    });

    return { results, remaining, totalFixed, totalPct };
  }, [incomeType, incomeNum, selectedCats, distributions]);

  const getCurrentStepMeta = () => {
    if (step === 1) return { title: 'Tu fuente de ingresos', sub: '¿Cómo recibes tu dinero principal?' };
    if (incomeType === 'fixed') {
      if (step === 2) return { title: 'Monto y frecuencia', sub: 'Dinos cuánto y cada cuánto te pagan.' };
      if (step === 3) return { title: 'Fechas de pago', sub: '¿Qué días del mes recibes el dinero?' };
      if (step === 4) return { title: 'Tus Bolsillos', sub: 'Selecciona las categorías donde repartes tu dinero.' };
      if (step === 5) return { title: 'Cascada Inteligente', sub: 'Define cómo se reparte tu sueldo automáticamente.' };
    } else {
      if (step === 2) return { title: 'Tus Bolsillos', sub: '¿A qué categorías sueles destinar dinero?' };
      if (step === 3) return { title: 'Reglas de Reparto', sub: 'Define prioridades para cuando recibas dinero.' };
    }
    return { title: '', sub: '' };
  };

  const isStepValid = (() => {
    if (step === 1) return !!incomeType;
    if (incomeType === 'fixed') {
      if (step === 2) return incomeNum > 0 && !!frequency;
      if (step === 3) return payDays.length > 0;
      if (step === 4) return selectedCats.length > 0;
      if (step === 5) return cascade.totalPct <= 100;
    } else {
      if (step === 2) return selectedCats.length > 0;
      if (step === 3) return cascade.totalPct <= 100;
    }
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
        preferred_currency: 'COP'
      });
      if (profileError) {
        console.error('Profile upsert error:', profileError);
        throw new Error('No se pudo inicializar tu perfil.');
      }

      // 2. Preparar Bolsillos
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

      // Usar upsert para ser resilientes a reintentos
      const { data: insertedPockets, error: pocketsError } = await supabase
        .from('pockets')
        .upsert(pocketsToInsert, { onConflict: 'user_id, category' })
        .select();
      
      if (pocketsError) {
        console.error('Pockets upsert error:', pocketsError);
        throw new Error('No se pudieron crear tus bolsillos.');
      }

      // 3. Crear Fuente de Ingresos
      const rules = selectedCats.map((id, index) => {
        const pocket = insertedPockets?.find(p => p.category === id);
        const dist = distributions[id] || { value: 0, type: 'fixed' };
        return {
          pocket_id: pocket?.id || null, // Asegurar que no sea undefined
          type: dist.type,
          value: dist.value,
          priority: index + 1
        };
      }).filter(r => r.value > 0);

      console.log('Finalizing Onboarding - Rules:', JSON.stringify(rules));

      const { error: incomeError } = await supabase.from('income_sources').insert({
        user_id: session.user.id,
        name: incomeType === 'fixed' ? 'Salario Principal' : 'Ingresos Variables',
        amount: incomeType === 'fixed' ? incomeNum : 1,
        frequency: incomeType === 'fixed' ? frequency : 'one_time',
        next_date: new Date().toISOString().split('T')[0],
        distribution_rules: rules,
        is_active: incomeType === 'fixed',
        metadata: { days: payDays, income_type: incomeType }
      });

      if (incomeError) {
        console.error('Income source insert error detail:', JSON.stringify(incomeError, null, 2));
        throw new Error('No se pudo guardar tu configuración de ingresos.');
      }

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
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          {step === 1 && (
            <View style={styles.typeGrid}>
              <TouchableOpacity style={[styles.typeCard, incomeType === 'fixed' && { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryContainer + '30' }]} onPress={() => setIncomeType('fixed')}>
                <View style={[styles.typeIcon, { backgroundColor: theme.colors.primaryContainer }]}>
                  <Landmark size={32} color={theme.colors.primary} />
                </View>
                <Text style={[styles.typeTitle, { color: theme.colors.onSurface, ...theme.typography.h3 }]}>Sueldo Fijo</Text>
                <Text style={[styles.typeDesc, { color: theme.colors.onSurfaceVariant, ...theme.typography.bodySmall }]}>Empleado, pensionado o contrato con monto mensual fijo.</Text>
                {incomeType === 'fixed' && <Check size={20} color={theme.colors.primary} style={styles.typeCheck} />}
              </TouchableOpacity>

              <TouchableOpacity style={[styles.typeCard, incomeType === 'variable' && { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryContainer + '30' }]} onPress={() => setIncomeType('variable')}>
                <View style={[styles.typeIcon, { backgroundColor: theme.colors.secondaryContainer || '#E2EAE8' }]}>
                  <Wallet size={32} color={theme.colors.secondary || '#70918E'} />
                </View>
                <Text style={[styles.typeTitle, { color: theme.colors.onSurface, ...theme.typography.h3 }]}>Ingresos Variables</Text>
                <Text style={[styles.typeDesc, { color: theme.colors.onSurfaceVariant, ...theme.typography.bodySmall }]}>Freelancer, emprendedor o ingresos que cambian cada mes.</Text>
                {incomeType === 'variable' && <Check size={20} color={theme.colors.primary} style={styles.typeCheck} />}
              </TouchableOpacity>
            </View>
          )}

          {incomeType === 'fixed' && step === 2 && (
            <View>
              <Text style={[styles.label, { color: theme.colors.onSurfaceVariant, ...theme.typography.label }]}>¿Cuánto ganas al mes?</Text>
              <View style={[styles.inputBox, { borderBottomColor: theme.colors.divider }]}>
                <Text style={{ ...theme.typography.displaySmall, color: theme.colors.primary }}>$</Text>
                <TextInput
                  style={[styles.amountInput, { color: theme.colors.onSurface, ...theme.typography.displaySmall }]}
                  value={formatMoneyDigits(incomeAmount)}
                  onChangeText={setIncomeAmount}
                  placeholder="0"
                  placeholderTextColor={theme.colors.onSurfaceVariant + '40'}
                  keyboardType="numeric"
                />
              </View>

              <Text style={[styles.label, { marginTop: 32, color: theme.colors.onSurfaceVariant, ...theme.typography.label }]}>Frecuencia de pago</Text>
              <View style={styles.freqRow}>
                <TouchableOpacity style={[styles.freqBtn, frequency === 'monthly' ? { backgroundColor: theme.colors.primary } : { backgroundColor: theme.colors.surfaceContainerHighest }]} onPress={() => { setFrequency('monthly'); setPayDays([]); }}>
                  <Text style={[styles.freqBtnText, { color: frequency === 'monthly' ? theme.colors.onPrimary : theme.colors.onSurfaceVariant, ...theme.typography.title }]}>Mensual</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.freqBtn, frequency === 'bi_weekly' ? { backgroundColor: theme.colors.primary } : { backgroundColor: theme.colors.surfaceContainerHighest }]} onPress={() => { setFrequency('bi_weekly'); setPayDays([]); }}>
                  <Text style={[styles.freqBtnText, { color: frequency === 'bi_weekly' ? theme.colors.onPrimary : theme.colors.onSurfaceVariant, ...theme.typography.title }]}>Quincenal</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {incomeType === 'fixed' && step === 3 && (
            <View style={styles.daysGrid}>
              {Array.from({ length: 31 }).map((_, i) => {
                const day = i + 1;
                const active = payDays.includes(day);
                return (
                  <TouchableOpacity key={day} style={[styles.dayCircle, { backgroundColor: active ? theme.colors.primary : theme.colors.surfaceContainerHighest }]} onPress={() => {
                    if (active) setPayDays(payDays.filter(d => d !== day));
                    else {
                      if (frequency === 'monthly') setPayDays([day]);
                      else if (payDays.length < 2) setPayDays([...payDays, day]);
                    }
                  }}>
                    <Text style={[styles.dayText, { color: active ? theme.colors.onPrimary : theme.colors.onSurfaceVariant, ...theme.typography.bodyLarge, fontWeight: '700' }]}>{day}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {((incomeType === 'variable' && step === 2) || (incomeType === 'fixed' && step === 4)) && (
            <View>
              <View style={[styles.pocketCard, { backgroundColor: theme.colors.surfaceContainerHigh, borderColor: theme.colors.primary, borderWidth: 1 }]}>
                <Wind size={24} color={theme.colors.primary} />
                <Text style={[styles.pocketName, { color: theme.colors.onSurface, flex: 1, ...theme.typography.title }]}>Libre (Sobrante)</Text>
                <Check size={18} color={theme.colors.primary} />
              </View>
              {CATEGORIES.map(cat => {
                const active = selectedCats.includes(cat.id);
                return (
                  <TouchableOpacity key={cat.id} style={[styles.pocketCard, { backgroundColor: active ? theme.colors.surfaceContainerHigh : theme.colors.surface, borderColor: active ? theme.colors.primary : theme.colors.outlineVariant, borderWidth: 1 }]} onPress={() => {
                    if (cat.id === 'Ahorros') return;
                    if (active) setSelectedCats(selectedCats.filter(c => c !== cat.id));
                    else setSelectedCats([...selectedCats, cat.id]);
                  }}>
                    <CategoryIcon id={cat.id} color={active ? theme.colors.primary : theme.colors.onSurfaceVariant} />
                    <Text style={[styles.pocketName, { flex: 1, color: active ? theme.colors.onSurface : theme.colors.onSurfaceVariant, ...theme.typography.title }]}>{cat.name}</Text>
                    {active && <Check size={18} color={theme.colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {((incomeType === 'variable' && step === 3) || (incomeType === 'fixed' && step === 5)) && (
            <View>
              {/* 📊 Feedback de Dinero / Porcentaje */}
              <View style={[styles.statusBanner, { backgroundColor: theme.colors.surfaceContainerHighest }]}>
                 {incomeType === 'fixed' ? (
                   <View style={styles.statusCol}>
                      <Text style={[styles.statusLabel, { color: theme.colors.onSurfaceVariant, ...theme.typography.label }]}>Dinero Restante</Text>
                      <Text style={[styles.statusValue, { color: cascade.remaining < 0 ? theme.colors.error : theme.colors.primary, ...theme.typography.h2 }]}>{formatMoney(cascade.remaining)}</Text>
                   </View>
                 ) : (
                   <View style={styles.statusCol}>
                      <Text style={[styles.statusLabel, { color: theme.colors.onSurfaceVariant, ...theme.typography.label }]}>Total Asignado</Text>
                      <Text style={[styles.statusValue, { color: theme.colors.primary, ...theme.typography.h2 }]}>{formatMoney(cascade.totalFixed)} + {cascade.totalPct}%</Text>
                   </View>
                 )}
                 <View style={[styles.statusCol, { borderLeftWidth: 1, borderLeftColor: theme.colors.divider, paddingLeft: 16 }]}>
                    <Text style={[styles.statusLabel, { color: theme.colors.onSurfaceVariant, ...theme.typography.label }]}>Carga Total %</Text>
                    <Text style={[styles.statusValue, { color: cascade.totalPct > 100 ? theme.colors.error : theme.colors.onSurface, ...theme.typography.h2 }]}>{cascade.totalPct}%</Text>
                 </View>
              </View>

              {cascade.totalPct > 100 && (
                <View style={[styles.errorBanner, { backgroundColor: theme.colors.errorContainer }]}>
                   <Info size={16} color={theme.colors.error} />
                   <Text style={[styles.errorText, { color: theme.colors.onErrorContainer, ...theme.typography.bodySmall }]}>No puedes superar el 100% en porcentajes.</Text>
                </View>
              )}

              {selectedCats.map((id, index) => {
                const dist = distributions[id] || { value: 0, type: 'fixed' };
                const [bg, color] = getCategoryColorPair(id, theme.isDark);
                return (
                  <View key={id} style={[styles.ruleCard, { backgroundColor: theme.colors.surface, ...theme.shadows.sm }]}>
                    <View style={styles.ruleHeader}>
                      <View style={[styles.priorityBadge, { backgroundColor: theme.colors.primaryContainer }]}>
                        <Text style={{ color: theme.colors.onPrimaryContainer, ...theme.typography.label, fontSize: 10 }}>{index + 1}</Text>
                      </View>
                      <CategoryIcon id={id} color={color} size={20} />
                      <Text style={[styles.ruleTitle, { color: theme.colors.onSurface, ...theme.typography.title }]}>{id === 'Ahorros' ? 'Ahorro' : id}</Text>

                      <View style={[styles.typeSwitch, { backgroundColor: theme.colors.surfaceContainerLow }]}>
                        <TouchableOpacity 
                          style={[styles.typeToggle, dist.type === 'fixed' && { backgroundColor: theme.colors.primary }]} 
                          onPress={() => setDistributions({...distributions, [id]: { ...dist, type: 'fixed' }})}
                        >
                          <DollarSign size={14} color={dist.type === 'fixed' ? theme.colors.onPrimary : theme.colors.onSurfaceVariant} />
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={[styles.typeToggle, dist.type === 'percentage' && { backgroundColor: theme.colors.primary }]} 
                          onPress={() => setDistributions({...distributions, [id]: { ...dist, type: 'percentage' }})}
                        >
                          <Percent size={14} color={dist.type === 'percentage' ? theme.colors.onPrimary : theme.colors.onSurfaceVariant} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.ruleInputRow}>
                      <Text style={[styles.rulePrefix, { color: theme.colors.primary, ...theme.typography.h2 }]}>{dist.type === 'fixed' ? '$' : '%'}</Text>
                      <TextInput
                        style={[styles.ruleInput, { color: theme.colors.onSurface, ...theme.typography.h2 }]}
                        value={dist.value > 0 ? (dist.type === 'fixed' ? formatMoneyDigits(String(dist.value)) : String(dist.value)) : ''}
                        onChangeText={(t) => {
                          const val = parseInt(t.replace(/\D/g, '')) || 0;
                          setDistributions({...distributions, [id]: { ...dist, value: val }});
                        }}
                        placeholder="0"
                        placeholderTextColor={theme.colors.onSurfaceVariant + '30'}
                        keyboardType="numeric"
                      />
                      {dist.type === 'fixed' && incomeType === 'fixed' && (
                        <Text style={[styles.ruleHint, { color: theme.colors.onSurfaceVariant, ...theme.typography.bodySmall }]}>de {formatMoney(incomeNum)}</Text>
                      )}
                      {dist.type === 'percentage' && (
                        <Text style={[styles.ruleHint, { color: theme.colors.onSurfaceVariant, ...theme.typography.bodySmall }]}>del resto</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
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
              <Text style={{ color: theme.colors.onPrimary, ...theme.typography.title }}>
                {step === totalSteps ? 'Comenzar' : 'Continuar'}
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
  title: { marginBottom: 8 },
  subtitle: { lineHeight: 22 },
  content: { flex: 1, paddingHorizontal: 24 },
  typeGrid: { gap: 16 },
  typeCard: { padding: 20, borderRadius: 24, borderWidth: 2, borderColor: 'transparent' },
  typeIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  typeTitle: { marginBottom: 4 },
  typeDesc: { lineHeight: 18 },
  typeCheck: { position: 'absolute', top: 20, right: 20 },
  label: { textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  inputBox: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 2, paddingBottom: 8 },
  amountInput: { flex: 1 },
  freqRow: { flexDirection: 'row', gap: 12 },
  freqBtn: { flex: 1, padding: 16, borderRadius: 16, alignItems: 'center' },
  freqBtnText: { },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  dayCircle: { width: 45, height: 45, borderRadius: 22.5, alignItems: 'center', justifyContent: 'center' },
  dayText: { },
  pocketCard: { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 20, marginBottom: 12, gap: 16 },
  pocketName: { },
  nav: { padding: 24, flexDirection: 'row', gap: 12, borderTopWidth: 1 },
  btnBack: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  btnNext: { flex: 1, height: 56, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  statusBanner: { flexDirection: 'row', padding: 20, borderRadius: 24, marginBottom: 24, gap: 16 },
  statusCol: { flex: 1 },
  statusLabel: { marginBottom: 4 },
  statusValue: { fontWeight: '800' },
  errorBanner: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, marginBottom: 16, alignItems: 'center' },
  errorText: { flex: 1, fontWeight: '600' },
  ruleCard: { borderRadius: 24, padding: 20, marginBottom: 16 },
  ruleHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  priorityBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  ruleTitle: { flex: 1 },
  typeSwitch: { flexDirection: 'row', borderRadius: 12, padding: 4 },
  typeToggle: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  ruleInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rulePrefix: { fontWeight: '700' },
  ruleInput: { flex: 1, fontWeight: '800' },
  ruleHint: { fontWeight: '600' }
});
