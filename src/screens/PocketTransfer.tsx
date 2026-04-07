import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Dimensions, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { X, ArrowRightLeft, ArrowRight, CheckCircle2, ChevronDown, Repeat } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { normalize } from '../theme/theme';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');

export const PocketTransfer = ({ pockets, session, onCancel, onSaveSuccess, initialParams }: { pockets: any[], session: any, onCancel: () => void, onSaveSuccess: () => void, initialParams?: { fromId?: string, amount?: number } }) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [amount, setAmount] = useState(initialParams?.amount ? initialParams.amount.toString() : '');
  const [fromPocketId, setFromPocketId] = useState<string | null>(initialParams?.fromId || pockets[0]?.id || null);
  const [toPocketId, setToPocketId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
      backgroundColor: theme.mode === 'honey' ? 'rgba(252, 250, 238, 0.95)' : 'rgba(247, 247, 242, 0.95)',
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outlineVariant
    },
    closeBtn: { 
      width: 48, 
      height: 48, 
      borderRadius: 24, 
      backgroundColor: theme.colors.surface, 
      alignItems: 'center', 
      justifyContent: 'center', 
      borderWidth: 1, 
      borderColor: theme.colors.outlineVariant,
      ...theme.shadows.soft 
    },
    title: { fontSize: 20, fontWeight: '900', color: theme.colors.onSurface, letterSpacing: -0.5 },
    scroll: { paddingHorizontal: 24, paddingBottom: 140 },
    
    // --- MAIN CARD ---
    card: { 
      backgroundColor: theme.colors.surface, 
      padding: 28, 
      borderRadius: 36, 
      borderWidth: 1, 
      borderColor: theme.colors.outlineVariant,
      marginBottom: 32,
      ...theme.shadows.premium 
    },
    label: { fontSize: 11, fontWeight: '900', color: theme.colors.onSurfaceVariant, textTransform: 'uppercase', marginBottom: 16, letterSpacing: 1.2 },
    inputWrap: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 3, borderBottomColor: theme.colors.primary, paddingBottom: 12 },
    currencySymbol: { fontSize: 36, fontWeight: '900', color: theme.colors.primary, marginRight: 10 },
    amountInput: { fontSize: 48, fontWeight: '900', color: theme.colors.onSurface, flex: 1, letterSpacing: -2 },
    
    // --- TRANSFER FLOW ---
    transferFlow: { gap: 12 },
    pocketSelectorSection: { marginBottom: 12 },
    subLabel: { fontSize: 15, fontWeight: '900', color: theme.colors.onSurface, marginBottom: 16, letterSpacing: -0.3 },
    
    pocketScroll: { marginHorizontal: -24, paddingHorizontal: 24 },
    pocketChip: { 
      width: width * 0.45,
      padding: 20, 
      borderRadius: 24, 
      backgroundColor: theme.colors.surface, 
      marginRight: 12, 
      borderWidth: 1.5, 
      borderColor: theme.colors.outlineVariant,
      ...theme.shadows.soft 
    },
    pocketChipActiveFrom: { 
      borderColor: theme.colors.tertiary, 
      backgroundColor: theme.colors.tertiaryContainer + '10',
      borderWidth: 2
    },
    pocketChipActiveTo: { 
      borderColor: theme.colors.primary, 
      backgroundColor: theme.colors.primaryContainer + '10',
      borderWidth: 2
    },
    pocketChipTxt: { fontSize: 16, fontWeight: '900', color: theme.colors.onSurface, marginBottom: 6 },
    pocketChipSub: { fontSize: 12, fontWeight: '700', color: theme.colors.onSurfaceVariant },
    
    arrowCenter: { 
      alignSelf: 'center', 
      width: 52, 
      height: 52, 
      borderRadius: 26, 
      backgroundColor: theme.colors.primaryContainer + '40', 
      alignItems: 'center', 
      justifyContent: 'center',
      marginVertical: 12,
      borderWidth: 1,
      borderColor: theme.colors.primary + '20'
    },

    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 24, paddingBottom: 40, backgroundColor: 'transparent' },
    saveBtn: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: 68, 
      borderRadius: 28, 
      backgroundColor: theme.colors.primary,
      ...theme.shadows.premium 
    },
    saveBtnDisabled: { backgroundColor: theme.colors.surfaceContainerHighest, opacity: 0.6 },
    saveBtnTxt: { color: '#FFF', fontSize: 18, fontWeight: '900', letterSpacing: -0.5 }
  }), [theme]);

  useEffect(() => {
    if (!toPocketId && fromPocketId) {
      const other = pockets.find(p => p.id !== fromPocketId);
      if (other) setToPocketId(other.id);
    }
  }, [fromPocketId]);

  const formatCurrency = (val: string) => {
    const numericValue = val.replace(/[^0-9]/g, '');
    if (!numericValue) return '';
    return parseInt(numericValue, 10).toLocaleString('es-CO');
  };

  const handleSave = async () => {
    const val = parseInt(amount.replace(/[^0-9]/g, ''), 10);
    if (!val || val <= 0) return alert('Monto inválido.');
    if (!fromPocketId || !toPocketId) return alert('Bolsillos incompletos.');
    if (fromPocketId === toPocketId) return alert('Origen y destino deben ser distintos.');

    const fromPocket = pockets.find(p => p.id === fromPocketId);
    if (fromPocket.budget < val) return alert(`Saldo insuficiente en ${fromPocket.name}.`);

    setIsSaving(true);
    try {
      const toPocket = pockets.find(p => p.id === toPocketId);
      await Promise.all([
        supabase.from('pockets').update({ budget: fromPocket.budget - val }).eq('id', fromPocketId),
        supabase.from('pockets').update({ budget: toPocket.budget + val }).eq('id', toPocketId),
        supabase.from('transactions').insert([
          { user_id: session.user.id, merchant: `Hacia ${toPocket.name}`, amount: -val, category: fromPocket.category, icon: 'repeat' },
          { user_id: session.user.id, merchant: `Desde ${fromPocket.name}`, amount: val, category: toPocket.category, icon: 'repeat' }
        ])
      ]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaveSuccess();
    } catch(e) {
      alert('Error en el traspaso.');
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 16 }]}>
        <TouchableOpacity style={styles.closeBtn} onPress={onCancel}>
          <X size={24} color={theme.colors.onSurface} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.title}>Traspaso Estratégico</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: Math.max(insets.top, 20) + 96 }]}>
        <View style={styles.card}>
          <Text style={styles.label}>FLUJO DE CAPITAL</Text>
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
        </View>

        <View style={styles.transferFlow}>
          <View style={styles.pocketSelectorSection}>
            <Text style={styles.subLabel}>Bolsillo de Origen</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pocketScroll}>
              {pockets.map(p => (
                <TouchableOpacity 
                   key={p.id} 
                   activeOpacity={0.8}
                   style={[styles.pocketChip, fromPocketId === p.id && styles.pocketChipActiveFrom]}
                   onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFromPocketId(p.id); }}
                >
                  <Text style={styles.pocketChipTxt}>{p.name}</Text>
                  <Text style={[styles.pocketChipSub, fromPocketId === p.id && { color: theme.colors.tertiary }]}>${p.budget.toLocaleString('es-CO')}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.arrowCenter}>
            <ArrowRightLeft size={24} color={theme.colors.primary} />
          </View>

          <View style={styles.pocketSelectorSection}>
            <Text style={styles.subLabel}>Destino de Fondos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pocketScroll}>
              {pockets.map(p => (
                <TouchableOpacity 
                  key={p.id} 
                  activeOpacity={0.8}
                  style={[styles.pocketChip, toPocketId === p.id && styles.pocketChipActiveTo]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setToPocketId(p.id); }}
                >
                  <Text style={styles.pocketChipTxt}>{p.name}</Text>
                  <Text style={[styles.pocketChipSub, toPocketId === p.id && { color: theme.colors.primary }]}>${p.budget.toLocaleString('es-CO')}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity 
          activeOpacity={0.9}
          style={[styles.saveBtn, (!amount || fromPocketId === toPocketId) && styles.saveBtnDisabled]} 
          onPress={handleSave} 
          disabled={isSaving || !amount || fromPocketId === toPocketId}
        >
          {isSaving ? <ActivityIndicator color="#FFF" /> : (
            <>
              <Text style={styles.saveBtnTxt}>Confirmar Traspaso</Text>
              <Repeat size={22} color="#FFF" style={{ marginLeft: 12 }} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};
