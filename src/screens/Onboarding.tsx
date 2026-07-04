import React, { useState, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Animated, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { ArrowRight, ArrowLeft, Wind, Check, Tag, Info, Utensils, Car, Home, Zap, Heart, Gamepad, GraduationCap, Target } from 'lucide-react-native';
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

  // Paso 1: Selección de bolsillos
  const [selectedCats, setSelectedCats] = useState<string[]>(['Ahorros', 'Alimentación', 'Transporte']);

  // Paso 2: Primer ingreso
  const [incomeAmount, setIncomeAmount] = useState('');
  const [distributions, setDistributions] = useState<Record<string, number>>({});

  const incomeNum = parseInt(incomeAmount.replace(/\D/g, '')) || 0;
  const totalSteps = 2;

  // Cálculo del remanente (Sobrante -> Libre)
  const cascade = useMemo(() => {
    let totalDistributed = 0;
    selectedCats.forEach(id => {
      totalDistributed += (distributions[id] || 0);
    });
    
    // El remanente es el ingreso total menos lo que ya se asignó a otros bolsillos
    const remaining = incomeNum - totalDistributed;
    return { remaining, totalDistributed };
  }, [incomeNum, selectedCats, distributions]);

  const getCurrentStepMeta = () => {
    if (step === 1) return { title: 'Tus Bolsillos', sub: 'Selecciona las categorías donde sueles gastar tu plata.' };
    if (step === 2) return { title: 'Tu primer ingreso', sub: 'Ingresa la plata que tienes y repártela en tus bolsillos.' };
    return { title: '', sub: '' };
  };

  const isStepValid = (() => {
    if (step === 1) return selectedCats.length > 0;
    if (step === 2) return incomeNum > 0 && cascade.remaining >= 0;
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
          const val = distributions[id] || 0;
          if (val > 0) {
            const p = insertedPockets.find(pocket => pocket.category === id);
            if (p) finalDistribution[p.id] = val;
          }
        });

        const librePocket = insertedPockets.find(p => p.is_default_free);
        if (librePocket && cascade.remaining > 0) {
          finalDistribution[librePocket.id] = cascade.remaining;
        }

        const { error: rpcError } = await supabase.rpc('register_income', {
          p_user_id: session.user.id,
          p_amount: incomeNum,
          p_distribution: finalDistribution,
          p_mode: 'manual', // Fue manual
          p_merchant: 'Saldo Inicial'
        });

        if (rpcError) {
          console.error('Error registrando ingreso inicial:', rpcError);
          throw new Error('No se pudo asentar tu saldo inicial.');
        }

        // 4. (Opcional) Guardar una regla base en income_sources
        const rules = Object.entries(finalDistribution).map(([pId, val], idx) => ({
          pocket_id: pId,
          type: 'fixed',
          value: val,
          priority: idx + 1
        })).filter(r => r.value > 0);

        await supabase.from('income_sources').insert({
          user_id: session.user.id,
          name: 'Ingreso Principal',
          amount: incomeNum,
          frequency: 'monthly',
          next_date: new Date().toISOString().split('T')[0],
          distribution_rules: rules,
          is_active: true,
          metadata: { income_type: 'fixed' }
        });
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
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
          
          {step === 1 && (
            <View>
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

          {step === 2 && (
            <View>
              <Text style={[styles.label, { color: theme.colors.onSurfaceVariant, ...theme.typography.label }]}>¿Cuánta plata vas a ingresar?</Text>
              <View style={[styles.inputBox, { borderBottomColor: theme.colors.divider }]}>
                <Text style={{ ...theme.typography.displaySmall, color: theme.colors.primary }}>$</Text>
                <TextInput
                  style={[styles.amountInput, { color: theme.colors.onSurface, ...theme.typography.displaySmall }]}
                  value={incomeAmount}
                  onChangeText={(t) => setIncomeAmount(formatMoneyDigits(t))}
                  placeholder="0"
                  placeholderTextColor={theme.colors.onSurfaceVariant + '40'}
                  keyboardType="numeric"
                  autoFocus
                />
              </View>

              <View style={{ marginTop: 24, marginBottom: 16 }}>
                <View style={[styles.statusBanner, { backgroundColor: cascade.remaining < 0 ? theme.colors.errorContainer : theme.colors.surfaceContainerHighest }]}>
                   <View style={styles.statusCol}>
                      <Text style={[styles.statusLabel, { color: cascade.remaining < 0 ? theme.colors.onErrorContainer : theme.colors.onSurfaceVariant, ...theme.typography.label }]}>
                        Restante (Va a Libre)
                      </Text>
                      <Text style={[styles.statusValue, { color: cascade.remaining < 0 ? theme.colors.error : theme.colors.primary, ...theme.typography.h2 }]}>
                        {formatMoney(cascade.remaining)}
                      </Text>
                   </View>
                </View>

                {cascade.remaining < 0 && (
                  <View style={[styles.errorBanner, { backgroundColor: theme.colors.errorContainer, marginTop: -8, marginBottom: 16 }]}>
                     <Info size={16} color={theme.colors.error} />
                     <Text style={[styles.errorText, { color: theme.colors.onErrorContainer, ...theme.typography.bodySmall }]}>No puedes repartir más plata de la que ingresaste.</Text>
                  </View>
                )}
              </View>

              {incomeNum > 0 && selectedCats.map((id, index) => {
                const val = distributions[id] || 0;
                const [_, color] = getCategoryColorPair(id, theme.isDark);
                return (
                  <View key={id} style={[styles.ruleCard, { backgroundColor: theme.colors.surface, ...theme.shadows.sm }]}>
                    <View style={styles.ruleHeader}>
                      <View style={[styles.priorityBadge, { backgroundColor: theme.colors.primaryContainer }]}>
                        <Text style={{ color: theme.colors.onPrimaryContainer, ...theme.typography.label, fontSize: 10 }}>{index + 1}</Text>
                      </View>
                      <CategoryIcon id={id} color={color} size={20} />
                      <Text style={[styles.ruleTitle, { color: theme.colors.onSurface, ...theme.typography.title }]}>{id === 'Ahorros' ? 'Ahorro' : id}</Text>
                    </View>

                    <View style={styles.ruleInputRow}>
                      <Text style={[styles.rulePrefix, { color: theme.colors.primary, ...theme.typography.h2 }]}>$</Text>
                      <TextInput
                        style={[styles.ruleInput, { color: theme.colors.onSurface, ...theme.typography.h2 }]}
                        value={val > 0 ? formatMoneyDigits(String(val)) : ''}
                        onChangeText={(t) => {
                          const num = parseInt(t.replace(/\D/g, '')) || 0;
                          setDistributions({...distributions, [id]: num});
                        }}
                        placeholder="0"
                        placeholderTextColor={theme.colors.onSurfaceVariant + '30'}
                        keyboardType="numeric"
                      />
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
              <Text style={{ color: theme.colors.onPrimary, ...theme.typography.title, fontWeight: '700' }}>
                {step === totalSteps ? 'Crear mi cuenta' : 'Continuar'}
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
