export type Category = 'Comida' | 'Transporte' | 'Ocio' | 'Vivienda' | 'Servicios' | 'Ahorros' | 'Ingresos' | 'Ingreso';

export interface Transaction {
  id: string;
  user_id?: string;
  merchant: string;
  canonical_merchant?: string;
  amount: number;
  // La columna real en Postgres es date_string ('YYYY-MM-DD'); `date` quedó
  // del modelo viejo y no existe en la tabla.
  date_string?: string;
  date?: string;
  category: Category;
  icon: string;
  metadata?: Record<string, any> | null;
  cycle_id?: string | null;
  created_at?: string;
}

export interface Pocket {
  id: string;
  user_id: string;
  name: string;
  category: string;
  allocated_budget?: number;
  icon?: string;
  is_default_free?: boolean;
}

export type Screen = 'dashboard' | 'scanner' | 'expenses' | 'pockets' | 'profile' | 'profile_details' | 'history' | 'onboarding' | 'add_income' | 'pocket_transfer' | 'quick_expense' | 'demo_scanner';
