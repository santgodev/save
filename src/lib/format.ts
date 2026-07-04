// Helpers de formato compartidos. ÚNICA fuente de verdad.
// Si necesitás formatear plata, importá de acá. NO redefinas funciones
// locales en cada pantalla — eso fue lo que rompió la consistencia
// visual y obligó a este refactor.

/**
 * Formato canónico de pesos colombianos.
 * Convención: signo $ pegado al número, sin espacio, separador de miles
 * con puntos, sin decimales.
 *   formatMoney(1250000)  → "$1.250.000"
 *   formatMoney(0)        → "$0"
 *   formatMoney(null)     → "$0"
 *   formatMoney(-12345)   → "-$12.345"
 */
export function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '$0';
  const num = Number(n);
  const isNegative = num < 0;
  const abs = Math.round(Math.abs(num));
  const formatted = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${isNegative ? '-' : ''}$${formatted}`;
}

/**
 * Solo el número, sin signo, para inputs de moneda.
 *   formatMoneyDigits("1250000") → "1.250.000"
 */
export function formatMoneyDigits(value: string): string {
  const numericValue = value.replace(/[^0-9]/g, '');
  if (!numericValue) return '';
  return parseInt(numericValue, 10).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Porcentaje formateado.
 *   formatPercent(0.35)  → "35%"
 *   formatPercent(1.5)   → "150%"
 */
export function formatPercent(ratio: number, decimals = 0): string {
  if (!Number.isFinite(ratio)) return '0%';
  return `${(ratio * 100).toFixed(decimals)}%`;
}

/**
 * Fecha local corta para listas.
 *   formatShortDate("2026-04-22")  → "22 de abril"
 */
export function formatShortDate(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });
}
