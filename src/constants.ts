import { Transaction, Pocket } from './types';
import Constants from 'expo-constants';

export const INITIAL_TRANSACTIONS: Transaction[] = [
  { id: '1', merchant: 'Starbucks', amount: -5.50, date: 'Hoy • 08:45 AM', category: 'Comida', icon: 'Coffee' },
  { id: '2', merchant: 'Uber', amount: -15.00, date: 'Ayer • 11:20 PM', category: 'Transporte', icon: 'Car' },
  { id: '3', merchant: 'Whole Foods', amount: -85.00, date: 'Oct 12 • 02:15 PM', category: 'Comida', icon: 'ShoppingBasket' },
  { id: '4', merchant: 'Salario Mensual', amount: 4200.00, date: 'Oct 01 • 09:00 AM', category: 'Ingresos', icon: 'Banknote' },
  { id: '5', merchant: 'Comestibles Orgánicos', amount: -84.20, date: 'Oct 15 • 02:45 PM', category: 'Comida', icon: 'Utensils' },
  { id: '6', merchant: 'Carga Eléctrica', amount: -32.00, date: 'Oct 14 • 10:00 AM', category: 'Transporte', icon: 'Zap' },
];

export const INITIAL_POCKETS: Pocket[] = [
  { id: '1', user_id: '', name: 'Comida y Súper', category: 'Comida', allocated_budget: 500, icon: 'Utensils' },
  { id: '2', user_id: '', name: 'Tránsito Diario', category: 'Transporte', allocated_budget: 300, icon: 'Car' },
  { id: '3', user_id: '', name: 'Ocio y Diversión', category: 'Ocio', allocated_budget: 200, icon: 'Theater' },
  { id: '4', user_id: '', name: 'Fondo Futuro', category: 'Ahorros', allocated_budget: 1000, icon: 'PiggyBank' },
];

// -----------------------------------------------------------------------------
// SECURITY: OpenAI and Google Vision API keys MUST NOT live on the client.
// They are now injected as Edge Function secrets and accessed only from
// Supabase Functions (chat-advisor, ocr-receipt). Do not re-add them here.
// -----------------------------------------------------------------------------
const testing = ['development', 'preview'].includes(Constants.expoConfig?.extra?.appVariant);
// Dev never falls back to the production backend. Demo does not mount live screens.
export const SUPABASE_URL = testing
  ? Constants.expoConfig?.extra?.devBackendUrl || 'https://save-demo.invalid'
  : process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = testing
  ? Constants.expoConfig?.extra?.devBackendKey || 'demo-mode-no-backend'
  : process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
