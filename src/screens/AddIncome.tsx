import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Dimensions, KeyboardAvoidingView, Platform, ActivityIndicator, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { X, CheckCircle2, Circle, ArrowRight, Plus, Wallet, PieChart } from 'lucide-react-native';
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
  const [distType, setDistType] = useState<'equal' | 'manual'>('equal');
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [source, setSource] = useState('Me pagaron');
  const [isSaving, setIsSaving] = useState(false);
  const [hasSwitchedToManual, setHasSwitchedToManual] = useState(false);
  const [saved, setSaved] = useState(false);

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
    distRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
    distBtn: { 
      flex: 1,
      backgroundColor: theme.colors.glassWhite, 
      padding: 16, 
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

    // equal
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

    return distribution;
  };

  const preview = getDistributionPreview();
  const currentTotal = Object.values(preview).reduce((a, b) => a + b, 0);
  const targetTotal = parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;
  const remainder = targetTotal - currentTotal;
  const isManualMismatch = distType === 'manual' && currentTotal !== targetTotal;

  // Encontrar bolsillo varios
  const variosPocket = pockets.find(p => p.name.toLowerCase() === 'varios');

  const assignRemainderToVarios = () => {
    if (!variosPocket || remainder <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Asegurarse de que esté seleccionado
    if (!selectedPockets.includes(variosPocket.id)) {
      setSelectedPockets(prev => [...prev, variosPocket.id]);
    }
    
    const currentVal = parseInt(manualValues[variosPocket.id]?.replace(/[^0-9]/g, '') || '0', 10);
    const newVal = currentVal + remainder;
    setManualValues(prev => ({ ...prev, [variosPocket.id]: newVal.toString() }));
  };

  const handleSave = async () => {
    let finalPreview = { ...preview };
    const val = parseInt(amount.replace(/[^0-9]/g, ''), 10);
    if (!val || val <= 0) return alert('Ingresa un monto válido.');
    if (selectedPockets.length === 0) return alert('Selecciona al menos un bolsillo.');

    if (distType === 'manual' && remainder > 0) {
      if (variosPocket) {
        // Auto asignar a varios si el usuario acepta
        const currentVarios = finalPreview[variosPocket.id] || 0;
        finalPreview[variosPocket.id] = currentVarios + remainder;
      } else {
        return alert(`Faltan $ ${remainder.toLocaleString('es-CO')} por asignar.`);
      }
    } else if (distType === 'manual' && remainder < 0) {
        return alert(`Te pasaste por $ ${Math.abs(remainder).toLocaleString('es-CO')}.`);
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.rpc('register_income', {
        p_user_id: session.user.id,
        p_amount: val,
        p_distribution: finalPreview,
        p_mode: distType
      });

      if (error) throw error;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
      // Esperar 1.8s para que el usuario vea el resumen antes de navegar
      setTimeout(() => onSaveSuccess(), 1800);
    } catch(e: any) {
      console.error(e);
      alert('Error guardando el ingreso.');
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
          $ {parseInt(amount.replace(/[^0-9]/g, '')).toLocaleString('es-CO')} distribuidos en tus bolsillos
        </Text>
        <View style={{ width: '100%', gap: 10 }}>
          {pockets.filter(p => selectedPockets.includes(p.id) && preview[p.id] > 0).map(p => (
            <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: theme.colors.glassWhite, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.divider }}>
              <Text style={{ fontWeight: '800', color: theme.colors.onSurface }}>{p.name}</Text>
              <Text style={{ fontWeight: '900', color: theme.colors.primary }}>+ $ {preview[p.id].toLocaleString('es-CO')}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 16 }]}>
        <TouchableOpacity style={styles.closeBtn} onPress={onCancel}>
          <X size={24} color={theme.colors.onSurface} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.title}>Entró Plata</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView 
        keyboardShouldPersistTaps="handled" 
        nestedScrollEnabled={true}
        scrollEventThrottle={16}
        decelerationRate="normal"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingTop: Math.max(insets.top, 20) + 96 }]}
      >
        <View style={styles.card}>
          <Text style={styles.label}>¿CUÁNTO ENTRÓ?</Text>
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

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 24, flexWrap: 'wrap' }}>
             {['Me pagaron', 'Venta', 'Ingreso Extra'].map(opt => (
                <TouchableOpacity 
                  key={opt}
                  onPress={() => { setSource(opt); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  style={{ 
                    backgroundColor: source === opt ? theme.colors.primary : theme.colors.background, 
                    borderWidth: 1.5,
                    borderColor: source === opt ? theme.colors.primary : theme.colors.outlineVariant,
                    paddingHorizontal: 16, 
                    paddingVertical: 10, 
                    borderRadius: 16 
                  }}
                >
                  <Text style={{ fontWeight: '800', color: source === opt ? '#FFF' : theme.colors.onSurfaceVariant }}>{opt}</Text>
                </TouchableOpacity>
             ))}
          </View>

          {distType === 'manual' && remainder !== 0 && (
            <TouchableOpacity 
              onPress={assignRemainderToVarios}
              disabled={!variosPocket || remainder <= 0}
              style={[
                styles.statusBox, 
                { 
                  backgroundColor: remainder > 0 ? theme.colors.primaryContainer : theme.colors.errorContainer, 
                  borderColor: remainder > 0 ? theme.colors.primary : theme.colors.error,
                  marginTop: 24,
                  opacity: (remainder > 0 && !!variosPocket) ? 1 : 0.7
                }
              ]}
            >
               <Text style={[styles.statusTxt, { color: remainder > 0 ? theme.colors.primary : theme.colors.error }]}>
                 {remainder > 0 
                   ? `Faltan $ ${remainder.toLocaleString('es-CO')} por asignar` 
                   : `Te pasaste por $ ${Math.abs(remainder).toLocaleString('es-CO')}`}
               </Text>
               {remainder > 0 && variosPocket && (
                 <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.primary, marginTop: 4 }}>
                   Toca aquí para mandar el resto a Varios 🚀
                 </Text>
               )}
               {remainder > 0 && !variosPocket && (
                 <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.error, marginTop: 4, textAlign: 'center' }}>
                   No tienes un bolsillo llamado "Varios". Créalo para auto-asignar.
                 </Text>
               )}
            </TouchableOpacity>
          )}
        </View>

        <View>
          <Text style={styles.subLabel}>Distribución de Fondos</Text>
          <View style={[styles.distRow, { gap: 14 }]}>
            <TouchableOpacity 
              activeOpacity={0.8}
              style={[styles.distBtn, distType === 'equal' && styles.distBtnActive]} 
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDistType('equal'); }}
            >
              <PieChart size={22} color={distType === 'equal' ? theme.colors.primary : theme.colors.onSurfaceVariant} style={{ marginBottom: 12 }} />
              <Text style={[styles.distBtnTitle, distType === 'equal' && styles.distBtnTitleActive]}>Equitativo</Text>
              <Text style={styles.distBtnSub}>Divide en partes iguales entre todos los bolsillos.</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              activeOpacity={0.8}
              style={[styles.distBtn, distType === 'manual' && styles.distBtnActive]} 
              onPress={() => { 
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); 
                setDistType('manual'); 
                if (!hasSwitchedToManual) { setHasSwitchedToManual(true); }
              }}
            >
              <Wallet size={22} color={distType === 'manual' ? theme.colors.primary : theme.colors.onSurfaceVariant} style={{ marginBottom: 12 }} />
              <Text style={[styles.distBtnTitle, distType === 'manual' && styles.distBtnTitleActive]}>Manual</Text>
              <Text style={styles.distBtnSub}>Tú defines cuánto va a cada bolsillo.</Text>
            </TouchableOpacity>
          </View>
        </View>

        {distType === 'manual' && (
          <View style={styles.manualChipRow}>
             <Text style={[styles.label, { marginBottom: 12 }]}>AGREGAR BOLSILLOS</Text>
             <ScrollView 
               horizontal 
               showsHorizontalScrollIndicator={false}
               nestedScrollEnabled={true}
               directionalLockEnabled={true}
             >
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

      <View style={[styles.footer, { flexDirection: 'row', gap: 12 }]}>
        <TouchableOpacity
          activeOpacity={0.8}
          style={{
            flex: 1,
            height: 68,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.surface,
            borderWidth: 1.5,
            borderColor: theme.colors.outlineVariant,
          }}
          onPress={onCancel}
        >
          <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.onSurfaceVariant }}>Cancelar</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          activeOpacity={0.9}
          style={[styles.saveBtn, { flex: 2 }, (!amount || selectedPockets.length === 0 || isManualMismatch) && styles.saveBtnDisabled]} 
          onPress={handleSave} 
          disabled={isSaving || !amount || selectedPockets.length === 0 || isManualMismatch}
        >
          <LinearGradient colors={theme.colors.brandGradient as any} style={[StyleSheet.absoluteFill, { borderRadius: 28 }]} start={{x:0, y:0}} end={{x:1, y:0}} />
          {isSaving ? <ActivityIndicator color="#FFF" /> : (
            <>
              <Text style={styles.saveBtnTxt}>Guardar</Text>
              <ArrowRight size={22} color="#FFF" style={{ marginLeft: 12 }} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};
