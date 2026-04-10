import { Platform, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');
const scale = width / 390; // Based on iPhone 13/14 width

export const normalize = (size: number) => {
  return Math.round(size * scale);
};

export const theme = {
  colors: {
    background: '#F7F7F2', // Warm Stone
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
    tertiary: '#C9A959', // Muted Gold
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
