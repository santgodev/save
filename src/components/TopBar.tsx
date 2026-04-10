import React, { useMemo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Bell } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';

interface TopBarProps {
  title: string;
  userAvatar?: string | null;
  userName?: string | null;
}

export const TopBar = ({ title, userAvatar, userName }: TopBarProps) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const styles = useMemo(() => StyleSheet.create({
    topBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingBottom: 20,
      zIndex: 50,
      backgroundColor: theme.colors.glassWhite, 
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.divider,
      ...theme.shadows.soft
    },
    avatarContainer: {
      width: 40, 
      height: 40,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.8)',
      backgroundColor: theme.colors.primaryContainer,
    },
    avatarImage: { width: '100%', height: '100%' },
    avatarFallback: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
    },
    avatarInitials: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '800',
    },
    topBarTitle: { 
      ...theme.typography.caption,
      color: theme.colors.primary,
      fontSize: 10,
      letterSpacing: 2,
      opacity: 0.6,
    },
    iconButton: { 
      width: 40, 
      height: 40, 
      alignItems: 'center', 
      justifyContent: 'center', 
      borderRadius: 12, 
      backgroundColor: theme.colors.primaryContainer,
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.7)',
    },
  }), [theme]);

  // Get initials from name for fallback
  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0][0]?.toUpperCase() || '?';
  };

  return (
    <BlurView intensity={Platform.OS === 'ios' ? 80 : 100} tint="light" style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) + 12 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          style={styles.avatarContainer}
        >
          {userAvatar ? (
            <Image
              source={{ uri: userAvatar }}
              style={styles.avatarImage}
            />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitials}>{getInitials(userName)}</Text>
            </View>
          )}
        </TouchableOpacity>
        {userName && (
          <Text style={{ ...theme.typography.label, fontSize: 9, color: theme.colors.primary }}>
            {userName.split(' ')[0]}
          </Text>
        )}
      </View>

      <View style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: -1 }}>
         <Text style={styles.topBarTitle}>{title}</Text>
      </View>

      <TouchableOpacity
        style={styles.iconButton}
        onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
        activeOpacity={0.7}
      >
        <Bell size={18} color={theme.colors.primary} strokeWidth={2.5} />
      </TouchableOpacity>
    </BlurView>
  );
};
