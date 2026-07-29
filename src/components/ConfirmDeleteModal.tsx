// ConfirmDeleteModal — confirmación de borrado compartida entre Movimientos
// y Bolsillos. Es un <Modal> nativo (no un overlay plano tipo BottomSheet)
// a propósito: el detalle del movimiento (TransactionDetailModal) también
// es un <Modal> nativo, y mezclar un Modal nativo con un overlay plano
// encima causaba que este se viera desplazado/raro mientras el de abajo
// todavía estaba cerrando su animación.
import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform, ActivityIndicator, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { Trash2 } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  visible: boolean;
  confirmLabel: string;
  merchant?: string;
  amountLabel?: string;
  subtitle: string;
  isDeleting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Oculta "No, mantener" y bloquea el cierre -- para cuando borrar es un
   * paso obligatorio (ej. el tour pidiendo borrar el gasto de prueba). */
  blockCancel?: boolean;
}

export const ConfirmDeleteModal = ({
  visible, confirmLabel, merchant, amountLabel, subtitle, isDeleting, onConfirm, onCancel, blockCancel,
}: Props) => {
  const { theme } = useTheme();
  const translateY = useRef(new Animated.Value(150)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 9 }),
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      translateY.setValue(150);
      opacity.setValue(0);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!blockCancel) onCancel(); }}>
      <BlurView intensity={Platform.OS === 'ios' ? 50 : 100} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
        {!blockCancel && <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onCancel} />}
        <View style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 44 : 28 }} pointerEvents="box-none">
          <Animated.View style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 32,
            padding: 24,
            borderWidth: 1,
            borderColor: theme.colors.divider,
            opacity,
            transform: [{ translateY }],
            ...theme.shadows.premium,
          }}>
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: theme.colors.error + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Trash2 size={28} color={theme.colors.error} />
              </View>
              {merchant ? (
                <Text style={{ fontFamily: theme.fonts.headline, fontSize: 18, fontWeight: '900', color: theme.colors.onSurface, textAlign: 'center' }}>
                  {merchant}
                </Text>
              ) : null}
              {amountLabel ? (
                <Text style={{ fontFamily: theme.fonts.headline, fontSize: 30, fontWeight: '900', color: theme.colors.onSurface, marginTop: 4, marginBottom: 8 }}>
                  {amountLabel}
                </Text>
              ) : null}
              <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, color: theme.colors.onSurfaceVariant, textAlign: 'center', lineHeight: 20, paddingHorizontal: 8 }}>
                {subtitle}
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onConfirm}
              disabled={isDeleting}
              style={{
                backgroundColor: theme.colors.error, borderRadius: 20, paddingVertical: 17,
                alignItems: 'center', ...theme.shadows.sm,
                opacity: isDeleting ? 0.7 : 1, marginBottom: blockCancel ? 0 : 10,
              }}
            >
              {isDeleting
                ? <ActivityIndicator color="#FFF" />
                : <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '800', fontFamily: theme.fonts.headline }}>{confirmLabel}</Text>}
            </TouchableOpacity>

            {!blockCancel && (
              <TouchableOpacity onPress={onCancel} style={{ paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.headline }}>No, mantener</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        </View>
      </BlurView>
    </Modal>
  );
};
