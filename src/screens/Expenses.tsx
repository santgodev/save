import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, Animated, StyleSheet, Alert, ScrollView, TextInput, Dimensions, ActivityIndicator, TouchableWithoutFeedback, Keyboard, KeyboardAvoidingView, Platform, Pressable
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import {
  Search, Filter, Trash2, ChevronRight, PieChart, ArrowDownRight, TrendingUp, ArrowRightLeft, X,
  ChevronLeft, ShieldCheck, Eye, AlertTriangle, Tag, CheckCircle2
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { normalize } from '../theme/theme';
import { CategoryIcon } from '../components/CategoryIcon';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');

export const Expenses = ({ transactions, onRefresh, session, pockets }: { transactions: any[], onRefresh?: () => void, session: any, pockets: any[] }) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [deletingTx, setDeletingTx] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [markingTx, setMarkingTx] = useState<any>(null);
  const [isMarking, setIsMarking] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());

  const MONTHS = [
    { label: 'Enero', value: 0 }, { label: 'Febrero', value: 1 }, { label: 'Marzo', value: 2 },
    { label: 'Abril', value: 3 }, { label: 'Mayo', value: 4 }, { label: 'Junio', value: 5 },
    { label: 'Julio', value: 6 }, { label: 'Agosto', value: 7 }, { label: 'Septiembre', value: 8 },
    { label: 'Octubre', value: 9 }, { label: 'Noviembre', value: 10 }, { label: 'Diciembre', value: 11 }
  ];

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    headerContainer: { paddingHorizontal: normalize(24), paddingBottom: normalize(16) },
    overviewCard: { 
      padding: 24, 
      borderRadius: theme.radius.xl, 
      overflow: 'hidden', 
      backgroundColor: theme.colors.glassWhite, 
      borderWidth: 1.5, 
      borderColor: 'rgba(255,255,255,0.8)', 
      ...theme.shadows.md 
    },
    overviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: normalize(12) },
    dotIndicator: { width: 8, height: 8, borderRadius: 4 },
    overviewTitle: { fontSize: normalize(9), fontWeight: '900', color: theme.colors.primary, letterSpacing: 1.5, textTransform: 'uppercase' },
    totalAmountText: { fontSize: normalize(44), fontWeight: '900', color: theme.colors.onSurface, letterSpacing: -2 },
    trendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: normalize(8) },
    trendText: { fontSize: normalize(12), color: theme.colors.onSurfaceVariant, fontWeight: '700' },
    
    searchRow: { flexDirection: 'row', gap: 12, marginTop: normalize(24) },
    searchBar: { 
      flex: 1, 
      flexDirection: 'row', 
      alignItems: 'center', 
      backgroundColor: theme.colors.glassWhite, 
      paddingHorizontal: 16, 
      paddingVertical: 12, 
      borderRadius: theme.radius.md, 
      borderWidth: 1.5, 
      borderColor: 'rgba(255,255,255,0.7)',
      ...theme.shadows.soft 
    },
    searchInput: { flex: 1, marginLeft: 12, fontSize: 15, fontWeight: '700', color: theme.colors.onSurface },
    filterBtn: { 
      backgroundColor: theme.colors.glassWhite, 
      width: 52, 
      height: 52, 
      alignItems: 'center', 
      justifyContent: 'center', 
      borderRadius: theme.radius.md, 
      borderWidth: 1.5, 
      borderColor: 'rgba(255,255,255,0.7)',
      ...theme.shadows.soft 
    },
    
    // Mes Nav
    monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 20 },
    monthTitle: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3, color: theme.colors.onSurface },
    navBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.glassWhite, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)', ...theme.shadows.soft },
  
    scrollContent: { paddingHorizontal: normalize(24), paddingBottom: 120 },
    txRow: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      backgroundColor: theme.colors.glassWhite, 
      padding: 16, 
      borderRadius: theme.radius.lg, 
      marginBottom: 14, 
      borderWidth: 1, 
      borderColor: theme.colors.divider,
      ...theme.shadows.sm 
    },
    iconArea: { width: normalize(52), height: normalize(52), borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primaryContainer },
    txInfo: { flex: 1, marginLeft: normalize(16) },
    txMerchant: { fontSize: normalize(16), fontWeight: '900', color: theme.colors.onSurface, letterSpacing: -0.3 },
    txCategory: { fontSize: normalize(10), fontWeight: '800', color: theme.colors.primary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
    txAmtArea: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    txAmt: { fontSize: normalize(16), fontWeight: '900', letterSpacing: -0.5 },
  
    chipRow: { flexDirection: 'row', gap: 8, marginTop: 14, marginBottom: 10 },
    chip: { 
      paddingHorizontal: 20, 
      paddingVertical: 10, 
      borderRadius: 14, 
      backgroundColor: theme.colors.primaryContainer, 
      marginRight: 10,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.5)'
    },
    chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    chipText: { fontSize: 13, fontWeight: '800', color: theme.colors.primary },
    chipTextActive: { color: theme.colors.onPrimary },
  
    emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 80, gap: 16 },
    emptyStateTitle: { fontSize: normalize(18), color: theme.colors.onSurfaceVariant, fontWeight: '900', opacity: 0.4 },
    longPressHint: { fontSize: normalize(11), color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 20, marginBottom: 8, fontStyle: 'italic', opacity: 0.5 },
  
    modalOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
    modalContainer: { borderRadius: 36, padding: 32, paddingBottom: 24, borderWidth: 1, borderColor: theme.colors.divider, ...theme.shadows.premium },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    modalTitle: { fontSize: 12, fontWeight: '900', color: theme.colors.primary, letterSpacing: 2, textTransform: 'uppercase' },
    modalInfo: { alignItems: 'center', marginBottom: 32 },
    modalIconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    modalMerchant: { fontSize: 20, fontWeight: '900', textAlign: 'center', color: theme.colors.onSurface },
    modalAmt: { fontSize: 32, fontWeight: '900', marginVertical: 10, color: theme.colors.onSurface },
    modalSub: { fontSize: 14, textAlign: 'center', lineHeight: 20, color: theme.colors.onSurfaceVariant, paddingHorizontal: 10 },
    modalConfirmBtn: { paddingVertical: 18, borderRadius: theme.radius.lg, alignItems: 'center', marginBottom: 12, ...theme.shadows.soft },
    modalConfirmTxt: { color: '#FFF', fontSize: 16, fontWeight: '900' },
    modalCancelBtn: { paddingVertical: 14, alignItems: 'center' },
    modalCancelTxt: { fontSize: 14, fontWeight: '800' },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' },
  }), [theme]);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  const monthTransactions = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    return (transactions || []).filter(tx => {
      const date = new Date((tx.date_string || tx.created_at).split('T')[0] + 'T12:00:00');
      return date.getMonth() === selectedMonth && date.getFullYear() === currentYear;
    });
  }, [transactions, selectedMonth]);

  const filteredTransactions = useMemo(() => {
    return monthTransactions.filter(tx =>
      (tx.merchant.toLowerCase().includes(searchQuery.toLowerCase()) ||
       tx.category.toLowerCase().includes(searchQuery.toLowerCase())) &&
      (!filterCategory || tx.category === filterCategory)
    ).sort((a, b) => new Date((b.date_string || b.created_at || '0').split('T')[0] + 'T12:00:00').getTime() - new Date((a.date_string || a.created_at || '0').split('T')[0] + 'T12:00:00').getTime());
  }, [monthTransactions, searchQuery, filterCategory]);

  const totalSpent = useMemo(() => {
    // Alinear con la lógica del backend (get_monthly_state):
    // Solo sumar cantidades negativas y excluir 'Ingreso' y 'Traslado'.
    return filteredTransactions
      .filter(tx => tx.category !== 'Ingreso' && tx.category !== 'Traslado' && Number(tx.amount) < 0)
      .reduce((acc, tx) => acc + Math.abs(Number(tx.amount)), 0);
  }, [filteredTransactions]);

  const handleConfirmDelete = async () => {
    if (!deletingTx || isDeleting) return;
    setIsDeleting(true);

    try {
      const { error } = await supabase.rpc('delete_transaction_with_reversal', {
        p_tx_id: deletingTx.id,
        p_user_id: session.user.id
      });

      if (!error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setDeletingTx(null);
        if (onRefresh) onRefresh();
      } else {
        alert('No se pudo eliminar el movimiento.');
      }
    } catch (e) {
      console.error(e);
      alert('Error en la operación.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Marca un comercio con una regla de gasto. UPSERT por (user_id, canonical_pattern).
  // El advisor lee esto en cada turno del chat y modula el tono.
  //   confidence  → no me alertes por gastos en este merchant
  //   monitor     → muéstrame si cambia mucho
  //   reduce      → alértame, quiero gastar menos
  const markMerchant = async (rule: 'confidence' | 'monitor' | 'reduce') => {
    if (!markingTx || isMarking) return;
    setIsMarking(true);
    try {
      const pattern = markingTx.merchant ?? '';
      const canonical = markingTx.canonical_merchant
        ?? pattern.toLowerCase().trim().replace(/\s+/g, ' ');
      const { error } = await supabase
        .from('user_spending_rules')
        .upsert({
          user_id: session.user.id,
          pattern,
          canonical_pattern: canonical,
          display_name: pattern,
          type: rule,
          last_used_at: new Date().toISOString(),
        }, { onConflict: 'user_id,canonical_pattern' });
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowSuccess(true);
      
      setTimeout(() => {
        setMarkingTx(null);
        setShowSuccess(false);
        if (onRefresh) onRefresh();
      }, 1500);
    } catch (e) {
      console.error('markMerchant', e);
      Alert.alert('Ups', 'No pudimos guardar la regla.');
    } finally {
      setIsMarking(false);
    }
  };

  const handleDeleteTrigger = (tx: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setDeletingTx(tx);
  };

  const availableCategories = [...new Set(transactions.map(tx => tx.category))].filter(Boolean) as string[];

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Animated.View style={[styles.headerContainer, { opacity: fadeAnim, paddingTop: Math.max(insets.top, 16) + 104 }]}>
        {/* Navegación de Mes */}
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedMonth(p => (p - 1 + 12) % 12); }} style={styles.navBtn}>
            <ChevronLeft size={18} color={theme.colors.onSurface} />
          </TouchableOpacity>
          <Text style={styles.monthTitle}>{MONTHS[selectedMonth].label}</Text>
          <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedMonth(p => (p + 1) % 12); }} style={styles.navBtn}>
            <ChevronRight size={18} color={theme.colors.onSurface} />
          </TouchableOpacity>
        </View>

        <View style={styles.overviewCard}>
           <View style={styles.overviewHeader}>
              <View style={[styles.dotIndicator, { backgroundColor: theme.colors.error }]} />
              <Text style={[styles.overviewTitle, { color: theme.colors.primary }]}>TOTAL GASTADO</Text>
           </View>
           <Text style={[styles.totalAmountText, { color: theme.colors.onSurface }]}>
              $ {totalSpent.toLocaleString('es-CO')}
           </Text>
           <View style={styles.trendRow}>
              <TrendingUp size={14} color={theme.colors.onSurfaceVariant} />
              <Text style={styles.trendText}>Consumo en el periodo seleccionado</Text>
           </View>
        </View>

           <View style={styles.searchRow}>
              <View style={styles.searchBar}>
                <Search size={18} color={theme.colors.primary} strokeWidth={2.5} />
                <TextInput 
                  placeholder="Buscar movimientos..." 
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholderTextColor={theme.colors.onSurfaceVariant + '80'}
                />
              </View>
              <TouchableOpacity
                style={[styles.filterBtn, showFilter && { backgroundColor: theme.colors.primaryContainer, borderColor: theme.colors.primary }]}
                onPress={() => { setShowFilter(v => !v); if (showFilter) setFilterCategory(null); }}
              >
                <Filter size={20} color={theme.colors.primary} />
              </TouchableOpacity>
           </View>
           {showFilter && (
             <View style={styles.chipRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <TouchableOpacity
                    onPress={() => setFilterCategory(null)}
                    style={[styles.chip, !filterCategory && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, !filterCategory && styles.chipTextActive]}>Todos</Text>
                  </TouchableOpacity>
                  {availableCategories.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => setFilterCategory(cat)}
                      style={[styles.chip, filterCategory === cat && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, filterCategory === cat && styles.chipTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
             </View>
           )}
      </Animated.View>

      <ScrollView 
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
      >
        {filteredTransactions.length === 0 ? (
          <View style={styles.emptyState}>
            <Search size={normalize(64)} color={theme.colors.outlineVariant} />
            <Text style={styles.emptyStateTitle}>Sin resultados</Text>
          </View>
        ) : (
          filteredTransactions.map((tx, idx) => {
            const isIncome = tx.category === 'Ingreso';
            const isTransfer = tx.category === 'Traslado';
            const amt = Math.abs(tx.amount);
            
            return (
              <TouchableOpacity
                key={tx.id || idx}
                style={styles.txRow}
                onPress={() => {
                  // Tap = marcar comercio (no aplica a Ingreso ni Traslado).
                  if (isIncome || isTransfer) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setMarkingTx(tx);
                }}
                onLongPress={() => handleDeleteTrigger(tx)}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.iconArea, 
                  { backgroundColor: (theme.colors.categoryColors[tx.category] || theme.colors.categoryColors['Otros'])[0] + '15' }
                ]}>
                  <CategoryIcon 
                    iconName={isIncome ? 'trending-up' : isTransfer ? 'arrow-right-left' : tx.icon} 
                    size={20} 
                    color={(theme.colors.categoryColors[tx.category] || theme.colors.categoryColors['Otros'])[0]} 
                  />
                </View>
                
                <View style={styles.txInfo}>
                  <Text style={styles.txMerchant} numberOfLines={1}>{tx.merchant}</Text>
                  <Text style={styles.txCategory}>{tx.category} • {new Date((tx.date_string || tx.created_at).split('T')[0] + 'T12:00:00').toLocaleDateString('es-CO')}</Text>
                </View>

                <View style={styles.txAmtArea}>
                  <Text style={[
                      styles.txAmt, 
                      isIncome && { color: theme.colors.primary }, 
                      isTransfer && { color: theme.colors.secondary },
                      !isIncome && !isTransfer && { color: theme.colors.onSurface }
                  ]}>
                    {isIncome ? '+ ' : ''}$ {amt.toLocaleString('es-CO')}
                  </Text>
                  <ChevronRight size={16} color={theme.colors.outlineVariant} />
                </View>
              </TouchableOpacity>
            );
          })
        )}
        {filteredTransactions.length > 0 && <Text style={styles.longPressHint}>Toca para marcar el comercio · mantén presionado para eliminar</Text>}
      </ScrollView>

      {deletingTx && (
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setDeletingTx(null)}>
            <BlurView intensity={theme.mode === 'honey' ? 40 : 20} tint="dark" style={StyleSheet.absoluteFill} />
          </TouchableOpacity>
          <View style={[styles.modalContainer, { width: width * 0.88, backgroundColor: theme.colors.surface }]}>
             <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Eliminar Movimiento</Text>
                <TouchableOpacity onPress={() => setDeletingTx(null)} style={{ padding: 8 }}>
                   <X color={theme.colors.onSurfaceVariant} size={20} />
                </TouchableOpacity>
             </View>
             
             <View style={styles.modalInfo}>
                <View style={[styles.modalIconCircle, { backgroundColor: theme.colors.error + '12' }]}>
                   <Trash2 size={28} color={theme.colors.error} />
                </View>
                <Text style={styles.modalMerchant}>{deletingTx.merchant}</Text>
                <Text style={styles.modalAmt}>$ {Math.abs(deletingTx.amount).toLocaleString('es-CO')}</Text>
                <Text style={styles.modalSub}>Al borrarlo, el presupuesto de tus bolsillos se ajustará automáticamente.</Text>
             </View>
             
             <TouchableOpacity 
               style={[styles.modalConfirmBtn, { backgroundColor: theme.colors.error }, isDeleting && { opacity: 0.7 }]} 
               onPress={handleConfirmDelete}
               disabled={isDeleting}
             >
                {isDeleting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalConfirmTxt}>Confirmar y Reversar</Text>}
             </TouchableOpacity>

             <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setDeletingTx(null)}>
                <Text style={[styles.modalCancelTxt, { color: theme.colors.onSurfaceVariant }]}>No, mantener</Text>
             </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Modal: marcar comercio con una regla de gasto (Premium BottomSheet Style) */}
      {markingTx && (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 5000 }]} pointerEvents="box-none">
          <Pressable style={styles.modalOverlay} onPress={() => setMarkingTx(null)}>
            <BlurView intensity={theme.mode === 'honey' ? 40 : 20} tint="dark" style={StyleSheet.absoluteFill} />
          </Pressable>
          
          <View style={[
            styles.modalContainer, 
            { 
              backgroundColor: theme.colors.background,
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              width: '100%',
              paddingBottom: Math.max(insets.bottom, 24) + normalize(90),
              paddingTop: 12,
              borderTopWidth: 1,
              borderColor: theme.colors.divider,
              zIndex: 5000,
              ...theme.shadows.premium
            }
          ]}>
            <View style={{ width: 40, height: 4, backgroundColor: theme.colors.outlineVariant, borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
            
            {showSuccess ? (
              <Animated.View 
                entering={undefined /* Sería ideal un FadeIn pero no tenemos Reanimated aquí */} 
                style={{ padding: 40, alignItems: 'center', justifyContent: 'center' }}
              >
                <View style={{ 
                  width: 80, height: 80, borderRadius: 40, 
                  backgroundColor: theme.colors.successContainer, 
                  alignItems: 'center', justifyContent: 'center',
                  marginBottom: 24,
                  ...theme.shadows.soft
                }}>
                  <CheckCircle2 size={44} color={theme.colors.success} strokeWidth={2.5} />
                </View>
                <Text style={{ fontSize: 24, fontWeight: '900', color: theme.colors.onSurface, marginBottom: 8 }}>¡Listo!</Text>
                <Text style={{ fontSize: 15, color: theme.colors.onSurfaceVariant, textAlign: 'center', fontWeight: '600' }}>
                  Tu preferencia ha sido guardada.
                </Text>
              </Animated.View>
            ) : (
              <>
                <View style={[styles.modalHeader, { paddingHorizontal: 24 }]}>
                  <Text style={[styles.modalTitle, { fontSize: 20 }]}>Etiquetar Comercio</Text>
                  <TouchableOpacity onPress={() => setMarkingTx(null)} style={styles.closeBtn}>
                    <X color={theme.colors.onSurface} size={18} strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>

                <View style={{ paddingHorizontal: 24, marginBottom: 24, alignItems: 'center' }}>
                  <View style={{ 
                    width: 64, height: 64, borderRadius: 24, 
                    backgroundColor: theme.colors.primaryContainer, 
                    alignItems: 'center', justifyContent: 'center',
                    marginBottom: 16,
                    borderWidth: 1,
                    borderColor: theme.colors.primary + '20'
                  }}>
                    <Tag size={32} color={theme.colors.primary} />
                  </View>
                  <Text style={[styles.modalMerchant, { fontSize: 22, textAlign: 'center' }]}>{markingTx.merchant}</Text>
                  <Text style={[styles.modalSub, { textAlign: 'center', marginTop: 8, paddingHorizontal: 20 }]}>
                    Define cómo el asesor debe interpretar tus gastos en este lugar.
                  </Text>
                </View>

                <View style={{ gap: 12, paddingHorizontal: 24 }}>
                  {[
                    { 
                      type: 'confidence' as const, 
                      label: 'Confianza', 
                      desc: 'Gasto recurrente y necesario. Sin alertas.', 
                      icon: ShieldCheck, 
                      color: theme.colors.success,
                      bg: theme.colors.successContainer 
                    },
                    { 
                      type: 'monitor' as const, 
                      label: 'Vigilar', 
                      desc: 'Mantener bajo la lupa. Avísame de cambios.', 
                      icon: Eye, 
                      color: theme.colors.primary,
                      bg: theme.colors.primaryContainer 
                    },
                    { 
                      type: 'reduce' as const, 
                      label: 'Reducir', 
                      desc: 'Gasto a optimizar. Ayúdame a gastar menos.', 
                      icon: AlertTriangle, 
                      color: theme.colors.error,
                      bg: theme.colors.errorContainer 
                    }
                  ].map((item) => (
                    <TouchableOpacity
                      key={item.type}
                      onPress={() => markMerchant(item.type)}
                      disabled={isMarking}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 16,
                        padding: 18, borderRadius: 24,
                        backgroundColor: item.bg + (theme.mode === 'honey' ? '40' : '80'),
                        borderWidth: 1.5, borderColor: item.color + '20',
                      }}
                    >
                      <View style={{ 
                        width: 44, height: 44, borderRadius: 14, 
                        backgroundColor: '#FFF', 
                        alignItems: 'center', justifyContent: 'center',
                        ...theme.shadows.soft
                      }}>
                        {isMarking ? (
                          <ActivityIndicator size="small" color={item.color} />
                        ) : (
                          <item.icon size={22} color={item.color} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.onSurface }}>{item.label}</Text>
                        <Text style={{ fontSize: 12, color: theme.colors.onSurfaceVariant, marginTop: 2, fontWeight: '600' }}>{item.desc}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </View>
        </View>
      )}
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
};
