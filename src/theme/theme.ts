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
  
  // Gradients (RULE: Only for Main CTAs or Success states. Never for text or basic list backgrounds)
  brandGradient: ['#8AD6CE', '#B9E2A2', '#D2A9D1'], 
  warmGradient: [coreColors.neutral[50], coreColors.neutral[100]],
};

const darkModeColors = {
  // Core
  background: '#121212', 
  onBackground: '#E0E0E0', 
  primary: '#8AD6CE', 
  onPrimary: '#13302D',
  primaryContainer: '#13302D', 
  onPrimaryContainer: '#8AD6CE',
  
  // Surfaces
  surface: '#1E1E1E',
  onSurface: '#E0E0E0', 
  surfaceContainerLow: '#242424', 
  surfaceContainerHigh: '#2C2C2C', 
  surfaceContainerHighest: '#333333', 
  onSurfaceVariant: '#A0AAB2', 
  
  // Semantic States
  success: '#81C784',
  onSuccess: '#1B5E20',
  successContainer: '#1B5E20',
  onSuccessContainer: '#E8F5E9',
  
  error: '#E57373',
  onError: '#B71C1C',
  errorContainer: '#B71C1C',
  onErrorContainer: '#FFEBEE',
  
  warning: '#FFB74D',
  onWarning: '#E65100',
  warningContainer: '#E65100',
  onWarningContainer: '#FFF3E0',
  
  info: '#4FC3F7',
  onInfo: '#01579B',
  infoContainer: '#01579B',
  onInfoContainer: '#E1F5FE',

  // Borders & Dividers
  outlineVariant: '#3A3A3A', 
  divider: 'rgba(255, 255, 255, 0.08)', 

  // Accents / Glass
  premiumShadow: '#000000',
  glassWhite: 'rgba(30, 30, 30, 0.75)', 
  glassDark: 'rgba(0, 0, 0, 0.3)', 
  
  // Gradients
  brandGradient: ['#13302D', '#1A2E1C', '#30132F'], 
  warmGradient: ['#121212', '#1A1A1A'],
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
  
  // Simple deterministic approach: we use the base as the primary identifier.
  // In a robust implementation, you could use an HSL library to shift lightness.
  // For now, we return fixed pairings assuming base is mid-tone.
  if (isDark) {
    return [base, '#FFFFFF']; // [background, text]
  }
  return [base + '33', base]; // [20% opacity background, pure text]
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
      h1: { fontSize: normalize(32), fontWeight: '800' as const, lineHeight: normalize(40), letterSpacing: -1 },
      h2: { fontSize: normalize(24), fontWeight: '700' as const, lineHeight: normalize(32), letterSpacing: -0.5 },
      h3: { fontSize: normalize(20), fontWeight: '700' as const, lineHeight: normalize(28) },
      title: { fontSize: normalize(18), fontWeight: '600' as const, lineHeight: normalize(26) },
      bodyLarge: { fontSize: normalize(16), fontWeight: '400' as const, lineHeight: normalize(24) },
      body: { fontSize: normalize(14), fontWeight: '400' as const, lineHeight: normalize(20) }, // Default text
      bodyMedium: { fontSize: normalize(14), fontWeight: '500' as const, lineHeight: normalize(20) },
      bodySmall: { fontSize: normalize(12), fontWeight: '400' as const, lineHeight: normalize(16) },
      caption: { fontSize: normalize(11), fontWeight: '600' as const, lineHeight: normalize(14), letterSpacing: 0.5, textTransform: 'uppercase' as const },
      label: { fontSize: normalize(10), fontWeight: '800' as const, lineHeight: normalize(12), letterSpacing: 1.2, textTransform: 'uppercase' as const },
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
