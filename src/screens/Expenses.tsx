import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Animated, StyleSheet, Alert, ScrollView, TextInput, Dimensions
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { Search, Filter, Trash2, ChevronRight, PieChart, ArrowDownRight } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme, normalize } from '../theme/theme';
import { CategoryIcon } from '../components/CategoryIcon';
import { INITIAL_TRANSACTIONS } from '../constants';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');

export const Expenses = ({ transactions, onRefresh }: { transactions: any[], onRefresh?: () => void }) => {
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  const displayTransactions = transactions.length > 0 ? transactions : INITIAL_TRANSACTIONS;
  const filteredTransactions = displayTransactions.filter(tx => 
    tx.merchant.toLowerCase().includes(searchQuery.toLowerCase()) || 
    tx.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalSpent = filteredTransactions.reduce((acc, tx) => acc + (tx.amount < 0 ? Math.abs(tx.amount) : 0), 0);

  const handleDelete = (id: string, merchant: string, amount: number) => {
    if (String(id).length < 5) return;
    Alert.alert(
      "Eliminar Gasto",
      `¿Deseas eliminar el gasto de ${merchant}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Borrar Gasto", style: "destructive", onPress: async () => {
            const { error } = await supabase.from('transactions').delete().eq('id', id);
            if (!error) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              if (onRefresh) onRefresh();
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.headerContainer, { opacity: fadeAnim, paddingTop: Math.max(insets.top, 16) + normalize(100) }]}>
        <BlurView intensity={80} tint="light" style={styles.overviewCard}>
           <View style={styles.overviewHeader}>
              <View style={styles.dotIndicator} />
              <Text style={styles.overviewTitle}>ANÁLISIS DE MOVIMIENTOS</Text>
           </View>
           <Text style={styles.totalAmountText}>$ {totalSpent.toLocaleString('es-CO')}</Text>
           <View style={styles.trendRow}>
              <ArrowDownRight size={14} color={theme.colors.success} />
              <Text style={styles.trendText}>Optimización activa por IA</Text>
           </View>
        </BlurView>

        <View style={styles.searchRow}>
           <View style={styles.searchBar}>
              <Search size={18} color={theme.colors.onSurfaceVariant} />
              <TextInput 
                placeholder="Buscar gasto..." 
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="rgba(0,0,0,0.25)"
              />
           </View>
           <TouchableOpacity style={styles.filterBtn}>
              <Filter size={20} color={theme.colors.primary} />
           </TouchableOpacity>
        </View>
      </Animated.View>

      <ScrollView 
        contentContainerStyle={styles.scrollPadding} 
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.listTitle}>Movimientos recientes</Text>
        {filteredTransactions.map((tx, i) => (
          <TouchableOpacity
            key={tx.id || i}
            style={styles.txRow}
            activeOpacity={0.7}
            onLongPress={() => {
               Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
               handleDelete(tx.id, tx.merchant, tx.amount);
            }}
          >
            <View style={[styles.txIconBox, { backgroundColor: theme.colors.surfaceContainerHigh }]}>
               <CategoryIcon iconName={tx.icon} size={normalize(20)} color={theme.colors.primary} />
            </View>
            <View style={styles.txContent}>
               <Text style={styles.txMerchant} numberOfLines={1}>{tx.merchant}</Text>
               <View style={styles.txDetailsRow}>
                  <Text style={styles.txCategory}>{tx.category}</Text>
                  <Text style={styles.txDot}>•</Text>
                  <Text style={styles.txDate}>{tx.date_string || tx.date}</Text>
               </View>
            </View>
            <View style={styles.txAmountContainer}>
               <Text style={[styles.txAmount, { color: tx.amount < 0 ? theme.colors.onSurface : theme.colors.primary }]}>
                  {tx.amount < 0 ? '-' : '+'} $ {Math.abs(tx.amount).toLocaleString('es-CO')}
               </Text>
               <ChevronRight size={14} color="rgba(0,0,0,0.15)" />
            </View>
          </TouchableOpacity>
        ))}
        {filteredTransactions.length === 0 && (
          <View style={styles.emptyState}>
             <Search size={normalize(48)} color="rgba(0,0,0,0.04)" />
             <Text style={styles.emptyText}>Sin registros aún</Text>
          </View>
        )}
        <View style={{ height: normalize(180) }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  headerContainer: { paddingHorizontal: normalize(20), paddingBottom: normalize(10) },
  overviewCard: { padding: normalize(24), borderRadius: normalize(32), overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.4)', borderWidth: 1, borderColor: theme.colors.outlineVariant, ...theme.shadows.soft },
  overviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: normalize(12) },
  dotIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.primary },
  overviewTitle: { fontSize: normalize(9), fontWeight: '900', color: theme.colors.primary, letterSpacing: 1.5 },
  totalAmountText: { fontSize: normalize(40), fontWeight: '900', color: theme.colors.onSurface, letterSpacing: -1 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: normalize(8) },
  trendText: { fontSize: normalize(12), color: theme.colors.success, fontWeight: '700' },
  
  searchRow: { flexDirection: 'row', gap: 12, marginTop: normalize(24) },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: normalize(16), paddingVertical: normalize(12), borderRadius: 20, borderWidth: 1, borderColor: theme.colors.outlineVariant, ...theme.shadows.soft },
  searchInput: { flex: 1, marginLeft: 12, fontSize: normalize(15), fontWeight: '600', color: theme.colors.onSurface },
  filterBtn: { backgroundColor: '#FFF', width: normalize(52), height: normalize(52), alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: theme.colors.outlineVariant, ...theme.shadows.soft },

  scrollPadding: { paddingHorizontal: normalize(20) },
  listTitle: { fontSize: normalize(18), fontWeight: '900', color: theme.colors.onSurface, marginBottom: normalize(16), marginTop: normalize(20) },
  txRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: normalize(16), borderRadius: normalize(24), marginBottom: normalize(12), borderWidth: 1, borderColor: theme.colors.outlineVariant, ...theme.shadows.soft },
  txIconBox: { width: normalize(48), height: normalize(48), borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  txContent: { flex: 1, marginLeft: normalize(16) },
  txMerchant: { fontSize: normalize(15), fontWeight: '800', color: theme.colors.onSurface },
  txDetailsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  txCategory: { fontSize: normalize(10), fontWeight: '800', color: theme.colors.primary, textTransform: 'uppercase' },
  txDot: { fontSize: 11, color: 'rgba(0,0,0,0.1)', marginHorizontal: 6 },
  txDate: { fontSize: normalize(11), color: theme.colors.onSurfaceVariant, fontWeight: '500' },
  txAmountContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  txAmount: { fontSize: normalize(15), fontWeight: '900' },

  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 60, gap: 16 },
  emptyText: { fontSize: normalize(14), color: 'rgba(0,0,0,0.2)', fontWeight: '600' }
});
