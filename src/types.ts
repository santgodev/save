export type Category = 'Comida' | 'Transporte' | 'Ocio' | 'Vivienda' | 'Servicios' | 'Ahorros' | 'Ingresos';

export interface Transaction {
  id: string;
  merchant: string;
  amount: number;
  date: string;
  category: Category;
  icon: string;
}

export interface Pocket {
  id: string;
  name: string;
  category: Category;
  spent: number;
  budget: number;
  icon: string;
}

export type Screen = 'dashboard' | 'scanner' | 'expenses' | 'pockets';
