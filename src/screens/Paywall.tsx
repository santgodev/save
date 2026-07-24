// =====================================================================
// Paywall.tsx — Pantalla de suscripción de Save (100% premium, sin
// versión gratis permanente). Aparece una sola vez, justo después del
// tour de bienvenida, y bloquea el resto de la app hasta que el usuario
// activa la prueba gratis de 7 días o se suscribe.
//
// 2 pasos, siguiendo las buenas prácticas de conversión que definimos
// con Maira:
//   Paso 1 (ValueStep)   -- conexión emocional, gastos hormiga reales,
//                           SIN pedir plata todavía.
//   Paso 2 (PricingStep) -- precios, anclaje, cronograma de cobro,
//                           mensaje de tranquilidad, CTA con flecha.
// =====================================================================

import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, ActivityIndicator, Platform, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  Sparkles, Coffee, Bus, Soup, PiggyBank, ChevronRight, ChevronLeft, Check, ShieldCheck,
} from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { useSubscription } from '../lib/SubscriptionContext';
import { PRODUCT_IDS, TRIAL_DAYS, FALLBACK_PRICING } from '../lib/purchases';
import { notify } from '../lib/notify';
import type { PurchasesPackage } from 'react-native-purchases';

interface PaywallProps {
  /** Se llama cuando el usuario queda con el entitlement activo (prueba o pago) */
  onSubscribed: () => void;
  /** Salida de emergencia -- ej. cerrar sesión, para no dejar a nadie 100% atrapado */
  onLogout?: () => void;
  /**
   * SOLO DESARROLLO -- si se pasa esta función, aparece un botón discreto
   * para saltar el paywall sin pagar. app/index.tsx solo la pasa cuando
   * __DEV__ es true, así que nunca existe en un build de App Store.
   */
  onDevSkip?: () => void;
}

export const Paywall = ({ onSubscribed, onLogout, onDevSkip }: PaywallProps) => {
  const [step, setStep] = useState<1 | 2>(1);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const goToStep2 = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setStep(2);
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  };

  const goToStep1 = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setStep(1);
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  };

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      {step === 1 ? (
        <ValueStep onNext={goToStep2} onDevSkip={onDevSkip} />
      ) : (
        <PricingStep onBack={goToStep1} onSubscribed={onSubscribed} onLogout={onLogout} onDevSkip={onDevSkip} />
      )}
    </Animated.View>
  );
};

// Botón discreto, solo visible cuando app/index.tsx nos pasa onDevSkip
// (es decir, solo en __DEV__). Nunca aparece en producción.
const DevSkipButton = ({ onPress, style }: { onPress: () => void; style?: any }) => (
  <TouchableOpacity onPress={onPress} style={[{ alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 14, marginBottom: 8 }, style]}>
    <Text style={{ fontSize: 11, fontWeight: '800', color: '#B45309', letterSpacing: 0.5 }}>⚠ SALTAR PAYWALL (SOLO DEV)</Text>
  </TouchableOpacity>
);

