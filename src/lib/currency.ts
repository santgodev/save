// =====================================================================
// currency.ts — Utilidades de moneda. Única fuente de verdad.
// Si necesitas símbolo o formateo de moneda, importa de acá.
// =====================================================================

export type SupportedCurrency = 'COP' | 'USD' | 'EUR' | 'MXN' | 'PEN' | 'ARS';

export interface CurrencyConfig {
  code: SupportedCurrency;
  symbol: string;
  locale: string;
  decimals: number;
  label: string;
}

export const SUPPORTED_CURRENCIES: CurrencyConfig[] = [
  { code: 'COP', symbol: '$', locale: 'es-CO', decimals: 0, label: 'Peso Colombiano' },
  { code: 'USD', symbol: '$', locale: 'en-US', decimals: 2, label: 'Dólar Americano' },
  { code: 'EUR', symbol: '€', locale: 'es-ES', decimals: 2, label: 'Euro' },
  { code: 'MXN', symbol: '$', locale: 'es-MX', decimals: 2, label: 'Peso Mexicano' },
  { code: 'PEN', symbol: 'S/', locale: 'es-PE', decimals: 2, label: 'Sol Peruano' },
  { code: 'ARS', symbol: '$', locale: 'es-AR', decimals: 0, label: 'Peso Argentino' },
];

export const DEFAULT_CURRENCY: SupportedCurrency = 'COP';

/**
 * Retorna la configuración completa de una moneda.
 * Si el código no existe, usa COP como fallback.
 */
export function getCurrencyConfig(code: string): CurrencyConfig {
  return SUPPORTED_CURRENCIES.find(c => c.code === code) ?? SUPPORTED_CURRENCIES[0];
}

/**
 * Retorna solo el símbolo de una moneda.
 *   getCurrencySymbol('USD') → '$'
 *   getCurrencySymbol('EUR') → '€'
 */
export function getCurrencySymbol(code: string): string {
  return getCurrencyConfig(code).symbol;
}

/**
 * Formatea un número como moneda usando la configuración de la moneda dada.
 * Usa Intl.NumberFormat para manejar decimales, separadores y símbolo correcto.
 *
 *   formatByCurrency(1250000, 'COP') → '$1.250.000'
 *   formatByCurrency(4.99, 'USD')   → '$4.99'
 *   formatByCurrency(-12.5, 'EUR')  → '-€12,50'
 */
export function formatByCurrency(
  n: number | null | undefined,
  currency: string = DEFAULT_CURRENCY
): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) {
    return formatByCurrency(0, currency);
  }

  const config = getCurrencyConfig(currency);
  const num = Number(n);
  const isNegative = num < 0;
  const abs = Math.abs(num);

  const formatted = new Intl.NumberFormat(config.locale, {
    minimumFractionDigits: config.decimals,
    maximumFractionDigits: config.decimals,
  }).format(abs);

  return `${isNegative ? '-' : ''}${config.symbol}${formatted}`;
}

/**
 * Formatea solo los dígitos de un input de moneda (para TextInput mientras el usuario escribe).
 * Respeta los decimales de la moneda:
 *   - COP: sin decimales → '1.250.000'
 *   - USD: 2 decimales → permite '1250.99'
 *
 * Esta función es para usar en onChangeText, igual que formatMoneyDigits.
 */
export function formatInputByCurrency(value: string, currency: string = DEFAULT_CURRENCY): string {
  const config = getCurrencyConfig(currency);

  if (config.decimals === 0) {
    // Sin decimales: comportamiento igual al formatMoneyDigits original (separador de miles)
    const numericValue = value.replace(/[^0-9]/g, '');
    if (!numericValue) return '';
    const thousands = ['es-CO', 'es-AR'].includes(config.locale) ? '.' : ',';
    return parseInt(numericValue, 10)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
  }

  // Con decimales: solo permitir dígitos y punto decimal
  return value.replace(/[^0-9.]/g, '');
}
