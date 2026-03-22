import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, Image, TouchableOpacity, ScrollView, Platform, Dimensions, StyleSheet, Animated, Easing 
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { 
  LayoutDashboard, 
  ReceiptText, 
  Wallet, 
  Grid2X2, 
  Bell, 
  Coffee, 
  Car, 
  ShoppingBasket, 
  Banknote, 
  Utensils, 
  Zap, 
  Theater, 
  PiggyBank,
  X,
  Plus
} from 'lucide-react-native';
import { Screen } from '../src/types';
import { INITIAL_TRANSACTIONS, INITIAL_POCKETS } from '../src/constants';

const { width, height } = Dimensions.get('window');

// --- Theme ---
const theme = {
  colors: {
    background: '#FFF8F4',
    onBackground: '#2B1700',
    primary: '#276959',
    primaryContainer: '#6FAF9D',
    onPrimaryContainer: '#004135',
    surface: '#FFF8F4',
    onSurface: '#2B1700',
    surfaceContainerLow: '#FFF1E6',
    surfaceContainerHigh: '#FFE3C9',
    surfaceContainerHighest: '#FFDDBA',
    onSurfaceVariant: '#3F4945',
    secondary: '#765B00',
    secondaryContainer: '#FECE4B',
    onSecondaryContainer: '#725800',
    tertiary: '#A03E40',
    tertiaryContainer: '#F68080',
    onTertiaryContainer: '#6E191F',
    outlineVariant: '#BFC9C4',
  },
  fonts: {
    headline: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
    body: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  }
};

// --- Animations ---
const AnimatedProgressBar = ({ percent, color, bgColor }: { percent: number; color: string; bgColor: string }) => {
  const animatedWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: percent,
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [percent]);

  return (
    <View style={[styles.progressBarBg, { backgroundColor: bgColor }]}>
      <Animated.View style={[
        styles.progressBarFill, 
        { 
          backgroundColor: color, 
          width: animatedWidth.interpolate({
            inputRange: [0, 100],
            outputRange: ['0%', '100%']
          })
        }
      ]} />
    </View>
  );
};

// --- Components ---

const TopBar = ({ title, userAvatar }: { title: string; userAvatar?: string }) => {
  const insets = useSafeAreaInsets();
  return (
    <BlurView intensity={80} tint="light" style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) + 16 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity 
          activeOpacity={0.8}
          onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          style={styles.avatarContainer}
        >
          <Image 
            source={{ uri: userAvatar || "https://picsum.photos/seed/user/100/100" }} 
            style={styles.avatarImage}
          />
        </TouchableOpacity>
      </View>
      <Text style={styles.topBarTitle}>{title}</Text>
      <TouchableOpacity 
        style={styles.iconButton}
        onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
        activeOpacity={0.7}
      >
        <Bell size={24} color={theme.colors.primary} />
      </TouchableOpacity>
    </BlurView>
  );
};

