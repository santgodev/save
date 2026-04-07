import React, { useMemo } from 'react';
import { View } from 'react-native';
import { 
  Coffee, Car, ShoppingBasket, Banknote, Utensils, 
  Zap, Theater, PiggyBank, Wallet, Tag, TrendingUp, ArrowRightLeft, 
  Smartphone, Home, ShoppingBag, HeartPulse, GraduationCap, Plane,
  User, Shield, Briefcase, Minus, Plus, Search, Grid2X2
} from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';

interface CategoryIconProps {
  iconName: string;
  style?: any;
  color?: string;
  size?: number;
  strokeWidth?: number;
}

export const CategoryIcon = ({ iconName, style, color, size = 24, strokeWidth = 2.5 }: CategoryIconProps) => {
  const { theme } = useTheme();
  
  const icons: Record<string, any> = {
    // Standard Pockets/Categories
    Coffee, 
    Car, 
    ShoppingBasket, 
    Banknote, 
    Utensils, 
    Zap, 
    Theater, 
    PiggyBank,
    Tag,
    
    // UI Icons used with categories
    'trending-up': TrendingUp,
    'arrow-right-left': ArrowRightLeft,
    'plus': Plus,
    'minus': Minus,
    'search': Search,
    'grid': Grid2X2,
    'user': User,
    
    // Additional helpful icons
    Smartphone,
    Home,
    ShoppingBag,
    'health': HeartPulse,
    'education': GraduationCap,
    Plane,
    Shield,
    Briefcase
  };
  
  const Icon = useMemo(() => {
    // Normalize icon name (lowercase/dash-case etc)
    const normalized = iconName?.toLowerCase();
    const found = Object.keys(icons).find(key => key.toLowerCase() === normalized);
    return found ? icons[found] : Wallet;
  }, [iconName]);

  const finalColor = color || theme.colors.primary;

  return (
    <View style={style}>
      <Icon color={finalColor} size={size} strokeWidth={strokeWidth} />
    </View>
  );
};
