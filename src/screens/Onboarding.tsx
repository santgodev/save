import React, { useState, useRef, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Dimensions, Animated, ActivityIndicator,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, ScrollView, Pressable, LayoutAnimation, UIManager
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { 
  ArrowRight, ArrowLeft, Percent, CheckCircle, Plus, X, Sparkles, Brain, Target, ShieldCheck 
} from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { normalize } from '../theme/theme';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';

const { width } = Dimensions.get('window');

const CATEGORIES = [
  { id: 'Comida',     name: 'Alimentación',    icon: 'Utensils',    defaultPct: 25 },
  { id: 'Transporte', name: 'Transporte',       icon: 'Bus',         defaultPct: 10 },
  { id: 'Vivienda',   name: 'Hogar / Servicios',icon: 'Home',        defaultPct: 30 },
  { id: 'Ocio',       name: 'Ocio y Gustos',    icon: 'Sparkles',    defaultPct: 15 },
  { id: 'Compras',    name: 'Compras',           icon: 'ShoppingBag', defaultPct: 10 },
  { id: 'Ahorros',   name: 'Ahorro Seguro',    icon: 'TrendingUp',  defaultPct: 20 },
];

const STEP_META = [
  { title: 'Inyección Inicial', sub: 'Establece la base de tu capital mensual para que la IA Save lo distribuya.' },
  { title: 'Bolsillos Estratégicos', sub: 'Define dónde fluirá tu dinero. "Ahorro Seguro" es innegociable.' },
  { title: 'Blindaje de Fondos', sub: 'Ajusta los porcentajes de asignación según tus objetivos reales.' },
];

export const Onboarding = ({ session, onComplete }: { session: any, onComplete: () => void }) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [step, setStep] = useState(1);
  const [income, setIncome] = useState('');
  const [selectedCats, setSelectedCats] = useState<string[]>(['Ahorros']);
  const [distributions, setDistributions] = useState<Record<string, { type: 'pct' | 'amt', value: number }>>({});
  const [customCatName, setCustomCatName] = useState('');
  const [loading, setLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    header: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16 },
    progressLine: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    progressStep: { flex: 1, height: 6, borderRadius: 3, backgroundColor: theme.colors.outlineVariant },
    progressStepActive: { backgroundColor: theme.colors.primary },
    stepLabel: { fontSize: 11, fontWeight: '900', color: theme.colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 1.5 },
    
    titleArea: { paddingHorizontal: 24, marginVertical: 32 },
    title: { fontSize: 28, fontWeight: '900', color: theme.colors.onSurface, letterSpacing: -1, marginBottom: 12 },
    subtitle: { fontSize: 15, color: theme.colors.onSurfaceVariant, lineHeight: 22, fontWeight: '600' },

    stepContent: { flex: 1, paddingHorizontal: 24 },
    
    // --- STEP 1 ---
    inputBox: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      backgroundColor: theme.colors.surface, 
      borderRadius: 32, 
      paddingHorizontal: 24, 
      paddingVertical: 24, 
      borderWidth: 2, 
      borderColor: theme.colors.outlineVariant, 
      marginBottom: 20,
      ...theme.shadows.premium
    },
    currencySign: { fontSize: 32, fontWeight: '900', marginRight: 12, color: theme.colors.primary },
    incomeInput: { flex: 1, fontSize: 44, fontWeight: '900', color: theme.colors.onSurface, letterSpacing: -2 },
    incomeHint: { fontSize: 13, color: theme.colors.onSurfaceVariant, textAlign: 'center', marginBottom: 32, fontWeight: '700' },
    
    infoCard: { 
      backgroundColor: theme.colors.surfaceContainerLow, 
      borderRadius: 24, 
      padding: 24, 
      borderWidth: 1.5, 
      borderColor: theme.colors.outlineVariant 
    },
    infoTitle: { fontSize: 11, fontWeight: '900', color: theme.colors.onSurfaceVariant, textTransform: 'uppercase', marginBottom: 16, letterSpacing: 1 },
    infoText: { fontSize: 14, color: theme.colors.onSurface, fontWeight: '700', lineHeight: 22, marginBottom: 8 },

    // --- STEP 2 ---
    addBox: { flexDirection: 'row', gap: 12, marginBottom: 24 },
    addInput: { 
      flex: 1, 
      backgroundColor: theme.colors.surface, 
      borderRadius: 20, 
      paddingHorizontal: 20, 
      paddingVertical: 18, 
      fontSize: 16, 
      fontWeight: '800', 
      color: theme.colors.onSurface, 
      borderWidth: 1.5, 
      borderColor: theme.colors.outlineVariant 
    },
    addBtn: { width: 56, height: 56, borderRadius: 20, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
    
    pocketPill: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      backgroundColor: theme.colors.surface, 
      borderRadius: 24, 
      paddingHorizontal: 20, 
      paddingVertical: 18, 
      marginBottom: 12, 
      borderWidth: 1.5, 
      borderColor: theme.colors.outlineVariant, 
      gap: 16,
      ...theme.shadows.soft
    },
    pocketPillActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryContainer + '08' },
    pocketName: { flex: 1, fontSize: 16, fontWeight: '900', color: theme.colors.onSurface },
    
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
    chipSugg: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 6, 
      backgroundColor: theme.colors.surfaceContainerHigh, 
      paddingHorizontal: 16, 
      paddingVertical: 10, 
      borderRadius: 16 
    },
    chipSuggTxt: { fontSize: 13, fontWeight: '900', color: theme.colors.onSurface },

    // --- STEP 3 ---
    allocBanner: { 
      backgroundColor: theme.colors.surface, 
      borderRadius: 32, 
      padding: 24, 
      marginBottom: 32, 
      borderWidth: 1.5, 
      borderColor: theme.colors.outlineVariant,
      ...theme.shadows.premium
    },
    allocBar: { height: 16, borderRadius: 8, backgroundColor: theme.colors.surfaceContainerHighest, marginBottom: 16, overflow: 'hidden', flexDirection: 'row' },
    allocStatus: { fontSize: 12, fontWeight: '900', textAlign: 'center' },

    distCard: { 
      backgroundColor: theme.colors.surface, 
      padding: 24, 
      borderRadius: 28, 
      marginBottom: 16, 
      borderWidth: 1.5, 
      borderColor: theme.colors.outlineVariant,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      ...theme.shadows.soft
    },
    distLabel: { fontSize: 16, fontWeight: '900', color: theme.colors.onSurface, flex: 1 },
    distVal: { fontSize: 16, fontWeight: '900', color: theme.colors.primary },
    
    // --- NAV ---
    nav: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 48 : 32, flexDirection: 'row', gap: 16 },
    btnNext: { 
      flex: 1, 
      height: 64, 
      borderRadius: 24, 
      backgroundColor: theme.colors.onSurface, 
      flexDirection: 'row', 
      alignItems: 'center', 
      justifyContent: 'center', 
      gap: 12 
    },
    btnBack: { 
      width: 64, 
      height: 64, 
      borderRadius: 24, 
      backgroundColor: theme.colors.surfaceContainerHigh, 
      alignItems: 'center', 
      justifyContent: 'center' 
    }
  }), [theme]);

  const incomeNum = parseInt(income.replace(/[^0-9]/g, '')) || 0;
  const isIncomeValid = incomeNum >= 500000;

  const transition = (to: number) => {
    Keyboard.dismiss();
    Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setStep(to);
      if (to === 3) applySmartDefaults();
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    });
  };

  const applySmartDefaults = () => {
    const d: Record<string, { type: 'pct' | 'amt', value: number }> = {};
    let rem = 80;
    const others = selectedCats.filter(c => c !== 'Ahorros');
    others.forEach((id, i) => {
      const cat = CATEGORIES.find(c => c.id === id);
      const val = i === others.length - 1 ? rem : Math.min(cat?.defaultPct || 15, rem - 10);
      d[id] = { type: 'pct', value: val };
      rem -= val;
    });
    setDistributions(d);
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      const strictClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${session.access_token}` } }
      });
      const now = new Date();
      await strictClient.from('user_monthly_income').upsert({ user_id: session.user.id, year: now.getFullYear(), month: now.getMonth(), income: incomeNum });
      
      const pocketsToInsert = selectedCats.map(id => {
        const cat = CATEGORIES.find(c => c.id === id);
        return {
          user_id: session.user.id,
          name: cat?.name || id,
          category: id,
          budget: id === 'Ahorros' ? (incomeNum * 0.2) : (incomeNum * ((distributions[id]?.value || 10)/100)),
          icon: cat?.icon || 'Tag',
        };
      });
      await strictClient.from('pockets').insert(pocketsToInsert);
      onComplete();
    } catch (e) {
      alert('Error guardando configuración.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
       <View style={styles.header}>
          <View style={styles.progressLine}>
             {[1, 2, 3].map(n => <View key={n} style={[styles.progressStep, n <= step && styles.progressStepActive]} />)}
          </View>
          <Text style={styles.stepLabel}>FASE {step} DE 3</Text>
       </View>

       <Animated.View style={[{ flex: 1, opacity: fadeAnim }]}>
          <View style={styles.titleArea}>
             <Text style={styles.title}>{STEP_META[step-1].title}</Text>
             <Text style={styles.subtitle}>{STEP_META[step-1].sub}</Text>
          </View>

          <View style={styles.stepContent}>
             {step === 1 && (
                <View>
                   <View style={styles.inputBox}>
                      <Text style={styles.currencySign}>$</Text>
                      <TextInput 
                        style={styles.incomeInput}
                        value={incomeNum > 0 ? incomeNum.toLocaleString('es-CO') : ''}
                        onChangeText={setIncome}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={theme.colors.onSurfaceVariant + '40'}
                        autoFocus
                      />
                   </View>
                   <Text style={styles.incomeHint}>Tus ingresos mensuales netos.</Text>
                   <View style={styles.infoCard}>
                      <Text style={styles.infoTitle}>REFERENCIA COLOMBIA</Text>
                      <Text style={styles.infoText}>• El mínimo 2026 proyectado es $1.5M COP.</Text>
                      <Text style={styles.infoText}>• Recomendamos asignar el 20% al Ahorro Seguro.</Text>
                   </View>
                </View>
             )}

             {step === 2 && (
                <View style={{ flex: 1 }}>
                   <View style={styles.addBox}>
                      <TextInput 
                        style={styles.addInput} 
                        placeholder="ej: Suscripciones" 
                        value={customCatName}
                        onChangeText={setCustomCatName}
                      />
                      <TouchableOpacity style={styles.addBtn} onPress={() => { if(customCatName) { setSelectedCats([...selectedCats, customCatName]); setCustomCatName(''); } }}>
                         <Plus size={24} color="#FFF" />
                      </TouchableOpacity>
                   </View>
                   <ScrollView showsVerticalScrollIndicator={false}>
                      {selectedCats.map(id => (
                         <View key={id} style={[styles.pocketPill, id === 'Ahorros' && styles.pocketPillActive]}>
                            <Text style={styles.pocketName}>{id === 'Ahorros' ? 'Ahorro Seguro' : id}</Text>
                            {id === 'Ahorros' ? <Brain size={18} color={theme.colors.primary} /> : <TouchableOpacity onPress={() => setSelectedCats(selectedCats.filter(c => c !== id))}><X size={18} color={theme.colors.onSurfaceVariant} /></TouchableOpacity>}
                         </View>
                      ))}
                      <Text style={[styles.infoTitle, { marginTop: 24 }]}>SUGERENCIAS</Text>
                      <View style={styles.chipRow}>
                         {CATEGORIES.filter(c => !selectedCats.includes(c.id)).map(c => (
                            <TouchableOpacity key={c.id} style={styles.chipSugg} onPress={() => setSelectedCats([...selectedCats, c.id])}>
                               <Plus size={14} color={theme.colors.primary} />
                               <Text style={styles.chipSuggTxt}>{c.name}</Text>
                            </TouchableOpacity>
                         ))}
                      </View>
                   </ScrollView>
                </View>
             )}

             {step === 3 && (
                <View>
                   <View style={styles.allocBanner}>
                      <View style={styles.allocBar}>
                         <View style={{ flex: 0.2, backgroundColor: theme.colors.primary }} />
                         <View style={{ flex: 0.8, backgroundColor: theme.colors.surfaceContainerHighest }} />
                      </View>
                      <Text style={[styles.allocStatus, { color: theme.colors.primary }]}>Distribución Sugerida por la IA activa</Text>
                   </View>
                   <ScrollView>
                      {selectedCats.map(id => (
                         <View key={id} style={styles.distCard}>
                            <Text style={styles.distLabel}>{id}</Text>
                            <Text style={styles.distVal}>{id === 'Ahorros' ? '20%' : (distributions[id]?.value || 10) + '%'}</Text>
                         </View>
                      ))}
                   </ScrollView>
                </View>
             )}
          </View>
       </Animated.View>

       <View style={[styles.nav, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          {step > 1 && (
             <TouchableOpacity style={styles.btnBack} onPress={() => transition(step - 1)}>
                <ArrowLeft size={24} color={theme.colors.onSurface} strokeWidth={2.5} />
             </TouchableOpacity>
          )}
          <TouchableOpacity 
            style={[styles.btnNext, (step === 1 && !isIncomeValid) && { opacity: 0.5 }]} 
            onPress={() => step < 3 ? transition(step + 1) : handleFinish()}
            disabled={step === 1 && !isIncomeValid}
          >
             {loading ? <ActivityIndicator color="#FFF" /> : (
                <>
                  <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '900' }}>{step === 3 ? 'Comenzar Blindaje' : 'Continuar'}</Text>
                  <ArrowRight size={22} color="#FFF" />
                </>
             )}
          </TouchableOpacity>
       </View>
    </View>
  );
};
