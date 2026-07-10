import { Dimensions, Platform } from 'react-native';

const { width } = Dimensions.get('window');
const scale = width / 390;

export const normalize = (size: number) => {
  return Math.round(size * scale);
};

// ==========================================
// 1. TOKENS: Core Values (Color, Spacing, Typography)
// ==========================================

const coreColors = {
  sage: {
    base: '#47ADA2',
    light: '#DDF5F2',
    dark: '#13302D',
  },
  neutral: {
    900: '#1A1A1A',
    800: '#2D3436',
    700: '#4A5557',
    500: '#70918E',
    300: '#E2EAE8',
    100: '#F5F9F8',
    50: '#F7F7F2',
    white: '#FFFFFF',
  },
  // WCAG AA Compliant Semantic Base Colors
  semantics: {
    success: '#2E7D32',
    successBackground: '#E8F5E9',
    error: '#D32F2F',
    errorBackground: '#FFEBEE',
    warning: '#ED6C02',
    warningBackground: '#FFF3E0',
    info: '#0288D1',
    infoBackground: '#E1F5FE',
  }
};

const lightModeColors = {
  // Core
  background: coreColors.neutral[50], 
  onBackground: coreColors.neutral[800], 
  primary: coreColors.sage.base, 
  onPrimary: coreColors.neutral.white,
  primaryContainer: coreColors.sage.light, 
  onPrimaryContainer: coreColors.sage.dark,
  
  // Surfaces
  surface: coreColors.neutral.white,
  onSurface: coreColors.neutral[800], 
  surfaceContainerLow: coreColors.neutral[100], 
  surfaceContainerHigh: '#EFF6F5', 
  surfaceContainerHighest: '#E6EFEF', 
  onSurfaceVariant: coreColors.neutral[500], 
  
  // Semantic States (PRO Level - WCAG Accessible)
  success: coreColors.semantics.success,
  onSuccess: coreColors.neutral.white,
  successContainer: coreColors.semantics.successBackground,
  onSuccessContainer: '#1B5E20',
  
  error: coreColors.semantics.error,
  onError: coreColors.neutral.white,
  errorContainer: coreColors.semantics.errorBackground,
  onErrorContainer: '#B71C1C',
  
  warning: coreColors.semantics.warning,
  onWarning: coreColors.neutral.white,
  warningContainer: coreColors.semantics.warningBackground,
  onWarningContainer: '#E65100',
  
  info: coreColors.semantics.info,
  onInfo: coreColors.neutral.white,
  infoContainer: coreColors.semantics.infoBackground,
  onInfoContainer: '#01579B',

  // Borders & Dividers
  outlineVariant: coreColors.neutral[300], 
  divider: 'rgba(71, 173, 162, 0.1)', 

  // Accents / Glass
  premiumShadow: coreColors.sage.base,
  glassWhite: 'rgba(255, 255, 255, 0.75)', 
  glassDark: 'rgba(19, 48, 45, 0.1)', 
  
  // Scanner (fondo oscuro premium — intencional, igual en light y dark)
  scannerBackground: '#0A1A18',
  // Gradients (RULE: Only for Main CTAs or Success states. Never for text or basic list backgrounds)
  brandGradient: ['#8AD6CE', '#B9E2A2', '#D2A9D1'], 
  warmGradient: [coreColors.neutral[50], coreColors.neutral[100]],
};

