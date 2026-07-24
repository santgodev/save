// =====================================================================
// Paywall.tsx — Pantalla de suscripción de Save
// Flujo narrativo de conversión:
// Paso 1: Concientización (Dolor / FOMO / Gastos reales colombianos)
// Paso 2: Solución (Beneficios) + Bottom Sheet de Planes
// =====================================================================

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Animated, ActivityIndicator, Dimensions, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  MessageCircle, PiggyBank, Search, History,
  TrendingDown, ArrowRight, HelpCircle, Wallet, AlertCircle, Frown, 
  Banknote, XCircle, ShieldOff
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeContext';
import { useSubscription } from '../lib/SubscriptionContext';
import { PRODUCT_IDS, TRIAL_DAYS, FALLBACK_PRICING } from '../lib/purchases';
import { notify } from '../lib/notify';

const { height } = Dimensions.get('window');

// =====================================================================
// COPY — 3 variantes A/B, muy aterrizadas a la realidad colombiana
// pains: icon = componente de lucide, text = texto corto y directo
// =====================================================================
export const AWAKENING_VARIANTS = {
  colloquial: {
    headline: '¿En dónde me gasté\nmi plata?',
    subheadline: 'Llegas al 20 del mes y no sabes qué pasó con tu sueldo.',
    mathLabel: 'Lo que se va en el día a día',
    mathLine: 'Tinto, empanada, pasajes y "cositas"',
    result: 'Hasta el 20% del sueldo',
    resultNote: 'se esfuma en gastos que ni recuerdas.',
    pains: [
      { icon: History,     color: '#F0927B', text: '"Llevo años trabajando y aún no tengo un ahorro..."' },
      { icon: AlertCircle, color: '#8AD6CE', text: '"Siento que me sobra plata, pero llega una deuda y quedo en cero."' },
      { icon: Wallet,      color: '#D2A9D1', text: '"Me da miedo mirar el saldo de mi cuenta bancaria a fin de mes."' },
    ],
    cta: 'Descubre a dónde va tu plata',
    socialProof: '+12.000 colombianos ya saben en qué gastan',
  },
  empathetic: {
    headline: '¿Trabajas y trabajas\ny nada que ahorras?',
    subheadline: 'Sientes que la plata se te va como agua entre los dedos.',
    mathLabel: 'El costo de no llevar cuentas',
    mathLine: '3 de cada 4 colombianos no saben en qué gastan',
    result: '0 ahorros reales',
    resultNote: 'por culpa de los gastos fantasma de cada día.',
    pains: [
      { icon: Banknote,  color: '#F0927B', text: '"Creí que me sobraba plata, pero la tarjeta de crédito me dejó en rojo."' },
      { icon: Frown,     color: '#8AD6CE', text: '"Pago deudas, recibos, y siento que trabajé solo para pagar cuentas."' },
      { icon: ShieldOff, color: '#D2A9D1', text: '"Si me pasa una urgencia médica hoy, no tengo de dónde sacar plata."' },
    ],
    cta: 'Empieza a ver resultados',
    socialProof: 'Primeros 7 días gratis. Sin compromiso.',
  },
  direct: {
    headline: 'Deja de sufrir por\nplata cada quincena',
    subheadline: 'Ganar más no sirve de nada si no sabes en qué lo gastas.',
    mathLabel: 'Lo que pierdes por no anotar',
    mathLine: 'Gastos hormiga + salidas + antojos no planeados',
    result: 'Tu tranquilidad',
    resultNote: 'y la posibilidad de construir tu futuro.',
    pains: [
      { icon: HelpCircle, color: '#F0927B', text: '"¿En qué se me fue la plata? Trabajo durísimo y no veo el progreso."' },
      { icon: TrendingDown, color: '#8AD6CE', text: '"Tengo que hacer malabares cada mes para llegar al próximo pago."' },
      { icon: XCircle,    color: '#D2A9D1', text: '"Siempre prometo que voy a ahorrar, pero siempre sale un imprevisto."' },
    ],
    cta: 'Recupera el control hoy',
    socialProof: 'Calificación 4.8 en las tiendas de apps',
  },
};

