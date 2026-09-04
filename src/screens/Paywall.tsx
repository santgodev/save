// =====================================================================
// Paywall.tsx — Pantalla de suscripción de Save
// Flujo narrativo de conversión:
// Paso 1: Gancho -- el producto en acción (chat) + prueba social, la
//         primera impresión más memorable que una lista de features.
// Paso 2: Beneficios + Confianza (timeline de la prueba) + Precios,
//         todo en una sola pantalla con scroll -- sin bottom sheet
//         intermedio, al estilo de los paywalls top (Monarch, Fixtured,
//         IFTTT): mientras menos toques entre "quiero esto" y "comprar",
//         mejor convierte.
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
  ArrowRight, Brain, ShieldCheck, Users, Heart, Camera, Target, Lock, Leaf, MessageSquare, Wallet, Star, Quote, Check
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeContext';
import { useSubscription } from '../lib/SubscriptionContext';
import { PRODUCT_IDS, TRIAL_DAYS, FALLBACK_PRICING } from '../lib/purchases';
import { notify } from '../lib/notify';

const { height } = Dimensions.get('window');

interface PaywallProps {
  onSubscribed: (plan: 'annual' | 'monthly') => void;
  onLogout?: () => void;
  onDevSkip?: () => void;
  onClose?: () => void;
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
// PIEZAS COMPARTIDAS ENTRE LOS DOS PASOS DEL PAYWALL
// Mismo margen horizontal, mismo tamaño de título y misma forma de botón
// en las dos pantallas -- se definen una sola vez aquí para que no puedan
// volver a desalinearse entre sí.
// =====================================================================
const PAYWALL_HPADDING = 24;

const PaywallHeadline = ({ eyebrow, children, theme }: { eyebrow?: string; children: React.ReactNode; theme: any }) => (
  <View style={{ alignItems: 'center' }}>
    {eyebrow ? (
      <Text style={{ fontFamily: theme.fonts.headline, fontSize: 10, color: theme.colors.primary, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12, textAlign: 'center' }}>
        {eyebrow}
      </Text>
    ) : null}
    <Text style={{ ...theme.typography.displaySmall, fontFamily: theme.fonts.headline, textAlign: 'center', color: theme.colors.onSurface, paddingHorizontal: 10 }}>
      {children}
    </Text>
  </View>
);

const PaywallCTA = ({ label, onPress, icon, disabled, theme }: { label: string; onPress: () => void; icon?: React.ReactNode; disabled?: boolean; theme: any }) => (
  <TouchableOpacity
    activeOpacity={0.85}
    onPress={onPress}
    disabled={disabled}
    style={{ backgroundColor: theme.colors.primary, borderRadius: 20, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: disabled ? 0.7 : 1, ...theme.shadows.md }}
  >
    {disabled
      ? <ActivityIndicator color={theme.colors.onPrimary} />
      : <>
          <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.onPrimary, fontFamily: theme.fonts.headline }}>{label}</Text>
          {icon}
        </>
    }
  </TouchableOpacity>
);

const PaywallFooter = ({ children, theme, insets }: { children: React.ReactNode; theme: any; insets: any }) => (
  <View style={{ backgroundColor: theme.colors.background, paddingHorizontal: PAYWALL_HPADDING, paddingTop: 14, paddingBottom: Math.max(insets.bottom, 24), borderTopWidth: 1, borderTopColor: theme.colors.divider }}>
    {children}
  </View>
);

const Testimonial = ({ theme }: { theme: any }) => (
  <View style={{
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    overflow: 'hidden',
    ...theme.shadows.sm,
  }}>
    <View style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: theme.colors.divider,
      backgroundColor: theme.colors.surfaceContainerLow,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Quote size={13} color={theme.colors.onPrimary} fill={theme.colors.onPrimary} />
        </View>
        <View style={{ flexDirection: 'row', gap: 2 }}>
          {[0, 1, 2, 3, 4].map(i => <Star key={i} size={13} color="#FFB800" fill="#FFB800" />)}
        </View>
      </View>
      <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.body, fontWeight: '700' }}>5.0</Text>
    </View>

    <View style={{ padding: 16 }}>
      <Text style={{ fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.onSurface, lineHeight: 22, marginBottom: 16, fontWeight: '500' }}>
        &quot;Parce, qué aplicación tan sencilla de usar.&quot;
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 12, fontFamily: theme.fonts.headline }}>SL</Text>
        </View>
        <Text style={{ fontFamily: theme.fonts.headline, fontSize: 13, color: theme.colors.onSurface, fontWeight: '700' }}>
          Stiven Lopera
        </Text>
      </View>
    </View>
  </View>
);

