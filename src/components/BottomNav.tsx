import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LayoutDashboard, Wallet, Grid2X2, User, Plus } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../types';

export const BottomNav = ({ activeScreen, setScreen, onAddPress }: { activeScreen: Screen | string; setScreen: (s: Screen | string) => void, onAddPress?: () => void }) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  
  const styles = useMemo(() => StyleSheet.create({
    outerContainer: {
      position: 'absolute',
      left: 16,
      right: 16,
      zIndex: 100,
      ...theme.shadows.premium
    },
    blurContainer: {
      height: 72,
      borderRadius: 24,
      overflow: 'hidden',
      backgroundColor: theme.colors.glassWhite, 
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.8)',
    },
    contentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: '100%',
      paddingHorizontal: 12,
    },
    navItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navLabel: {
      fontSize: 9,
      fontWeight: '900',
      marginTop: 4,
      letterSpacing: 0.5,
      textAlign: 'center',
    },
    centerSpace: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fabButton: {
      width: 52,
      height: 52,
      borderRadius: 18,
      ...theme.shadows.soft,
      elevation: 4,
    },
    fabGradient: {
      flex: 1,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.4)',
    }
  }), [theme]);

   const activeColor = theme.colors.primary;
   const inactiveColor = theme.colors.onSurfaceVariant;

  return (
    <View style={[styles.outerContainer, { bottom: Math.max(insets.bottom, 16) }]}>
      <BlurView intensity={Platform.OS === 'ios' ? 80 : 100} tint="light" style={styles.blurContainer}>
        <View style={styles.contentRow}>
          
          <TouchableOpacity 
            style={styles.navItem} 
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setScreen('dashboard'); }}
          >
            <LayoutDashboard size={22} color={activeScreen === 'dashboard' ? activeColor : inactiveColor} strokeWidth={activeScreen === 'dashboard' ? 2.5 : 1.5} />
            <Text style={[styles.navLabel, { color: activeScreen === 'dashboard' ? activeColor : inactiveColor }]}>RESUMEN</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.navItem} 
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setScreen('expenses'); }}
          >
            <Wallet size={20} color={activeScreen === 'expenses' ? activeColor : inactiveColor} strokeWidth={activeScreen === 'expenses' ? 2.5 : 1.5} />
            <Text style={[styles.navLabel, { color: activeScreen === 'expenses' ? activeColor : inactiveColor }]}>GASTOS</Text>
          </TouchableOpacity>

          <View style={styles.centerSpace}>
            <TouchableOpacity 
              style={styles.fabButton}
              onPress={() => { 
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); 
                if (onAddPress) onAddPress(); 
                else setScreen('scanner');
              }}
              activeOpacity={0.8}
            >
              <LinearGradient colors={theme.colors.brandGradient as any} style={styles.fabGradient} start={{x:0, y:0}} end={{x:1, y:1}}>
                <Plus size={24} color="#FFF" />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            style={styles.navItem} 
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setScreen('pockets'); }}
          >
            <Grid2X2 size={20} color={activeScreen === 'pockets' ? activeColor : inactiveColor} strokeWidth={activeScreen === 'pockets' ? 2.5 : 1.5} />
            <Text style={[styles.navLabel, { color: activeScreen === 'pockets' ? activeColor : inactiveColor }]}>BOLSILLOS</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.navItem} 
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setScreen('profile'); }}
          >
             <User size={20} color={activeScreen === 'profile' ? activeColor : inactiveColor} strokeWidth={activeScreen === 'profile' ? 2.5 : 1.5} />
             <Text style={[styles.navLabel, { color: activeScreen === 'profile' ? activeColor : inactiveColor }]}>PERFIL</Text>
          </TouchableOpacity>

        </View>
      </BlurView>
    </View>
  );
};
