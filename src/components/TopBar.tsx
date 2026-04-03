import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Bell, LogOut, User } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { theme } from '../theme/theme';
import { supabase } from '../lib/supabase';

interface TopBarProps {
  title: string;
  userAvatar?: string | null;
  userName?: string | null;
}

export const TopBar = ({ title, userAvatar, userName }: TopBarProps) => {
  const insets = useSafeAreaInsets();

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
    <BlurView intensity={80} tint="light" style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) + 16 }]}>
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
          style={[styles.iconButton, { backgroundColor: 'rgba(160, 62, 64, 0.08)' }]}
          onPress={async () => {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await supabase.auth.signOut();
          }}
          activeOpacity={0.7}
        >
          <LogOut size={20} color={theme.colors.tertiary} />
        </TouchableOpacity>
      </View>
    </BlurView>
  );
};

const styles = StyleSheet.create({
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
    backgroundColor: 'rgba(255, 248, 244, 0.7)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(43, 23, 0, 0.03)',
  },
  avatarContainer: {
    width: 44, height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primaryContainer,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
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
    fontWeight: '500',
  },
  userName: {
    fontSize: 14,
    color: theme.colors.onBackground,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  topBarTitle: { fontFamily: theme.fonts.headline, fontWeight: '800', color: theme.colors.primary, fontSize: 22, letterSpacing: -0.5 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: 'rgba(39, 105, 89, 0.08)' },
});
