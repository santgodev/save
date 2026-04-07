import { Platform, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');
const scale = width / 390; 

export const normalize = (size: number) => {
  return Math.round(size * scale);
};

export const UI_COLORS = {
  sage: {
    background: '#F7F7F2',
    onBackground: '#2D3436', 
    primary: '#7D907E', // Sage Green
    onPrimary: '#FFFFFF',
    primaryContainer: '#DDE5D1', 
    onPrimaryContainer: '#344E41',
    surface: '#FFFFFF',
    onSurface: '#1B201F',
    surfaceContainerLow: '#F0F1EA',
    surfaceContainerHigh: '#E7E9E0',
    surfaceContainerHighest: '#D5D8CF',
    onSurfaceVariant: '#5B6259',
    secondary: '#6B8E9B', // Slate Blue
    secondaryContainer: '#E1E9EC',
    onSecondaryContainer: '#2D4B54',
    tertiary: '#C9A959', 
    tertiaryContainer: '#F9F4E6',
    onTertiaryContainer: '#5C4A1E',
    outlineVariant: '#C4C8BA',
    brandGradient: ['#7D907E', '#6B8E9B', '#C9A959'], 
    warmGradient: ['#F7F7F2', '#E7E9E0'],
    glassWhite: 'rgba(255, 255, 255, 0.75)',
    glassDark: 'rgba(0, 0, 0, 0.04)',
    success: '#7D907E',
    warning: '#C9A959',
    error: '#BA1A1A',
    info: '#6B8E9B'
  },
  honey: {
    background: '#FCFAEE', // Luxury Champagne Background
    onBackground: '#1C1C1C',
    primary: '#B8860B', // Dark Goldenrod (Old Gold Metallic)
    onPrimary: '#FFFFFF',
    primaryContainer: '#FFF5D6',
    onPrimaryContainer: '#4B3E00',
    surface: '#FFFFFF',
    onSurface: '#121212',
    surfaceContainerLow: '#F8F4DF',
    surfaceContainerHigh: '#EFEACF',
    surfaceContainerHighest: '#E6E1C4',
    onSurfaceVariant: '#5D5A4D',
    secondary: '#1A1C1E', // Midnight Black (For Premium High-Contrast)
    secondaryContainer: '#DCD4B5',
    onSecondaryContainer: '#2D2910',
    tertiary: '#8B4513', // Saddle Brown (Deep Amber Accent)
    tertiaryContainer: '#F9F1EB',
    onTertiaryContainer: '#3E2723',
    outlineVariant: '#CFCAB5',
    brandGradient: ['#B8860B', '#8B4513', '#4E342E'], // Golden Luxury Gradient
    warmGradient: ['#FCFAEE', '#EFEACF'],
    glassWhite: 'rgba(255, 255, 255, 0.82)',
    glassDark: 'rgba(0, 0, 0, 0.06)',
    success: '#816900', // Deep Gold Success
    warning: '#D49400',
    error: '#B01010',
    info: '#1A1C1E'
  }
};

export type ThemeMode = 'sage' | 'honey';

export const getTheme = (mode: ThemeMode = 'sage') => {
  const colors = UI_COLORS[mode] || UI_COLORS.sage;
  const isHoney = mode === 'honey';

  return {
    colors,
    fonts: {
      headline: 'Outfit-Bold',
      body: 'Inter',
    },
    shadows: {
      premium: {
        shadowColor: isHoney ? '#4B3E00' : '#2D3436',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: isHoney ? 0.22 : 0.15,
        shadowRadius: 24,
        elevation: 10,
      },
      soft: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3,
      }
    }
  };
};

// Default export for backward compatibility during transition
export const theme = getTheme('sage');