const darkModeColors = {
  // Core (Sleek Pitch Black & Pure White)
  background: '#09090B', 
  onBackground: '#FFFFFF', 
  primary: '#B9E2A2', // Vibrant fresh green (acting as the "yellow" from inspiration)
  onPrimary: '#09090B', // Dark text on primary button for maximum pop
  primaryContainer: '#1A241C', // Subtle dark green tint for containers
  onPrimaryContainer: '#B9E2A2', 
  
  // Surfaces (Deep greys, highly contrasted with background)
  surface: '#121214',
  onSurface: '#FFFFFF', 
  surfaceContainerLow: '#18181B', 
  surfaceContainerHigh: '#27272A', 
  surfaceContainerHighest: '#3F3F46', 
  onSurfaceVariant: '#A1A1AA', // Crisp cool-grey for secondary text
  
  // Semantic States
  success: '#4ADE80',
  onSuccess: '#064E3B',
  successContainer: '#064E3B',
  onSuccessContainer: '#D1FAE5',
  
  error: '#F87171',
  onError: '#450A0A',
  errorContainer: '#450A0A',
  onErrorContainer: '#FEE2E2',
  
  warning: '#FBBF24',
  onWarning: '#451A03',
  warningContainer: '#451A03',
  onWarningContainer: '#FEF3C7',
  
  info: '#38BDF8',
  onInfo: '#082F49',
  infoContainer: '#082F49',
  onInfoContainer: '#E0F2FE',

  // Borders & Dividers
  outlineVariant: '#27272A', // Very subtle border line
  divider: 'rgba(255, 255, 255, 0.05)', 

  // Accents / Glass
  premiumShadow: '#000000',
  glassWhite: 'rgba(18, 18, 20, 0.85)', // Dark glass for bottom nav
  glassDark: 'rgba(0, 0, 0, 0.5)', 
  
  // Scanner (fondo oscuro premium — intencional, igual en light y dark)
  scannerBackground: '#0A1A18',
  // Gradients
  brandGradient: ['#B9E2A2', '#8AD6CE'], // Fresh green to teal gradient for premium buttons
  warmGradient: ['#09090B', '#121214'],
};

// ==========================================
// 2. RULES & GENERATIVE FUNCTIONS
// ==========================================

// Generative rule for Category Colors (Scalable for 20+ categories)
// Using base colors with deterministic dark/light pairings
const baseCategoryColors: Record<string, string> = {
  'Ahorros': '#47ADA2',   // Teal
  'Ahorro': '#47ADA2',
  'Comida': '#F0927B',    // Salmon
  'Salud': '#D2A9D1',     // Lavender
  'Hogar': '#B9E2A2',     // Soft Green
  'Transporte': '#8AD6CE',// Light Teal
  'Ingreso': '#2E7D32',   // Success Green
  'Diversión': '#FFB74D', // Deep Orange/Gold
  'Ropa': '#9575CD',      // Purple
  'Mascotas': '#A1887F',  // Brown
  'Varios': '#9E9E9E',    // Grey
  'Otros': '#9E9E9E',
};

// Auto-generates container (light) and text (dark) pairs for any category
export const getCategoryColorPair = (categoryName: string, isDark: boolean = false) => {
  const base = baseCategoryColors[categoryName] || '#7D907E';
  
  if (isDark) {
    return [base, '#FFFFFF']; // [background, text]
  }
  return [base + '33', base]; // [20% opacity background, pure text]
};

export const getDeterministicColor = (seedString: string, colorsArray: string[]) => {
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    hash = seedString.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colorsArray.length;
  return colorsArray[index];
};

// Retro-compatibility explicit mapping needed by chart components
const generatedCategoryColors: Record<string, [string, string]> = {
  'Ahorros': ['#8AD6CE', '#64B3A8'],
  'Ahorro': ['#8AD6CE', '#64B3A8'],
  'Comida': ['#F0927B', '#D77762'],
  'Salud': ['#D2A9D1', '#BB8EBB'],
  'Hogar': ['#B9E2A2', '#A3CF8C'],
  'Transporte': ['#8BD6DE', '#69CDE2'],
  'Otros': ['#D5DEE0', '#B9C5C8'],
  'Varios': ['#D5DEE0', '#B9C5C8'],
  'Ingreso': ['#A5D6A7', '#86B988']
};

export const UI_COLORS = {
  sage: lightModeColors,
  sageDark: darkModeColors,
};

// ==========================================
// 3. COMPONENTS: Design System Structures
// ==========================================

export type ThemeMode = 'sage' | 'sageDark';

