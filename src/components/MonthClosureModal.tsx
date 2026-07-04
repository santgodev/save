import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Switch, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { notify } from '../lib/notify';
import { formatMoney } from '../lib/format';
import { CheckCircle, Info } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

interface MonthClosureModalProps {
  visible: boolean;
  pockets: any[];
  cycleId: string;
  cycleName: string;
  userId: string;
  onClosed: () => void;
}

export function MonthClosureModal({ visible, pockets, cycleId, cycleName, userId, onClosed }: MonthClosureModalProps) {
  const [loading, setLoading] = useState(false);
  const { theme } = useTheme();
  
  const [sweeps, setSweeps] = useState<Record<string, boolean>>({});

  const pocketsWithBalance = pockets.filter(p => !p.is_default_free && p.available > 0);

  const handleToggle = (id: string) => {
    Haptics.selectionAsync();
    setSweeps(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const sweepPayload: Record<string, number> = {};
      let hasSweeps = false;

      pocketsWithBalance.forEach(p => {
        if (sweeps[p.id]) {
          sweepPayload[p.id] = p.available;
          hasSweeps = true;
        }
      });

      const { error } = await supabase.rpc('execute_cycle_closure', {
        p_user_id: userId,
        p_cycle_id: cycleId,
        p_sweeps: hasSweeps ? sweepPayload : null,
      });

      if (error) throw error;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClosed();
    } catch (e) {
      console.error('Error executing closure:', e);
      notify.error('No se pudo cerrar el mes.');
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent={true}>
      <BlurView intensity={Platform.OS === 'ios' ? 40 : 100} tint="dark" style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.xl }]}>
          <LinearGradient 
            colors={[theme.colors.primary, theme.colors.secondary || theme.colors.primary]} 
            style={styles.header}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.headerIconWrapper}>
              <CheckCircle size={32} color="#FFF" />
            </View>
            <Text style={[{ color: '#FFF' }, theme.typography.h2]}>¡Mes finalizado!</Text>
            <Text style={[{ color: 'rgba(255,255,255,0.9)', textAlign: 'center', marginTop: 8 }, theme.typography.bodyMedium]}>
              Es momento de cerrar {cycleName}. Tienes saldos sin gastar en algunos bolsillos.
            </Text>
          </LinearGradient>

          <ScrollView style={styles.body} contentContainerStyle={styles.scrollContent}>
            <Text style={[{ color: theme.colors.onSurfaceVariant, marginBottom: 24, textAlign: 'center' }, theme.typography.bodyMedium]}>
              Elige qué hacer con el sobrante. "Arrastrar" lo sumará a tu próximo mes. "A Libre" barrerá el dinero y empezará de cero.
            </Text>

            {pocketsWithBalance.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: theme.colors.surfaceContainer, borderRadius: theme.radius.lg }]}>
                <Info size={24} color={theme.colors.onSurfaceVariant} />
                <Text style={[{ color: theme.colors.onSurfaceVariant, marginTop: 12, textAlign: 'center' }, theme.typography.bodyMedium]}>No tuviste sobrantes en tus bolsillos asignados.</Text>
              </View>
            ) : (
              pocketsWithBalance.map((p, index) => {
                const isCarriedOver = !sweeps[p.id];
                return (
                  <View key={p.id} style={[styles.pocketRow, { borderBottomColor: theme.colors.divider, borderBottomWidth: index === pocketsWithBalance.length - 1 ? 0 : 1 }]}>
                    <View style={styles.pocketInfo}>
                      <Text style={[{ color: theme.colors.onSurface }, theme.typography.h4]}>{p.name}</Text>
                      <Text style={[{ color: theme.colors.primary, marginTop: 4 }, theme.typography.bodyLarge]}>{formatMoney(p.available)}</Text>
                    </View>
                    <View style={styles.actionRow}>
                      <Text style={[{ color: isCarriedOver ? theme.colors.primary : theme.colors.onSurfaceVariant }, theme.typography.bodySmall]}>
                        {isCarriedOver ? 'Arrastrar' : 'A Libre'}
                      </Text>
                      <Switch 
                        value={isCarriedOver}
                        onValueChange={() => handleToggle(p.id)}
                        trackColor={{ false: theme.colors.surfaceVariant, true: theme.colors.primary }}
                        thumbColor={theme.colors.surface}
                      />
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          <View style={[styles.footer, { backgroundColor: theme.colors.surface }]}>
            <TouchableOpacity 
              style={[{ backgroundColor: theme.colors.primary, borderRadius: theme.radius.xl, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', ...theme.shadows.sm }, loading && styles.buttonDisabled]} 
              onPress={handleConfirm}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={[{ color: '#FFF' }, theme.typography.h3]}>{loading ? 'Procesando...' : 'Confirmar Cierre'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  container: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  header: {
    padding: 32,
    alignItems: 'center',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  headerIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  body: {
    maxHeight: 450,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 32,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 15,
    textAlign: 'center',
    fontWeight: '500',
  },
  pocketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    borderBottomWidth: 1,
  },
  pocketInfo: {
    flex: 1,
  },
  pocketName: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  pocketBalance: {
    fontSize: 16,
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  footer: {
    padding: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
