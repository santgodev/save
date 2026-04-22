import { Transaction, Pocket } from './types';

export const INITIAL_TRANSACTIONS: Transaction[] = [
  { id: '1', merchant: 'Starbucks', amount: -5.50, date: 'Hoy • 08:45 AM', category: 'Comida', icon: 'Coffee' },
  { id: '2', merchant: 'Uber', amount: -15.00, date: 'Ayer • 11:20 PM', category: 'Transporte', icon: 'Car' },
  { id: '3', merchant: 'Whole Foods', amount: -85.00, date: 'Oct 12 • 02:15 PM', category: 'Comida', icon: 'ShoppingBasket' },
  { id: '4', merchant: 'Salario Mensual', amount: 4200.00, date: 'Oct 01 • 09:00 AM', category: 'Ingresos', icon: 'Banknote' },
  { id: '5', merchant: 'Comestibles Orgánicos', amount: -84.20, date: 'Oct 15 • 02:45 PM', category: 'Comida', icon: 'Utensils' },
  { id: '6', merchant: 'Carga Eléctrica', amount: -32.00, date: 'Oct 14 • 10:00 AM', category: 'Transporte', icon: 'Zap' },
];

export const INITIAL_POCKETS: Pocket[] = [
  { id: '1', name: 'Comida y Súper', category: 'Comida', spent: 450, budget: 500, icon: 'Utensils' },
  { id: '2', name: 'Tránsito Diario', category: 'Transporte', spent: 135, budget: 300, icon: 'Car' },
  { id: '3', name: 'Ocio y Diversión', category: 'Ocio', spent: 220, budget: 200, icon: 'Theater' },
  { id: '4', name: 'Fondo Futuro', category: 'Ahorros', spent: 600, budget: 1000, icon: 'PiggyBank' },
];

// -----------------------------------------------------------------------------
// SECURITY: OpenAI and Google Vision API keys MUST NOT live on the client.
// They are now injected as Edge Function secrets and accessed only from
// Supabase Functions (chat-advisor, ocr-receipt). Do not re-add them here.
// -----------------------------------------------------------------------------
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

