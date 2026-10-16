import React, { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, Platform, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from '../src/lib/supabase';
import { clearCycleCaches } from '../src/lib/useCycleState';
import { INITIAL_POCKETS, SUPABASE_URL, SUPABASE_ANON_KEY } from '../src/constants';
import { getTheme } from '../src/theme/theme';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';
import { CurrencyProvider } from '../src/lib/CurrencyContext';
import { Screen } from '../src/types';
import { RealtimeChannel, createClient } from '@supabase/supabase-js';
import * as QuickActions from 'expo-quick-actions';
import * as Linking from 'expo-linking';

// Components & Screens
import { TopBar } from '../src/components/TopBar';
import { BottomNav } from '../src/components/BottomNav';
import { Dashboard } from '../src/screens/Dashboard';
import { Scanner } from '../src/screens/Scanner';
import { Expenses } from '../src/screens/Expenses';
import { Pockets } from '../src/screens/Pockets';
import { Profile } from '../src/screens/Profile';
import { HistoryScreen } from '../src/screens/HistoryScreen';
import { Auth } from '../src/screens/Auth';
import { ResetPassword } from '../src/screens/ResetPassword';
import { Onboarding } from '../src/screens/Onboarding';
import { AddIncome } from '../src/screens/AddIncome';
import { PocketTransfer } from '../src/screens/PocketTransfer';
import { IntroTour } from '../src/screens/IntroTour';
import { Camera, X, Repeat, TrendingUp, Sparkles, Zap } from 'lucide-react-native';
import { TourProvider, useTour } from '../src/components/tour/TourContext';
import { TourStep } from '../src/components/tour/TourStep';
import { DeviceEventEmitter } from 'react-native';
import { TourOverlay } from '../src/components/tour/TourOverlay';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SubscriptionProvider, useSubscription } from '../src/lib/SubscriptionContext';
import { ensureDailyReminders } from '../src/lib/notifications';
import { Paywall } from '../src/screens/Paywall';
import { PurchaseConfirmation } from '../src/screens/PurchaseConfirmation';

const { width, height } = Dimensions.get('window');

const SLOGANS = [
  "Lo que se organiza, se multiplica.",
  "Tu bolsillo también sueña.",
  "Menos impulso, más futuro.",
  "Cada gasto cuenta.",
  "Tu dinero merece dirección.",
  "Ahorrar también es avanzar.",
  "Pequeños hábitos, grandes logros.",
  "Hoy ordenas, mañana respiras.",
  "Finanzas simples, vida ligera.",
  "Gasta con conciencia.",
  "SAVE cuida tu futuro.",
  "“Los planes bien pensados traen prosperidad.” — Proverbios 21:5",
  "“El sabio guarda sus provisiones.” — Proverbios 21:20",
  "Jesús guarda tu vida; nosotros, tu bolsillo.",
  "Jesús guarda tu vida; nosotros, tu bolsillo."
];

