import React from 'react';
import { View } from 'react-native';
import { 
  Coffee, Car, ShoppingBasket, Banknote, Utensils, 
  Zap, Theater, PiggyBank, Wallet 
} from 'lucide-react-native';
import { theme } from '../theme/theme';

export const CategoryIcon = ({ iconName, style, color = theme.colors.primary, size = 24 }: { iconName: string; style?: any, color?: string, size?: number }) => {
  const icons: Record<string, any> = {
    Coffee, Car, ShoppingBasket, Banknote, Utensils, Zap, Theater, PiggyBank
  };
  const Icon = icons[iconName] || Wallet;
  return <View style={style}><Icon color={color} size={size} strokeWidth={2.5} /></View>;
};
