export type Category = 'Comida' | 'Transporte' | 'Ocio' | 'Vivienda' | 'Servicios' | 'Ahorros' | 'Ingresos' | 'Ingreso';

export interface Transaction {
  id: string;
  merchant: string;
  canonical_merchant?: string;
  amount: number;
  date: string;
  category: Category;
  icon: string;
  created_at?: string;
}

export interface Pocket {
  id: string;
  name: string;
  category: Category;
  spent: number;
  budget: number;
  icon: string;
}

export type Screen = 'dashboard' | 'scanner' | 'expenses' | 'pockets' | 'profile' | 'onboarding' | 'add_income' | 'pocket_transfer';