// =====================================================================
// COMPONENTE PRINCIPAL
// =====================================================================
export const Paywall = ({ onSubscribed, onLogout, onDevSkip, onClose }: PaywallProps) => {
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
        {onDevSkip && !onClose && (
          <TouchableOpacity onPress={onDevSkip} style={{ position: 'absolute', top: Math.max(insets.top, 16) + 16, right: 20, zIndex: 20, opacity: 0.4 }}>
            <Text style={{ fontSize: 10, fontFamily: theme.fonts.headline, fontWeight: '800', color: theme.colors.warning }}>SALTAR DEV</Text>
          </TouchableOpacity>
        )}
        {onClose && (
          <TouchableOpacity onPress={onClose} style={{ position: 'absolute', top: Math.max(insets.top, 16) + 16, right: 20, zIndex: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surfaceContainerHighest, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 16, fontFamily: theme.fonts.headline, fontWeight: '800', color: theme.colors.onSurfaceVariant }}>✕</Text>
          </TouchableOpacity>
        )}
        <SaveProLogo theme={theme} />
      </View>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {step === 1 ? (
          <HookStep onNext={goToStep2} onDevSkip={onDevSkip} />
        ) : (
          <BenefitsAndPricingStep onSubscribed={onSubscribed} onLogout={onLogout} onDevSkip={onDevSkip} />
        )}
      </Animated.View>
    </View>
  );
};

// =====================================================================
// PASO 1: Gancho — el producto en acción + prueba social. Primera
// impresión más memorable que abrir con una lista de features.
// =====================================================================
const ChatMockup = ({ theme }: any) => (
  <View style={{
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    overflow: 'hidden',
    ...theme.shadows.sm,
  }}>
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: theme.colors.divider,
      backgroundColor: theme.colors.surfaceContainerLow,
    }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
        <MessageSquare size={13} color={theme.colors.onPrimary} />
      </View>
      <Text style={{ fontFamily: theme.fonts.headline, fontSize: 13, color: theme.colors.onSurface, fontWeight: '800' }}>Save IA</Text>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#4CAF50', marginLeft: 2 }} />
      <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.body }}>en línea</Text>
    </View>

    <View style={{ padding: 16, gap: 10 }}>
      <View style={{ alignSelf: 'flex-end', backgroundColor: theme.colors.primary, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18, borderBottomRightRadius: 4, maxWidth: '85%' }}>
        <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.onPrimary, fontWeight: '500' }}>¿Cuánto puedo gastar esta semana?</Text>
      </View>
      <View style={{ alignSelf: 'flex-start', backgroundColor: theme.colors.surfaceContainerLow, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18, borderBottomLeftRadius: 4, maxWidth: '90%' }}>
        <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.onSurface, lineHeight: 18 }}>
          Puedes gastar hasta <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>$145.000</Text> y seguir cumpliendo tu meta de ahorro.
        </Text>
      </View>
    </View>
  </View>
);

const TrustBadge = ({ icon, label, theme }: any) => (
  <View style={{ alignItems: 'center', flex: 1, gap: 6, paddingHorizontal: 4 }}>
    <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: theme.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
      {icon}
    </View>
    <Text style={{ fontSize: 10.5, fontWeight: '700', color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.headline, textAlign: 'center' }}>{label}</Text>
  </View>
);

const HookStep = ({
  onNext, onDevSkip,
}: { onNext: () => void; onDevSkip?: () => void }) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const S = StyleSheet.create({
    scroll: { paddingHorizontal: PAYWALL_HPADDING, paddingTop: 10, paddingBottom: 24, flexGrow: 1 },
    topSection: { alignItems: 'center', marginTop: 20, marginBottom: 36 },
    midSection: { gap: 20 },
  });

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={S.scroll} showsVerticalScrollIndicator={false} bounces={false}>
        <View style={S.topSection}>
          <PaywallHeadline eyebrow="MENOS ESTRÉS • MÁS CLARIDAD • MÁS AHORRO" theme={theme}>
            La forma más simple de organizar tu dinero.
          </PaywallHeadline>
        </View>

        <View style={S.midSection}>
          <ChatMockup theme={theme} />
          <Testimonial theme={theme} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <TrustBadge icon={<Lock size={16} color={theme.colors.primary} />} label="Pago seguro" theme={theme} />
            <TrustBadge icon={<ShieldCheck size={16} color={theme.colors.primary} />} label="Cancela cuando quieras" theme={theme} />
            <TrustBadge icon={<Heart size={16} color={theme.colors.primary} />} label="Hecho en Colombia" theme={theme} />
          </View>
        </View>
      </ScrollView>

      <PaywallFooter theme={theme} insets={insets}>
        <PaywallCTA
          label="Continuar"
          onPress={onNext}
          icon={<ArrowRight size={20} color={theme.colors.onPrimary} />}
          theme={theme}
        />
      </PaywallFooter>
    </View>
  );
};

