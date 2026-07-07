import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, Animated, StyleSheet, Alert, ScrollView, TextInput, Dimensions, ActivityIndicator, TouchableWithoutFeedback, Keyboard, KeyboardAvoidingView, Platform, Pressable
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import {
  Search, Filter, Trash2, ChevronRight, PieChart, ArrowDownRight, TrendingUp, ArrowRightLeft, X,
  ShieldCheck, Eye, AlertTriangle, Tag, CheckCircle2
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { normalize } from '../theme/theme';
import { getDeterministicColor } from '../theme/theme';
import { CategoryIcon } from '../components/CategoryIcon';
import { TransactionDetailModal } from '../components/TransactionDetailModal';
import { supabase } from '../lib/supabase';
import { formatMoney } from '../lib/format';
import { notify } from '../lib/notify';
import { CycleNav } from '../components/CycleNav';
import { useUserCycles } from '../lib/useCycleState';
import { BottomSheet } from '../components/BottomSheet';
import type { Session } from '@supabase/supabase-js';

const { width } = Dimensions.get('window');

export const Expenses = ({ transactions, onRefresh, session, pockets, onEditIncome }: { transactions: any[], onRefresh?: () => void, session: Session, pockets: any[], onEditIncome?: (tx: any) => void }) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [deletingTx, setDeletingTx] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const { cycles, activeCycle } = useUserCycles();
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);

  useEffect(() => {
    if (activeCycle && !selectedCycleId) {
      setSelectedCycleId(activeCycle.id);
    }
  }, [activeCycle]);

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    headerContainer: { paddingHorizontal: normalize(24), paddingBottom: normalize(16) },
    overviewCard: { 
      padding: 24, 
      borderRadius: theme.radius.xl, 
      overflow: 'hidden', 
      backgroundColor: theme.colors.glassWhite, 
      borderWidth: 1.5, 
      borderColor: theme.colors.divider, 
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
      borderColor: theme.colors.divider,
      ...theme.shadows.soft 
    },
    searchInput: { flex: 1, marginLeft: 12, fontSize: 15, fontWeight: '600', fontFamily: theme.fonts.body, letterSpacing: 0.3, color: theme.colors.onSurface },
    filterBtn: { 
      backgroundColor: theme.colors.glassWhite, 
      width: 52, 
      height: 52, 
      alignItems: 'center', 
      justifyContent: 'center', 
      borderRadius: theme.radius.md, 
      borderWidth: 1.5, 
      borderColor: theme.colors.divider,
      ...theme.shadows.soft 
    },
    

    navBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.glassWhite, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: theme.colors.divider, ...theme.shadows.soft },
  
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
      borderColor: theme.colors.divider
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

  const cycleTransactions = useMemo(() => {
    if (!selectedCycleId) return [];
    return (transactions || []).filter(tx => tx.cycle_id === selectedCycleId);
  }, [transactions, selectedCycleId]);

  const filteredTransactions = useMemo(() => {
    return cycleTransactions.filter(tx =>
      (tx.merchant.toLowerCase().includes(searchQuery.toLowerCase()) ||
       tx.category.toLowerCase().includes(searchQuery.toLowerCase())) &&
      (!filterCategory || tx.category === filterCategory)
    ).sort((a, b) => new Date((b.date_string || b.created_at || '0').split('T')[0] + 'T12:00:00').getTime() - new Date((a.date_string || a.created_at || '0').split('T')[0] + 'T12:00:00').getTime());
  }, [cycleTransactions, searchQuery, filterCategory]);

  const totalSpent = useMemo(() => {
    return filteredTransactions
      .filter(tx => 
        tx.category !== 'Ingreso' && 
        tx.category !== 'Traslado' && 
        Number(tx.amount) < 0 &&
        tx.metadata?.type !== 'internal_transfer_out' &&
        tx.metadata?.type !== 'internal_transfer_in'
      )
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
        notify.error('No se pudo eliminar el movimiento.');
      }
    } catch (e) {
      console.error(e);
      notify.error('Error en la operación.');
    } finally {
      setIsDeleting(false);
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
        {!selectedCycleId ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : (
          <>
            <Animated.View style={[styles.headerContainer, { opacity: fadeAnim, paddingTop: Math.max(insets.top, 16) + 104 }]}>
              {/* Navegación de Ciclo — componente compartido */}
              <CycleNav cycles={cycles} activeCycleId={selectedCycleId} onChange={setSelectedCycleId} />

            <View style={styles.overviewCard}>
               <View style={styles.overviewHeader}>
                  <View style={[styles.dotIndicator, { backgroundColor: theme.colors.error }]} />
                  <Text style={[styles.overviewTitle, { color: theme.colors.primary }]}>TOTAL GASTADO</Text>
               </View>
           <Text style={[styles.totalAmountText, { color: theme.colors.onSurface }]}>
              {formatMoney(totalSpent)}
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
            
              const txColor = getDeterministicColor(tx.category, theme.colors.pocketFlatColors as string[]);
              
              return (
                <TouchableOpacity
                  key={tx.id || idx}
                  style={styles.txRow}
                  onPress={() => setSelectedTx(tx)}
                  onLongPress={() => handleDeleteTrigger(tx)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.iconArea, 
                    { backgroundColor: (isIncome ? theme.colors.primary : isTransfer ? theme.colors.secondary : txColor) + '20' }
                  ]}>
                    <CategoryIcon 
                      iconName={isIncome ? 'trending-up' : isTransfer ? 'arrow-right-left' : (pockets?.find(p => p.name === tx.category)?.icon || tx.icon || 'tag')} 
                      size={20} 
                      color={isIncome ? theme.colors.primary : isTransfer ? theme.colors.secondary : txColor} 
                    />
                  </View>
                
                <View style={styles.txInfo}>
                  <Text style={styles.txMerchant} numberOfLines={1}>{tx.merchant || tx.category}</Text>
                  <Text style={styles.txCategory}>{tx.category} • {new Date((tx.date_string || tx.created_at).split('T')[0] + 'T12:00:00').toLocaleDateString('es-CO')}</Text>
                </View>

                <View style={styles.txAmtArea}>
                  <Text style={[
                      styles.txAmt, 
                      isIncome && { color: theme.colors.primary }, 
                      isTransfer && { color: theme.colors.secondary },
                      !isIncome && !isTransfer && { color: theme.colors.onSurface }
                  ]}>
                    {isIncome ? '+ ' : ''}{formatMoney(amt)}
                  </Text>
                  <ChevronRight size={16} color={theme.colors.outlineVariant} />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
          </>
        )}

      <BottomSheet visible={!!deletingTx} onClose={() => setDeletingTx(null)} title="Eliminar movimiento">
        {deletingTx && (
          <>
            <View style={styles.modalInfo}>
              <View style={[styles.modalIconCircle, { backgroundColor: theme.colors.error + '12' }]}>
                <Trash2 size={28} color={theme.colors.error} />
              </View>
              <Text style={styles.modalMerchant}>{deletingTx.merchant}</Text>
              <Text style={styles.modalAmt}>{formatMoney(Math.abs(deletingTx.amount))}</Text>
              <Text style={styles.modalSub}>Al borrarlo, el presupuesto de tus bolsillos se ajustará automáticamente.</Text>
            </View>

            <TouchableOpacity
              style={[styles.modalConfirmBtn, { backgroundColor: theme.colors.error }, isDeleting && { opacity: 0.7 }]}
              onPress={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalConfirmTxt}>Eliminar movimiento</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setDeletingTx(null)}>
              <Text style={[styles.modalCancelTxt, { color: theme.colors.onSurfaceVariant }]}>No, mantener</Text>
            </TouchableOpacity>
          </>
        )}
      </BottomSheet>
      
      <TransactionDetailModal 
        visible={!!selectedTx}
        transaction={selectedTx}
        pockets={pockets}
        onClose={() => setSelectedTx(null)}
        onEdit={onEditIncome}
      />
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
};
