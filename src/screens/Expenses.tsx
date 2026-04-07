import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, Animated, StyleSheet, Alert, ScrollView, TextInput, Dimensions, ActivityIndicator
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { 
  Search, Filter, Trash2, ChevronRight, PieChart, ArrowDownRight, TrendingUp, ArrowRightLeft, X 
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

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    headerContainer: { paddingHorizontal: normalize(24), paddingBottom: normalize(16) },
    overviewCard: { 
      padding: normalize(24), 
      borderRadius: normalize(32), 
      overflow: 'hidden', 
      backgroundColor: theme.colors.surface, 
      borderWidth: 1, 
      borderColor: theme.colors.outlineVariant, 
      ...theme.shadows.premium 
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
      backgroundColor: theme.colors.surface, 
      paddingHorizontal: normalize(16), 
      paddingVertical: normalize(12), 
      borderRadius: 20, 
      borderWidth: 1, 
      borderColor: theme.colors.outlineVariant,
      ...theme.shadows.soft 
    },
    searchInput: { flex: 1, marginLeft: 12, fontSize: normalize(15), fontWeight: '700', color: theme.colors.onSurface },
    filterBtn: { 
      backgroundColor: theme.colors.surface, 
      width: normalize(56), 
      height: normalize(56), 
      alignItems: 'center', 
      justifyContent: 'center', 
      borderRadius: 24, 
      borderWidth: 1, 
      borderColor: theme.colors.outlineVariant,
      ...theme.shadows.soft 
    },
  
    scrollContent: { paddingHorizontal: normalize(24), paddingBottom: 120 },
    txRow: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      backgroundColor: theme.colors.surface, 
      padding: normalize(16), 
      borderRadius: normalize(28), 
      marginBottom: normalize(16), 
      borderWidth: 1, 
      borderColor: theme.colors.outlineVariant,
      ...theme.shadows.soft 
    },
    iconArea: { width: normalize(52), height: normalize(52), borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceContainerLow },
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
      backgroundColor: theme.colors.surfaceContainerHigh, 
      marginRight: 10,
      borderWidth: 1,
      borderColor: 'transparent'
    },
    chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    chipText: { fontSize: 13, fontWeight: '800', color: theme.colors.onSurfaceVariant },
    chipTextActive: { color: theme.colors.onPrimary },
  
    emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 80, gap: 16 },
    emptyStateTitle: { fontSize: normalize(18), color: theme.colors.onSurfaceVariant, fontWeight: '900', opacity: 0.4 },
    longPressHint: { fontSize: normalize(11), color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 20, marginBottom: 8, fontStyle: 'italic', opacity: 0.5 },
  
    modalOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    modalContainer: { width: width * 0.88, borderRadius: 36, padding: 32, paddingBottom: 24, ...theme.shadows.premium },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    modalTitle: { fontSize: 12, fontWeight: '900', color: theme.colors.onSurfaceVariant, letterSpacing: 2, textTransform: 'uppercase' },
    modalInfo: { alignItems: 'center', marginBottom: 32 },
    modalIconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    modalMerchant: { fontSize: 20, fontWeight: '900', textAlign: 'center', color: theme.colors.onSurface },
    modalAmt: { fontSize: 32, fontWeight: '900', marginVertical: 10, color: theme.colors.onSurface },
    modalSub: { fontSize: 14, textAlign: 'center', lineHeight: 20, color: theme.colors.onSurfaceVariant, paddingHorizontal: 10 },
    modalConfirmBtn: { paddingVertical: 20, borderRadius: 24, alignItems: 'center', marginBottom: 12, ...theme.shadows.soft },
    modalConfirmTxt: { color: '#FFF', fontSize: 17, fontWeight: '900' },
    modalCancelBtn: { paddingVertical: 14, alignItems: 'center' },
    modalCancelTxt: { fontSize: 15, fontWeight: '800' },
  }), [theme]);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  const filteredTransactions = transactions.filter(tx =>
    (tx.merchant.toLowerCase().includes(searchQuery.toLowerCase()) ||
     tx.category.toLowerCase().includes(searchQuery.toLowerCase())) &&
    (!filterCategory || tx.category === filterCategory)
  ).sort((a, b) => new Date(b.date_string || b.created_at || 0).getTime() - new Date(a.date_string || a.created_at || 0).getTime());

  const totalSpent = filteredTransactions.reduce((acc, tx) => acc + (tx.category === 'Ingreso' ? tx.amount : -Math.abs(tx.amount)), 0);

  const handleConfirmDelete = async () => {
    if (!deletingTx || isDeleting) return;
    setIsDeleting(true);

    try {
      const tx = deletingTx;
      const { metadata, category, amount, pocket_id } = tx;

      const updates: any[] = [];
      if (category === 'Ingreso' && metadata?.distribution) {
        Object.entries(metadata.distribution).forEach(([pid, amt]: [any, any]) => {
          const p = pockets.find(pk => pk.id === pid);
          if (p) updates.push(supabase.from('pockets').update({ budget: (p.budget || 0) - amt }).eq('id', pid));
        });
      } else if (category === 'Traslado' && metadata?.from_id && metadata?.to_id) {
        const fromP = pockets.find(p => p.id === metadata.from_id);
        const toP = pockets.find(p => p.id === metadata.to_id);
        if (fromP) updates.push(supabase.from('pockets').update({ budget: (fromP.budget || 0) + amount }).eq('id', metadata.from_id));
        if (toP) updates.push(supabase.from('pockets').update({ budget: (toP.budget || 0) - amount }).eq('id', metadata.to_id));
      } else {
        const pid = pocket_id || metadata?.pocket_id;
        if (pid) {
          const p = pockets.find(pk => pk.id === pid);
          if (p) updates.push(supabase.from('pockets').update({ budget: (p.budget || 0) + Math.abs(amount) }).eq('id', pid));
        }
      }

      await Promise.all(updates);
      const { error } = await supabase.from('transactions').delete().eq('id', tx.id);
      
      if (!error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setDeletingTx(null);
        if (onRefresh) onRefresh();
      }
    } catch (e) {
      console.error(e);
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
    <View style={styles.container}>
      <Animated.View style={[styles.headerContainer, { opacity: fadeAnim, paddingTop: Math.max(insets.top, 16) + 104 }]}>
        <BlurView intensity={90} tint={theme.mode === 'honey' ? 'light' : 'dark'} style={styles.overviewCard}>
           <View style={styles.overviewHeader}>
              <View style={[styles.dotIndicator, { backgroundColor: totalSpent >= 0 ? theme.colors.success : theme.colors.error }]} />
              <Text style={[styles.overviewTitle, { color: theme.colors.primary }]}>RESUMEN DE FLUJO</Text>
           </View>
           <Text style={[styles.totalAmountText, { color: totalSpent >= 0 ? theme.colors.success : theme.colors.error }]}>
              {totalSpent >= 0 ? '+' : '-'} $ {Math.abs(totalSpent).toLocaleString('es-CO')}
           </Text>
           <View style={styles.trendRow}>
              <TrendingUp size={14} color={theme.colors.onSurfaceVariant} />
              <Text style={styles.trendText}>Control activo de capital</Text>
           </View>
        </BlurView>

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
                onLongPress={() => handleDeleteTrigger(tx)}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.iconArea, 
                  isIncome && { backgroundColor: theme.colors.success + '15' }, 
                  isTransfer && { backgroundColor: theme.colors.secondaryContainer }
                ]}>
                  <CategoryIcon 
                    iconName={isIncome ? 'trending-up' : isTransfer ? 'arrow-right-left' : tx.icon} 
                    size={20} 
                    color={isIncome ? theme.colors.success : isTransfer ? theme.colors.secondary : theme.colors.onSurface} 
                  />
                </View>
                
                <View style={styles.txInfo}>
                  <Text style={styles.txMerchant} numberOfLines={1}>{tx.merchant}</Text>
                  <Text style={styles.txCategory}>{tx.category} • {new Date(tx.date_string || tx.created_at).toLocaleDateString('es-CO')}</Text>
                </View>

                <View style={styles.txAmtArea}>
                  <Text style={[
                      styles.txAmt, 
                      isIncome && { color: theme.colors.success }, 
                      isTransfer && { color: theme.colors.secondary },
                      !isIncome && !isTransfer && { color: theme.colors.onSurface }
                  ]}>
                    {isIncome ? '+' : isTransfer ? '' : '-'} $ {amt.toLocaleString('es-CO')}
                  </Text>
                  <ChevronRight size={16} color={theme.colors.outlineVariant} />
                </View>
              </TouchableOpacity>
            );
          })
        )}
        {filteredTransactions.length > 0 && <Text style={styles.longPressHint}>Mantén presionado un movimiento para eliminarlo</Text>}
      </ScrollView>

      {deletingTx && (
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setDeletingTx(null)}>
            <BlurView intensity={theme.mode === 'honey' ? 40 : 20} tint="dark" style={StyleSheet.absoluteFill} />
          </TouchableOpacity>
          <View style={[styles.modalContainer, { backgroundColor: theme.colors.surface }]}>
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
    </View>
  );
};