// =====================================================================
// PASO 2: Beneficios + Confianza + Precios -- todo en un scroll,
// terminando en el botón real de compra. Sin bottom sheet intermedio.
// =====================================================================
const BenefitsAndPricingStep = ({ onSubscribed, onLogout, onDevSkip, onClose }: PaywallProps) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const { offering, purchasePackage, restorePurchases, isSubscribed } = useSubscription();
  const [selected, setSelected] = useState<'annual' | 'monthly'>('annual');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const isInitialMount = React.useRef(true);
  const hasNotified = React.useRef(false);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (isSubscribed && !hasNotified.current) {
      hasNotified.current = true;
      onSubscribed(selected);
    }
  }, [isSubscribed]);

  const monthlyPkg = offering?.availablePackages.find(p => p.product.identifier === PRODUCT_IDS.monthly);
  const annualPkg  = offering?.availablePackages.find(p => p.product.identifier === PRODUCT_IDS.annual);

  const monthlyPrice          = monthlyPkg?.product.priceString || formatCOP(FALLBACK_PRICING.monthly);
  const annualPrice           = annualPkg?.product.priceString  || formatCOP(FALLBACK_PRICING.annual);
  const annualMonthlyEquivalent = formatCOP(
    annualPkg ? Math.round(annualPkg.product.price / 12) : Math.round(FALLBACK_PRICING.annual / 12)
  );

  const handlePurchase = async () => {
    const pkg = selected === 'annual' ? annualPkg : monthlyPkg;
    if (!pkg) { notify.error('La suscripción todavía no está configurada.'); return; }
    setIsPurchasing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await purchasePackage(pkg);
    setIsPurchasing(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSubscribed(selected);
    } else if (result.error) {
      notify.error(result.error);
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scroll: { paddingHorizontal: PAYWALL_HPADDING, paddingTop: 8, paddingBottom: 24, flexGrow: 1 },


    benefitsCard: { backgroundColor: theme.colors.surface, borderRadius: 20, padding: 8, borderWidth: 1, borderColor: theme.colors.outlineVariant, marginBottom: 16, marginTop: 20 },
    benefitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.divider },
    benefitTextLeft: { flex: 1, paddingRight: 16 },
    benefitTitle: { ...theme.typography.bodyMedium, fontWeight: '800', color: theme.colors.onSurface, fontFamily: theme.fonts.headline, marginBottom: 3 },
    benefitSub: { ...theme.typography.bodySmall, fontSize: 12.5, color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.body, lineHeight: 16 },
    benefitIconBg: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },

    planCard: { borderRadius: theme.radius.lg, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    planLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    checkDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    planNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    planName: { ...theme.typography.bodyLarge, fontWeight: '800', color: theme.colors.onSurface, fontFamily: theme.fonts.headline },
    badge: { backgroundColor: '#F0927B', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
    badgeText: { ...theme.typography.label, color: '#FFF', fontFamily: theme.fonts.headline },
    planDesc: { ...theme.typography.bodyMedium, color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.body, marginBottom: 2 },
    planRight: { alignItems: 'flex-end' },
    planPrice: { ...theme.typography.title, fontWeight: '800', color: theme.colors.onSurface, fontFamily: theme.fonts.headline },
    planPriceSub: { ...theme.typography.bodySmall, color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.body },

    bottomLinks: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 12 },
    link: { ...theme.typography.bodySmall, color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.body, textDecorationLine: 'underline' },
    renewalNote: { ...theme.typography.label, textTransform: 'none', letterSpacing: 0, fontSize: 10, lineHeight: 14, color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.body, textAlign: 'center', marginTop: 12, opacity: 0.55 },
  });

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} bounces={false}>
      <View style={{ gap: 24 }}>
        <View>
          <PaywallHeadline theme={theme}>
            Todo lo que necesitas para ahorrar
          </PaywallHeadline>

          <View style={styles.benefitsCard}>
            <BenefitRow
              title="Sin complicaciones"
              sub="Hecha para personas, no para contadores."
              icon={<Leaf size={18} color="#FFF" />}
              bg="#8AD6CE" styles={styles} theme={theme}
            />
            <BenefitRow
              title="Escanea un recibo"
              sub="La IA organiza el gasto automáticamente."
              icon={<Camera size={18} color="#FFF" />}
              bg="#F0927B" styles={styles} theme={theme}
            />
            <BenefitRow
              title="Habla con tu dinero"
              sub="Pregunta lo que quieras sobre tus finanzas."
              icon={<MessageSquare size={18} color="#FFF" />}
              bg="#D2A9D1" styles={styles} theme={theme}
            />
            <BenefitRow
              title="Tus bolsillos"
              sub="Organiza y controla tus gastos fácilmente."
              icon={<Wallet size={18} color="#FFF" />}
              bg={theme.colors.primary} styles={styles} theme={theme} last
            />
          </View>
        </View>

        <View>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => { Haptics.selectionAsync(); setSelected('annual'); }}
          style={[styles.planCard, selected === 'annual' ? {
            // SELECTED: relleno suave + sombra coloreada, cero bordes -- mismo
            // lenguaje que la selección de bolsillos en el onboarding.
            backgroundColor: theme.isDark ? theme.colors.primary + '28' : theme.colors.primary + '1A',
            shadowColor: theme.colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.22,
            shadowRadius: 14,
            elevation: 5,
          } : {
            backgroundColor: theme.colors.surfaceContainerLow,
            shadowOpacity: 0,
            elevation: 0,
          }]}
        >
          <View style={styles.planLeft}>
            <View>
              <View style={styles.planNameRow}>
                <Text style={styles.planName}>Anual</Text>
                <View style={styles.badge}><Text style={styles.badgeText}>Ahorras 44%</Text></View>
              </View>
              <Text style={styles.planDesc}>Pagas 1 vez al año</Text>
            </View>
          </View>
          <View style={styles.planRight}>
            <Text style={[styles.planPrice, { color: selected === 'annual' ? theme.colors.primary : theme.colors.onSurface }]}>{annualPrice}</Text>
            <Text style={styles.planPriceSub}>al año</Text>
            <Text style={[styles.planPriceSub, { fontSize: 11, marginTop: 4, fontWeight: '700' }]}>{annualMonthlyEquivalent} al mes</Text>
          </View>
          {selected === 'annual'
            ? <View style={[styles.checkDot, { backgroundColor: theme.colors.primary, marginLeft: 10 }]}><Check size={12} color="#FFF" strokeWidth={3} /></View>
            : <View style={[styles.checkDot, { backgroundColor: theme.colors.surfaceContainerHighest, marginLeft: 10 }]} />}
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => { Haptics.selectionAsync(); setSelected('monthly'); }}
          style={[styles.planCard, selected === 'monthly' ? {
            backgroundColor: theme.isDark ? theme.colors.primary + '28' : theme.colors.primary + '1A',
            shadowColor: theme.colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.22,
            shadowRadius: 14,
            elevation: 5,
          } : {
            backgroundColor: theme.colors.surfaceContainerLow,
            shadowOpacity: 0,
            elevation: 0,
          }]}
        >
          <View style={styles.planLeft}>
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
          {selected === 'monthly'
            ? <View style={[styles.checkDot, { backgroundColor: theme.colors.primary, marginLeft: 10 }]}><Check size={12} color="#FFF" strokeWidth={3} /></View>
            : <View style={[styles.checkDot, { backgroundColor: theme.colors.surfaceContainerHighest, marginLeft: 10 }]} />}
        </TouchableOpacity>
        </View>
      </View>
      </ScrollView>

      <PaywallFooter theme={theme} insets={insets}>
        <PaywallCTA label="Empezar gratis" onPress={handlePurchase} disabled={isPurchasing} theme={theme} />
        <Text style={styles.renewalNote}>
          Prueba gratis de {TRIAL_DAYS} días. Después, el plan {selected === 'annual' ? 'anual' : 'mensual'} se renueva automáticamente y se cobra a tu cuenta de Apple, a menos que canceles al menos 24 horas antes. Administra o cancela cuando quieras desde Ajustes de tu cuenta de Apple.
        </Text>
        <View style={styles.bottomLinks}>
          <TouchableOpacity onPress={() => Linking.openURL('https://eveenia.com/es/save/terms')}>
            <Text style={styles.link}>Términos</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL('https://eveenia.com/es/save/privacy')}>
            <Text style={styles.link}>Privacidad</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={async () => {
            const result = await restorePurchases();
            if (result.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onSubscribed(selected);
            } else if (result.error) {
              notify.error(result.error);
            } else {
              notify.error('No se encontró una suscripción activa.');
            }
          }}>
            <Text style={styles.link}>Restaurar compra</Text>
          </TouchableOpacity>
        </View>
      </PaywallFooter>
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
