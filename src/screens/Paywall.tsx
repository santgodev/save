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
  ArrowRight, Brain, ShieldCheck, Users, Heart, CheckCircle2, Camera, Target, Lock, Leaf, MessageSquare, Wallet, Star
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeContext';
import { useSubscription } from '../lib/SubscriptionContext';
import { PRODUCT_IDS, TRIAL_DAYS, FALLBACK_PRICING } from '../lib/purchases';
import { notify } from '../lib/notify';

const { height } = Dimensions.get('window');

interface PaywallProps {
  onSubscribed: () => void;
  onLogout?: () => void;
  onDevSkip?: () => void;
}

// =====================================================================
// LOGO Save PRO
// =====================================================================
const SaveProLogo = ({ theme }: { theme: any }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ fontSize: 26, fontWeight: '900', fontFamily: theme.fonts.headline, color: theme.colors.primary, letterSpacing: 1 }}>S</Text>
    <Text style={{ fontSize: 26, fontWeight: '900', fontFamily: theme.fonts.headline, color: '#F0927B', letterSpacing: 1 }}>A</Text>
    <Text style={{ fontSize: 26, fontWeight: '900', fontFamily: theme.fonts.headline, color: '#8AD6CE', letterSpacing: 1 }}>V</Text>
    <Text style={{ fontSize: 26, fontWeight: '900', fontFamily: theme.fonts.headline, color: '#D2A9D1', letterSpacing: 1 }}>E</Text>
    <View style={{ backgroundColor: theme.colors.primary, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 }}>
      <Text style={{ fontSize: 10, fontWeight: '900', fontFamily: theme.fonts.headline, color: theme.colors.onPrimary, letterSpacing: 1 }}>PRO</Text>
    </View>
  </View>
);

// =====================================================================
// COMPONENTE PRINCIPAL
// =====================================================================
export const Paywall = ({ onSubscribed, onLogout, onDevSkip }: PaywallProps) => {
  const [step, setStep] = useState<1 | 2>(1);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const goToStep2 = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setStep(2);
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ paddingTop: Math.max(insets.top, 16) + 16, paddingBottom: 16, alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
        {onDevSkip && (
          <TouchableOpacity onPress={onDevSkip} style={{ position: 'absolute', top: Math.max(insets.top, 16) + 16, right: 20, zIndex: 20, opacity: 0.4 }}>
            <Text style={{ fontSize: 10, fontFamily: theme.fonts.headline, fontWeight: '800', color: theme.colors.warning }}>SALTAR DEV</Text>
          </TouchableOpacity>
        )}
        <SaveProLogo theme={theme} />
      </View>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {step === 1 ? (
          <ConscienceStep onNext={goToStep2} onDevSkip={onDevSkip} />
        ) : (
          <BenefitsAndPlansStep onSubscribed={onSubscribed} onLogout={onLogout} onDevSkip={onDevSkip} />
        )}
      </Animated.View>
    </View>
  );
};

// =====================================================================
// PASO 1: Conciencia sobre el costo de la App
// =====================================================================
const ChatMockup = ({ theme }: any) => (
  <View style={{ marginBottom: 24, paddingHorizontal: 4 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, alignSelf: 'flex-start' }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: theme.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
        <MessageSquare size={12} color={theme.colors.primary} />
      </View>
      <Text style={{ fontFamily: theme.fonts.headline, fontSize: 13, color: theme.colors.onSurfaceVariant, fontWeight: '800' }}>Save IA</Text>
    </View>
    <View style={{ gap: 10 }}>
      <View style={{ alignSelf: 'flex-end', backgroundColor: theme.colors.primary, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18, borderBottomRightRadius: 4, maxWidth: '85%' }}>
        <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.onPrimary, fontWeight: '500' }}>¿Cuánto puedo gastar esta semana?</Text>
      </View>
      <View style={{ alignSelf: 'flex-start', backgroundColor: theme.colors.surface, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18, borderBottomLeftRadius: 4, maxWidth: '90%', borderWidth: 1, borderColor: theme.colors.outlineVariant, ...theme.shadows.xs }}>
        <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.onSurface, lineHeight: 18 }}>Puedes gastar hasta $145.000 y seguir cumpliendo tu meta de ahorro.</Text>
      </View>
    </View>
  </View>
);