const SplashScreen = () => {
  const { theme } = useTheme();
  // Antes usaba useColorScheme() (modo del sistema) directo -- eso hacía
  // que el splash siguiera el modo oscuro/claro del teléfono mientras el
  // resto de la app sigue theme_preference del perfil (default 'sage'/
  // claro en la base de datos para todo el mundo). Dos fuentes de verdad
  // distintas. Ahora el splash usa la MISMA fuente que toda la app.
  const splashBg = theme.colors.background;

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  // AVE empieza oculto a la izquierda detrás de la S
  const slideTextAnim = useRef(new Animated.Value(-60)).current;
  // El bloque completo arranca desplazado a la derecha para que la S quede centrada
  const containerShift = useRef(new Animated.Value(40)).current;
  const sloganOpacity = useRef(new Animated.Value(0)).current;
  const sloganTranslateY = useRef(new Animated.Value(10)).current;

  // Elegir un slogan al azar una vez por render
  const randomSlogan = React.useMemo(() => SLOGANS[Math.floor(Math.random() * SLOGANS.length)], []);

  useEffect(() => {
    Animated.sequence([
      // Escena 1: La S aparece centrada
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),

      // Pausa breve para apreciar la S sola
      Animated.delay(250),

      // Escena 2: El bloque se centra y AVE se desliza desde detrás
      Animated.parallel([
        Animated.spring(containerShift, {
          toValue: 0,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.spring(slideTextAnim, {
          toValue: 0,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
        // Slogan aparece un poco después
        Animated.sequence([
          Animated.delay(300),
          Animated.parallel([
            Animated.timing(sloganOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.spring(sloganTranslateY, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }),
          ]),
        ]),
      ]),
    ]).start();
  }, []);

  const fontSize = 56;

  return (
    <View style={[styles.loadingContainer, { backgroundColor: splashBg }]}>
      {/* SAVE animado — mismos colores que el TopBar */}
      <Animated.View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ translateX: containerShift }],
      }}>
        {/* S — color primario */}
        <Animated.Text style={{
          fontSize,
          fontWeight: '900',
          fontFamily: theme.fonts.headline,
          color: theme.colors.primary,
          opacity: logoOpacity,
          zIndex: 10,
        }}>
          S
        </Animated.Text>

        {/* AVE — se deslizan desde detrás de la S */}
        <Animated.View style={{
          flexDirection: 'row',
          opacity: textOpacity,
          transform: [{ translateX: slideTextAnim }],
          zIndex: 1,
        }}>
          <Text style={{ fontSize, fontWeight: '900', fontFamily: theme.fonts.headline, color: (theme.colors as any).pastel?.salmon || '#F0927B' }}>A</Text>
          <Text style={{ fontSize, fontWeight: '900', fontFamily: theme.fonts.headline, color: (theme.colors as any).pastel?.teal || '#8AD6CE' }}>V</Text>
          <Text style={{ fontSize, fontWeight: '900', fontFamily: theme.fonts.headline, color: (theme.colors as any).pastel?.lavender || '#D2A9D1' }}>E</Text>
        </Animated.View>
      </Animated.View>

      {/* Slogan / Proverbio */}
      <Animated.Text
        style={{
          opacity: sloganOpacity,
          transform: [{ translateY: sloganTranslateY }],
          marginTop: 24,
          marginHorizontal: 44,
          fontSize: 13,
          fontWeight: '600',
          fontFamily: theme.fonts.medium,
          color: theme.colors.onSurfaceVariant,
          letterSpacing: 0.3,
          textAlign: 'center',
          lineHeight: 21,
        }}
      >
        {randomSlogan}
      </Animated.Text>
    </View>
  );
};