interface PaywallProps {
  onSubscribed: () => void;
  onLogout?: () => void;
  onDevSkip?: () => void;
  variant?: keyof typeof AWAKENING_VARIANTS;
}

// =====================================================================
// LOGO Save PRO
// =====================================================================
const SaveProLogo = ({ theme }: { theme: any }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ fontSize: 26, fontWeight: '900', fontFamily: theme.fonts.headline, color: theme.colors.primary, letterSpacing: -1 }}>S</Text>
    <Text style={{ fontSize: 26, fontWeight: '900', fontFamily: theme.fonts.headline, color: '#F0927B', letterSpacing: -1 }}>a</Text>
    <Text style={{ fontSize: 26, fontWeight: '900', fontFamily: theme.fonts.headline, color: '#8AD6CE', letterSpacing: -1 }}>v</Text>
    <Text style={{ fontSize: 26, fontWeight: '900', fontFamily: theme.fonts.headline, color: '#D2A9D1', letterSpacing: -1 }}>e</Text>
    <View style={{ backgroundColor: theme.colors.primary, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6 }}>
      <Text style={{ fontSize: 10, fontWeight: '900', fontFamily: theme.fonts.headline, color: theme.colors.onPrimary, letterSpacing: 1 }}>PRO</Text>
    </View>
  </View>
);

// =====================================================================
// COMPONENTE PRINCIPAL
// =====================================================================
export const Paywall = ({ onSubscribed, onLogout, onDevSkip, variant }: PaywallProps) => {
  const [step, setStep] = useState<1 | 2>(1);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const { theme } = useTheme();

  const chosenKey = useMemo<keyof typeof AWAKENING_VARIANTS>(() => {
    if (variant) return variant;
    const keys = Object.keys(AWAKENING_VARIANTS) as Array<keyof typeof AWAKENING_VARIANTS>;
    return keys[Math.floor(Math.random() * keys.length)];
  }, [variant]);

  const chosenVariant = AWAKENING_VARIANTS[chosenKey];

  useEffect(() => {
    notify.info(`[Paywall] variante: ${chosenKey}`);
  }, [chosenKey]);

  const goToStep2 = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setStep(2);
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {step === 1 ? (
          <AwarenessStep variant={chosenVariant} onNext={goToStep2} onDevSkip={onDevSkip} />
        ) : (
          <BenefitsAndPlansStep onSubscribed={onSubscribed} onLogout={onLogout} onDevSkip={onDevSkip} />
        )}
      </Animated.View>
    </View>
  );
};

// =====================================================================
// PASO 1: Concientización — Distribución equilibrada
// =====================================================================
type VariantData = typeof AWAKENING_VARIANTS[keyof typeof AWAKENING_VARIANTS];