export const getTheme = (mode: ThemeMode = 'sage') => {
  const isDark = mode === 'sageDark';
  const colors = UI_COLORS[mode];

  return {
    mode,
    isDark,
    colors: {
      ...colors,
      pastel: {
        teal: '#8AD6CE',
        green: '#B9E2A2',
        salmon: '#F0927B',
        lavender: '#D2A9D1',
      },
      pocketFlatColors: [
        '#8AD6CE', '#F0927B', '#D2A9D1', '#8BD6DE', '#F7C59F', '#C5B4E3'
      ],
      chartColors: ['#8AD6CE', '#B9E2A2', '#D2A9D1', '#F0927B', '#A5D6A7'],
      categoryColors: generatedCategoryColors, // Retained for compatibility
    },
    
    // 📐 Spacing System (CLAVE para escalar UI)
    spacing: {
      xs: normalize(4),
      sm: normalize(8),
      md: normalize(16),
      lg: normalize(24),
      xl: normalize(32),
      xxl: normalize(48),
      xxxl: normalize(64),
    },

    // 🧱 Border Radius System
    radius: {
      xs: 4,
      sm: 8,
      md: 12,
      lg: 16,
      xl: 24,
      xxl: 32,
      full: 9999,
    },

    // 🧩 Typography System (Tamaños, pesos, jerarquías, line-height)
    fonts: {
      headline: 'Outfit-Bold',
      body: 'Inter',
    },
    typography: {
      // Cifras gigantes — el saldo principal del Dashboard, totales de Pockets,
      // input de monto en AddIncome/PocketTransfer.
      display: { fontSize: normalize(44), fontWeight: '900' as const, lineHeight: normalize(52), letterSpacing: -1.5 },
      displaySmall: { fontSize: normalize(32), fontWeight: '900' as const, lineHeight: normalize(40), letterSpacing: -1 },
      h1: { fontSize: normalize(32), fontWeight: '800' as const, lineHeight: normalize(40), letterSpacing: -1 },
      h2: { fontSize: normalize(24), fontWeight: '700' as const, lineHeight: normalize(32), letterSpacing: -0.5 },
      h3: { fontSize: normalize(20), fontWeight: '700' as const, lineHeight: normalize(28) },
      title: { fontSize: normalize(18), fontWeight: '600' as const, lineHeight: normalize(26) },
      bodyLarge: { fontSize: normalize(16), fontWeight: '400' as const, lineHeight: normalize(24) },
      body: { fontSize: normalize(14), fontWeight: '400' as const, lineHeight: normalize(20) }, // Default text
      bodyMedium: { fontSize: normalize(14), fontWeight: '500' as const, lineHeight: normalize(20) },
      bodySmall: { fontSize: normalize(12), fontWeight: '400' as const, lineHeight: normalize(16) },
      caption: { fontSize: normalize(11), fontWeight: '600' as const, lineHeight: normalize(16), letterSpacing: 1, textTransform: 'uppercase' as const },
      label: { fontSize: normalize(10), fontWeight: '700' as const, lineHeight: normalize(14), letterSpacing: 1.5, textTransform: 'uppercase' as const },
    },

    // ✨ Shadow Hierarchy
    shadows: {
      xs: {
        shadowColor: isDark ? '#000' : '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: isDark ? 0.3 : 0.05,
        shadowRadius: 2,
        elevation: 1,
      },
      sm: {
        shadowColor: isDark ? '#000' : '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.4 : 0.08,
        shadowRadius: 4,
        elevation: 2,
      },
      md: {
        shadowColor: isDark ? '#000' : '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isDark ? 0.5 : 0.12,
        shadowRadius: 8,
        elevation: 4,
      },
      lg: {
        shadowColor: isDark ? '#000' : '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: isDark ? 0.6 : 0.15,
        shadowRadius: 16,
        elevation: 8,
      },
      premium: {
        shadowColor: colors.premiumShadow,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: isDark ? 0.4 : 0.2, // Glow effect
        shadowRadius: 24,
        elevation: 12,
      }
    },

    // 🧪 Component Interaction States
    states: {
      hover: { opacity: 0.9 }, // Usable on Web
      pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
      disabled: { opacity: 0.4 },
      focus: { borderWidth: 2, borderColor: colors.primary },
    }
  };
};

export const theme = getTheme('sage');
