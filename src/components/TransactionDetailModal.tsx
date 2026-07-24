import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Platform, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { X, Trash2 } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { formatMoney } from '../lib/format';
import { CategoryIcon } from './CategoryIcon';
import { TourStep } from './tour/TourStep';

interface Transaction {
  id: string;
  amount: number;
  category: string;
  date_string?: string;
  created_at?: string;
  merchant?: string;
  icon?: string;
  metadata?: any;
}

interface Props {
  visible: boolean;
  transaction: Transaction | null;
  onClose: () => void;
  pockets?: any[];
  onEdit?: (tx: Transaction) => void;
  onDelete?: (tx: Transaction) => void;
}

export const TransactionDetailModal = ({ visible, transaction, onClose, pockets, onEdit, onDelete }: Props) => {
  const { theme } = useTheme();
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && transaction?.metadata?.is_demo) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(bounceAnim, { toValue: -8, duration: 400, useNativeDriver: true }),
          Animated.timing(bounceAnim, { toValue: 0, duration: 400, useNativeDriver: true })
        ])
      ).start();
    } else {
      bounceAnim.setValue(0);
    }
  }, [visible, transaction, bounceAnim]);

  if (!transaction) return null;

  const isIncome = transaction.category === 'Ingreso';
  const displayIcon = isIncome ? 'trending-up' : (pockets?.find(p => p.name === transaction.category)?.icon || transaction.icon || 'tag');
  
  const rawDate = (transaction.date_string || transaction.created_at || '').split('T')[0];
  const dateObj = rawDate ? new Date(rawDate + 'T12:00:00') : new Date();
  const dateFormatted = dateObj.toLocaleDateString('es-CO', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  });
  
  const timeFormatted = new Date(transaction.created_at || new Date().toISOString()).toLocaleTimeString('es-CO', {
    hour: '2-digit', minute: '2-digit'
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <BlurView intensity={Platform.OS === 'ios' ? 40 : 100} tint="dark" style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        
        <View style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.colors.surfaceContainerHighest }]}>
              <X size={20} color={theme.colors.onSurface} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.content}>
            <View style={[styles.iconWrapper, { backgroundColor: isIncome ? theme.colors.primary + '20' : theme.colors.primary + '20' }]}>
              <CategoryIcon iconName={displayIcon} size={36} color={isIncome ? theme.colors.primary : theme.colors.primary} />
            </View>
            
            <Text style={[styles.categoryText, { color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.headline }]}>
              {transaction.merchant || transaction.category}
            </Text>
            
            <Text style={[styles.amountText, { color: isIncome ? theme.colors.primary : theme.colors.onSurface, fontFamily: theme.fonts.headline }]}>
              {isIncome ? '+ ' : ''}{formatMoney(Math.abs(transaction.amount))}
            </Text>

            <View style={[styles.divider, { backgroundColor: theme.colors.outlineVariant + '40' }]} />
            
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.body }]}>Fecha</Text>
              <Text style={[styles.infoValue, { color: theme.colors.onSurface, fontFamily: theme.fonts.body, textTransform: 'capitalize' }]}>{dateFormatted}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.body }]}>Hora</Text>
              <Text style={[styles.infoValue, { color: theme.colors.onSurface, fontFamily: theme.fonts.body }]}>{timeFormatted}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.body }]}>Categoría</Text>
              <Text style={[styles.infoValue, { color: theme.colors.onSurface, fontFamily: theme.fonts.body }]}>{transaction.category}</Text>
            </View>
            
            {isIncome && onEdit && (
              <TouchableOpacity 
                style={{ marginTop: 24, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: theme.colors.primaryContainer, borderRadius: 12 }}
                onPress={() => { onClose(); onEdit(transaction); }}
              >
                <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 15 }}>Editar Ingreso</Text>
              </TouchableOpacity>
            )}

            {onDelete && (
              <View style={{ marginTop: 24, width: '100%' }}>
                {transaction.metadata?.is_demo && (
                  <Animated.View style={{ alignItems: 'center', marginBottom: 12, transform: [{ translateY: bounceAnim }] }}>
                    <View style={{ backgroundColor: theme.colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16 }}>
                      <Text style={{ color: theme.colors.onPrimary, fontWeight: '900', fontSize: 13 }}>¡Último paso!</Text>
                      <Text style={{ color: theme.colors.onPrimary + 'E0', fontSize: 11, marginTop: 4, textAlign: 'center' }}>Presiona Eliminar para terminar la prueba</Text>
                    </View>
                    <View style={{ width: 0, height: 0, backgroundColor: 'transparent', borderStyle: 'solid', borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: theme.colors.primary }} />
                  </Animated.View>
                )}
                <TouchableOpacity 
                  style={{ paddingVertical: 12, paddingHorizontal: 24, backgroundColor: theme.colors.error + '15', borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, borderWidth: transaction.metadata?.is_demo ? 2 : 0, borderColor: theme.colors.error + '50' }}
                  onPress={() => { onClose(); onDelete(transaction); }}
                >
                  <Trash2 size={18} color={theme.colors.error} />
                  <Text style={{ color: theme.colors.error, fontWeight: '800', fontSize: 15 }}>Eliminar Gasto</Text>
                </TouchableOpacity>
              </View>
            )}

          </View>
        </View>
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  modalCard: {
    borderRadius: 32,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    alignItems: 'flex-end',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 16,
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  amountText: {
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -2,
    marginBottom: 32,
  },
  divider: {
    height: 1,
    width: '100%',
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 12,
  },
  infoLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '800',
  },
});
