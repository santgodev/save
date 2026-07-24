// =====================================================================
// purchases.ts — Configuración central de compras in-app (RevenueCat).
//
// IMPORTANTE: estos identificadores deben coincidir EXACTO con lo que
// crees en App Store Connect y en el dashboard de RevenueCat. Si algún
// ID no coincide, RevenueCat no va a encontrar el producto y el paywall
// se queda sin precios para mostrar. Ver checklist de configuración.
// =====================================================================

export const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || '';

// El identificador del "entitlement" en RevenueCat (Project → Entitlements).
// Todo lo premium de Save se controla con este único entitlement.
export const ENTITLEMENT_ID = 'premium';

// Identificadores de producto -- se crean en App Store Connect dentro de
// "In-App Purchases → Suscripciones auto-renovables", ambos en el MISMO
// grupo de suscripción (para que un usuario solo pueda tener un plan
// activo a la vez).
export const PRODUCT_IDS = {
  monthly: 'save_premium_monthly',
  annual: 'save_premium_annual',
} as const;

// Duración de la prueba gratis. Este número es solo para los textos de
// la pantalla -- la prueba real la define la "oferta introductoria" del
// producto en App Store Connect (Free Trial, 1 week).
export const TRIAL_DAYS = 7;

// Precios de referencia en COP, solo para mostrar mientras RevenueCat no
// tenga configurados los productos todavía (fallback visual). Una vez
// existan los productos reales, el precio que se muestra en el paywall
// viene directo de Apple (localizado), no de estas constantes.
export const FALLBACK_PRICING = {
  monthly: 14900,
  annual: 119900,
};
