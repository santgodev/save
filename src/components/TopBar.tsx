import React, { useMemo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Bell, LogOut, User } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../lib/supabase';

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
      paddingBottom: 16,
      zIndex: 50,
      backgroundColor: theme.mode === 'honey' ? 'rgba(252, 250, 238, 0.85)' : 'rgba(247, 247, 242, 0.85)',
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outlineVariant,
    },
    avatarContainer: {
      width: 44, height: 44,
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: 2,
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
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: 1,
    },
    greeting: {
      fontSize: 11,
      color: theme.colors.onSurfaceVariant,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    userName: {
      fontSize: 15,
      color: theme.colors.onBackground,
      fontWeight: '900',
      letterSpacing: -0.5,
    },
    topBarTitle: { 
      fontWeight: '900', 
      color: theme.colors.primary, 
      fontSize: 22, 
      letterSpacing: -0.8,
      textTransform: 'uppercase',
    },
    iconButton: { 
      width: 44, 
      height: 44, 
      alignItems: 'center', 
      justifyContent: 'center', 
      borderRadius: 22, 
      backgroundColor: theme.colors.primaryContainer + '40' 
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
    <BlurView intensity={80} tint={theme.mode === 'honey' ? 'light' : 'default'} style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) + 16 }]}>
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
        {userName ? (
          <View style={{ maxWidth: 120 }}>
            <Text style={styles.greeting} numberOfLines={1}>Hola,</Text>
            <Text style={styles.userName} numberOfLines={1}>{userName.split(' ')[0]}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.topBarTitle}>{title}</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
          activeOpacity={0.7}
        >
          <Bell size={24} color={theme.colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: theme.colors.error + '15' }]}
          onPress={async () => {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await supabase.auth.signOut();
          }}
          activeOpacity={0.7}
        >
          <LogOut size={20} color={theme.colors.error} />
        </TouchableOpacity>
      </View>
    </BlurView>
  );
};
