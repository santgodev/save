import { Platform, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');
const scale = width / 390; // Based on iPhone 13/14 width

export const normalize = (size: number) => {
  return Math.round(size * scale);
};

export const theme = {
  colors: {
    background: '#FFFDF0', // Warm Honey White / Creamy Yellow
    onBackground: '#3E2723', // Dark Coffee / Warm Umber
    primary: '#FFB300', // Warm Amber (Amarillito Cálido)
    onPrimary: '#FFFFFF',
    primaryContainer: '#FFE084', // Miel / Yellow Muted
    onPrimaryContainer: '#5D4037',
    surface: '#FFFFFF',
    onSurface: '#2D1D19',
    surfaceContainerLow: '#FFFDF5',
    surfaceContainerHigh: '#FFF4D2',
    surfaceContainerHighest: '#FFDC73',
    onSurfaceVariant: '#6D4C41',
    secondary: '#FF8F00', // Amber Orange
    secondaryContainer: '#FFF3E0',
    onSecondaryContainer: '#BF360C',
    tertiary: '#7C9672', // Sage / Willow Green (The 'play' with Yellow)
    tertiaryContainer: '#E8F5E9',
    onTertiaryContainer: '#1B5E20',
    outlineVariant: '#EFDBC5',
    // Premium Warm Gradients (The 'Sun & Sage' Palette)
    brandGradient: ['#FFC107', '#FFB300', '#FFA000'], // Bright Warm Yellows
    warmGradient: ['#FFFDF0', '#FFF4D2'],
    glassWhite: 'rgba(255, 255, 255, 0.75)',
    glassDark: 'rgba(0, 0, 0, 0.04)',
    success: '#43A047',
    warning: '#FB8C00',
    error: '#E53935',
    info: '#1E88E5'
  },
  fonts: {
    headline: 'Outfit-Bold',
    body: 'Inter',
  },
  shadows: {
    premium: {
      shadowColor: '#FFB300',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.12,
      shadowRadius: 20,
      elevation: 8,
    },
    soft: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.04,
      shadowRadius: 10,
      elevation: 2,
    }
  }
};
