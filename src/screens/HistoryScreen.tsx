import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/ThemeContext';
import { formatMoney } from '../lib/format';
import { History, TrendingUp, TrendingDown, Target, HelpCircle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { getDeterministicColor } from '../theme/theme';

const HistoryCard = ({ cycle, theme, pockets }: { cycle: any, theme: any, pockets: any[] }) => {
  const isCurrent = cycle.is_active;
  const net = cycle.income - cycle.spent;
  const isPositive = net >= 0;

  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const toggleExpand = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (expanded) {
      setExpanded(false);
    } else {
      setExpanded(true);
      if (details.length === 0) {
        setLoadingDetails(true);
        try {
          const { data, error } = await supabase
            .from('transactions')
            .select('category, amount, metadata')
            .eq('cycle_id', cycle.id)
            .lt('amount', 0);
            
          if (!error && data) {
            const grouped = data.reduce((acc: any, tx: any) => {
              if (tx.category === 'Ingreso' || tx.category === 'Traslado') return acc;
              if (tx.metadata?.type === 'internal_transfer_out' || tx.metadata?.type === 'internal_transfer_in') return acc;
              acc[tx.category] = (acc[tx.category] || 0) + Math.abs(tx.amount);
              return acc;
            }, {});
            
            const detailsArr = pockets
              .map(p => {
                const spent = grouped[p.category] || 0; // Fixed: use category instead of name
                return { 
                  category: p.name, 
                  spent, 
                  allocated: p.allocated_budget || 0,
                  color: getDeterministicColor(p.name, theme.colors.pocketFlatColors as string[])
                };
              })
              .filter(d => d.spent > 0 || d.allocated > 0)
              .sort((a: any, b: any) => b.spent - a.spent);
              
            setDetails(detailsArr);
          }
        } catch(e) {}
        setLoadingDetails(false);
      }
    }
  };

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={toggleExpand} style={{
      backgroundColor: theme.colors.glassWhite,
      borderRadius: 28,
      padding: 24,
      marginBottom: 20,
      borderWidth: 1.5,
      borderColor: expanded ? theme.colors.primary + '50' : 'rgba(255,255,255,0.7)',
      ...theme.shadows.premium
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Text style={{ fontSize: 20, fontWeight: '900', color: theme.colors.onSurface, flex: 1, letterSpacing: -0.5 }}>{cycle.name}</Text>
        {isCurrent && (
          <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: theme.colors.primaryContainer }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: theme.colors.primary, textTransform: 'uppercase' }}>Mes Actual</Text>
          </View>
        )}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={{ fontSize: 15, color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>Total Ingresado</Text>
        <Text style={{ fontSize: 15, fontWeight: '800', color: theme.colors.primary }}>{formatMoney(cycle.income)}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={{ fontSize: 15, color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>Total Gastado</Text>
        <Text style={{ fontSize: 15, fontWeight: '800', color: theme.colors.onSurface }}>{formatMoney(cycle.spent)}</Text>
      </View>

      <View style={{ height: 1, backgroundColor: theme.colors.divider, marginVertical: 16 }} />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: expanded ? 16 : 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {isPositive ? <TrendingUp size={20} color={theme.colors.primary} /> : <TrendingDown size={20} color={theme.colors.error} />}
          <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.onSurface }}>
            {isPositive ? 'Ahorro / Sobrante' : 'Déficit del Mes'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 20, fontWeight: '900', letterSpacing: -0.5, color: isPositive ? theme.colors.primary : theme.colors.error }}>
            {isPositive ? '+' : '-'}{formatMoney(Math.abs(net))}
          </Text>
          {expanded ? <ChevronUp size={24} color={theme.colors.onSurfaceVariant} /> : <ChevronDown size={24} color={theme.colors.onSurfaceVariant} />}
        </View>
      </View>

      {expanded && (
        <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: theme.colors.divider }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: theme.colors.onSurfaceVariant, marginBottom: 20, textTransform: 'uppercase', letterSpacing: 0.5 }}>Desglose por Bolsillo</Text>
          
          {loadingDetails ? (
            <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 20 }} />
          ) : details.length === 0 ? (
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 14, fontStyle: 'italic' }}>No hay gastos ni presupuestos asignados en este mes.</Text>
          ) : (
            <View style={{ gap: 20 }}>
              {details.map((d: any) => {
                const isOver = d.allocated > 0 && d.spent > d.allocated;
                const percentage = d.allocated > 0 ? Math.min(100, (d.spent / d.allocated) * 100) : 0;
                
                return (
                  <View key={d.category}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: d.color }} />
                        <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.onSurface }}>{d.category}</Text>
                      </View>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.onSurface }}>
                        {formatMoney(d.spent)}
                      </Text>
                    </View>
                    
                    {d.allocated > 0 && (
                      <View style={{ height: 8, backgroundColor: theme.colors.surfaceContainerHighest, borderRadius: 4, overflow: 'hidden' }}>
                        <View style={{ 
                          height: '100%', 
                          backgroundColor: isOver ? theme.colors.error : d.color, 
                          width: `${percentage}%`,
                          borderRadius: 4
                        }} />
                      </View>
                    )}
                    
                    {d.allocated > 0 && (
                      <Text style={{ fontSize: 13, fontWeight: '600', color: isOver ? theme.colors.error : theme.colors.onSurfaceVariant, marginTop: 6, textAlign: 'right' }}>
                        de {formatMoney(d.allocated)} asignado
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

export const HistoryScreen = () => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [cycles, setCycles] = useState<any[]>([]);
  const [pockets, setPockets] = useState<any[]>([]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [cyclesRes, pocketsRes] = await Promise.all([
        supabase.rpc('get_history_cycles', { p_user_id: user.id }),
        supabase.from('pockets').select('*').eq('user_id', user.id).order('is_default_free', { ascending: false }).order('created_at', { ascending: true })
      ]);
      
      if (cyclesRes.error) throw cyclesRes.error;
      
      setCycles(cyclesRes.data || []);
      setPockets(pocketsRes.data || []);
    } catch (e) {
      console.error('Error loading history:', e);
    } finally {
      setLoading(false);
    }
  };

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scrollContent: { paddingTop: Math.max(insets.top, 16) + 100, paddingBottom: 150, paddingHorizontal: 24 },
    headerTitle: { fontSize: 32, fontWeight: '900', color: theme.colors.onSurface, marginBottom: 8, letterSpacing: -1 },
    headerSubtitle: { fontSize: 16, color: theme.colors.onSurfaceVariant, fontWeight: '500', marginBottom: 24 },
    
    emptyState: { padding: 40, alignItems: 'center', justifyContent: 'center' },
    emptyText: { fontSize: 16, color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 16, fontWeight: '500' },
  }), [theme, insets.top]);

  if (loading) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: theme.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
            <History size={24} color={theme.colors.primary} />
          </View>
          <Text style={styles.headerTitle}>Historial</Text>
        </View>
        <Text style={styles.headerSubtitle}>Revisa el balance de tus meses anteriores y analiza tu progreso.</Text>

        {cycles.length === 0 ? (
          <View style={styles.emptyState}>
            <HelpCircle size={48} color={theme.colors.outlineVariant} />
            <Text style={styles.emptyText}>Aún no tienes ciclos registrados.</Text>
          </View>
        ) : (
          cycles.map((cycle) => (
            <HistoryCard key={cycle.id} cycle={cycle} theme={theme} pockets={pockets} />
          ))
        )}

      </ScrollView>
    </View>
  );
};
