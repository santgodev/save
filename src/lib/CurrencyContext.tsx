// =====================================================================
// CurrencyContext.tsx — Contexto global de moneda.
// Patrón idéntico a ThemeContext: lee de Supabase, cachea en AsyncStorage,
// expone todo a la app vía useCurrency().
// =====================================================================

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import {
  SupportedCurrency,
  DEFAULT_CURRENCY,
  getCurrencyConfig,
  getCurrencySymbol,
  formatByCurrency,
  formatInputByCurrency,
  CurrencyConfig,
} from './currency';

interface CurrencyContextType {
  /** Código ISO de la moneda activa, ej: 'COP', 'USD' */
  currency: SupportedCurrency;
  /** Símbolo visual, ej: '$', '€', 'S/' */
  symbol: string;
  /** Configuración completa de la moneda activa */
  config: CurrencyConfig;
  /** Formatea un número con el símbolo y decimales correctos */
  formatMoney: (n: number | null | undefined) => string;
  /** Formatea el valor de un TextInput mientras el usuario escribe */
  formatInput: (value: string) => string;
  /** Cambia la moneda activa (actualiza Supabase + cache local) */
  setCurrency: (code: SupportedCurrency) => Promise<void>;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

const STORAGE_KEY = 'preferred_currency';

export const CurrencyProvider = ({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId?: string;
}) => {
  const [currency, setCurrencyState] = useState<SupportedCurrency>(DEFAULT_CURRENCY);

  // Carga inicial: primero cache local, luego Supabase
  useEffect(() => {
    const init = async () => {
      try {
        // 1. Leer cache local (instantáneo)
        const cached = await AsyncStorage.getItem(STORAGE_KEY);
        if (cached) {
          setCurrencyState(cached as SupportedCurrency);
        }

        // 2. Si hay usuario, sincronizar con Supabase
        if (userId) {
          const { data } = await supabase
            .from('profiles')
            .select('preferred_currency')
            .eq('id', userId)
            .maybeSingle();

          if (data?.preferred_currency && data.preferred_currency !== cached) {
            setCurrencyState(data.preferred_currency as SupportedCurrency);
            await AsyncStorage.setItem(STORAGE_KEY, data.preferred_currency);
          }
        }
      } catch (e) {
        console.error('[CurrencyContext] init error:', e);
      }
    };

    init();
  }, [userId]);

  const setCurrency = useCallback(async (code: SupportedCurrency) => {
    try {
      setCurrencyState(code);
      await AsyncStorage.setItem(STORAGE_KEY, code);

      if (userId) {
        await supabase
          .from('profiles')
          .update({ preferred_currency: code })
          .eq('id', userId);
      }
    } catch (e) {
      console.error('[CurrencyContext] setCurrency error:', e);
    }
  }, [userId]);

  const config = getCurrencyConfig(currency);
  const symbol = getCurrencySymbol(currency);
  const formatMoney = useCallback(
    (n: number | null | undefined) => formatByCurrency(n, currency),
    [currency]
  );
  const formatInput = useCallback(
    (value: string) => formatInputByCurrency(value, currency),
    [currency]
  );

  return (
    <CurrencyContext.Provider
      value={{ currency, symbol, config, formatMoney, formatInput, setCurrency }}
    >
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = (): CurrencyContextType => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
};
