import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LayoutDashboard, Wallet, Grid2X2, User, Plus } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { normalize } from '../theme/theme';
import { Screen } from '../types';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

export const BottomNav = ({ activeScreen, setScreen, onAddPress }: { activeScreen: Screen | string; setScreen: (s: Screen | string) => void, onAddPress?: () => void }) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  
  const styles = useMemo(() => StyleSheet.create({
    outerContainer: {
      position: 'absolute',
      left: normalize(20),
      right: normalize(20),
      zIndex: 100,
      ...theme.shadows.premium
    },
    blurContainer: {
      height: normalize(76),
      borderRadius: normalize(38),
      overflow: 'hidden',
      backgroundColor: theme.mode === 'honey' ? 'rgba(252, 250, 238, 0.92)' : 'rgba(247, 247, 242, 0.92)', 
      borderWidth: 1.5,
      borderColor: theme.colors.outlineVariant,
    },
    contentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: '100%',
      paddingHorizontal: normalize(10),
    },
    navItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navLabel: {
      fontSize: normalize(7),
      fontWeight: '900',
      marginTop: 4,
      letterSpacing: 1,
    },
    centerSpace: {
      flex: 1.2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fabButton: {
      width: normalize(54),
      height: normalize(54),
      borderRadius: normalize(27),
      ...theme.shadows.premium,
    },
    fabGradient: {
      flex: 1,
      borderRadius: normalize(27),
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: '#FFF',
    }
  }), [theme]);

  const activeColor = theme.colors.primary;
  const inactiveColor = theme.colors.onSurfaceVariant;

  return (
    <View style={[styles.outerContainer, { bottom: Math.max(insets.bottom, 16) }]}>
      <BlurView intensity={Platform.OS === 'ios' ? 95 : 100} tint={theme.mode === 'honey' ? 'light' : 'default'} style={styles.blurContainer}>
        <View style={styles.contentRow}>
          
          <TouchableOpacity 
            style={styles.navItem} 
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setScreen('dashboard'); }}
          >
            <LayoutDashboard size={normalize(22)} color={activeScreen === 'dashboard' ? activeColor : inactiveColor} strokeWidth={activeScreen === 'dashboard' ? 2.5 : 1.5} />
            <Text style={[styles.navLabel, { color: activeScreen === 'dashboard' ? activeColor : inactiveColor }]}>RESUMEN</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.navItem} 
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setScreen('expenses'); }}
          >
            <Wallet size={normalize(22)} color={activeScreen === 'expenses' ? activeColor : inactiveColor} strokeWidth={activeScreen === 'expenses' ? 2.5 : 1.5} />
            <Text style={[styles.navLabel, { color: activeScreen === 'expenses' ? activeColor : inactiveColor }]}>MOVIMIENTOS</Text>
          </TouchableOpacity>

          {/* Central Button */}
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
                <Plus size={normalize(28)} color="#FFF" />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            style={styles.navItem} 
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setScreen('pockets'); }}
          >
            <Grid2X2 size={normalize(22)} color={activeScreen === 'pockets' ? activeColor : inactiveColor} strokeWidth={activeScreen === 'pockets' ? 2.5 : 1.5} />
            <Text style={[styles.navLabel, { color: activeScreen === 'pockets' ? activeColor : inactiveColor }]}>BOLSILLOS</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.navItem} 
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setScreen('profile'); }}
          >
             <User size={normalize(22)} color={activeScreen === 'profile' ? activeColor : inactiveColor} strokeWidth={activeScreen === 'profile' ? 2.5 : 1.5} />
             <Text style={[styles.navLabel, { color: activeScreen === 'profile' ? activeColor : inactiveColor }]}>PERFIL</Text>
          </TouchableOpacity>

        </View>
      </BlurView>
    </View>
  );
};
