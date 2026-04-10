import { Platform, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');
const scale = width / 390; 

export const normalize = (size: number) => {
  return Math.round(size * scale);
};

export const UI_COLORS = {
  sage: {
    // Core
    background: '#F7F7F2', 
    onBackground: '#2D3436', 
    primary: '#47ADA2', // Refined mint/teal from pastel palette
    onPrimary: '#FFFFFF',
    primaryContainer: '#DDF5F2', 
    onPrimaryContainer: '#13302D',
    
    surface: '#FFFFFF',
    onSurface: '#2D3436', 
    surfaceContainerLow: '#FAFBFA', // Lighter
    surfaceContainerHigh: '#F5F9F8', // Lighter
    surfaceContainerHighest: '#EFF6F5', // Lighter
    onSurfaceVariant: '#70918E', // Much lighter, soft mint-slate
    
    secondary: '#B9E2A2', // Soft Green
    secondaryContainer: '#F7FBF4',
    onSecondaryContainer: '#1A2E1C',
    
    tertiary: '#F0927B', // Salmon
    tertiaryContainer: '#FEF6F4',
    onTertiaryContainer: '#401A10',

    // Semantic States (PRO Level)
    success: '#8AD6CE',
    onSuccess: '#FFFFFF',
    successContainer: '#F0FAF9',
    onSuccessContainer: '#13302D',
    
    error: '#F0927B',
    onError: '#FFFFFF',
    errorContainer: '#FFF2F0',
    onErrorContainer: '#401A10',
    
    warning: '#D2A9D1', // Changed from Yellow to Lavender
    onWarning: '#30132F',
    warningContainer: '#FBF7FB',
    onWarningContainer: '#30132F',
    
    info: '#8AD6CE',
    onInfo: '#FFFFFF',
    infoContainer: '#F0FAF9',
    onInfoContainer: '#13302D',

    outlineVariant: '#E2EAE8', // Much softer
    brandGradient: ['#8AD6CE', '#B9E2A2', '#D2A9D1'], 
    warmGradient: ['#F7F7F2', '#E7E9E0'],
    glassWhite: 'rgba(255, 255, 255, 0.75)', // Pure luminous glass
    glassDark: 'rgba(138, 214, 206, 0.1)', 
    divider: 'rgba(138, 214, 206, 0.08)', 
    
    pastel: {
      teal: '#8AD6CE',
      green: '#B9E2A2',
      yellow: '#B9E2A2', // Banned Yellow/Mustard, map to green
      salmon: '#F0927B',
      lavender: '#D2A9D1',
    },
    chartColors: ['#8AD6CE', '#B9E2A2', '#D2A9D1', '#F0927B', '#8AD6CE'],

    premiumShadow: '#8AD6CE',
    categoryColors: {
      'Ahorros': ['#8AD6CE', '#47ADA2'],
      'Ahorro': ['#8AD6CE', '#47ADA2'],
      'Comida': ['#F0927B', '#83382D'],
      'Salud': ['#D2A9D1', '#5B3E5A'],
      'Hogar': ['#B9E2A2', '#1A2E1C'], // Changed from Yellow to Green
      'Transporte': ['#8AD6CE', '#13302D'],
      'Otros': ['#E7E9E0', '#7D907E'],
      'Varios': ['#E7E9E0', '#7D907E'],
      'Ingreso': ['#8AD6CE', '#1B5E20']
    }
  }
};

export type ThemeMode = 'sage';

export const getTheme = (mode: ThemeMode = 'sage') => {
  const colors = UI_COLORS.sage;

  return {
    mode,
    colors,
    // Spacing System
    spacing: {
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
      xxl: 48,
    },
    // Fonts
    fonts: {
      headline: 'Outfit-Bold',
      body: 'Inter',
    },
    // Radius Hierarchy
    radius: {
      xs: 6,
      sm: 10,
      md: 14,
      lg: 20,
      xl: 28,
      xxl: 36,
      full: 9999,
    },
    // Typography System
    typography: {
      h1: { fontSize: normalize(34), fontWeight: '900', letterSpacing: -1.2, lineHeight: 42 },
      h2: { fontSize: normalize(26), fontWeight: '900', letterSpacing: -0.8, lineHeight: 34 },
      h3: { fontSize: normalize(21), fontWeight: '800', letterSpacing: -0.5, lineHeight: 28 },
      title: { fontSize: normalize(17), fontWeight: '800', letterSpacing: -0.3, lineHeight: 24 },
      bodyLarge: { fontSize: normalize(16), fontWeight: '500', lineHeight: 24 },
      bodyMedium: { fontSize: normalize(14), fontWeight: '500', lineHeight: 20 },
      bodySmall: { fontSize: normalize(12), fontWeight: '500', lineHeight: 16 },
      caption: { fontSize: normalize(11), fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
      label: { fontSize: normalize(10), fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase' },
    },
    shadows: {
      sm: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
        elevation: 1,
      },
      md: {
        shadowColor: colors.onBackground,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
        elevation: 3,
      },
      premium: {
        shadowColor: colors.premiumShadow,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.08,
        shadowRadius: 30,
        elevation: 8,
      },
      soft: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.03,
        shadowRadius: 12,
        elevation: 2,
      }
    },
    states: {
      pressed: { opacity: 0.7 },
      disabled: { opacity: 0.4 },
      focus: { borderWidth: 2, borderColor: colors.primary },
    }
  };
};

export const theme = getTheme('sage');