const BottomNav = ({ activeScreen, setScreen }: { activeScreen: Screen; setScreen: (s: Screen) => void }) => {
  const insets = useSafeAreaInsets();
  const navItems = [
    { id: 'dashboard' as Screen, label: 'Panel', icon: LayoutDashboard },
    { id: 'scanner' as Screen, label: 'Escáner', icon: ReceiptText },
    { id: 'expenses' as Screen, label: 'Gastos', icon: Wallet },
    { id: 'pockets' as Screen, label: 'Bolsillos', icon: Grid2X2 },
  ];

  return (
    <BlurView intensity={90} tint="light" style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
      {navItems.map((item) => {
        const isActive = activeScreen === item.id;
        const Icon = item.icon;
        
        return (
          <TouchableOpacity
            key={item.id}
            activeOpacity={0.7}
            onPress={() => {
              if (!isActive) {
                Haptics.selectionAsync();
                setScreen(item.id);
              }
            }}
            style={[styles.navItem, isActive && styles.navItemActive]}
          >
            <Icon size={24} color={isActive ? theme.colors.onBackground : theme.colors.onSurfaceVariant} strokeWidth={isActive ? 2.5 : 2} />
            <Text style={[styles.navItemText, isActive && styles.navItemTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </BlurView>
  );
};

// --- Icons Mapping ---
const CategoryIcon = ({ iconName, style, color = theme.colors.primary }: { iconName: string; style?: any, color?: string }) => {
  const icons: Record<string, any> = {
    Coffee, Car, ShoppingBasket, Banknote, Utensils, Zap, Theater, PiggyBank
  };
  const Icon = icons[iconName] || Wallet;
  return <View style={style}><Icon color={color} size={24} strokeWidth={2.5} /></View>;
};

// --- Screens ---

const Dashboard = () => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true })
    ]).start();
  }, []);

  return (
    <Animated.ScrollView 
      contentContainerStyle={styles.scrollContent} 
      showsVerticalScrollIndicator={false}
      style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
    >
      <View style={[styles.card, styles.motivationCard]}>
        <View style={{ flex: 1, zIndex: 10 }}>
          <Text style={styles.overline}>Intención Diaria</Text>
          <Text style={styles.motivationQuote}>
            "Pequeñas decisiones crean grandes resultados."
          </Text>
        </View>
        <View style={styles.motivationBgCircle} />
      </View>

      <View style={styles.gridContainer}>
        <View style={styles.overviewCard}>
          <View>
            <Text style={styles.overline}>Total gastado este mes</Text>
            <View style={styles.amountContainer}>
              <Text style={styles.amountText}>$1,245.50</Text>
            </View>
          </View>
          <View style={styles.progressContainer}>
            <View style={{ flex: 1 }}>
              <AnimatedProgressBar percent={65} color={theme.colors.primary} bgColor={theme.colors.surfaceContainerLow} />
            </View>
            <Text style={styles.progressText}>65% usado</Text>
          </View>
        </View>

        <TouchableOpacity 
          activeOpacity={0.9} 
          onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
          style={[styles.card, styles.savingsCard]}
        >
          <View style={{ zIndex: 10 }}>
            <Text style={styles.overlineSavings}>Potencial de Ahorro</Text>
            <Text style={styles.amountTextSavings}>$320.00</Text>
            <View style={styles.savingsButton}>
              <Text style={styles.savingsButtonText}>Mover al Bolsillo</Text>
            </View>
          </View>
          <View style={styles.savingsBgShape} />
        </TouchableOpacity>
      </View>

      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Tus Categorías</Text>
        </View>
        <View style={styles.categoriesCard}>
          {[
            { label: 'Comida y Restaurantes', amount: '$540.00', percent: 45, color: theme.colors.primary },
            { label: 'Transporte', amount: '$210.00', percent: 25, color: theme.colors.primaryContainer },
            { label: 'Entretenimiento', amount: '$315.00', percent: 30, color: '#A03E40' },
          ].map((cat, i) => (
            <View key={i} style={styles.categoryItem}>
              <View style={styles.categoryHeader}>
                <Text style={styles.categoryLabel}>{cat.label}</Text>
                <Text style={styles.categoryLabelBold}>{cat.amount}</Text>
              </View>
              <AnimatedProgressBar percent={cat.percent} color={cat.color} bgColor="#FFFFFF" />
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.sectionContainer, { paddingBottom: 100 }]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Actividad</Text>
          <TouchableOpacity onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
            <Plus size={28} color={theme.colors.onSurfaceVariant} />
          </TouchableOpacity>
        </View>
        <View style={styles.transactionsList}>
          {INITIAL_TRANSACTIONS.slice(0, 3).map((tx) => (
            <TouchableOpacity key={tx.id} activeOpacity={0.8} delayPressIn={100} style={styles.transactionItem}>
              <View style={styles.transactionIconBg}>
                <CategoryIcon iconName={tx.icon} />
              </View>
              <View style={styles.transactionDetails}>
                <Text style={styles.transactionMerchant} numberOfLines={1}>{tx.merchant}</Text>
                <Text style={styles.transactionDate}>{tx.date}</Text>
              </View>
              <Text style={[styles.transactionAmount, { color: tx.amount < 0 ? theme.colors.tertiary : theme.colors.primary }]}>
                {tx.amount < 0 ? '-' : '+'} ${Math.abs(tx.amount).toFixed(2)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Animated.ScrollView>
  );
};

const Scanner = () => {
  const [progress, setProgress] = useState(0);
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Progress counter simulation
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) clearInterval(timer);
        return prev < 100 ? prev + 1 : 100;
      });
    }, 50);

    // Laser Animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        })
      ])
    ).start();

    return () => clearInterval(timer);
  }, []);

  const insets = useSafeAreaInsets();
  
  const scanLineTranslateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 300] // Frame height approximation
  });

  return (
    <View style={styles.scannerContainer}>
      <Image 
        source={{ uri: "https://picsum.photos/seed/receipt/800/1200" }} 
        style={StyleSheet.absoluteFillObject}
        blurRadius={Platform.OS === 'ios' ? 10 : 3}
      />
      <View style={styles.scannerOverlayBg} />

      {/* Target Frame Simulation */}
      <View style={styles.scannerFrameContainer}>
        <View style={styles.scannerFrame}>
          <View style={styles.frameCornerTL} />
          <View style={styles.frameCornerTR} />
          <View style={styles.frameCornerBL} />
          <View style={styles.frameCornerBR} />
          <Animated.View style={[styles.scannerLaser, { transform: [{ translateY: scanLineTranslateY }] }]} />
        </View>
      </View>

      {/* Top Bar Overlay */}
      <View style={[styles.scannerTopBar, { paddingTop: Math.max(insets.top, 16) + 16 }]}>
        <TouchableOpacity onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
          <X size={28} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.scannerBadge}>
          <Text style={styles.scannerBadgeText}>IA ACTIVA</Text>
        </View>
      </View>

      {/* Progress Overlay */}
      <View style={[styles.scannerProgressContainer, { paddingBottom: Math.max(insets.bottom, 24) + 100 }]}>
        <BlurView intensity={70} tint="light" style={styles.scannerProgressCard}>
          <View style={styles.scannerProgressHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <View style={styles.scannerIconBg}>
                <ReceiptText size={20} color={theme.colors.onPrimaryContainer} />
              </View>
              <View>
                <Text style={styles.scannerActionTitle}>Extrayendo Datos...</Text>
                <Text style={styles.scannerActionSubtitle}>INTELIGENCIA ARTIFICIAL EN PROGRESO</Text>
              </View>
            </View>
          </View>
          <AnimatedProgressBar percent={progress} color={theme.colors.primary} bgColor="rgba(255,255,255,0.5)" />
        </BlurView>
      </View>
    </View>
  );
};

