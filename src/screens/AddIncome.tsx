import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Dimensions, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { X, CheckCircle2, Circle, ArrowRight, Sparkles, Wallet, DollarSign, Percent, Briefcase, Tag, PlusCircle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../lib/supabase';
import { formatMoney, formatMoneyDigits } from '../lib/format';
import { useCurrency } from '../lib/CurrencyContext';
import { notify } from '../lib/notify';
import { useUserCycles } from '../lib/useCycleState';
import type { Session } from '@supabase/supabase-js';

const { width } = Dimensions.get('window');
const formatCurrency = formatMoneyDigits;

export const AddIncome = ({ pockets, session, onCancel, onSaveSuccess, editTransaction }: { pockets: any[], session: Session, onCancel: () => void, onSaveSuccess: () => void, editTransaction?: any }) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { symbol } = useCurrency();
  
  const isEditing = !!editTransaction;
  const initialDistType = (editTransaction?.metadata?.mode === 'manual') ? 'single' : 'smart';
  const initialAmount = editTransaction ? Math.abs(editTransaction.amount).toString() : '';
  
  // Get active cycle ID from global cache (already fetched by Dashboard/Pockets).
  // Used to tag new income transactions to the correct cycle via register_income.
  const { activeCycle } = useUserCycles();

  const [distType, setDistType] = useState<'smart' | 'single'>(initialDistType);
  const [amount, setAmount] = useState(initialAmount ? formatCurrency(initialAmount) : '');
  const [source, setSource] = useState(editTransaction?.merchant || 'Me pagaron');
  const [cycleMode, setCycleMode] = useState<'accumulate' | 'start_fresh'>('accumulate');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const defaultRules = useMemo(() => {
    let initialRules: any[] = [];
    let priority = 0;
    pockets.forEach(p => {
      if (!p.is_default_free && p.allocated > 0) {
        priority += 1;
        initialRules.push({ pocket_id: p.id, priority, type: 'fixed', value: p.allocated });
      }
    });
    return initialRules;
  }, [pockets]);

  const [rules, setRules] = useState<any[]>(defaultRules);

  const variosPocket = pockets.find(p => p.is_default_free) || pockets.find(p => p.name.toLowerCase() === 'libre') || pockets.find(p => p.name.toLowerCase() === 'varios') || pockets[0];
  const initialSinglePocket = (initialDistType === 'single' && editTransaction?.metadata?.distribution) 
    ? Object.keys(editTransaction.metadata.distribution)[0] 
    : (variosPocket?.id || pockets[0]?.id);
  const [singlePocketId, setSinglePocketId] = useState<string>(initialSinglePocket);

  useEffect(() => {
    const fetchRules = async () => {
      try {
        const { data, error } = await supabase
          .from('income_sources')
          .select('distribution_rules')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1);

        let dbRules = (!error && data && data.length > 0) ? (data[0].distribution_rules || []) : [];
        
        // Ensure new pockets with a budget are added to the rules
        const pocketsInRules = new Set(dbRules.map((r: any) => r.pocket_id));
        let maxPriority = dbRules.reduce((max: number, r: any) => Math.max(max, r.priority || 0), 0);
        
        pockets.forEach(p => {
          if (!p.is_default_free && p.allocated > 0 && !pocketsInRules.has(p.id)) {
            maxPriority += 1;
            dbRules.push({
              pocket_id: p.id,
              priority: maxPriority,
              type: 'fixed',
              value: p.allocated
            });
          }
        });

        // Prevent layout shift by only updating if the fetched rules are actually different
        if (JSON.stringify(dbRules) !== JSON.stringify(rules)) {
          setRules(dbRules);
        }
      } catch (e) {
        console.error('Error fetching rules:', e);
      }
    };
    fetchRules();
  }, [session.user.id, pockets]);

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    header: { 
      position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', 
      justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 20, zIndex: 100, 
      backgroundColor: theme.colors.background
    },
    closeBtn: { 
      width: 48, height: 48, borderRadius: 24, backgroundColor: theme.colors.glassWhite, 
      alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: theme.colors.divider,
      ...theme.shadows.soft
    },
    scannerBadge: { 
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, 
      borderColor: theme.colors.divider, backgroundColor: theme.colors.glassWhite,
      ...theme.shadows.soft 
    },
    scannerBadgeText: { color: theme.colors.primary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.5 },
    
    scroll: { paddingHorizontal: 24, paddingBottom: 180 },
    
    // --- Premium Amount Box ---
    premiumAmountBox: { alignItems: 'center', marginTop: 10, marginBottom: 32 },
    premiumAmountLabel: { fontSize: 12, color: theme.colors.primary, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    modernAmountInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    modernCurrencySymbol: { fontSize: 24, fontWeight: '700', color: theme.colors.onSurface, marginRight: 4 },
    modernAmountInput: { fontSize: 52, fontWeight: '800', color: theme.colors.onSurface, textAlign: 'center', letterSpacing: -2, minWidth: 120 },
    
    dividerCustom: { height: 1.5, backgroundColor: theme.colors.divider, marginVertical: 24 },
    
    sectionContainer: { marginBottom: 32 },
    sectionTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.onSurface, marginBottom: 16, letterSpacing: -0.3 },
    
    // --- Chips (Source and Dist Type) ---
    chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
    catChip: { 
      paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, 
      backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.divider 
    },
    catChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    catText: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },
    catTextActive: { color: theme.colors.onPrimary },
    
    // --- Premium Segmented Control ---
    segmentedControl: {
      flexDirection: 'row', backgroundColor: theme.colors.surfaceContainerLow,
      borderRadius: 16, padding: 4, marginBottom: 24,
    },
    segmentBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 8, paddingVertical: 12, borderRadius: 12,
    },
    segmentBtnActive: { backgroundColor: theme.colors.surface, ...theme.shadows.sm },
    segmentText: { fontSize: 13, fontWeight: '700', color: theme.colors.onSurfaceVariant },
    segmentTextActive: { color: theme.colors.primary, fontWeight: '800' },
    
    pocketsList: { gap: 14 },
    pocketItem: { 
      flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: 24, backgroundColor: theme.colors.surface,
      borderWidth: 1, borderColor: theme.colors.divider,
      ...theme.shadows.sm
    },
    pocketItemSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryContainer, borderWidth: 1.5 },
    pocketName: { fontSize: 16, fontWeight: '700', color: theme.colors.onSurface },
    
    ruleCard: { borderRadius: 24, padding: 20, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.divider, ...theme.shadows.sm },
    ruleHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    priorityBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    ruleTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: theme.colors.onSurface },
    typeSwitch: { flexDirection: 'row', borderRadius: 12, padding: 4, backgroundColor: theme.colors.surfaceContainerLow },
    typeToggle: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    ruleInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rulePrefix: { fontSize: 24, fontWeight: '700', color: theme.colors.primary },
    ruleInput: { flex: 1, fontSize: 24, fontWeight: '800', color: theme.colors.onSurface },
    previewResultTag: { backgroundColor: theme.colors.primaryContainer, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14 },
    previewResultTxt: { color: theme.colors.primary, fontSize: 14, fontWeight: '800' },
    
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 24, paddingBottom: 40 },
    premiumConfirmBtn: { borderRadius: 20, overflow: 'hidden', height: 60, backgroundColor: theme.colors.primary, ...theme.shadows.premium },
    btnInner: { flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
    premiumConfirmBtnText: { color: theme.colors.onPrimary, fontWeight: '900', fontSize: 16 },
    saveBtnDisabled: { opacity: 0.6 },
  }), [theme]);

  const val = parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;

  const getDistributionPreview = () => {
    const distribution: Record<string, number> = {};
    if (val <= 0) return { distribution, remainingCascade: 0 };

    if (distType === 'smart') {
      let remaining = val;
      // Only include rules whose pocket still exists — rules referencing
      // deleted pockets are silently ignored (amount falls through to Libre).
      const validPocketIds = new Set(pockets.map(p => p.id));
      const sortedRules = [...rules]
        .filter(r => r.pocket_id && validPocketIds.has(r.pocket_id))
        .sort((a, b) => a.priority - b.priority);

      sortedRules.forEach(rule => {
        let amt = 0;
        if (rule.type === 'fixed') {
          amt = Math.min(remaining, rule.value);
        } else if (rule.type === 'percentage') {
          amt = Math.round(remaining * (rule.value / 100));
        }
        if (amt > 0) {
          distribution[rule.pocket_id] = (distribution[rule.pocket_id] || 0) + amt;
          remaining -= amt;
        }
      });
      
      const remainingCascade = remaining;

      if (remaining > 0 && variosPocket) {
        distribution[variosPocket.id] = (distribution[variosPocket.id] || 0) + remaining;
      }
      return { distribution, remainingCascade };
    }

    if (distType === 'single') {
      if (singlePocketId) distribution[singlePocketId] = val;
      return { distribution, remainingCascade: 0 };
    }

    return { distribution, remainingCascade: 0 };
  };

  const { distribution: preview, remainingCascade } = getDistributionPreview();

  const handleSave = async () => {
    let finalPreview = { ...preview };
    if (!val || val <= 0) return notify.error('Ingresa un monto válido.');
    if (Object.keys(finalPreview).length === 0) return notify.error('No hay bolsillos asignados.');

    setIsSaving(true);
    try {
      let rpcName = isEditing ? 'update_income_with_reversal' : 'register_income';
      let rpcPayload = isEditing ? {
        p_tx_id: editTransaction.id,
        p_user_id: session.user.id,
        p_new_amount: val,
        p_new_distribution: finalPreview,
        p_new_merchant: source
      } : {
        p_user_id: session.user.id,
        p_amount: val,
        p_distribution: finalPreview,
        p_mode: distType === 'smart' ? 'equal' : 'manual',
        p_merchant: source,
        p_cycle_mode: cycleMode
      };

      const { error } = await supabase.rpc(rpcName, rpcPayload);

      if (error) throw error;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
      setTimeout(() => onSaveSuccess(), 1800);
    } catch (e: any) {
      console.error('[AddIncome] handleSave error:', e);
      notify.error('Error guardando el ingreso.');
    } finally {
      setIsSaving(false);
    }
  };

  if (saved) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: theme.colors.primaryContainer, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <CheckCircle2 size={40} color={theme.colors.primary} />
        </View>
        <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.onSurface, marginBottom: 8, letterSpacing: -0.5 }}>¡Listo!</Text>
        <Text style={{ fontSize: 16, color: theme.colors.onSurfaceVariant, fontWeight: '700', marginBottom: 32, textAlign: 'center' }}>
          {formatMoney(val)} distribuidos en tus bolsillos
        </Text>
        <View style={{ width: '100%', gap: 10 }}>
          {Object.entries(preview).filter(([_, v]) => v > 0).map(([id, addValue]) => {
            const p = pockets.find(p => p.id === id);
            return p ? (
              <View key={id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: theme.colors.glassWhite, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.divider }}>
                <Text style={{ fontWeight: '800', color: theme.colors.onSurface }}>{p.name}</Text>
                <Text style={{ fontWeight: '900', color: theme.colors.primary }}>+ {formatMoney(addValue)}</Text>
              </View>
            ) : null;
          })}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 16 }]}>
        <TouchableOpacity style={styles.closeBtn} onPress={onCancel}>
          <X size={24} color={theme.colors.onSurface} strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={styles.scannerBadge}>
           <Text style={styles.scannerBadgeText}>{isEditing ? 'Editar Ingreso' : 'Ingresar Plata'}</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingTop: Math.max(insets.top, 20) + 104 }]}>
        
        {/* --- AMOUNT HERO --- */}
        <View style={styles.premiumAmountBox}>
          <Text style={styles.premiumAmountLabel}>¿Cuánto Entró?</Text>
          <View style={styles.modernAmountInputRow}>
            <Text style={styles.modernCurrencySymbol}>{symbol}</Text>
            <TextInput
              style={styles.modernAmountInput}
              value={amount}
              onChangeText={(t) => setAmount(formatCurrency(t))}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={theme.colors.onSurfaceVariant + '40'}
              autoFocus
            />
          </View>
        </View>

        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>¿De dónde viene?</Text>
          <View style={[styles.segmentedControl, { marginBottom: 0 }]}>
             {[
               { id: 'Me pagaron', label: 'Sueldo', icon: Briefcase },
               { id: 'Venta', label: 'Venta', icon: Tag },
               { id: 'Ingreso Extra', label: 'Extra', icon: PlusCircle }
             ].map(opt => {
                const isActive = source === opt.id;
                const Icon = opt.icon;
                return (
                  <TouchableOpacity 
                    key={opt.id}
                    activeOpacity={0.8}
                    onPress={() => { setSource(opt.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    style={[styles.segmentBtn, isActive && styles.segmentBtnActive]}
                  >
                    <Icon size={16} color={isActive ? theme.colors.primary : theme.colors.onSurfaceVariant} />
                    <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
             })}
          </View>
        </View>

         {!isEditing && (
           <View style={styles.sectionContainer}>
             <Text style={styles.sectionTitle}>¿A qué mes pertenece?</Text>
             <View style={[styles.segmentedControl, { marginBottom: 0 }]}>
               <TouchableOpacity 
                 activeOpacity={0.8} 
                 style={[styles.segmentBtn, cycleMode === 'accumulate' && styles.segmentBtnActive]} 
                 onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCycleMode('accumulate'); }}
               >
                 <ArrowRight size={18} color={cycleMode === 'accumulate' ? theme.colors.primary : theme.colors.onSurfaceVariant} />
                 <Text style={[styles.segmentText, cycleMode === 'accumulate' && styles.segmentTextActive]}>Al mes actual</Text>
               </TouchableOpacity>

               <TouchableOpacity 
                 activeOpacity={0.8} 
                 style={[styles.segmentBtn, cycleMode === 'start_fresh' && styles.segmentBtnActive]} 
                 onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCycleMode('start_fresh'); }}
               >
                 <Sparkles size={18} color={cycleMode === 'start_fresh' ? theme.colors.primary : theme.colors.onSurfaceVariant} />
                 <Text style={[styles.segmentText, cycleMode === 'start_fresh' && styles.segmentTextActive]}>A un mes nuevo</Text>
               </TouchableOpacity>
             </View>
           </View>
         )}

        <View style={[styles.sectionContainer, { marginBottom: 0 }]}>
          <Text style={styles.sectionTitle}>¿Cómo lo repartimos?</Text>
        <View style={styles.segmentedControl}>
          <TouchableOpacity 
            activeOpacity={0.8} 
            style={[styles.segmentBtn, distType === 'smart' && styles.segmentBtnActive]} 
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDistType('smart'); }}
          >
            <Sparkles size={18} color={distType === 'smart' ? theme.colors.primary : theme.colors.onSurfaceVariant} />
            <Text style={[styles.segmentText, distType === 'smart' && styles.segmentTextActive]}>Automático</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            activeOpacity={0.8} 
            style={[styles.segmentBtn, distType === 'single' && styles.segmentBtnActive]} 
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDistType('single'); }}
          >
            <Wallet size={18} color={distType === 'single' ? theme.colors.primary : theme.colors.onSurfaceVariant} />
            <Text style={[styles.segmentText, distType === 'single' && styles.segmentTextActive]}>Elegir bolsillo</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.pocketsList}>
          {distType === 'smart' ? (
            <>
              {[...rules].sort((a, b) => a.priority - b.priority).map((rule, index) => {
                const p = pockets.find(p => p.id === rule.pocket_id);
                if (!p) return null;
                const addValue = preview[p.id] || 0;

                return (
                  <View key={rule.pocket_id} style={styles.ruleCard}>
                    <View style={styles.ruleHeader}>
                      <View style={[styles.priorityBadge, { backgroundColor: theme.colors.primaryContainer }]}>
                        <Text style={{ color: theme.colors.onPrimaryContainer, fontSize: 10, fontWeight: '900' }}>{index + 1}</Text>
                      </View>
                      <Text style={styles.ruleTitle}>{p.name}</Text>

                      <View style={styles.typeSwitch}>
                        <TouchableOpacity 
                          style={[styles.typeToggle, rule.type === 'fixed' && { backgroundColor: theme.colors.primary }]} 
                          onPress={() => {
                            const newRules = [...rules];
                            const idx = newRules.findIndex(r => r.pocket_id === rule.pocket_id);
                            newRules[idx] = { ...rule, type: 'fixed' };
                            setRules(newRules);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }}
                        >
                          <DollarSign size={14} color={rule.type === 'fixed' ? theme.colors.onPrimary : theme.colors.onSurfaceVariant} />
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={[styles.typeToggle, rule.type === 'percentage' && { backgroundColor: theme.colors.primary }]} 
                          onPress={() => {
                            const newRules = [...rules];
                            const idx = newRules.findIndex(r => r.pocket_id === rule.pocket_id);
                            newRules[idx] = { ...rule, type: 'percentage' };
                            setRules(newRules);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }}
                        >
                          <Percent size={14} color={rule.type === 'percentage' ? theme.colors.onPrimary : theme.colors.onSurfaceVariant} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.ruleInputRow}>
                      <Text style={styles.rulePrefix}>{rule.type === 'fixed' ? '$' : '%'}</Text>
                      <TextInput
                        style={styles.ruleInput}
                        value={rule.value > 0 ? (rule.type === 'fixed' ? formatMoneyDigits(String(rule.value)) : String(rule.value)) : ''}
                        onChangeText={(t) => {
                          const v = parseInt(t.replace(/\D/g, '')) || 0;
                          const newRules = [...rules];
                          const idx = newRules.findIndex(r => r.pocket_id === rule.pocket_id);
                          newRules[idx] = { ...rule, value: v };
                          setRules(newRules);
                        }}
                        placeholder="0"
                        placeholderTextColor={theme.colors.onSurfaceVariant + '40'}
                        keyboardType="numeric"
                      />
                      
                      <View style={styles.previewResultTag}>
                        <Text style={styles.previewResultTxt}>+ {formatMoney(addValue)}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}

              {variosPocket && remainingCascade > 0 && (
                <View style={[styles.ruleCard, { opacity: 0.8 }]}>
                    <View style={styles.ruleHeader}>
                       <Text style={[styles.ruleTitle, { color: theme.colors.onSurfaceVariant }]}>{variosPocket.name} (Sobrante)</Text>
                    </View>
                    <View style={styles.ruleInputRow}>
                        <View style={{ flex: 1 }} />
                        <View style={[styles.previewResultTag, { backgroundColor: theme.colors.surface }]}>
                          <Text style={[styles.previewResultTxt, { color: theme.colors.onSurfaceVariant }]}>+ {formatMoney(remainingCascade)}</Text>
                        </View>
                    </View>
                </View>
              )}
            </>
          ) : pockets.map(p => {
            const isSingleSelected = distType === 'single' && singlePocketId === p.id;
            return (
              <View key={p.id} style={[styles.pocketItem, isSingleSelected && styles.pocketItemSelected]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pocketName}>{p.name}</Text>
                </View>

                <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSinglePocketId(p.id); }} style={{ padding: 8 }}>
                  {isSingleSelected ? <CheckCircle2 size={28} color={theme.colors.primary} /> : <Circle size={28} color={theme.colors.outlineVariant} />}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { flexDirection: 'row', gap: 12 }]}>
        <TouchableOpacity activeOpacity={0.9} style={[styles.premiumConfirmBtn, { flex: 1 }, (!val || Object.keys(preview).length === 0) && styles.saveBtnDisabled]} onPress={handleSave} disabled={isSaving || !val || Object.keys(preview).length === 0}>
          <View style={styles.btnInner}>
            {isSaving ? <ActivityIndicator color={theme.colors.onPrimary} /> : (
              <>
                <Text style={styles.premiumConfirmBtnText}>{isEditing ? 'Guardar Cambios' : 'Guardar'}</Text>
                <ArrowRight size={22} color={theme.colors.onPrimary} />
              </>
            )}
          </View>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};