// =====================================================================
// PASO 1 — Conexión emocional. Traduce un gasto hormiga de ejemplo a
// referencias reales de Colombia. Cero mención de precio de Save aquí.
// =====================================================================
const ValueStep = ({ onNext, onDevSkip }: { onNext: () => void; onDevSkip?: () => void }) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scroll: { paddingHorizontal: 24, paddingTop: Math.max(insets.top, 16) + 24, paddingBottom: Math.max(insets.bottom, 16) + 24 },
    iconWrap: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16 },
    eyebrow: { textAlign: 'center', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase', color: theme.colors.onSurfaceVariant, marginBottom: 6 },
    title: { textAlign: 'center', color: theme.colors.onSurface, marginBottom: 28 },
    card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.xl, padding: 20, borderWidth: 1, borderColor: theme.colors.divider, marginBottom: 16, ...theme.shadows.sm },
    amountLabel: { fontSize: 13, color: theme.colors.onSurfaceVariant, marginBottom: 2 },
    amount: { ...theme.typography.display, color: theme.colors.onSurface, marginBottom: 14 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.colors.divider },
    rowIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.onSurface },
    rowSub: { fontSize: 12, color: theme.colors.onSurfaceVariant, marginTop: 1 },
    calloutBox: { backgroundColor: theme.colors.primaryContainer, borderRadius: theme.radius.lg, padding: 16, marginBottom: 24, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    calloutText: { flex: 1, fontSize: 13, color: theme.colors.onPrimaryContainer, lineHeight: 19 },
    nextBtn: { borderRadius: theme.radius.xl, overflow: 'hidden', ...theme.shadows.soft },
    nextBtnInner: { paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    nextBtnText: { color: '#13302D', fontSize: 16, fontWeight: '900' },
  });

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {onDevSkip && <DevSkipButton onPress={onDevSkip} />}
        <LinearGradient colors={theme.colors.brandGradient as any} style={styles.iconWrap} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Sparkles size={28} color="#13302D" />
        </LinearGradient>
        <Text style={styles.eyebrow}>Antes de empezar</Text>
        <Text style={[theme.typography.h2, styles.title]}>Así se siente tu plata</Text>

        <View style={styles.card}>
          <Text style={styles.amountLabel}>Un gasto hormiga de</Text>
          <Text style={styles.amount}>{formatCOP(14900)}</Text>

          <EquivalenceRow
            icon={<Coffee size={18} color="#13302D" />}
            bg={theme.colors.primaryContainer}
            title="2 tintos de cadena"
            subtitle="~$5.370 c/u en Colombia"
            styles={styles}
          />
          <EquivalenceRow
            icon={<Bus size={18} color="#712B13" />}
            bg="#FAECE7"
            title="4 pasajes de Transmilenio"
            subtitle="$3.550 el pasaje en 2026"
            styles={styles}
          />
          <EquivalenceRow
            icon={<Soup size={18} color="#72243E" />}
            bg="#FBEAF0"
            title="Casi un corrientazo completo"
            subtitle="ronda los $20.000 en Bogotá"
            styles={styles}
          />
        </View>

        <View style={styles.calloutBox}>
          <PiggyBank size={20} color={theme.colors.onPrimaryContainer} />
          <Text style={styles.calloutText}>
            Aquí no te vamos a juzgar el tinto. Te ayudamos a ver estos gastos a tiempo, antes de que se te vuelvan un hábito caro.
          </Text>
        </View>

        <TouchableOpacity activeOpacity={0.85} style={styles.nextBtn} onPress={onNext}>
          <LinearGradient colors={theme.colors.brandGradient as any} style={styles.nextBtnInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Text style={styles.nextBtnText}>Vamos a ahorrar</Text>
            <ChevronRight size={20} color="#13302D" />
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const EquivalenceRow = ({ icon, bg, title, subtitle, styles }: any) => (
  <View style={styles.row}>
    <View style={[styles.rowIcon, { backgroundColor: bg }]}>{icon}</View>
    <View style={{ flex: 1 }}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowSub}>{subtitle}</Text>
    </View>
  </View>
);