function MainApp() {
  const { theme } = useTheme();
  
  // Changed initial state to null to prevent flashing Dashboard on slow loads/first login
  const [currentScreen, setCurrentScreen] = useState<Screen | null>(null);
  const [transferParams, setTransferParams] = useState<{ fromId?: string, toId?: string, amount?: number } | null>(null);
  const [editIncomeTx, setEditIncomeTx] = useState<any | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [pockets, setPockets] = useState<any[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [session, setSession] = useState<any>(null);
  // true mientras el usuario está a mitad del flujo de "olvidé mi
  // contraseña" -- la bandera real la escribe app/auth/callback.tsx
  // (ver el useEffect de abajo que la lee al montar). Bloquea el resto
  // de los gates hasta que elija una contraseña nueva o cancele.
  const [passwordRecoverySession, setPasswordRecoverySession] = useState(false);
  const [isDataReady, setIsDataReady] = useState(false);
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [minSplashTimeElapsed, setMinSplashTimeElapsed] = useState(false);

  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatInitialMessage, setChatInitialMessage] = useState<string | undefined>(undefined);
  const [clearChatOnOpen, setClearChatOnOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pull-to-refresh handler global — recarga datos y rastrea el spinner.
  // Garantiza mínimo 600ms de visibilidad para evitar el parpadeo brusco.
  const handleGlobalRefresh = async () => {
    if (!session?.user?.id) return;
    setIsRefreshing(true);
    try {
      await Promise.all([
        loadUserData(session.user.id),
        new Promise(resolve => setTimeout(resolve, 600)),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    // Aumentamos a 3800ms para que el usuario pueda leer el slogan/proverbio completo
    const timer = setTimeout(() => {
      setMinSplashTimeElapsed(true);
    }, 3800);
    return () => clearTimeout(timer);
  }, []);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(300)).current;
  const { startTour, isActive: tourActive } = useTour();
  const { isSubscribed, isLoading: subLoading } = useSubscription();

  // Save es 100% premium (sin versión gratis permanente): el paywall debe
  // aparecer DESPUÉS del tour de bienvenida, no encima de él. Mientras el
  // tour mágico de 4 pasos siga pendiente (banderas puestas por Onboarding
  // y consumidas en Dashboard/Pockets) o haya un tour activo en pantalla,
  // no mostramos el paywall todavía.
  const [tourFlowPending, setTourFlowPending] = useState(true);
  // SOLO DESARROLLO -- deja saltar el paywall sin pagar para poder probar
  // el resto de la app. __DEV__ es false en cualquier build de producción
  // (incluyendo TestFlight/App Store), así que esto nunca llega a un
  // usuario real.
  const [devPaywallBypass, setDevPaywallBypass] = useState(false);
  // No null = se acaba de suscribir en ESTA sesión -- mostrar la pantalla
  // de celebración una sola vez antes de entrar a la app. En aperturas
  // futuras (ya suscrito) esto nunca se pone porque Paywall.onSubscribed
  // solo se dispara al pasar por el gate de abajo.
  const [justSubscribedPlan, setJustSubscribedPlan] = useState<'annual' | 'monthly' | null>(null);

  // Bandera para abrir el paywall manualmente desde Configuración / Perfil,
  // ignorando la suscripción actual o el estado de los tutoriales.
  const [forceShowPaywall, setForceShowPaywall] = useState(false);

  useEffect(() => {
    // Si no hay sesión, no hay nada que bloquear.
    // IMPORTANTE: cuando pockets.length === 0 NO ponemos tourFlowPending=false
    // porque el gate de onboarding ya bloquea el paywall en ese caso. Si lo
    // ponemos en false aquí, cuando los bolsillos aparecen hay un render
    // fugaz con tourFlowPending=false (antes de que el effect corra de nuevo)
    // y el paywall se cuela justo al terminar el onboarding.
    if (!session?.user?.id) {
      setTourFlowPending(false);
      return;
    }
    if (pockets.length === 0) return; // El gate de onboarding ya se encarga
    // Bloquea el paywall por defecto apenas hay bolsillos -- si no, queda
    // en el valor (probablemente false) que tenía de la rama de arriba
    // hasta que el check async de abajo resuelva, y en esa ventana el
    // paywall se puede abrir de golpe encima del tutorial.
    setTourFlowPending(true);
    let cancelled = false;
    const check = async () => {
      const [magicPending, demoInProgress] = await Promise.all([
        AsyncStorage.getItem('@save_magic_tour_pending'),
        AsyncStorage.getItem('@save_demo_in_progress'),
      ]);
      const pending = magicPending === 'true' || demoInProgress === 'true';
      if (!cancelled) setTourFlowPending(pending);
      return pending;
    };
    check();
    const interval = setInterval(async () => {
      await check();
    }, 1500);

    const demoSub = DeviceEventEmitter.addListener('demo_completed', () => {
      if (!cancelled) setTourFlowPending(false);
    });

    return () => { 
      cancelled = true; 
      clearInterval(interval); 
      demoSub.remove();
    };
  }, [session?.user?.id, pockets.length]);

  const handleShowChatChange = (val: boolean) => {
    setShowChat(val);
    if (!val) {
      setChatInitialMessage(undefined);
    }
  };

  const openChatWithContext = (msg?: string) => {
    setChatInitialMessage(msg);
    setClearChatOnOpen(true); // Siempre borrar si venimos desde un botón de contexto (ej. Dashboard)
    setShowChat(true);
  };

  useEffect(() => {
    if (typeof QuickActions.setItems === 'function') {
      try {
        QuickActions.setItems([
          {
            title: 'Abrir Escáner',
            subtitle: 'Escanear recibo con cámara',
            icon: 'capture',
            id: 'open_scanner'
          },
          {
            title: 'Registrar gasto',
            subtitle: 'Ingresar gasto manualmente',
            icon: 'compose',
            id: 'quick_expense'
          }
        ]);
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    const handleInitialAction = async () => {
      try {
        const initialAction = QuickActions.initial;
        // initialAction might be a function in some versions or just a property.
        // The type definition says it's an object/property, but some docs say it's a function.
        // If it's a getter, accessing it gets the value.
        // To be safe against crashes:
        const action = typeof QuickActions.initial === 'function' ? await (QuickActions.initial as any)() : QuickActions.initial;
        if (action?.id === 'open_scanner') {
          setCurrentScreen('scanner');
        } else if (action?.id === 'quick_expense') {
          setCurrentScreen('quick_expense');
        }
      } catch (e) {
        console.warn('QuickActions error:', e);
      }
    };

    // Solo manejamos la acción si el usuario ya está autenticado o la data se está cargando
    // Esto se ejecutará cada vez que la app monte
    handleInitialAction();

    let sub: any = null;
    if (typeof QuickActions.addListener === 'function') {
      sub = QuickActions.addListener((action) => {
        if (action.id === 'open_scanner') {
          setCurrentScreen('scanner');
        } else if (action.id === 'quick_expense') {
          setCurrentScreen('quick_expense');
        }
      });
    }

    return () => sub?.remove();
  }, []);

  // app/auth/callback.tsx procesa el link de recuperación y deja la
  // bandera acá antes de hacer router.replace('/') -- ese replace
  // desmonta la pantalla de callback (pierde su estado local) y vuelve
  // a montar este componente desde cero, así que la única forma de que
  // el gate de "elige tu nueva contraseña" sobreviva el salto es leerla
  // de AsyncStorage al montar, no de un estado en memoria.
  useEffect(() => {
    AsyncStorage.getItem('@save_password_recovery_pending').then((pending) => {
      if (pending === 'true') {
        setPasswordRecoverySession(true);
        AsyncStorage.removeItem('@save_password_recovery_pending');
      }
    });
  }, []);

  // Nuevo bloque para manejar Deep Links (Para los Widgets de Apple Shortcuts)
  // NOTA: "auth/callback" ya NO se maneja acá -- tiene su propia ruta de
  // expo-router en app/auth/callback.tsx. Sin esa ruta, expo-router
  // interceptaba el link antes que este listener y mostraba "Unmatched
  // Route" (404) en vez de dejar procesar el link.
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;

      if (url.includes('scanner')) {
        setCurrentScreen('scanner');
      } else if (url.includes('quick_expense')) {
        setCurrentScreen('quick_expense');
      } else if (url.includes('add_income')) {
        setCurrentScreen('add_income');
      }
    };

    // Revisar la URL inicial si la app estaba cerrada
    Linking.getInitialURL().then(handleUrl);

    // Escuchar cambios en la URL si la app ya está abierta en segundo plano
    const subscription = Linking.addEventListener('url', (e) => handleUrl(e.url));

    return () => subscription.remove();
  }, []);

  // Recordatorios locales (mañana + noche) -- se piden/programan una sola
  // vez por instalación, apenas el usuario ya pasó el onboarding (tiene
  // bolsillos). Pedir el permiso en frío antes de esto no tiene contexto;
  // acá el usuario ya sabe qué es Save.
  useEffect(() => {
    if (session?.user?.id && pockets.length > 0) {
      ensureDailyReminders().catch((e) => console.error('[notifications] setup error:', e));
    }
  }, [session?.user?.id, pockets.length]);

  // Optimistic update: cuando Pockets crea un nuevo bolsillo, lo agrega
  // inmediatamente al array local para que se vea en pantalla sin reiniciar.
  // onRefresh() luego confirmará/sobreescribirá con los datos reales del servidor.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('pocket_created', (newPocket: any) => {
      if (newPocket?.id) {
        setPockets((prev: any[]) => {
          // Evitar duplicados si onRefresh ya actualizó antes del evento
          if (prev.some(p => p.id === newPocket.id)) return prev;
          return [...prev, newPocket];
        });
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setIsInitializing(false);
    }).catch(() => setIsInitializing(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        setTransactions([]);
        setPockets([]);
        setIsDataReady(false);
        setIsFetchingData(false);
        setCurrentScreen('dashboard');

        // Clear local flags so new logins start fresh
        AsyncStorage.multiRemove([
          '@save_intro_tour_completed',
          '@save_magic_tour_pending',
          '@save_demo_in_progress',
          '@save_demo_dashboard_tour_seen',
          'tour_dashboard_done',
          'tour_action_menu_done',
          'tour_scanner_done',
          'tour_addincome_toggle_done'
        ]).catch(() => {});
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      loadUserData(session.user.id);
    } else if (!isInitializing) {
      // If no session and not initializing, we point to something safe or let renderScreen handle it
      setCurrentScreen(null);
    }
  }, [session?.user?.id, isInitializing]);

  const loadUserData = async (userId: string) => {
    if (!userId) return;
    setIsFetchingData(true);
    clearCycleCaches();
    DeviceEventEmitter.emit('force_dashboard_refresh');
    try {
      const activeAccessToken = session?.access_token || '';
      const strictClient = activeAccessToken ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${activeAccessToken}` } }
      }) : supabase;

      const [txRes, pkRes] = await Promise.all([
        strictClient.from('transactions').select('*').order('created_at', { ascending: false }),
        strictClient.from('pockets').select('*').order('name')
      ]);

      if (txRes.data) {
        // Limpieza automática de gastos demo huérfanos: si el flujo demo
        // no está activo (no hay @save_demo_in_progress) y quedan
        // transacciones con is_demo:true, se revierten con la misma RPC
        // que usa el cierre normal del tour (delete_transaction_with_reversal).
        // Un DELETE crudo borra la fila pero deja el bolsillo con el
        // presupuesto ya descontado para siempre, sin ninguna transacción
        // que lo explique -- por eso NO se usa `.delete()` directo acá.
        const demoInProgress = await AsyncStorage.getItem('@save_demo_in_progress');
        if (demoInProgress !== 'true') {
          const demoTxs = (txRes.data as any[]).filter((t: any) => t.metadata?.is_demo);
          if (demoTxs.length > 0) {
            const reversedIds = new Set<string>();
            await Promise.all(demoTxs.map(async (t: any) => {
              const { error } = await strictClient.rpc('delete_transaction_with_reversal', {
                p_tx_id: t.id,
                p_user_id: userId,
              });
              if (error) {
                console.error('[loadUserData] No se pudo revertir gasto demo huérfano:', t.id, error);
                return;
              }
              reversedIds.add(t.id);
            }));
            // Solo filtramos del array local lo que sí se revirtió en el
            // servidor -- si la RPC falló para alguno, se queda visible
            // hasta el próximo intento en vez de desaparecer sin revertir.
            txRes.data = (txRes.data as any[]).filter((t: any) => !reversedIds.has(t.id));
          }
        }
        setTransactions(txRes.data);
      }
      if (pkRes.data) {
        setPockets(pkRes.data);
        // ROUTING LOGIC: If new user (no pockets), go to onboarding or intro tour. Else, dashboard (only if no screen is already set by deep link).
        if (pkRes.data.length === 0) {
          const introDone = await AsyncStorage.getItem('@save_intro_tour_completed');
          if (introDone === 'true') {
            setCurrentScreen('onboarding');
          } else {
            setCurrentScreen('intro_tour');
          }
        } else {
          setCurrentScreen((prev) => {
            if (!prev || prev === 'onboarding' || prev === 'intro_tour') return 'dashboard';
            return prev; // Preserve 'scanner' or other screens if set by deep link
          });
        }
      } else {
        // Fallback for edge cases
        setCurrentScreen('dashboard');
      }

      setIsDataReady(true);
    } catch (error) {
      console.error('Data load error:', error);
      setIsDataReady(true);
      setCurrentScreen('dashboard');
    } finally {
      setIsFetchingData(false);
    }
  };

  const toggleActionMenu = (show: boolean) => {
    if (show) {
      setActionMenuVisible(true);
      AsyncStorage.getItem('tour_action_menu_done').then(done => {
        if (!done) {
          // FIX: antes esto se saltaba si '@save_magic_tour_pending' seguía
          // en 'true', con la idea de "el magic_tour se encarga". Pero
          // Dashboard borra esa bandera apenas la lee (antes de que el
          // usuario pueda llegar a tocar el +), así que la condición nunca
          // se cumplía de verdad y el tour de los 3 botones dependía de una
          // carrera de tiempos poco confiable. Ahora se dispara de forma
          // directa la primera vez que alguien abre el menú +, sin importar
          // si acaba de pasar por el tour de bienvenida o no.
          AsyncStorage.setItem('tour_action_menu_done', 'true');
          Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
            Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 10, useNativeDriver: true })
          ]).start();
          setTimeout(() => {
            startTour([
              {
                name: 'action_income',
                title: 'Entró Plata',
                description: 'Registra aquí tu sueldo, pagos o cualquier dinero que te entre. Save lo repartirá en tus bolsillos automáticamente.',
                iconName: 'TrendingUp',
                order: 1
              },
              {
                name: 'action_expense',
                title: 'Registrar gasto',
                description: 'Para esos pequeños gastos del día a día (un café, el bus, una propina). Simple y rápido.',
                iconName: 'Zap',
                order: 2
              },
              {
                name: 'action_scan',
                title: 'Escanear Recibo',
                description: 'Nuestra función estrella. Toma una foto a cualquier factura y la IA organiza el gasto por ti.',
                iconName: 'Camera',
                order: 3
              }
            ]);
          }, 300);
        } else {
          Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
            Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 10, useNativeDriver: true })
          ]).start();
        }
      });
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 300, duration: 200, useNativeDriver: true })
      ]).start(() => setActionMenuVisible(false));
    }
  };

  const [showPocketTransfer, setShowPocketTransfer] = useState(false);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('force_show_intro_tour', () => {
      setCurrentScreen('intro_tour');
    });
    return () => sub.remove();
  }, []);

  const triggerTransfer = (params: { fromId?: string, toId?: string, amount?: number }) => {
    setTransferParams(params);
    setShowPocketTransfer(true);
  };

    const renderScreen = () => {
    switch (currentScreen) {
      case 'dashboard': return <Dashboard transactions={transactions} pockets={pockets} session={session} isDataReady={isDataReady} onOpenScanner={() => setCurrentScreen('quick_expense')} onOpenScannerDemo={() => setCurrentScreen('demo_scanner')} onViewAll={() => setCurrentScreen('expenses')} onOpenChat={openChatWithContext} onDevPreviewPurchaseConfirmation={__DEV__ ? () => setJustSubscribedPlan('annual') : undefined} onRefresh={handleGlobalRefresh} isLoading={isRefreshing} onAddIncome={() => setCurrentScreen('add_income')} />;
      case 'scanner': return <Scanner onGoBack={() => setCurrentScreen('dashboard')} session={session} pockets={pockets} onSaveSuccess={() => { loadUserData(session?.user?.id); setCurrentScreen('expenses'); }} initialMode="camera" />;
      case 'quick_expense': return <Scanner onGoBack={() => setCurrentScreen('dashboard')} session={session} pockets={pockets} onSaveSuccess={() => { loadUserData(session?.user?.id); setCurrentScreen('expenses'); }} initialMode="manual" />;
      case 'demo_scanner': return <Scanner onGoBack={async () => { await AsyncStorage.removeItem('@save_demo_in_progress'); setCurrentScreen('dashboard'); }} session={session} pockets={pockets} onSaveSuccess={() => { loadUserData(session?.user?.id); setCurrentScreen('dashboard'); }} initialMode="demo" />;
      case 'expenses':
        return <Expenses
          transactions={transactions}
          pockets={pockets}
          session={session}
          onRefresh={handleGlobalRefresh}
          isRefreshing={isRefreshing}
          onEditIncome={(tx) => {
            setEditIncomeTx(tx);
            setCurrentScreen('add_income');
          }}
        />;
      case 'pockets': return <Pockets session={session} pockets={pockets} transactions={transactions} onRefresh={handleGlobalRefresh} isRefreshing={isRefreshing} onTransferPress={triggerTransfer} />;
      case 'history': return <HistoryScreen onRefresh={handleGlobalRefresh} isRefreshing={isRefreshing} />;
      case 'profile_details': return <Profile session={session} transactions={transactions} pockets={pockets} onRefresh={() => loadUserData(session!.user.id)} onBack={() => setCurrentScreen('dashboard')} onOpenPaywall={() => setForceShowPaywall(true)} />;
      case 'add_income':
        return <AddIncome pockets={pockets} session={session} onCancel={() => setCurrentScreen('dashboard')} onSaveSuccess={async () => { await loadUserData(session!.user.id); setCurrentScreen('dashboard'); setEditIncomeTx(null); }} editTransaction={editIncomeTx} />;
      case 'intro_tour': return <IntroTour onComplete={async () => { await AsyncStorage.setItem('@save_intro_tour_completed', 'true'); setCurrentScreen('onboarding'); }} userName={session?.user?.user_metadata?.full_name} />;
      default: return <Dashboard transactions={transactions} pockets={pockets} session={session} isDataReady={isDataReady} onOpenScanner={() => setCurrentScreen('scanner')} onViewAll={() => setCurrentScreen('expenses')} onOpenChat={openChatWithContext} onRefresh={handleGlobalRefresh} isLoading={isRefreshing} onAddIncome={() => setCurrentScreen('add_income')} />;
    }
  };

  // Pantallas a pantalla completa (Splash o Auth)
  if (isInitializing || !minSplashTimeElapsed || (session && !isDataReady)) {
    return <SplashScreen />;
  }

  // Gate de recuperación de contraseña: tiene prioridad sobre todo lo demás
  // (incluso sobre una sesión ya válida -- setSession() de arriba deja una
  // sesión activa con la contraseña VIEJA todavía vigente; no queremos que
  // el usuario caiga directo al Dashboard sin haber elegido una nueva).
  if (passwordRecoverySession) {
    return (
      <ResetPassword
        onDone={() => {
          // Después de cambiar la contraseña, entra directo a Perfil en
          // vez del Dashboard por defecto -- así queda claro que el
          // cambio se maneja ahí, reforzando el "Cambiar contraseña" que
          // ya existe en esa pantalla para la próxima vez.
          setCurrentScreen('profile_details');
          setPasswordRecoverySession(false);
        }}
      />
    );
  }

  if (!session) {
    return <Auth onLoginSuccess={() => {}} />;
  }

  // 1. GATE DE ONBOARDING: Bloqueo absoluto si no hay bolsillos.
  // Excepción: si currentScreen es 'intro_tour', dejamos pasar al IntroTour
  // para que se muestre ANTES del onboarding en una instalación nueva.
  if (pockets.length === 0 && currentScreen !== 'intro_tour') {
    return <Onboarding session={session} onComplete={() => loadUserData(session?.user?.id)} />;
  }

  // 2. GATE DE PAYWALL: Aparece DESPUÉS del Onboarding y DESPUÉS del tutorial.
  // También bloqueamos mientras estamos en 'demo_scanner', 'intro_tour' u
  // 'onboarding' para evitar que el paywall aparezca antes de que el usuario
  // termine cualquier parte del flujo de bienvenida. Esto es defensa en
  // profundidad: tourFlowPending ya debería cubrirlo, pero si hay algún
  // race condition donde se resuelve a false prematuramente, estas exclusiones
  // de pantalla son la última línea de defensa.
  if (forceShowPaywall || (!subLoading && !isSubscribed && !devPaywallBypass && !tourFlowPending && !tourActive && currentScreen !== 'demo_scanner' && currentScreen !== 'intro_tour' && currentScreen !== 'onboarding')) {
    return (
      <Paywall
        onSubscribed={(plan) => { setJustSubscribedPlan(plan); setForceShowPaywall(false); }}
        onLogout={async () => { await supabase.auth.signOut(); }}
        onDevSkip={__DEV__ ? () => { setDevPaywallBypass(true); setForceShowPaywall(false); } : undefined}
        onClose={forceShowPaywall ? () => setForceShowPaywall(false) : undefined}
      />
    );
  }

  // 3. Celebración post-compra: una sola vez, justo al salir del gate de arriba.
  if (justSubscribedPlan) {
    return <PurchaseConfirmation plan={justSubscribedPlan} onContinue={() => setJustSubscribedPlan(null)} />;
  }

  // Fallback si no hay currentScreen después de pasar todos los gates
  if (!currentScreen) {
    return <SplashScreen />;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      {currentScreen !== 'scanner' && currentScreen !== 'quick_expense' && currentScreen !== 'demo_scanner' && currentScreen !== 'add_income' && currentScreen !== 'intro_tour' && (
        <TopBar
          title={currentScreen === 'dashboard' ? 'Save' : currentScreen === 'expenses' ? 'Movimientos' : currentScreen === 'pockets' ? 'Bolsillos' : 'Perfil'}
          userName={session.user?.user_metadata?.full_name || session.user?.user_metadata?.name}
          userAvatar={session.user?.user_metadata?.avatar_url || session.user?.user_metadata?.picture}
          userId={session.user?.id}
          transactions={transactions}
          pockets={pockets}
          showChat={showChat}
          onShowChatChange={handleShowChatChange}
          initialMessage={chatInitialMessage}
          clearHistoryOnOpen={clearChatOnOpen}
          onHistoryCleared={() => setClearChatOnOpen(false)}
          onAvatarPress={() => setCurrentScreen('profile_details')}
        />
      )}

      <View style={styles.mainArea}>
        {renderScreen()}
      </View>

      {currentScreen !== 'scanner' && currentScreen !== 'quick_expense' && currentScreen !== 'add_income' && currentScreen !== 'intro_tour' && currentScreen !== 'onboarding' && (
        <BottomNav activeScreen={currentScreen} setScreen={(s: any) => setCurrentScreen(s)} onAddPress={() => toggleActionMenu(true)} onAddLongPress={() => setCurrentScreen('scanner')} />
      )}

      {actionMenuVisible && (
        <Animated.View style={[styles.actionMenu, { opacity: fadeAnim }]}>
           <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => toggleActionMenu(false)} />
           <Animated.View style={[styles.menuContent, { transform: [{ translateY: slideAnim }], backgroundColor: theme.colors.background }]}>
              <View style={[styles.menuHandle, { backgroundColor: theme.colors.divider }]} />
              <Text style={[styles.menuTitle, { color: theme.colors.onSurface }]}>¿Qué quieres hacer?</Text>

              <View style={[styles.menuGrid, { flexWrap: 'wrap', justifyContent: 'center' }]}>
                 <TourStep name="action_income">
                   <TouchableOpacity activeOpacity={0.8} style={[styles.menuItem, { width: '45%', marginBottom: 16 }]} onPress={() => { toggleActionMenu(false); setCurrentScreen('add_income'); }}>
                      <View style={[styles.menuIcon, { backgroundColor: (theme.colors as any).pastel.teal + '25' }]}><TrendingUp size={28} color={(theme.colors as any).pastel.teal} /></View>
                      <Text style={[styles.menuLabel, { color: theme.colors.onSurface }]}>Entró Plata</Text>
                   </TouchableOpacity>
                 </TourStep>

                 <TourStep name="action_expense">
                   <TouchableOpacity activeOpacity={0.8} style={[styles.menuItem, { width: '45%', marginBottom: 16 }]} onPress={() => { toggleActionMenu(false); setCurrentScreen('quick_expense'); }}>
                      <View style={[styles.menuIcon, { backgroundColor: (theme.colors as any).pastel.salmon + '25' }]}><Zap size={28} color={(theme.colors as any).pastel.salmon} /></View>
                      <Text style={[styles.menuLabel, { color: theme.colors.onSurface }]}>Registrar gasto</Text>
                   </TouchableOpacity>
                 </TourStep>

                 <TourStep name="action_scan">
                   <TouchableOpacity activeOpacity={0.8} style={[styles.menuItem, { width: '45%' }]} onPress={() => { toggleActionMenu(false); setCurrentScreen('scanner'); }}>
                      <View style={[styles.menuIcon, { backgroundColor: theme.colors.primaryContainer }]}><Camera size={28} color={theme.colors.primary} /></View>
                      <Text style={[styles.menuLabel, { color: theme.colors.onSurface }]}>Escanear Recibo</Text>
                   </TouchableOpacity>
                 </TourStep>
              </View>

              <TouchableOpacity style={[styles.closeMenu, { backgroundColor: theme.colors.surface }]} onPress={() => toggleActionMenu(false)}>
                 <Text style={[styles.closeMenuTxt, { color: theme.colors.onSurfaceVariant }]}>Cancelar</Text>
              </TouchableOpacity>
            </Animated.View>
         </Animated.View>
       )}

       {showPocketTransfer && (
         <PocketTransfer
           session={session}
           pockets={pockets}
           initialParams={transferParams ?? undefined}
           onCancel={() => { setTransferParams(null); setShowPocketTransfer(false); }}
           onSaveSuccess={() => { setTransferParams(null); setShowPocketTransfer(false); loadUserData(session!.user.id); }}
         />
       )}

       {/* TourOverlay va aquí dentro -- así SOLO renderiza cuando el main app
           está activo. Si está fuera (en App()), se dibuja encima de TODO:
           Paywall, Auth, Onboarding -- causando el tour encima del Paywall. */}
       <TourOverlay />
    </View>
  );
}

export default function App() {
  const [session, setSession] = useState<any>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => setSession(currentSession));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider userId={session?.user?.id}>
        <CurrencyProvider userId={session?.user?.id}>
          <SubscriptionProvider userId={session?.user?.id}>
            <TourProvider>
              <MainApp />
            </TourProvider>
          </SubscriptionProvider>
        </CurrencyProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  mainArea: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  loadingText: { marginTop: 16, fontWeight: '800', textAlign: 'center' },
  actionMenu: { ...StyleSheet.absoluteFillObject, zIndex: 1000 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  menuContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    padding: 32,
    paddingBottom: Platform.OS === 'ios' ? 60 : 40,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)'
  },
  menuHandle: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 24, opacity: 0.5 },
  menuTitle: { fontSize: 20, fontWeight: '900', marginBottom: 32, textAlign: 'center', letterSpacing: -0.5 },
  menuGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 40 },
  menuItem: { flex: 1, alignItems: 'center' },
  menuIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  menuLabel: { fontSize: 13, fontWeight: '900', textAlign: 'center', letterSpacing: -0.2 },
  closeMenu: { paddingVertical: 18, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  closeMenuTxt: { fontSize: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 }
});