const ConscienceStep = ({
  onNext, onDevSkip,
}: { onNext: () => void; onDevSkip?: () => void }) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const S = StyleSheet.create({
    scroll: {
      paddingHorizontal: 24,
      paddingTop: 10,
      paddingBottom: Math.max(insets.bottom, 24),
      flexGrow: 1,
      justifyContent: 'space-between',
    },
    topSection: {
      alignItems: 'center',
    },
    midSection: {
      flex: 1,
      justifyContent: 'center',
      paddingVertical: 10,
    },
    bottomSection: {
      justifyContent: 'flex-end',
    },

    headline: {
      ...theme.typography.displaySmall,
      fontFamily: theme.fonts.headline,
      textAlign: 'center',
      color: theme.colors.onSurface,
      lineHeight: 36, marginTop: 12,
      paddingHorizontal: 10,
    },

    // ---- Beneficios Grid (Estilo Bolsillos) ----
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      justifyContent: 'space-between',
      marginTop: 8, marginBottom: 24,
    },
    pocketCard: {
      width: '48%',
      height: 175,
      borderRadius: 20, padding: 16,
      ...theme.shadows.xs,
    },
    pocketIconWrap: {
      width: 44, height: 44, borderRadius: 14,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 12,
    },
    pocketTitle: {
      ...theme.typography.bodyLarge, fontWeight: '800',
      fontFamily: theme.fonts.headline, color: '#FFF',
      marginBottom: 4,
    },
    pocketSub: {
      ...theme.typography.bodySmall,
      fontFamily: theme.fonts.body, color: '#FFF', fontWeight: '500',
      lineHeight: 16,
    },

    // ---- CTA ----
    cta: { 
      backgroundColor: theme.colors.primary, 
      borderRadius: 24, 
      ...theme.shadows.md, 
      marginTop: 20 
    },
    ctaInner: {
      paddingVertical: 18,
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: 10,
    },
    ctaTxt: {
      ...theme.typography.bodyLarge, fontWeight: '800',
      fontFamily: theme.fonts.headline, color: theme.colors.onPrimary,
    },
  });

  const PocketCard = ({ icon, title, sub, bg }: any) => (
    <View style={[S.pocketCard, { backgroundColor: bg }]}>
      <View style={[S.pocketIconWrap, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
        {icon}
      </View>
      <Text style={S.pocketTitle}>{title}</Text>
      <Text style={S.pocketSub}>{sub}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={S.scroll} showsVerticalScrollIndicator={false} bounces={false}>
        
        <View style={S.topSection}>
          <Text style={{ fontFamily: theme.fonts.headline, fontSize: 10, color: theme.colors.primary, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 16 }}>
            MENOS ESTRÉS • MÁS CLARIDAD • MÁS AHORRO
          </Text>

          <Text style={S.headline}>La forma más simple de organizar tu dinero.</Text>
        </View>

        <View style={S.midSection}>
          <ChatMockup theme={theme} />

          <View style={S.grid}>
            <PocketCard icon={<Leaf size={22} color="#FFF" />} title="Fácil de usar" sub="Sin herramientas difíciles." bg="#8AD6CE" />
            <PocketCard icon={<Camera size={22} color="#FFF" />} title="Escanea facturas" sub="La IA clasifica todo por ti." bg="#F0927B" />
            <PocketCard icon={<MessageSquare size={22} color="#FFF" />} title="Tu asistente" sub="Habla con tus finanzas." bg="#D2A9D1" />
            <PocketCard icon={<Wallet size={22} color="#FFF" />} title="Cada peso en su lugar" sub="Controla lo que puedes gastar." bg="#B9E2A2" />
          </View>
        </View>

        <View style={S.bottomSection}>
          <TouchableOpacity activeOpacity={0.85} style={S.cta} onPress={onNext}>
            <View style={S.ctaInner}>
              <Text style={S.ctaTxt}>Continuar</Text>
              <ArrowRight size={20} color={theme.colors.onPrimary} />
            </View>
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
    scroll: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 140, flexGrow: 1 },

    title: { ...theme.typography.h2, textAlign: 'center', color: theme.colors.onSurface, fontFamily: theme.fonts.headline, marginBottom: 8, paddingHorizontal: 10 },
    titleSub: { ...theme.typography.bodySmall, textAlign: 'center', color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.body, marginBottom: 26 },

    benefitsCard: { backgroundColor: theme.colors.surface, borderRadius: 20, padding: 10, borderWidth: 1, borderColor: theme.colors.outlineVariant },
    benefitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 18, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.divider },
    benefitTextLeft: { flex: 1, paddingRight: 16 },
    benefitTitle: { ...theme.typography.bodyLarge, fontWeight: '800', color: theme.colors.onSurface, fontFamily: theme.fonts.headline, marginBottom: 4 },
    benefitSub: { ...theme.typography.bodySmall, color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.body, lineHeight: 18 },
    benefitIconBg: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

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
        <Text style={styles.title}>Las finanzas deberían{'\n'}sentirse así de simples</Text>
        <Text style={styles.titleSub}>Todo lo que necesitas para tomar el control de tu dinero.</Text>

        <View style={styles.benefitsCard}>
          <BenefitRow
            title="Sin complicaciones"
            sub="Hecha para personas, no para contadores."
            icon={<Leaf size={20} color="#FFF" />}
            bg="#8AD6CE" styles={styles} theme={theme}
          />
          <BenefitRow
            title="Escanea un recibo"
            sub="La IA organiza el gasto automáticamente."
            icon={<Camera size={20} color="#FFF" />}
            bg="#F0927B" styles={styles} theme={theme}
          />
          <BenefitRow
            title="Habla con tu dinero"
            sub="Pregunta lo que quieras sobre tus finanzas."
            icon={<MessageSquare size={20} color="#FFF" />}
            bg="#D2A9D1" styles={styles} theme={theme}
          />
          <BenefitRow
            title="Cada peso tiene un lugar"
            sub="Siempre sabrás cuánto puedes gastar."
            icon={<Wallet size={20} color="#FFF" />}
            bg={theme.colors.primary} styles={styles} theme={theme} last
          />
        </View>

        <View style={{ marginTop: 32, alignItems: 'center', paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', gap: 4, marginBottom: 12 }}>
            <Star size={16} color="#FFB800" fill="#FFB800" />
            <Star size={16} color="#FFB800" fill="#FFB800" />
            <Star size={16} color="#FFB800" fill="#FFB800" />
            <Star size={16} color="#FFB800" fill="#FFB800" />
            <Star size={16} color="#FFB800" fill="#FFB800" />
          </View>
          <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, color: theme.colors.onSurfaceVariant, textAlign: 'center', fontStyle: 'italic', lineHeight: 22 }}>
            "Parce, qué aplicación tan sencilla de usar."
          </Text>
          <Text style={{ fontFamily: theme.fonts.headline, fontSize: 13, color: theme.colors.onSurface, marginTop: 12, fontWeight: '700' }}>
            — Stiven Lopera
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity activeOpacity={0.85} style={styles.ctaBtn} onPress={() => togglePlans(true)}>
          <Text style={styles.ctaText}>Empieza gratis por 7 días</Text>
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
        
        <View style={{ backgroundColor: theme.colors.surfaceContainerLow, borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: theme.colors.outlineVariant }}>
           <Text style={{ ...theme.typography.h3, fontFamily: theme.fonts.headline, color: theme.colors.onSurface, marginBottom: 4 }}>7 días gratis</Text>
           <Text style={{ ...theme.typography.bodyMedium, fontFamily: theme.fonts.body, color: theme.colors.onSurfaceVariant }}>No pagas hoy. Te avisaremos antes del primer cobro. Cancela cuando quieras.</Text>
        </View>

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
            : <Text style={styles.ctaText}>Empezar gratis</Text>
          }
        </TouchableOpacity>

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