// =====================================================================
// PASO 2 — Precios. Anual por defecto, anclaje de precio, cronograma de
// cobro de la prueba, mensaje de tranquilidad, CTA con flecha.
// =====================================================================
const PricingStep = ({ onBack, onSubscribed, onLogout, onDevSkip }: { onBack: () => void; onSubscribed: () => void; onLogout?: () => void; onDevSkip?: () => void }) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { offering, purchasePackage, restorePurchases, isSubscribed } = useSubscription();
  const [selected, setSelected] = useState<'annual' | 'monthly'>('annual');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    if (isSubscribed) onSubscribed();
  }, [isSubscribed]);

  // Paquetes reales de RevenueCat, si ya están configurados. Mientras
  // Maira no cree los productos en App Store Connect, offering es null
  // y usamos los precios de referencia (FALLBACK_PRICING) solo para que
  // la pantalla no se vea vacía durante el desarrollo.
  const monthlyPkg = offering?.availablePackages.find(p => p.product.identifier === PRODUCT_IDS.monthly);
  const annualPkg = offering?.availablePackages.find(p => p.product.identifier === PRODUCT_IDS.annual);

  const monthlyPrice = monthlyPkg?.product.priceString || formatCOP(FALLBACK_PRICING.monthly);
  const annualPrice = annualPkg?.product.priceString || formatCOP(FALLBACK_PRICING.annual);
  const annualMonthlyEquivalent = formatCOP(Math.round(FALLBACK_PRICING.annual / 12));

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scroll: { paddingHorizontal: 24, paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: Math.max(insets.bottom, 16) + 24 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    backBtn: { padding: 8, marginLeft: -8 },
    title: { color: theme.colors.onSurface, textAlign: 'center' },
    subtitle: { textAlign: 'center', color: theme.colors.onSurfaceVariant, fontSize: 13, marginBottom: 24, lineHeight: 19 },
    timeline: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.divider, padding: 16, marginBottom: 20 },
    timelineRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 6 },
    dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.primary, marginTop: 4 },
    timelineTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.onSurface },
    timelineSub: { fontSize: 12, color: theme.colors.onSurfaceVariant, marginTop: 1 },
    planCard: { borderRadius: theme.radius.lg, borderWidth: 1.5, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    planLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    planName: { fontSize: 15, fontWeight: '900', color: theme.colors.onSurface },
    planPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
    planPrice: { fontSize: 13, color: theme.colors.onSurfaceVariant },
    badge: { position: 'absolute', top: -10, left: 16, backgroundColor: theme.colors.primary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
    badgeText: { fontSize: 10, fontWeight: '900', color: theme.colors.onPrimary, letterSpacing: 0.5 },
    anchorText: { textAlign: 'center', fontSize: 12, color: theme.colors.onSurfaceVariant, marginTop: 4, marginBottom: 20 },
    ctaBtn: { borderRadius: theme.radius.xl, overflow: 'hidden', ...theme.shadows.soft, marginBottom: 12 },
    ctaInner: { paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    ctaText: { color: '#13302D', fontSize: 16, fontWeight: '900' },
    reassurance: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    reassuranceText: { fontSize: 12, color: theme.colors.onSurfaceVariant },
    footerLinks: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 4 },
    footerLink: { fontSize: 12, color: theme.colors.onSurfaceVariant, textDecorationLine: 'underline' },
    logoutLink: { textAlign: 'center', fontSize: 12, color: theme.colors.onSurfaceVariant, marginTop: 16, opacity: 0.7 },
  });

  const handlePurchase = async () => {
    const pkg = selected === 'annual' ? annualPkg : monthlyPkg;
    if (!pkg) {
      notify.error('La suscripción todavía no está configurada. Vuelve a intentarlo más tarde.');
      return;
    }
    setIsPurchasing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await purchasePackage(pkg);
    setIsPurchasing(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSubscribed();
    } else if (result.error) {
      notify.error(result.error);
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    const result = await restorePurchases();
    setIsRestoring(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSubscribed();
    } else {
      notify.error(result.error || 'No encontramos ninguna compra activa para restaurar.');
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {onDevSkip && <DevSkipButton onPress={onDevSkip} />}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <ChevronLeft size={22} color={theme.colors.onSurface} />
          </TouchableOpacity>
        </View>

        <Text style={[theme.typography.h2, styles.title]}>Save es 100% premium</Text>
        <Text style={styles.subtitle}>
          Escáner con IA, chat que analiza tus finanzas, insights automáticos y tu historial completo. {TRIAL_DAYS} días gratis para probarlo todo.
        </Text>

        <View style={styles.timeline}>
          <TimelineRow dot title="Hoy" subtitle="Empiezas tu prueba gratis. No se te cobra nada." styles={styles} />
          <TimelineRow dot title={`Día ${TRIAL_DAYS - 2}`} subtitle="Te avisamos antes de que termine la prueba." styles={styles} />
          <TimelineRow dot title={`Día ${TRIAL_DAYS}`} subtitle="Si sigues activo, se cobra tu plan. Cancela antes si no quieres seguir." styles={styles} last />
        </View>

        <PlanCard
          selected={selected === 'annual'}
          onPress={() => setSelected('annual')}
          name="Anual"
          price={annualPrice}
          sub={`equivale a ${annualMonthlyEquivalent}/mes`}
          badge="Más popular"
          theme={theme}
          styles={styles}
        />
        <PlanCard
          selected={selected === 'monthly'}
          onPress={() => setSelected('monthly')}
          name="Mensual"
          price={`${monthlyPrice}/mes`}
          sub="cancela cuando quieras"
          theme={theme}
          styles={styles}
        />

        <Text style={styles.anchorText}>Eso es menos de lo que gastas en 2 tintos a la semana.</Text>

        <TouchableOpacity activeOpacity={0.85} style={styles.ctaBtn} onPress={handlePurchase} disabled={isPurchasing}>
          <LinearGradient colors={theme.colors.brandGradient as any} style={styles.ctaInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            {isPurchasing ? (
              <ActivityIndicator color="#13302D" />
            ) : (
              <>
                <Text style={styles.ctaText}>Empezar prueba gratis de {TRIAL_DAYS} días</Text>
                <ChevronRight size={20} color="#13302D" />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.reassurance}>
          <ShieldCheck size={14} color={theme.colors.onSurfaceVariant} />
          <Text style={styles.reassuranceText}>Sin compromiso. Cancela cuando quieras.</Text>
        </View>

        <TouchableOpacity onPress={handleRestore} disabled={isRestoring}>
          <Text style={[styles.footerLink, { textAlign: 'center', marginBottom: 16 }]}>
            {isRestoring ? 'Restaurando...' : 'Restaurar compra'}
          </Text>
        </TouchableOpacity>

        <View style={styles.footerLinks}>
          <TouchableOpacity onPress={() => Linking.openURL('https://eveenia.com/es/save/terms')}>
            <Text style={styles.footerLink}>Términos de uso</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL('https://eveenia.com/es/save/privacy')}>
            <Text style={styles.footerLink}>Privacidad</Text>
          </TouchableOpacity>
        </View>

        {onLogout && (
          <TouchableOpacity onPress={onLogout}>
            <Text style={styles.logoutLink}>Cerrar sesión</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};

const TimelineRow = ({ title, subtitle, styles, last }: any) => (
  <View style={[styles.timelineRow, last && { paddingBottom: 0 }]}>
    <View style={styles.dot} />
    <View style={{ flex: 1 }}>
      <Text style={styles.timelineTitle}>{title}</Text>
      <Text style={styles.timelineSub}>{subtitle}</Text>
    </View>
  </View>
);

const PlanCard = ({ selected, onPress, name, price, sub, badge, theme, styles }: any) => (
  <TouchableOpacity
    activeOpacity={0.85}
    onPress={() => { Haptics.selectionAsync(); onPress(); }}
    style={[
      styles.planCard,
      {
        backgroundColor: selected ? theme.colors.primaryContainer : theme.colors.surface,
        borderColor: selected ? theme.colors.primary : theme.colors.divider,
      },
    ]}
  >
    {badge && (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{badge.toUpperCase()}</Text>
      </View>
    )}
    <View style={styles.planLeft}>
      <View style={[styles.radio, { borderColor: selected ? theme.colors.primary : theme.colors.outlineVariant }]}>
        {selected && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.colors.primary }} />}
      </View>
      <View>
        <Text style={styles.planName}>{name}</Text>
        <View style={styles.planPriceRow}>
          <Text style={styles.planPrice}>{sub}</Text>
        </View>
      </View>
    </View>
    <Text style={[styles.planName, { color: theme.colors.primary }]}>{price}</Text>
  </TouchableOpacity>
);

function formatCOP(n: number): string {
  return `$${n.toLocaleString('es-CO')}`;
}
