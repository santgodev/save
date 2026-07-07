import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  cycles: any[];
  activeCycleId: string | null;
  onChange: (nextId: string) => void;
};

export const CycleNav = ({ cycles, activeCycleId, onChange }: Props) => {
  const { theme } = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    nav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
      marginBottom: 24,
    },
    titleContainer: {
      alignItems: 'center',
    },
    title: {
      ...theme.typography.h3,
      letterSpacing: -0.3,
      color: theme.colors.onSurface,
      textAlign: 'center',
    },
    subtitle: {
      ...theme.typography.caption,
      color: theme.colors.primary,
      marginTop: -2,
    },
    btn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: theme.colors.glassWhite,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5, borderColor: theme.colors.divider,
      ...theme.shadows.soft,
    },
    btnDisabled: {
      opacity: 0.3,
    }
  }), [theme]);

  if (!cycles || cycles.length === 0 || !activeCycleId) {
    return null;
  }

  const currentIndex = cycles.findIndex(c => c.id === activeCycleId);
  if (currentIndex === -1) return null;

  const currentCycle = cycles[currentIndex];
  
  const canGoLeft = currentIndex < cycles.length - 1; 
  const canGoRight = currentIndex > 0;

  const handleGo = (direction: 'left' | 'right') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (direction === 'left' && canGoLeft) {
      onChange(cycles[currentIndex + 1].id);
    } else if (direction === 'right' && canGoRight) {
      onChange(cycles[currentIndex - 1].id);
    }
  };

  return (
    <View style={styles.nav}>
      <TouchableOpacity 
        onPress={() => handleGo('left')} 
        style={[styles.btn, !canGoLeft && styles.btnDisabled]}
        disabled={!canGoLeft}
      >
        <ChevronLeft size={18} color={theme.colors.onSurface} />
      </TouchableOpacity>
      
      <Text style={styles.title}>{currentCycle.name}</Text>
      
      <TouchableOpacity 
        onPress={() => handleGo('right')} 
        style={[styles.btn, !canGoRight && styles.btnDisabled]}
        disabled={!canGoRight}
      >
        <ChevronRight size={18} color={theme.colors.onSurface} />
      </TouchableOpacity>
    </View>
  );
};
