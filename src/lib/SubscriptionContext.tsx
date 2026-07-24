// =====================================================================
// SubscriptionContext.tsx — Contexto global de suscripción.
// Patrón idéntico a CurrencyContext: expone todo a la app vía
// useSubscription(). Envuelve el SDK de RevenueCat (react-native-purchases).
// =====================================================================

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import Purchases, { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { REVENUECAT_IOS_API_KEY, ENTITLEMENT_ID } from './purchases';

interface PurchaseResult {
  success: boolean;
  error?: string;
}

interface SubscriptionContextType {
  /** Sigue cargando el estado inicial de RevenueCat */
  isLoading: boolean;
  /** true si el entitlement "premium" está activo -- incluye prueba gratis Y pago real */
  isSubscribed: boolean;
  /** true si está activo pero todavía en el período de prueba gratis */
  isInTrial: boolean;
  /** La oferta actual configurada en RevenueCat (contiene los paquetes con precios reales de Apple) */
  offering: PurchasesOffering | null;
  /** Compra un paquete (mensual o anual) */
  purchasePackage: (pkg: PurchasesPackage) => Promise<PurchaseResult>;
  /** Restaura compras anteriores (requerido por Apple en todo paywall) */
  restorePurchases: () => Promise<PurchaseResult>;
  /** Refresca el estado manualmente */
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider = ({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId?: string;
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [configured, setConfigured] = useState(false);

  // Configuración inicial del SDK. Save por ahora solo vende suscripción
  // en iOS -- en cualquier otra plataforma nunca se bloquea la app.
  useEffect(() => {
    if (Platform.OS !== 'ios') {
      setIsLoading(false);
      return;
    }

    if (!REVENUECAT_IOS_API_KEY) {
      console.warn('[Subscription] Falta EXPO_PUBLIC_REVENUECAT_IOS_API_KEY -- el paywall no puede validar compras todavía.');
      setIsLoading(false);
      return;
    }

    Purchases.configure({ apiKey: REVENUECAT_IOS_API_KEY });
    setConfigured(true);

    Purchases.getCustomerInfo()
      .then(info => setCustomerInfo(info))
      .catch(e => console.error('[Subscription] Error leyendo customerInfo:', e))
      .finally(() => setIsLoading(false));

    Purchases.getOfferings()
      .then(res => setOffering(res.current))
      .catch(e => console.error('[Subscription] Error leyendo offerings:', e));

    const listener = (info: CustomerInfo) => setCustomerInfo(info);
    Purchases.addCustomerInfoUpdateListener(listener);

    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  // Vincula el usuario de Supabase con RevenueCat, para que la misma
  // cuenta se reconozca igual sin importar el dispositivo.
  useEffect(() => {
    if (configured && userId) {
      Purchases.logIn(userId).catch(e => console.error('[Subscription] Error en logIn:', e));
    }
  }, [configured, userId]);

  const activeEntitlement = customerInfo?.entitlements.active[ENTITLEMENT_ID];
  const isSubscribed = !!activeEntitlement;
  // RevenueCat no expone un booleano de "está en prueba" -- hay que leer
  // el periodType del entitlement activo.
  const isInTrial = activeEntitlement?.periodType === 'TRIAL';

  const refresh = useCallback(async () => {
    if (Platform.OS !== 'ios' || !REVENUECAT_IOS_API_KEY) return;
    try {
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
    } catch (e) {
      console.error('[Subscription] Error en refresh:', e);
    }
  }, []);

  const purchasePackage = useCallback(async (pkg: PurchasesPackage): Promise<PurchaseResult> => {
    try {
      const { customerInfo: updated } = await Purchases.purchasePackage(pkg);
      setCustomerInfo(updated);
      return { success: !!updated.entitlements.active[ENTITLEMENT_ID] };
    } catch (e: any) {
      if (e?.userCancelled) return { success: false };
      console.error('[Subscription] Error comprando:', e);
      return { success: false, error: e?.message || 'No se pudo procesar la compra.' };
    }
  }, []);

  const restorePurchases = useCallback(async (): Promise<PurchaseResult> => {
    try {
      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);
      return { success: !!info.entitlements.active[ENTITLEMENT_ID] };
    } catch (e: any) {
      console.error('[Subscription] Error restaurando:', e);
      return { success: false, error: e?.message || 'No se pudo restaurar la compra.' };
    }
  }, []);

  return (
    <SubscriptionContext.Provider
      value={{ isLoading, isSubscribed, isInTrial, offering, purchasePackage, restorePurchases, refresh }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = (): SubscriptionContextType => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};