const AwarenessStep = ({
  variant, onNext, onDevSkip,
}: { variant: VariantData; onNext: () => void; onDevSkip?: () => void }) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const S = StyleSheet.create({
    scroll: {
      paddingHorizontal: 24,
      paddingTop: Math.max(insets.top, 16),
      paddingBottom: Math.max(insets.bottom, 24),
      flexGrow: 1,
      justifyContent: 'space-between',
    },
    topSection: {
      alignItems: 'center',
      marginTop: 8,
    },
    midSection: {
      flex: 1,
      justifyContent: 'center',
      paddingVertical: 20,
    },
    bottomSection: {
      justifyContent: 'flex-end',
    },

    devBtn: { position: 'absolute', top: 0, right: 0, padding: 8, zIndex: 10 },
    devTxt: { fontSize: 10, fontFamily: theme.fonts.headline, fontWeight: '800', color: theme.colors.warning },

    iconWrap: {
      width: 52, height: 52, borderRadius: 16,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#FDECEA',
      marginTop: 20, marginBottom: 16,
    },
    headline: {
      fontSize: 28, fontWeight: '900',
      fontFamily: theme.fonts.headline,
      textAlign: 'center',
      color: theme.colors.onSurface,
      lineHeight: 34, marginBottom: 8,
    },
    subheadline: {
      ...theme.typography.bodyMedium,
      textAlign: 'center',
      color: theme.colors.onSurfaceVariant,
      fontFamily: theme.fonts.body,
    },

    // ---- Tarjeta matemática / Datos ----
    mathCard: {
      borderRadius: 20, overflow: 'hidden',
      marginBottom: 20,
      backgroundColor: theme.colors.surface,
      borderWidth: 1, borderColor: theme.colors.outlineVariant,
    },
    mathTop: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      backgroundColor: '#F0927B',
      paddingVertical: 10, paddingHorizontal: 16,
    },
    mathTopText: {
      fontSize: 12, fontWeight: '800',
      fontFamily: theme.fonts.headline, color: '#FFF',
      textTransform: 'uppercase', letterSpacing: 0.5,
    },
    mathBottom: {
      paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16,
    },
    mathEq: {
      fontSize: 13, fontFamily: theme.fonts.body,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center', marginBottom: 12,
    },
    resultBox: {
      backgroundColor: '#FDECEA', borderRadius: 14,
      paddingVertical: 14, alignItems: 'center',
      paddingHorizontal: 12,
    },
    resultAmt: {
      fontSize: 24, fontWeight: '900',
      fontFamily: theme.fonts.headline, color: '#C62828',
      textAlign: 'center',
    },
    resultNote: {
      fontSize: 12, fontFamily: theme.fonts.body,
      color: '#C62828', opacity: 0.85, marginTop: 4,
      textAlign: 'center',
    },

    // ---- Puntos de dolor ----
    painList: { gap: 12 },
    painRow: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      backgroundColor: theme.colors.surfaceContainerHighest,
      paddingVertical: 14, paddingHorizontal: 16,
      borderRadius: 16,
    },
    painIconBox: {
      width: 40, height: 40, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center',
    },
    painText: {
      flex: 1, fontSize: 13, fontFamily: theme.fonts.body,
      color: theme.colors.onSurface, lineHeight: 18,
      fontWeight: '600', fontStyle: 'italic',
    },

    // ---- Social proof ----
    proof: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: 8, marginBottom: 20,
    },
    proofLine: {
      height: 1, width: 30,
      backgroundColor: theme.colors.outlineVariant,
    },
    proofText: {
      fontSize: 11, fontFamily: theme.fonts.headline,
      color: theme.colors.onSurfaceVariant, fontWeight: '700',
      textTransform: 'uppercase', letterSpacing: 0.5,
    },

    // ---- CTA ----
    cta: { borderRadius: 18, overflow: 'hidden', ...theme.shadows.premium },
    ctaInner: {
      paddingVertical: 18,
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: 10,
    },
    ctaTxt: {
      fontSize: 16, fontWeight: '800',
      fontFamily: theme.fonts.headline, color: theme.colors.onPrimary,
    },
  });

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={S.scroll} showsVerticalScrollIndicator={false} bounces={false}>
        
        <View style={S.topSection}>
          {onDevSkip && (
            <TouchableOpacity onPress={onDevSkip} style={S.devBtn}>
              <Text style={S.devTxt}>SALTAR DEV</Text>
            </TouchableOpacity>
          )}
          <SaveProLogo theme={theme} />
          
          <View style={S.iconWrap}>
            <TrendingDown size={28} color="#C62828" />
          </View>

          <Text style={S.headline}>{variant.headline}</Text>
          <Text style={S.subheadline}>{variant.subheadline}</Text>
        </View>

        <View style={S.midSection}>
          <View style={S.mathCard}>
            <View style={S.mathTop}>
              <AlertCircle size={14} color="#FFF" />
              <Text style={S.mathTopText}>{variant.mathLabel}</Text>
            </View>
            <View style={S.mathBottom}>
              <Text style={S.mathEq}>{variant.mathLine}</Text>
              <View style={S.resultBox}>
                <Text style={S.resultAmt}>{variant.result}</Text>
                <Text style={S.resultNote}>{variant.resultNote}</Text>
              </View>
            </View>
          </View>

          <View style={S.painList}>
            {variant.pains.map((p, i) => {
              const Icon = p.icon;
              return (
                <View key={i} style={S.painRow}>
                  <View style={[S.painIconBox, { backgroundColor: p.color + '22' }]}>
                    <Icon size={20} color={p.color} />
                  </View>
                  <Text style={S.painText}>{p.text}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={S.bottomSection}>
          <View style={S.proof}>
            <View style={S.proofLine} />
            <Text style={S.proofText}>{variant.socialProof}</Text>
            <View style={S.proofLine} />
          </View>

          <TouchableOpacity activeOpacity={0.85} style={S.cta} onPress={onNext}>
            <LinearGradient
              colors={theme.colors.brandGradient as any}
              style={S.ctaInner}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={S.ctaTxt}>{variant.cta}</Text>
              <ArrowRight size={20} color={theme.colors.onPrimary} />
            </LinearGradient>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
};

// =====================================================================
// PASO 2: Beneficios — Solucionando los dolores específicos
// =====================================================================
const BenefitsAndPlansStep = ({ onSubscribed, onLogout, onDevSkip }: PaywallProps) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [showPlans, setShowPlans] = useState(false);
  const slideAnim = useRef(new Animated.Value(height)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  const togglePlans = (show: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPlans(show);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: show ? 0 : height, useNativeDriver: true, tension: 65, friction: 10 }),
      Animated.timing(overlayAnim, { toValue: show ? 1 : 0, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const { offering, purchasePackage, restorePurchases, isSubscribed } = useSubscription();
  const [selected, setSelected] = useState<'annual' | 'monthly'>('annual');
  const [isPurchasing, setIsPurchasing] = useState(false);

  useEffect(() => { if (isSubscribed) onSubscribed(); }, [isSubscribed]);

  const monthlyPkg = offering?.availablePackages.find(p => p.product.identifier === PRODUCT_IDS.monthly);
  const annualPkg  = offering?.availablePackages.find(p => p.product.identifier === PRODUCT_IDS.annual);

  const monthlyPrice          = monthlyPkg?.product.priceString || formatCOP(FALLBACK_PRICING.monthly);
  const annualPrice           = annualPkg?.product.priceString  || formatCOP(FALLBACK_PRICING.annual);
  const annualMonthlyEquivalent = formatCOP(Math.round(FALLBACK_PRICING.annual / 12));

  const handlePurchase = async () => {
    const pkg = selected === 'annual' ? annualPkg : monthlyPkg;
    if (!pkg) { notify.error('La suscripción todavía no está configurada.'); return; }
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

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scroll: { paddingHorizontal: 20, paddingTop: Math.max(insets.top, 16), paddingBottom: 140, flexGrow: 1, justifyContent: 'center' },

    title: { ...theme.typography.h2, textAlign: 'center', color: theme.colors.onSurface, fontFamily: theme.fonts.headline, marginBottom: 8, paddingHorizontal: 10 },
    titleSub: { ...theme.typography.bodySmall, textAlign: 'center', color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.body, marginBottom: 26 },

    benefitsCard: { backgroundColor: theme.colors.surface, borderRadius: 20, padding: 10, borderWidth: 1, borderColor: theme.colors.outlineVariant },
    benefitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 18, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.divider },
    benefitTextLeft: { flex: 1, paddingRight: 16 },
    benefitTitle: { ...theme.typography.bodyLarge, fontWeight: '800', color: theme.colors.onSurface, fontFamily: theme.fonts.headline, marginBottom: 4 },
    benefitSub: { ...theme.typography.bodySmall, color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.body, lineHeight: 18 },
    benefitIconBg: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

    devBtn: { alignSelf: 'center', marginTop: 28, padding: 10 },
    devBtnText: { fontSize: 10, fontFamily: theme.fonts.headline, fontWeight: '800', color: theme.colors.warning },

    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: theme.colors.background, paddingHorizontal: 20, paddingTop: 14, paddingBottom: Math.max(insets.bottom, 24), borderTopWidth: 1, borderTopColor: theme.colors.divider },
    ctaBtn: { backgroundColor: theme.colors.primary, borderRadius: 18, paddingVertical: 18, alignItems: 'center', justifyContent: 'center', ...theme.shadows.md },
    ctaText: { fontSize: 16, fontWeight: '800', color: theme.colors.onPrimary, fontFamily: theme.fonts.headline },
    reassuranceRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 },
    reassuranceText: { ...theme.typography.bodySmall, color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.body, fontWeight: '600' },

    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10 },
    sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: theme.colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 24), zIndex: 20, ...theme.shadows.premium },
    dragHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: theme.colors.outlineVariant, alignSelf: 'center', marginBottom: 20 },
    sheetTitle: { ...theme.typography.h3, color: theme.colors.onSurface, fontFamily: theme.fonts.headline, marginBottom: 20, marginLeft: 4 },

    planCard: { borderRadius: theme.radius.lg, borderWidth: 2, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    planLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, flex: 1 },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    planNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    planName: { ...theme.typography.bodyLarge, fontWeight: '800', color: theme.colors.onSurface, fontFamily: theme.fonts.headline },
    badge: { backgroundColor: '#F0927B', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
    badgeText: { ...theme.typography.label, color: '#FFF', fontFamily: theme.fonts.headline },
    planDesc: { ...theme.typography.bodyMedium, color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.body, marginBottom: 2 },
    planRight: { alignItems: 'flex-end' },
    planPrice: { ...theme.typography.title, fontWeight: '800', color: theme.colors.onSurface, fontFamily: theme.fonts.headline },
    planPriceSub: { ...theme.typography.bodySmall, color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.body },

    bottomLinks: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 20 },
    link: { ...theme.typography.bodySmall, color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.body, textDecorationLine: 'underline' },
  });

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} bounces={false}>
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <SaveProLogo theme={theme} />
        </View>

        <Text style={styles.title}>La solución real{'\n'}para que te sobre plata</Text>
        <Text style={styles.titleSub}>Cómo Save PRO acaba con el desorden financiero</Text>

        <View style={styles.benefitsCard}>
          <BenefitRow
            title="Escáner de Recibos con IA"
            sub="No más '¿en qué me gasté la plata?'. Tómale foto y la IA anota y categoriza todo por ti."
            icon={<Search size={20} color="#FFF" />}
            bg="#8AD6CE" styles={styles} theme={theme}
          />
          <BenefitRow
            title="Consejero Financiero 24/7"
            sub="Pregúntale a la IA cómo pagar tus deudas y qué hacer para que te sobre plata a fin de mes."
            icon={<MessageCircle size={20} color="#FFF" />}
            bg="#D2A9D1" styles={styles} theme={theme}
          />
          <BenefitRow
            title="Bolsillos Ilimitados"
            sub="Separa la plata del arriendo, deudas y salidas desde el día 1. Así por fin empezarás a ahorrar."
            icon={<PiggyBank size={20} color="#FFF" />}
            bg="#F0927B" styles={styles} theme={theme}
          />
          <BenefitRow
            title="Historial Completo"
            sub="Ve en qué se te fue el sueldo los meses pasados y deja de trabajar solo para pagar recibos."
            icon={<History size={20} color="#FFF" />}
            bg={theme.colors.primary} styles={styles} theme={theme} last
          />
        </View>

        {onDevSkip && (
          <TouchableOpacity onPress={onDevSkip} style={styles.devBtn}>
            <Text style={styles.devBtnText}>DEV — SALTAR PAYWALL</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity activeOpacity={0.85} style={styles.ctaBtn} onPress={() => togglePlans(true)}>
          <Text style={styles.ctaText}>Ver Planes — 7 días gratis</Text>
        </TouchableOpacity>
        <View style={styles.reassuranceRow}>
          <Text style={styles.reassuranceText}>Sin compromiso</Text>
          <Text style={styles.reassuranceText}>·</Text>
          <Text style={styles.reassuranceText}>Cancela cuando quieras</Text>
        </View>
      </View>

      <Animated.View style={[styles.overlay, { opacity: overlayAnim }]} pointerEvents={showPlans ? 'auto' : 'none'}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => togglePlans(false)} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.dragHandle} />
        <Text style={styles.sheetTitle}>Empieza a ahorrar hoy</Text>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => { Haptics.selectionAsync(); setSelected('annual'); }}
          style={[styles.planCard, {
            borderColor: selected === 'annual' ? theme.colors.primary : theme.colors.outlineVariant,
            backgroundColor: selected === 'annual' ? theme.colors.primaryContainer : 'transparent',
          }]}
        >
          <View style={styles.planLeft}>
            <View style={[styles.radio, { borderColor: selected === 'annual' ? theme.colors.primary : theme.colors.outlineVariant }]}>
              {selected === 'annual' && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.colors.primary }} />}
            </View>
            <View>
              <View style={styles.planNameRow}>
                <Text style={styles.planName}>Anual</Text>
                <View style={styles.badge}><Text style={styles.badgeText}>Ahorras 40%</Text></View>
              </View>
              <Text style={styles.planDesc}>Pagas 1 vez al año</Text>
            </View>
          </View>
          <View style={styles.planRight}>
            <Text style={[styles.planPrice, { color: selected === 'annual' ? theme.colors.primary : theme.colors.onSurface }]}>{annualMonthlyEquivalent}</Text>
            <Text style={styles.planPriceSub}>al mes</Text>
            <Text style={[styles.planPriceSub, { fontSize: 11, marginTop: 4 }]}>Cobro de {annualPrice}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => { Haptics.selectionAsync(); setSelected('monthly'); }}
          style={[styles.planCard, {
            borderColor: selected === 'monthly' ? theme.colors.primary : theme.colors.outlineVariant,
            backgroundColor: selected === 'monthly' ? theme.colors.primaryContainer : 'transparent',
          }]}
        >
          <View style={styles.planLeft}>
            <View style={[styles.radio, { borderColor: selected === 'monthly' ? theme.colors.primary : theme.colors.outlineVariant }]}>
              {selected === 'monthly' && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.colors.primary }} />}
            </View>
            <View>
              <View style={styles.planNameRow}>
                <Text style={styles.planName}>Mensual</Text>
              </View>
              <Text style={styles.planDesc}>Flexibilidad total</Text>
            </View>
          </View>
          <View style={styles.planRight}>
            <Text style={[styles.planPrice, { color: selected === 'monthly' ? theme.colors.primary : theme.colors.onSurface }]}>{monthlyPrice}</Text>
            <Text style={styles.planPriceSub}>al mes</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.ctaBtn, { marginTop: 10 }]}
          onPress={handlePurchase}
          disabled={isPurchasing}
        >
          {isPurchasing
            ? <ActivityIndicator color={theme.colors.onPrimary} />
            : <Text style={styles.ctaText}>Iniciar {TRIAL_DAYS} días gratis</Text>
          }
        </TouchableOpacity>

        <View style={styles.reassuranceRow}>
          <Text style={styles.reassuranceText}>Sin riesgo</Text>
          <Text style={styles.reassuranceText}>·</Text>
          <Text style={styles.reassuranceText}>Cancela cuando quieras</Text>
        </View>

        <View style={styles.bottomLinks}>
          <TouchableOpacity onPress={() => Linking.openURL('https://eveenia.com/es/save/terms')}>
            <Text style={styles.link}>Términos</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => restorePurchases()}>
            <Text style={styles.link}>Restaurar compra</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
};

// =====================================================================
// BenefitRow helper
// =====================================================================
const BenefitRow = ({ title, sub, icon, bg, styles, theme, last }: any) => (
  <View style={[styles.benefitRow, last && { borderBottomWidth: 0 }]}>
    <View style={styles.benefitTextLeft}>
      <Text style={styles.benefitTitle}>{title}</Text>
      <Text style={styles.benefitSub}>{sub}</Text>
    </View>
    <View style={[styles.benefitIconBg, { backgroundColor: bg }]}>
      {icon}
    </View>
  </View>
);

function formatCOP(n: number): string {
  return `$${n.toLocaleString('es-CO')}`;
}
