import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Dimensions, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { X, CheckCircle2, Circle, ArrowRight, Plus, Wallet, PieChart, LayoutGrid } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { normalize } from '../theme/theme';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');

export const AddIncome = ({ pockets, session, onCancel, onSaveSuccess }: { pockets: any[], session: any, onCancel: () => void, onSaveSuccess: () => void }) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [amount, setAmount] = useState('');
  const [selectedPockets, setSelectedPockets] = useState<string[]>(pockets.map(p => p.id));
  const [distType, setDistType] = useState<'equal' | 'budget' | 'manual'>('equal');
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [hasSwitchedToManual, setHasSwitchedToManual] = useState(false);

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    header: { 
      position: 'absolute', 
      top: 0, 
      left: 0, 
      right: 0, 
      flexDirection: 'row', 
      alignItems: 'center', 
      justifyContent: 'space-between', 
      paddingHorizontal: 24, 
      paddingBottom: 20, 
      zIndex: 100, 
      backgroundColor: theme.colors.glassWhite,
      borderBottomWidth: 1.5,
      borderBottomColor: theme.colors.divider
    },
    closeBtn: { 
      width: 48, 
      height: 48, 
      borderRadius: 24, 
      backgroundColor: theme.colors.glassWhite, 
      alignItems: 'center', 
      justifyContent: 'center', 
      borderWidth: 1.5, 
      borderColor: 'rgba(255,255,255,0.8)',
      ...theme.shadows.soft 
    },
    title: { fontSize: 20, fontWeight: '900', color: theme.colors.onSurface, letterSpacing: -0.5, fontFamily: theme.fonts.headline },
    scroll: { paddingHorizontal: 24, paddingBottom: 140 },
    
    // --- MAIN CARD ---
    card: { 
      backgroundColor: theme.colors.glassWhite, 
      padding: 28, 
      borderRadius: 36, 
      borderWidth: 1.5, 
      borderColor: 'rgba(255,255,255,0.8)',
      marginBottom: 32,
      ...theme.shadows.premium 
    },
    label: { fontSize: 11, fontWeight: '900', color: theme.colors.primary, textTransform: 'uppercase', marginBottom: 16, letterSpacing: 1.2 },
    inputWrap: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 3, borderBottomColor: theme.colors.primary, paddingBottom: 12 },
    currencySymbol: { fontSize: 36, fontWeight: '900', color: theme.colors.primary, marginRight: 10 },
    amountInput: { fontSize: 48, fontWeight: '900', color: theme.colors.onSurface, flex: 1, letterSpacing: -2 },
    
    // --- DIST MODE SELECTOR ---
    subLabel: { fontSize: 15, fontWeight: '900', color: theme.colors.onSurface, marginBottom: 20, marginTop: 8, letterSpacing: -0.3 },
    distRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
    distBtn: { 
      width: width * 0.35, 
      backgroundColor: theme.colors.glassWhite, 
      padding: 20, 
      borderRadius: 24, 
      borderWidth: 1.5, 
      borderColor: 'rgba(255,255,255,0.7)',
      ...theme.shadows.soft 
    },
    distBtnActive: { 
      borderColor: theme.colors.primary, 
      backgroundColor: theme.colors.primaryContainer,
      borderWidth: 2
    },
    distBtnTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.onSurface, marginBottom: 6 },
    distBtnTitleActive: { color: theme.colors.primary },
    distBtnSub: { fontSize: 11, color: theme.colors.onSurfaceVariant, lineHeight: 15, fontWeight: '700' },
    
    // --- MANUAL MODE LIST ---
    manualChipRow: { marginBottom: 24 },
    manualChip: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 8, 
      backgroundColor: theme.colors.glassWhite, 
      paddingHorizontal: 16, 
      paddingVertical: 12, 
      borderRadius: 16, 
      marginRight: 12, 
      borderWidth: 1.5, 
      borderColor: 'rgba(255,255,255,0.7)',
      ...theme.shadows.soft 
    },
    manualChipTxt: { fontSize: 13, fontWeight: '800', color: theme.colors.onSurface },
    
    // --- LIST ITEMS ---
    pocketsList: { gap: 14 },
    pocketItem: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      padding: 20, 
      borderRadius: 28, 
      backgroundColor: theme.colors.glassWhite,
      borderWidth: 1.5, 
      borderColor: 'rgba(255,255,255,0.7)',
      ...theme.shadows.soft 
    },
    pocketItemSelected: { 
      borderColor: theme.colors.primary, 
      backgroundColor: theme.colors.primaryContainer,
      borderWidth: 2
    },
    pocketName: { fontSize: 17, fontWeight: '900', color: theme.colors.onSurface },
    
    manualInputBox: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      backgroundColor: theme.colors.primaryContainer, 
      borderRadius: 16, 
      paddingHorizontal: 14, 
      borderWidth: 1, 
      borderColor: 'rgba(255,255,255,0.5)' 
    },
    manualPrefix: { fontSize: 18, fontWeight: '800', color: theme.colors.primary, marginRight: 4 },
    manualInput: { fontSize: 18, fontWeight: '900', color: theme.colors.onSurface, width: 120, paddingVertical: 10 },
    
    previewTag: { backgroundColor: theme.colors.primaryContainer, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14 },
    previewTagTxt: { color: theme.colors.primary, fontSize: 15, fontWeight: '900' },
    
    statusBox: { padding: 16, borderRadius: 20, alignItems: 'center', marginTop: 16, borderWidth: 1 },
    statusTxt: { fontSize: 14, fontWeight: '900' },

    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 24, paddingBottom: 40 },
    saveBtn: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: 68, 
      borderRadius: 28, 
      overflow: 'hidden',
      ...theme.shadows.premium 
    },
    saveBtnDisabled: { opacity: 0.6 },
    saveBtnTxt: { color: '#FFF', fontSize: 18, fontWeight: '900', letterSpacing: -0.5 }
  }), [theme]);

  const val = parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;

  useEffect(() => {
    if (distType === 'manual' && selectedPockets.length === 1 && val > 0) {
      const pid = selectedPockets[0];
      if (!manualValues[pid]) {
        setManualValues(p => ({ ...p, [pid]: val.toString() }));
      }
    }
  }, [selectedPockets, distType, val]);

  const formatCurrency = (val: string) => {
    const numericValue = val.replace(/[^0-9]/g, '');
    if (!numericValue) return '';
    return parseInt(numericValue, 10).toLocaleString('es-CO');
  };

  const handleToggle = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPockets(prev => 
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  const getDistributionPreview = () => {
    const val = parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;
    if (val <= 0 || selectedPockets.length === 0) return {};
    const filteredPockets = pockets.filter(p => selectedPockets.includes(p.id));
    const distribution: Record<string, number> = {};

    if (distType === 'manual') {
      filteredPockets.forEach(p => {
        distribution[p.id] = parseInt(manualValues[p.id]?.replace(/[^0-9]/g, '') || '0', 10);
      });
      return distribution;
    }

    if (distType === 'equal') {
      const perPocketRaw = val / filteredPockets.length;
      const perPocketRounded = Math.round(perPocketRaw / 100) * 100;
      let runningTotal = 0;
      filteredPockets.forEach((p, index) => {
        if (index === filteredPockets.length - 1) {
          distribution[p.id] = val - runningTotal;
        } else {
          distribution[p.id] = perPocketRounded;
          runningTotal += perPocketRounded;
        }
      });
    } else {
      const totalSelectedBudget = filteredPockets.reduce((acc, p) => acc + (p.budget || 0), 0);
      if (totalSelectedBudget === 0) {
        const perPocketRaw = val / filteredPockets.length;
        const perPocketRounded = Math.round(perPocketRaw / 100) * 100;
        let runningTotal = 0;
        filteredPockets.forEach((p, index) => {
          if (index === filteredPockets.length - 1) {
            distribution[p.id] = val - runningTotal;
          } else {
            distribution[p.id] = perPocketRounded;
            runningTotal += perPocketRounded;
          }
        });
      } else {
        let runningTotal = 0;
        filteredPockets.forEach((p, index) => {
          if (index === filteredPockets.length - 1) {
            distribution[p.id] = val - runningTotal;
          } else {
            const addAmount = Math.round(((p.budget / totalSelectedBudget) * val) / 100) * 100;
            distribution[p.id] = addAmount;
            runningTotal += addAmount;
          }
        });
      }
    }
    return distribution;
  };

  const preview = getDistributionPreview();
  const currentTotal = Object.values(preview).reduce((a, b) => a + b, 0);
  const targetTotal = parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;
  const isManualMismatch = distType === 'manual' && currentTotal !== targetTotal;

  const handleSave = async () => {
    const val = parseInt(amount.replace(/[^0-9]/g, ''), 10);
    if (!val || val <= 0) return alert('Ingresa un monto válido.');
    if (selectedPockets.length === 0) return alert('Selecciona al menos un bolsillo.');

    setIsSaving(true);
    try {
      const { error } = await supabase.rpc('register_income', {
        p_user_id: session.user.id,
        p_amount: val,
        p_distribution: preview,
        p_mode: distType
      });

      if (error) throw error;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaveSuccess();
    } catch(e: any) {
      console.error(e);
      alert('Error guardando el ingreso.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 16 }]}>
        <TouchableOpacity style={styles.closeBtn} onPress={onCancel}>
          <X size={24} color={theme.colors.onSurface} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.title}>Inyección de Capital</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: Math.max(insets.top, 20) + 96 }]}>
        <View style={styles.card}>
          <Text style={styles.label}>NUEVOS FONDOS</Text>
          <View style={styles.inputWrap}>
            <Text style={styles.currencySymbol}>$</Text>
            <TextInput
              style={styles.amountInput}
              value={formatCurrency(amount)}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={theme.colors.onSurfaceVariant + '40'}
              autoFocus
            />
          </View>
          {distType === 'manual' && (
            <View style={[styles.statusBox, { 
              backgroundColor: isManualMismatch ? theme.colors.error + '10' : theme.colors.success + '10',
              borderColor: isManualMismatch ? theme.colors.error + '20' : theme.colors.success + '20'
            }]}>
              <Text style={[styles.statusTxt, { color: isManualMismatch ? theme.colors.error : theme.colors.success }]}>
                {isManualMismatch 
                  ? `Faltan $${(targetTotal - currentTotal).toLocaleString()} por asignar` 
                  : 'Balance manual completo'}
              </Text>
            </View>
          )}
        </View>

        <View>
          <Text style={styles.subLabel}>Distribución de Fondos</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.distRow}>
            <TouchableOpacity 
              activeOpacity={0.8}
              style={[styles.distBtn, distType === 'equal' && styles.distBtnActive]} 
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDistType('equal'); }}
            >
              <PieChart size={24} color={distType === 'equal' ? theme.colors.primary : theme.colors.onSurfaceVariant} style={{ marginBottom: 16 }} />
              <Text style={[styles.distBtnTitle, distType === 'equal' && styles.distBtnTitleActive]}>Equitativo</Text>
              <Text style={styles.distBtnSub}>Partes iguales en cada bolsillo.</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              activeOpacity={0.8}
              style={[styles.distBtn, distType === 'budget' && styles.distBtnActive]} 
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDistType('budget'); }}
            >
              <LayoutGrid size={24} color={distType === 'budget' ? theme.colors.primary : theme.colors.onSurfaceVariant} style={{ marginBottom: 16 }} />
              <Text style={[styles.distBtnTitle, distType === 'budget' && styles.distBtnTitleActive]}>Prioridad</Text>
              <Text style={styles.distBtnSub}>Según tu presupuesto ideal.</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              activeOpacity={0.8}
              style={[styles.distBtn, distType === 'manual' && styles.distBtnActive]} 
              onPress={() => { 
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); 
                setDistType('manual'); 
                if (!hasSwitchedToManual) { setSelectedPockets([]); setHasSwitchedToManual(true); }
              }}
            >
              <Wallet size={24} color={distType === 'manual' ? theme.colors.primary : theme.colors.onSurfaceVariant} style={{ marginBottom: 16 }} />
              <Text style={[styles.distBtnTitle, distType === 'manual' && styles.distBtnTitleActive]}>Manual</Text>
              <Text style={styles.distBtnSub}>Tú controlas cada centavo.</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {distType === 'manual' && (
          <View style={styles.manualChipRow}>
             <Text style={[styles.label, { marginBottom: 12 }]}>AGREGAR BOLSILLOS</Text>
             <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {pockets.filter(p => !selectedPockets.includes(p.id)).map(p => (
                  <TouchableOpacity key={p.id} style={styles.manualChip} onPress={() => handleToggle(p.id)}>
                    <Plus size={16} color={theme.colors.primary} />
                    <Text style={styles.manualChipTxt}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
             </ScrollView>
          </View>
        )}

        <Text style={styles.subLabel}>Destinos Confirmados</Text>
        <View style={styles.pocketsList}>
          {pockets.filter(p => distType !== 'manual' || selectedPockets.includes(p.id)).map(p => {
            const isSelected = selectedPockets.includes(p.id);
            const addValue = preview[p.id] || 0;
            return (
              <View key={p.id} style={[styles.pocketItem, isSelected && styles.pocketItemSelected]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pocketName}>{p.name}</Text>
                  {distType !== 'manual' && !isSelected && <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant, fontWeight: '700' }}>Excluido del reparto</Text>}
                </View>

                {distType === 'manual' ? (
                  <View style={styles.manualInputBox}>
                    <Text style={styles.manualPrefix}>$</Text>
                    <TextInput
                      style={styles.manualInput}
                      value={formatCurrency(manualValues[p.id] || '')}
                      onChangeText={(v) => { setManualValues(prev => ({ ...prev, [p.id]: v })); }}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={theme.colors.onSurfaceVariant + '40'}
                    />
                    <TouchableOpacity onPress={() => handleToggle(p.id)} style={{ marginLeft: 12 }}><X size={20} color={theme.colors.error} /></TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => handleToggle(p.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {isSelected && addValue > 0 && (
                      <View style={styles.previewTag}><Text style={styles.previewTagTxt}>+ ${addValue.toLocaleString('es-CO')}</Text></View>
                    )}
                    {isSelected ? <CheckCircle2 size={24} color={theme.colors.primary} fill={theme.colors.primary + '10'} /> : <Circle size={24} color={theme.colors.outlineVariant} />}
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity 
          activeOpacity={0.9}
          style={[styles.saveBtn, (!amount || selectedPockets.length === 0 || isManualMismatch) && styles.saveBtnDisabled]} 
          onPress={handleSave} 
          disabled={isSaving || !amount || selectedPockets.length === 0 || isManualMismatch}
        >
          <LinearGradient colors={theme.colors.brandGradient as any} style={[StyleSheet.absoluteFill, { borderRadius: 28 }]} start={{x:0, y:0}} end={{x:1, y:0}} />
          {isSaving ? <ActivityIndicator color="#FFF" /> : (
            <>
              <Text style={styles.saveBtnTxt}>Blindar Ingreso de Capital</Text>
              <ArrowRight size={22} color="#FFF" style={{ marginLeft: 12 }} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};
