import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Dimensions, KeyboardAvoidingView, Platform, ActivityIndicator, TouchableWithoutFeedback, Keyboard, Animated, Modal } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { X, ArrowRightLeft, ArrowRight, CheckCircle2, ChevronDown, Repeat, ArrowDown } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { useTheme } from '../theme/ThemeContext';
import { normalize } from '../theme/theme';
import { supabase } from '../lib/supabase';
import { formatMoney, formatMoneyDigits } from '../lib/format';
import { useCurrency } from '../lib/CurrencyContext';
import { notify } from '../lib/notify';
import type { Session } from '@supabase/supabase-js';

const { width } = Dimensions.get('window');

export const PocketTransfer = ({ pockets, session, onCancel, onSaveSuccess, initialParams }: { pockets: any[], session: Session, onCancel: () => void, onSaveSuccess: () => void, initialParams?: { fromId?: string, toId?: string, amount?: number } }) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { symbol, currency } = useCurrency();
  const [amount, setAmount] = useState(initialParams?.amount ? initialParams.amount.toString() : '');
  const [fromPocketId, setFromPocketId] = useState<string | null>(initialParams?.fromId || pockets[0]?.id || null);
  const [toPocketId, setToPocketId] = useState<string | null>(initialParams?.toId || null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0)).current;

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    // --- NEW STYLES (MATCHING SCANNER) ---
    scannerContainer: { flex: 1, backgroundColor: theme.colors.background }, // Matches app background
    scannerTopBar: { position: 'absolute', top: 0, width: '100%', zIndex: 100, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center' },
    closeBtn: { 
      width: 48, 
      height: 48, 
      borderRadius: 24, 
      backgroundColor: theme.colors.surface, 
      alignItems: 'center', 
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: theme.colors.outlineVariant
    },
    scannerBadge: { 
      paddingHorizontal: 14, 
      paddingVertical: 8, 
      borderRadius: 20, 
      borderWidth: 1.5, 
      borderColor: theme.colors.primary + '30',
      backgroundColor: theme.colors.primaryContainer,
      ...theme.shadows.premium 
    },
    scannerBadgeText: { color: theme.colors.primary, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5 },
    
    scannerProgressCard: { 
      paddingVertical: 24,
      paddingHorizontal: 16, 
      borderRadius: 36, 
      overflow: 'hidden', 
      backgroundColor: theme.colors.glassWhite,
      borderWidth: 1.5, 
      borderColor: theme.colors.divider,
      ...theme.shadows.premium 
    },
    
    premiumAmountBox: { alignItems: 'center', marginBottom: 24 },
    premiumAmountLabel: { fontSize: 12, color: theme.colors.primary, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
    modernAmountInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    modernCurrencySymbol: { fontSize: 24, fontWeight: '800', color: theme.colors.onSurface, marginRight: 4 },
    modernAmountInput: { fontSize: 52, fontWeight: '900', color: theme.colors.onSurface, textAlign: 'center', letterSpacing: -2, minWidth: 120 },
    copBadge: { fontSize: 12, fontWeight: '900', color: theme.colors.primary, marginLeft: 8 },
    
    premiumDetailItem: { 
      marginBottom: 0
    },
    arrowContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 16
    },
    premiumIconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primaryContainer },
    premiumDetailLabel: { fontSize: 11, fontWeight: '900', color: theme.colors.primary, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12, textAlign: 'center' },
    premiumDetailValue: { fontSize: 16, fontWeight: '800', color: theme.colors.onSurface, paddingVertical: 4 },
    
    categoryPicker: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 24 },
    catChip: { 
      paddingHorizontal: 14, 
      paddingVertical: 10, 
      borderRadius: 14, 
      backgroundColor: theme.colors.surface,
      borderWidth: 1.5,
      borderColor: theme.colors.outlineVariant
    },
    catChipActive: { backgroundColor: theme.colors.primaryContainer, borderColor: theme.colors.primary },
    catText: { fontSize: 13, fontWeight: '800', color: theme.colors.onSurfaceVariant },
    catTextActive: { color: theme.colors.primary },

    premiumConfirmBtn: { borderRadius: 24, overflow: 'hidden', height: 64, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', ...theme.shadows.soft },
    premiumConfirmBtnText: { color: theme.colors.onPrimary, fontWeight: '900', fontSize: 17, letterSpacing: -0.3 }
  }), [theme]);

  useEffect(() => {
    if (!toPocketId && fromPocketId) {
      const other = pockets.find(p => p.id !== fromPocketId);
      if (other) setToPocketId(other.id);
    }
  }, [fromPocketId]);

  // formatMoneyDigits importado de lib/format.
  const formatCurrency = formatMoneyDigits;

  const handleSave = async () => {
    const val = parseInt(amount.replace(/[^0-9]/g, ''), 10);
    if (!val || val <= 0) return notify.error('Monto inválido.');
    if (!fromPocketId || !toPocketId) return notify.error('Bolsillos incompletos.');
    if (fromPocketId === toPocketId) return notify.error('Origen y destino deben ser distintos.');

    setIsSaving(true);
    try {
      const { error } = await supabase.rpc('transfer_between_pockets', {
        p_user_id: session.user.id,
        p_from_id: fromPocketId,
        p_to_id: toPocketId,
        p_amount: val
      });

      if (error) throw error;

      setIsSaving(false);
      setSaved(true);

      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.delay(600),
        Animated.timing(scaleAnim, { toValue: 0, duration: 200, useNativeDriver: true })
      ]).start(() => {
        onSaveSuccess();
      });

      setTimeout(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }, 150);
    } catch(e: any) {
      console.log('Transfer error:', e);
      if (e?.message) {
        notify.error(e.message);
      } else {
        notify.error('Error en el traspaso.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView style={[styles.scannerContainer, { flex: 1, backgroundColor: theme.colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        
        <View style={[styles.scannerTopBar, { paddingTop: Math.max(insets.top, 16) + 16 }]}>
          <TouchableOpacity 
            style={[styles.closeBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} 
            onPress={() => { onCancel(); Keyboard.dismiss(); }}
          >
            <X size={24} color={theme.colors.onSurface} strokeWidth={2.5} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={[styles.scannerBadge, { backgroundColor: theme.colors.primaryContainer, borderColor: theme.colors.primary + '30' }]}>
            <Text style={[styles.scannerBadgeText, { color: theme.colors.primary }]}>Mover Plata</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: Math.max(insets.top, 16) + 80, paddingBottom: Math.max(insets.bottom, 24) + 20, paddingHorizontal: 16 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <BlurView intensity={Platform.OS === 'ios' ? 95 : 100} tint={theme.isDark ? 'dark' : 'light'} style={styles.scannerProgressCard}>
              <View style={styles.premiumAmountBox}>
                <Text style={styles.premiumAmountLabel}>Monto a Mover</Text>
                <View style={styles.modernAmountInputRow}>
                  <Text style={styles.modernCurrencySymbol}>{symbol}</Text>
                  <TextInput
                    style={styles.modernAmountInput}
                    value={amount}
                    onChangeText={(t) => setAmount(formatCurrency(t))}
                    keyboardType="numeric"
                    selectionColor={theme.colors.primary}
                    placeholder="0"
                    placeholderTextColor={theme.colors.onSurfaceVariant}
                    autoFocus
                  />
                  <Text style={styles.copBadge}>{currency}</Text>
                </View>
              </View>

              <View style={styles.premiumDetailItem}>
                  <Text style={styles.premiumDetailLabel}>Bolsillo de Origen</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}>
                    {pockets.map(p => (
                      <TouchableOpacity 
                        key={`from-${p.id}`} 
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFromPocketId(p.id); }}
                        style={[styles.catChip, fromPocketId === p.id && styles.catChipActive]}
                      >
                        <Text style={[styles.catText, fromPocketId === p.id && styles.catTextActive]}>{p.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
              </View>

              <View style={styles.arrowContainer}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
                  <ArrowDown size={20} color={theme.colors.primary} />
                </View>
              </View>

              <View style={styles.premiumDetailItem}>
                  <Text style={styles.premiumDetailLabel}>Destino de Fondos</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}>
                    {pockets.map(p => (
                      <TouchableOpacity 
                        key={`to-${p.id}`} 
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setToPocketId(p.id); }}
                        style={[styles.catChip, toPocketId === p.id && styles.catChipActive]}
                      >
                        <Text style={[styles.catText, toPocketId === p.id && styles.catTextActive]}>{p.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
              </View>

              <TouchableOpacity
                onPress={handleSave}
                disabled={isSaving || !amount || fromPocketId === toPocketId || saved}
                style={[styles.premiumConfirmBtn, { marginTop: 32 }, (isSaving || !amount || fromPocketId === toPocketId || saved) && { opacity: 0.6 }]}
              >
                {isSaving
                  ? <ActivityIndicator color={theme.colors.onPrimary} />
                  : <Text style={styles.premiumConfirmBtnText}>Confirmar Traspaso</Text>}
              </TouchableOpacity>
            </BlurView>
        </ScrollView>

        {saved && (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.colors.background, zIndex: 9999, alignItems: 'center', justifyContent: 'center' }]}>
            <Animated.View style={{
              transform: [{ scale: scaleAnim }],
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 40,
              paddingHorizontal: 32,
              borderRadius: 32,
              backgroundColor: theme.colors.glassWhite,
              borderWidth: 1,
              borderColor: theme.colors.divider,
              ...theme.shadows.premium
            }}>
              <View style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 24, backgroundColor: theme.colors.primaryContainer, borderWidth: 1, borderColor: theme.colors.primary }}>
                <CheckCircle2 size={40} color={theme.colors.primary} strokeWidth={2.5} />
              </View>
              
              <Text style={{ fontSize: 16, color: theme.colors.onSurfaceVariant, marginBottom: 8, letterSpacing: 1, fontWeight: '500' }}>
                TRASPASO EXITOSO
              </Text>
              
              <Text style={{ fontSize: 40, fontWeight: '900', color: theme.colors.onSurface, marginBottom: 8, letterSpacing: -1 }}>
                {symbol}{amount}
              </Text>
              
            </Animated.View>
          </View>
        )}
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
};
