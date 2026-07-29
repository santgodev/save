// =====================================================================
// PurchaseConfirmation.tsx — Pantalla de celebración justo después de que
// el pago se procesa. Se muestra UNA vez por compra nueva (ver index.tsx:
// justSubscribedPlan) -- si la persona ya estaba suscrita al abrir la app,
// nunca la vuelve a ver.
// =====================================================================

import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Sparkles, Camera, MessageSquare, Wallet, Leaf, ArrowRight } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';

const { width, height } = Dimensions.get('window');

interface PurchaseConfirmationProps {
  plan: 'annual' | 'monthly';
  onContinue: () => void;
}

// =====================================================================
// CONFETTI — piezas de colores de la marca, caen desde arriba con una
// rotación y una velocidad ligeramente distintas cada una para que no se
// sientan sincronizadas ni artificiales.
// =====================================================================
const CONFETTI_COLORS = ['#47ADA2', '#F0927B', '#8AD6CE', '#D2A9D1', '#B9E2A2'];
const CONFETTI_COUNT = 26;

type ConfettiPiece = {
  left: number;
  color: string;
  size: number;
  isCircle: boolean;
  delay: number;
  duration: number;
  drift: number;
  rotations: number;
};

const ConfettiLayer = () => {
  const pieces = useMemo<ConfettiPiece[]>(() => (
    Array.from({ length: CONFETTI_COUNT }).map(() => ({
      left: Math.random() * width,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: 6 + Math.random() * 7,
      isCircle: Math.random() > 0.5,
      delay: Math.random() * 350,
      duration: 2200 + Math.random() * 1400,
      drift: (Math.random() - 0.5) * 80,
      rotations: 2 + Math.random() * 3,
    }))
  ), []);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {pieces.map((p, i) => <ConfettiPieceView key={i} piece={p} />)}
    </View>
  );
};

