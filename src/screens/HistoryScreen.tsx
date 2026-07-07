import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, LayoutAnimation, Platform, UIManager } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/ThemeContext';
import { formatMoney } from '../lib/format';
import { History, TrendingUp, TrendingDown, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { getDeterministicColor } from '../theme/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const HistoryCard = ({ cycle, theme }: { cycle: any, theme: any }) => {
  const isCurrent = cycle.is_active;
  const net = cycle.income - cycle.spent;
  const isPositive = net >= 0;

  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const toggleExpand = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    
    if (expanded) {
      setExpanded(false);
    } else {
      setExpanded(true);
      if (details.length === 0) {
        setLoadingDetails(true);
        try {
          const { data, error } = await supabase.rpc('get_cycle_state', {
            p_cycle_id: cycle.id
          });
            
          if (!error && data && data.pockets) {
            const detailsArr = (data.pockets as any[])
              .filter((p: any) => p.spent_month > 0 || p.allocated > 0)
              .map((p: any) => ({
                category: p.name,
                spent: p.spent_month,
                allocated: p.allocated || 0,
                color: getDeterministicColor(p.name, theme.colors.pocketFlatColors as string[])
              }))
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
      borderRadius: 32,
      padding: 24,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: expanded ? theme.colors.primary + '40' : theme.colors.divider,
      ...theme.shadows.md
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <Text style={{ ...theme.typography.h2, color: theme.colors.onSurface, letterSpacing: -0.5 }}>{cycle.name}</Text>
        {isCurrent && (
          <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: theme.colors.primaryContainer }}>
            <Text style={{ fontSize: 10, fontWeight: '900', color: theme.colors.primary, letterSpacing: 1 }}>CICLO ACTIVO</Text>
          </View>
        )}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
        <View style={{ flex: 1, backgroundColor: theme.colors.surfaceContainerLowest, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.divider }}>
          <Text style={{ ...theme.typography.label, color: theme.colors.onSurfaceVariant, marginBottom: 6, letterSpacing: 1 }}>INGRESOS</Text>
          <Text style={{ ...theme.typography.h3, color: theme.colors.primary }} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(cycle.income)}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: theme.colors.surfaceContainerLowest, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.divider }}>
          <Text style={{ ...theme.typography.label, color: theme.colors.onSurfaceVariant, marginBottom: 6, letterSpacing: 1 }}>GASTOS</Text>
          <Text style={{ ...theme.typography.h3, color: theme.colors.onSurface }} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(cycle.spent)}</Text>
        </View>
      </View>

      <View style={{ 
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
        padding: 16, borderRadius: 20, 
        backgroundColor: isPositive ? theme.colors.primaryContainer + '30' : theme.colors.errorContainer + '30',
        borderWidth: 1,
        borderColor: isPositive ? theme.colors.primary + '20' : theme.colors.error + '20'
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: isPositive ? theme.colors.primaryContainer : theme.colors.errorContainer, alignItems: 'center', justifyContent: 'center' }}>
            {isPositive ? <TrendingUp size={20} color={theme.colors.primary} strokeWidth={2.5} /> : <TrendingDown size={20} color={theme.colors.error} strokeWidth={2.5} />}
          </View>
          <View>
            <Text style={{ ...theme.typography.label, color: isPositive ? theme.colors.primary : theme.colors.error, opacity: 0.9, letterSpacing: 1 }}>
              {isPositive ? 'SOBRANTE' : 'DÉFICIT'}
            </Text>
            <Text style={{ ...theme.typography.h3, color: isPositive ? theme.colors.primary : theme.colors.error, marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>
              {isPositive ? '+' : '-'}{formatMoney(Math.abs(net))}
            </Text>
          </View>
        </View>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.glassWhite, alignItems: 'center', justifyContent: 'center', ...theme.shadows.sm }}>
          {expanded ? <ChevronUp size={20} color={theme.colors.onSurfaceVariant} /> : <ChevronDown size={20} color={theme.colors.onSurfaceVariant} />}
        </View>
      </View>

      {expanded && (
        <View style={{ marginTop: 24, paddingTop: 24, borderTopWidth: 1, borderTopColor: theme.colors.divider }}>
          <Text style={{ ...theme.typography.label, color: theme.colors.onSurfaceVariant, marginBottom: 20, letterSpacing: 1 }}>DESGLOSE POR BOLSILLO</Text>
          
          {loadingDetails ? (
            <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 20 }} />
          ) : details.length === 0 ? (
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 14, fontStyle: 'italic', textAlign: 'center' }}>Sin movimientos en este ciclo.</Text>
          ) : (
            <View style={{ gap: 20 }}>
              {details.map((d: any) => {
                const isOver = d.allocated > 0 && d.spent > d.allocated;
                const percentage = d.allocated > 0 ? Math.min(100, (d.spent / d.allocated) * 100) : 0;
                
                return (
                  <View key={d.category}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: isOver ? theme.colors.error : d.color }} />
                        <Text style={{ ...theme.typography.bodyMedium, fontWeight: '800', color: theme.colors.onSurface }}>{d.category}</Text>
                      </View>
                      <Text style={{ ...theme.typography.bodyMedium, fontWeight: '900', color: theme.colors.onSurface }}>
                        {formatMoney(d.spent)}
                      </Text>
                    </View>
                    
                    {d.allocated > 0 && (
                      <View style={{ height: 10, backgroundColor: theme.colors.surfaceContainerHighest, borderRadius: 5, overflow: 'hidden' }}>
                        <View style={{ 
                          height: '100%', 
                          backgroundColor: isOver ? theme.colors.error : d.color, 
                          width: `${percentage}%`,
                          borderRadius: 5
                        }} />
                      </View>
                    )}
                    
                    {d.allocated > 0 && (
                      <Text style={{ ...theme.typography.caption, color: isOver ? theme.colors.error : theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'right', fontWeight: '700' }}>
                        de {formatMoney(d.allocated)}
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

  useEffect(() => {
    loadHistory();
  }, []);

  const totalAhorro = useMemo(() => {
    return cycles.reduce((acc, cycle) => acc + (cycle.income - cycle.spent), 0);
  }, [cycles]);

  const loadHistory = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.rpc('get_history_cycles', { p_user_id: user.id });
      
      if (error) throw error;
      setCycles(data || []);
    } catch (e) {
      console.error('Error loading history:', e);
    } finally {
      setLoading(false);
    }
  };

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scrollContent: { paddingTop: Math.max(insets.top, 16) + 104, paddingBottom: 150, paddingHorizontal: 24 },
    emptyState: { padding: 40, alignItems: 'center', justifyContent: 'center' },
    emptyText: { ...theme.typography.bodyMedium, color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 16, fontWeight: '600' },
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
        
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <View style={{ alignItems: 'center', backgroundColor: theme.colors.glassWhite, paddingHorizontal: 32, paddingVertical: 24, borderRadius: 32, borderWidth: 1, borderColor: theme.colors.primary + '30', ...theme.shadows.md, width: '100%' }}>
            <Text style={{ ...theme.typography.label, color: theme.colors.onSurfaceVariant, letterSpacing: 1, marginBottom: 8 }}>AHORRO TOTAL ACUMULADO</Text>
            <Text style={{ ...theme.typography.display, color: totalAhorro >= 0 ? theme.colors.primary : theme.colors.error }} numberOfLines={1} adjustsFontSizeToFit>
              {formatMoney(totalAhorro)}
            </Text>
          </View>
        </View>

        {cycles.length === 0 ? (
          <View style={styles.emptyState}>
            <HelpCircle size={48} color={theme.colors.outlineVariant} />
            <Text style={styles.emptyText}>Aún no tienes ciclos registrados.</Text>
          </View>
        ) : (
          cycles.map((cycle) => (
            <HistoryCard key={cycle.id} cycle={cycle} theme={theme} />
          ))
        )}

      </ScrollView>
    </View>
  );
};
