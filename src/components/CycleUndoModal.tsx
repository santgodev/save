import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform, NativeModules, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { Sparkles, ChevronRight } from 'lucide-react-native';
import * as Updates from 'expo-updates';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  visible: boolean;
  reverted?: boolean;
}

export const CycleUndoModal = ({ visible, reverted = true }: Props) => {
  const { theme } = useTheme();

  const translateY = useRef(new Animated.Value(150)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 60,
          friction: 8
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true
        })
      ]).start();
    } else {
      translateY.setValue(150);
      opacity.setValue(0);
    }
  }, [visible, translateY, opacity]);

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <BlurView intensity={Platform.OS === 'ios' ? 80 : 100} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} tint="dark">
        <View style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 60 : 40 }}>
          <Animated.View style={{ 
            width: '100%', 
            backgroundColor: theme.colors.primary, 
            borderRadius: 28, 
            padding: 24, 
            ...theme.shadows.premium, 
            shadowOffset: { width: 0, height: 12 }, 
            shadowOpacity: 0.4, 
            shadowRadius: 24, 
            elevation: 20,
            opacity,
            transform: [{ translateY }]
          }}>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: theme.colors.onPrimary + '20', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={28} color={theme.colors.onPrimary} />
              </View>
              <View style={{ backgroundColor: theme.colors.onPrimary + '20', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: '900', letterSpacing: 1, color: theme.colors.onPrimary }}>SISTEMA</Text>
              </View>
            </View>
            
            <Text style={{ fontSize: 24, fontWeight: '900', color: theme.colors.onPrimary, marginBottom: 8 }}>
              {reverted ? 'Volvimos a donde estábamos' : 'Ciclo limpiado'}
            </Text>
            <Text style={{ fontSize: 16, color: theme.colors.onPrimary, opacity: 0.85, lineHeight: 24, marginBottom: 32, fontWeight: '600' }}>
              {reverted 
                ? 'Borraste el único ingreso de este ciclo, así que quedó vacío. No te preocupes, te devolvimos automáticamente a tu presupuesto anterior.'
                : 'Borraste el único ingreso de este ciclo, así que quedó completamente vacío y ha sido limpiado automáticamente.'}
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, backgroundColor: theme.colors.surface }}
                onPress={async () => {
                  if (__DEV__) {
                    NativeModules.DevSettings?.reload?.();
                  } else {
                    try {
                      await Updates.reloadAsync();
                    } catch (e) {
                      NativeModules.DevSettings?.reload?.();
                    }
                  }
                }}
              >
                <Text style={{ color: theme.colors.primary, fontSize: 16, fontWeight: '800', marginRight: 6 }}>Entendido</Text>
                <ChevronRight size={18} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>

          </Animated.View>
        </View>
      </BlurView>
    </Modal>
  );
};