const ConfettiPieceView = ({ piece }: { piece: ConfettiPiece }) => {
  const fall = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fall, {
      toValue: 1,
      duration: piece.duration,
      delay: piece.delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, []);

  const translateY = fall.interpolate({ inputRange: [0, 1], outputRange: [-40, height * 0.85] });
  const translateX = fall.interpolate({ inputRange: [0, 1], outputRange: [0, piece.drift] });
  const rotate = fall.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${piece.rotations * 360}deg`] });
  const opacity = fall.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: piece.left,
        top: 0,
        width: piece.size,
        height: piece.isCircle ? piece.size : piece.size * 1.8,
        borderRadius: piece.isCircle ? piece.size / 2 : 2,
        backgroundColor: piece.color,
        opacity,
        transform: [{ translateY }, { translateX }, { rotate }],
      }}
    />
  );
};

// =====================================================================
// COMPONENTE PRINCIPAL
// =====================================================================
export const PurchaseConfirmation = ({ plan, onContinue }: PurchaseConfirmationProps) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const badgeScale = useRef(new Animated.Value(0)).current;
  const headlineOpacity = useRef(new Animated.Value(0)).current;
  const headlineY = useRef(new Animated.Value(14)).current;
  const listOpacity = useRef(new Animated.Value(0)).current;
  const ctaOpacity = useRef(new Animated.Value(0)).current;
  const ctaY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Animated.sequence([
      Animated.spring(badgeScale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(headlineOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(headlineY, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]),
      Animated.timing(listOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(ctaOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(ctaY, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const planLabel = plan === 'annual' ? 'Plan Anual' : 'Plan Mensual';

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { flex: 1, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
    badgeOuter: {
      width: 92, height: 92, borderRadius: 46,
      backgroundColor: theme.colors.primary + '20',
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 24,
    },
    badgeInner: {
      width: 70, height: 70, borderRadius: 35,
      backgroundColor: theme.colors.primary,
      alignItems: 'center', justifyContent: 'center',
      ...theme.shadows.md,
    },
    planPill: {
      backgroundColor: theme.colors.primaryContainer,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 6,
      marginBottom: 14,
    },
    planPillText: {
      fontSize: 11, fontWeight: '900', letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: theme.colors.primary,
      fontFamily: theme.fonts.headline,
    },
    headlinePre: {
      fontSize: 22, fontWeight: '800',
      fontFamily: theme.fonts.headline,
      color: theme.colors.onSurface,
    },
    wordmarkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 14,
    },
    wordmarkLetter: {
      fontSize: 22, fontWeight: '900',
      fontFamily: theme.fonts.headline,
    },
    proBadge: {
      backgroundColor: theme.colors.primary,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginLeft: 6,
    },
    proBadgeText: {
      fontSize: 10, fontWeight: '900', letterSpacing: 0.8,
      fontFamily: theme.fonts.headline,
      color: theme.colors.onPrimary,
    },
    subtitle: {
      fontSize: 15, color: theme.colors.onSurfaceVariant,
      textAlign: 'center', lineHeight: 22,
      fontFamily: theme.fonts.body,
      marginBottom: 32,
      maxWidth: 300,
    },
    list: { width: '100%', gap: 14, marginBottom: 40 },
    listRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    listIconBg: {
      width: 38, height: 38, borderRadius: 13,
      alignItems: 'center', justifyContent: 'center',
    },
    listText: {
      flex: 1, fontSize: 14.5, fontWeight: '700',
      color: theme.colors.onSurface,
      fontFamily: theme.fonts.headline,
    },
    cta: {
      width: '100%',
      backgroundColor: theme.colors.primary,
      borderRadius: 20,
      paddingVertical: 18,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      ...theme.shadows.md,
    },
    ctaText: {
      fontSize: 16, fontWeight: '800',
      color: theme.colors.onPrimary,
      fontFamily: theme.fonts.headline,
    },
  });

  const FEATURES: Array<{ icon: React.ReactNode; label: string; bg: string }> = [
    { icon: <Leaf size={18} color="#FFF" />, label: 'Sin complicaciones, hecha para vos', bg: '#8AD6CE' },
    { icon: <Camera size={18} color="#FFF" />, label: 'Escaneo de recibos ilimitado', bg: '#F0927B' },
    { icon: <MessageSquare size={18} color="#FFF" />, label: 'Save IA sin límites', bg: '#D2A9D1' },
    { icon: <Wallet size={18} color="#FFF" />, label: 'Bolsillos y ciclos ilimitados', bg: theme.colors.primary },
  ];

  return (
    <View style={styles.container}>
      <ConfettiLayer />

      <View style={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Animated.View style={[styles.badgeOuter, { transform: [{ scale: badgeScale }] }]}>
          <View style={styles.badgeInner}>
            <Sparkles size={30} color={theme.colors.onPrimary} />
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: headlineOpacity, transform: [{ translateY: headlineY }], alignItems: 'center' }}>
          <View style={styles.planPill}>
            <Text style={styles.planPillText}>{planLabel} activado</Text>
          </View>
          <View style={styles.wordmarkRow}>
            <Text style={styles.headlinePre}>Ya eres </Text>
            <Text style={[styles.wordmarkLetter, { color: theme.colors.primary }]}>S</Text>
            <Text style={[styles.wordmarkLetter, { color: '#F0927B' }]}>A</Text>
            <Text style={[styles.wordmarkLetter, { color: '#8AD6CE' }]}>V</Text>
            <Text style={[styles.wordmarkLetter, { color: '#D2A9D1' }]}>E</Text>
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>Tu prueba de 7 días ya empezó. No te cobramos nada hoy, y puedes cancelar cuando quieras.</Text>
        </Animated.View>

        <Animated.View style={[styles.list, { opacity: listOpacity }]}>
          {FEATURES.map((f, i) => (
            <View key={i} style={styles.listRow}>
              <View style={[styles.listIconBg, { backgroundColor: f.bg }]}>{f.icon}</View>
              <Text style={styles.listText}>{f.label}</Text>
            </View>
          ))}
        </Animated.View>

        <Animated.View style={{ width: '100%', opacity: ctaOpacity, transform: [{ translateY: ctaY }] }}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.cta}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onContinue(); }}
          >
            <Text style={styles.ctaText}>Empezar a ahorrar</Text>
            <ArrowRight size={20} color={theme.colors.onPrimary} />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
};
