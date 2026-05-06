// Selector de mes compartido. Antes Pockets y Expenses cada una tenía su
// propia tira de meses + array MONTHS duplicado. Ahora viene de acá.
//
// Uso:
//   const [m, setM] = useState(new Date().getMonth());
//   <MonthNav value={m} onChange={setM} />

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';

export const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

type Props = {
  /** 0..11 (igual que Date.getMonth()) */
  value: number;
  onChange: (next: number) => void;
  /** Si true, muestra "Septiembre 2025" en lugar de solo "Septiembre" */
  showYear?: boolean;
  year?: number;
};

export const MonthNav = ({ value, onChange, showYear = false, year }: Props) => {
  const { theme } = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    nav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
      marginBottom: 24,
    },
    title: {
      ...theme.typography.h3,
      letterSpacing: -0.3,
      color: theme.colors.onSurface,
    },
    btn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: theme.colors.glassWhite,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)',
      ...theme.shadows.soft,
    },
  }), [theme]);

  const go = (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange((value + delta + 12) % 12);
  };

  const label = showYear && year !== undefined
    ? `${MONTHS[value]} ${year}`
    : MONTHS[value];

  return (
    <View style={styles.nav}>
      <TouchableOpacity onPress={() => go(-1)} style={styles.btn}>
        <ChevronLeft size={18} color={theme.colors.onSurface} />
      </TouchableOpacity>
      <Text style={styles.title}>{label}</Text>
      <TouchableOpacity onPress={() => go(1)} style={styles.btn}>
        <ChevronRight size={18} color={theme.colors.onSurface} />
      </TouchableOpacity>
    </View>
  );
};