const Expenses = () => {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.ScrollView 
      contentContainerStyle={styles.scrollContent} 
      showsVerticalScrollIndicator={false}
      style={{ opacity: fadeAnim }}
    >
      <View style={[styles.card, styles.expensesOverview]}>
        <Text style={styles.overline}>Gasto Total Octubre</Text>
        <View style={styles.amountContainer}>
          <Text style={styles.amountTextLarge}>$1,245.50</Text>
        </View>
        <View style={styles.progressContainer}>
          <View style={{ flex: 1 }}>
            <AnimatedProgressBar percent={65} color={theme.colors.primary} bgColor={theme.colors.surfaceContainerHighest} />
          </View>
          <Text style={styles.progressText}>65% usado</Text>
        </View>
      </View>

      <View style={[styles.sectionContainer, { marginTop: 32 }]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Últimos Movimientos</Text>
        </View>
        <View style={[styles.transactionsList, { paddingBottom: 100 }]}>
          {INITIAL_TRANSACTIONS.map((tx) => (
            <TouchableOpacity 
              activeOpacity={0.7} 
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
              key={tx.id} 
              style={styles.transactionItemLarge}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 }}>
                <View style={[styles.transactionIconBgLarge, { backgroundColor: tx.amount > 0 ? theme.colors.primaryContainer : theme.colors.surfaceContainerLow }]}>
                  <CategoryIcon iconName={tx.icon} color={tx.amount > 0 ? theme.colors.onPrimaryContainer : theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.transactionMerchantLarge} numberOfLines={1}>{tx.merchant}</Text>
                  <Text style={styles.transactionDateLarge}>{tx.date}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
                <Text style={[styles.transactionAmountLarge, { color: tx.amount < 0 ? theme.colors.onSurface : theme.colors.primary }]}>
                  {tx.amount < 0 ? '-' : '+'} ${Math.abs(tx.amount).toFixed(2)}
                </Text>
                <Text style={styles.transactionCategory}>{tx.category}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Animated.ScrollView>
  );
};

const Pockets = () => {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.ScrollView 
      contentContainerStyle={[styles.scrollContent, { paddingTop: 16 }]} 
      showsVerticalScrollIndicator={false}
      style={{ opacity: fadeAnim }}
    >
      <View style={styles.headerBlock}>
        <Text style={styles.headerTitle}>Tus Bolsillos</Text>
        <Text style={styles.headerSubtitle}>Divide y vencerás sobre tus gastos.</Text>
      </View>

      <View style={[styles.pocketsList, { paddingBottom: 100 }]}>
        {INITIAL_POCKETS.map((pocket) => {
          const percent = Math.min((pocket.spent / pocket.budget) * 100, 100);
          const isOver = pocket.spent > pocket.budget;
          
          return (
            <TouchableOpacity 
              activeOpacity={0.9}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
              key={pocket.id} 
              style={styles.pocketCard}
            >
              <View style={styles.pocketHeader}>
                <View style={styles.pocketIconBg}>
                  <CategoryIcon iconName={pocket.icon} />
                </View>
                <View style={[styles.pocketBadge, { backgroundColor: isOver ? theme.colors.tertiaryContainer : theme.colors.primaryContainer }]}>
                  <Text style={[styles.pocketBadgeText, { color: isOver ? theme.colors.onTertiaryContainer : theme.colors.onPrimaryContainer }]}>
                    {isOver ? `ALERTA: SOBREGIRO` : `ACTIVO`}
                  </Text>
                </View>
              </View>
              <Text style={styles.pocketCategory}>{pocket.category}</Text>
              <Text style={styles.pocketName}>{pocket.name}</Text>
              
              <View style={styles.pocketProgressBlock}>
                <View style={styles.pocketProgressInfo}>
                  <Text style={styles.pocketAmountText}>
                    ${pocket.spent} <Text style={{ color: theme.colors.onSurfaceVariant, fontWeight: '400' }}>de ${pocket.budget}</Text>
                  </Text>
                  <Text style={[styles.pocketPercentText, { color: isOver ? theme.colors.tertiary : theme.colors.primary }]}>
                    {Math.round(percent)}%
                  </Text>
                </View>
                <AnimatedProgressBar percent={percent} color={isOver ? theme.colors.tertiary : theme.colors.primary} bgColor={theme.colors.surfaceContainerHighest} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </Animated.ScrollView>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
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
  topBarTitle: { fontFamily: theme.fonts.headline, fontWeight: '800', color: theme.colors.primary, fontSize: 22, letterSpacing: -0.5 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: 'rgba(39, 105, 89, 0.08)' },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    zIndex: 50,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255, 248, 244, 0.8)',
  },
  navItem: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 30 },
  navItemActive: { backgroundColor: theme.colors.surfaceContainerHighest, transform: [{ scale: 1.05 }] },
  navItemText: { fontFamily: theme.fonts.body, fontWeight: '600', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4, color: theme.colors.onSurfaceVariant },
  navItemTextActive: { color: theme.colors.onBackground, fontWeight: '800' },
  scrollContent: { paddingTop: 120, paddingHorizontal: 20, paddingBottom: 150 },
  card: { borderRadius: 24, overflow: 'hidden' },
  motivationCard: { backgroundColor: theme.colors.primaryContainer, padding: 24, flexDirection: 'row', alignItems: 'center', marginTop: 10, elevation: 8, shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.2, shadowRadius: 16 },
  motivationBgCircle: { position: 'absolute', top: -30, right: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.15)' },
  overline: { color: theme.colors.onPrimaryContainer, fontFamily: theme.fonts.body, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 11, marginBottom: 8, opacity: 0.8 },
  motivationQuote: { fontSize: 22, fontFamily: theme.fonts.headline, fontWeight: '800', color: theme.colors.onPrimaryContainer, fontStyle: 'italic', lineHeight: 30 },
  gridContainer: { marginTop: 20, gap: 16 },
  overviewCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, minHeight: 200, justifyContent: 'space-between', elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 20 },
  amountContainer: { flexDirection: 'row', alignItems: 'baseline', marginTop: 12 },
  amountText: { fontSize: 44, fontFamily: theme.fonts.headline, fontWeight: '800', color: theme.colors.onSurface, letterSpacing: -1.5 },
  progressContainer: { marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 16 },
  progressBarBg: { height: 12, borderRadius: 6, overflow: 'hidden', width: '100%' },
  progressBarFill: { height: '100%', borderRadius: 6 },
  progressText: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
  savingsCard: { backgroundColor: theme.colors.secondaryContainer, padding: 24, minHeight: 180, elevation: 6, shadowColor: theme.colors.secondary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12 },
  savingsBgShape: { position: 'absolute', bottom: -50, right: -30, width: 150, height: 150, backgroundColor: 'rgba(255,255,255,0.2)', transform: [{ rotate: '45deg' }], borderRadius: 40 },
  overlineSavings: { color: theme.colors.onSecondaryContainer, fontFamily: theme.fonts.body, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, opacity: 0.8 },
  amountTextSavings: { marginTop: 16, fontSize: 38, fontFamily: theme.fonts.headline, fontWeight: '800', color: theme.colors.onSecondaryContainer, letterSpacing: -1 },
  savingsButton: { marginTop: 24, backgroundColor: theme.colors.onSecondaryContainer, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 30, alignSelf: 'flex-start' },
  savingsButtonText: { color: '#FFFFFF', fontFamily: theme.fonts.body, fontSize: 14, fontWeight: '800' },
  sectionContainer: { marginTop: 32 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  sectionTitle: { fontSize: 22, fontFamily: theme.fonts.headline, fontWeight: '800', color: theme.colors.onSurface },
  categoriesCard: { backgroundColor: theme.colors.surfaceContainerLow, borderRadius: 24, padding: 24, marginTop: 16, gap: 18 },
  categoryItem: { marginBottom: 4 },
  categoryHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' },
  categoryLabel: { fontSize: 15, fontWeight: '600', color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.body },
  categoryLabelBold: { fontSize: 16, fontWeight: '800', color: theme.colors.onSurface, fontFamily: theme.fonts.headline },
  transactionsList: { marginTop: 16, gap: 12 },
  transactionItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 20, backgroundColor: '#FFFFFF', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, marginHorizontal: 2 },
  transactionIconBg: { width: 48, height: 48, borderRadius: 18, backgroundColor: theme.colors.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' },
  transactionDetails: { flex: 1, marginLeft: 16 },
  transactionMerchant: { fontFamily: theme.fonts.headline, fontWeight: '800', color: theme.colors.onSurface, fontSize: 16 },
  transactionDate: { fontSize: 12, color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.body, marginTop: 4, fontWeight: '500' },
  transactionAmount: { fontFamily: theme.fonts.headline, fontWeight: '800', fontSize: 18 },
  
  // Scanner Styles
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerOverlayBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  scannerTopBar: { position: 'absolute', top: 0, width: '100%', zIndex: 50, paddingHorizontal: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scannerBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  scannerBadgeText: { color: '#FFF', fontFamily: theme.fonts.body, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  scannerFrameContainer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  scannerFrame: { width: 280, height: 350, position: 'relative' },
  frameCornerTL: { position: 'absolute', top: 0, left: 0, width: 40, height: 40, borderColor: '#FFF', borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
  frameCornerTR: { position: 'absolute', top: 0, right: 0, width: 40, height: 40, borderColor: '#FFF', borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
  frameCornerBL: { position: 'absolute', bottom: 0, left: 0, width: 40, height: 40, borderColor: '#FFF', borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
  frameCornerBR: { position: 'absolute', bottom: 0, right: 0, width: 40, height: 40, borderColor: '#FFF', borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },
  scannerLaser: { position: 'absolute', width: '100%', height: 2, backgroundColor: '#00FF41', shadowColor: '#00FF41', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 10, elevation: 10 },
  scannerProgressContainer: { marginTop: 'auto', zIndex: 10, paddingHorizontal: 24 },
  scannerProgressCard: { padding: 24, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  scannerProgressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  scannerIconBg: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  scannerActionTitle: { fontFamily: theme.fonts.headline, fontWeight: '800', color: theme.colors.onSurface, fontSize: 18 },
  scannerActionSubtitle: { fontSize: 10, color: theme.colors.onSurfaceVariant, fontFamily: theme.fonts.body, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4, fontWeight: '600' },
  
  // Expenses & Pockets specific
  expensesOverview: { backgroundColor: theme.colors.surfaceContainerLow, padding: 24, marginTop: 10, elevation: 0, shadowOpacity: 0 },
  amountTextLarge: { fontSize: 48, fontFamily: theme.fonts.headline, fontWeight: '800', color: theme.colors.onSurface, letterSpacing: -1.5, marginTop: 12 },
  transactionItemLarge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, backgroundColor: '#FFFFFF', borderRadius: 24, elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.04, shadowRadius: 14, marginBottom: 16, marginHorizontal: 2 },
  transactionIconBgLarge: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  transactionMerchantLarge: { fontFamily: theme.fonts.headline, fontWeight: '800', color: theme.colors.onSurface, fontSize: 17 },
  transactionDateLarge: { fontSize: 13, color: theme.colors.onSurfaceVariant, marginTop: 4, fontWeight: '500' },
  transactionAmountLarge: { fontFamily: theme.fonts.headline, fontWeight: '800', fontSize: 18, marginBottom: 4 },
  transactionCategory: { fontSize: 10, fontFamily: theme.fonts.body, color: theme.colors.onSurfaceVariant, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  headerBlock: { marginBottom: 32, marginTop: 10, paddingHorizontal: 4 },
  headerTitle: { fontFamily: theme.fonts.headline, fontWeight: '800', fontSize: 36, color: theme.colors.onSurface, letterSpacing: -1, marginBottom: 8 },
  headerSubtitle: { fontFamily: theme.fonts.body, color: theme.colors.onSurfaceVariant, fontSize: 16, fontWeight: '500' },
  pocketsList: { gap: 20 },
  pocketCard: { backgroundColor: theme.colors.surfaceContainerLow, padding: 24, borderRadius: 24, marginBottom: 4, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10 },
  pocketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  pocketIconBg: { backgroundColor: theme.colors.surfaceContainerHighest, padding: 14, borderRadius: 16 },
  pocketBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  pocketBadgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  pocketCategory: { fontFamily: theme.fonts.body, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, color: theme.colors.onSurfaceVariant, opacity: 0.8, marginBottom: 6 },
  pocketName: { fontFamily: theme.fonts.headline, fontWeight: '800', fontSize: 26, color: theme.colors.onSurface, marginBottom: 24 },
  pocketProgressBlock: { paddingTop: 4 },
  pocketProgressInfo: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end', justifyContent: 'space-between' },
  pocketAmountText: { fontSize: 16, fontWeight: '800', color: theme.colors.onSurface },
  pocketPercentText: { fontSize: 16, fontWeight: '800' }
});

// --- Main App ---

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');

  const renderScreen = () => {
    switch (currentScreen) {
      case 'dashboard': return <Dashboard />;
      case 'scanner': return <Scanner />;
      case 'expenses': return <Expenses />;
      case 'pockets': return <Pockets />;
      default: return <Dashboard />;
    }
  };

  return (
    <View style={styles.container}>
      {currentScreen !== 'scanner' && (
        <TopBar 
          title={currentScreen === 'dashboard' ? 'Organic Ledger' : currentScreen === 'expenses' ? 'Tus Gastos' : 'Bolsillos'} 
          userAvatar="https://picsum.photos/seed/organic/100/100"
        />
      )}
      
      <View style={{ flex: 1, backgroundColor: currentScreen === 'scanner' ? '#000' : theme.colors.background }}>
        {renderScreen()}
      </View>

      <BottomNav activeScreen={currentScreen} setScreen={setCurrentScreen} />
    </View>
  );
}
