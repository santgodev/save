// BottomSheet compartido. Antes había 3 patrones distintos para
// "modal centrado con backdrop": Pockets usaba slide-up con Animated.View,
// Expenses usaba modalOverlay + BlurView + container, AddIncome era full
// screen. Esto unifica todos los modales centrados de la app.
//
// Uso:
//   <BottomSheet visible={!!modal} onClose={() => setModal(null)} title="Editar">
//     ...contenido...
//   </BottomSheet>
//
// Siempre cierra al tocar afuera. El header tiene título + botón X.

import React, { ReactNode, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { X } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Si true, el contenido scrollea internamente. Default false. */
  scrollable?: boolean;
  children: ReactNode;
};

export const BottomSheet = ({ visible, onClose, title, scrollable = false, children }: Props) => {
  const { theme } = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
      zIndex: 1000,
    },
    container: {
      width: '100%',
      maxWidth: 480,
      maxHeight: '85%',
      borderRadius: 28,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.divider,
      padding: 24,
      ...theme.shadows.premium,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    title: {
      ...theme.typography.h3,
      color: theme.colors.onSurface,
      flex: 1,
    },
    closeBtn: {
      padding: 8,
      marginRight: -8,
    },
  }), [theme]);

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <BlurView
          intensity={Platform.OS === 'ios' ? 40 : 80}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
      </Pressable>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <View style={styles.container}>
          {title !== undefined && (
            <View style={styles.header}>
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={22} color={theme.colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>
          )}
          {scrollable
            ? <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
            : children}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};
