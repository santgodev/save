import React, { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, Platform, Image } from 'react-native';
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
import { Onboarding } from '../src/screens/Onboarding';
import { AddIncome } from '../src/screens/AddIncome';
import { PocketTransfer } from '../src/screens/PocketTransfer';
import { Camera, X, Repeat, TrendingUp, Sparkles, Zap } from 'lucide-react-native';
import { TourProvider, useTour } from '../src/components/tour/TourContext';
import { TourStep } from '../src/components/tour/TourStep';
import { DeviceEventEmitter } from 'react-native';
import { TourOverlay } from '../src/components/tour/TourOverlay';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  "“El sabio guarda sus provisiones.” — Proverbios 21:20"
];

const SplashScreen = () => {
  const { theme } = useTheme();
  
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
    <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
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
  const [isDataReady, setIsDataReady] = useState(false);
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [minSplashTimeElapsed, setMinSplashTimeElapsed] = useState(false);
  
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatInitialMessage, setChatInitialMessage] = useState<string | undefined>(undefined);
  const [clearChatOnOpen, setClearChatOnOpen] = useState(false);

  useEffect(() => {
    // Aumentamos a 3800ms para que el usuario pueda leer el slogan/proverbio completo
    const timer = setTimeout(() => {
      setMinSplashTimeElapsed(true);
    }, 3800);
    return () => clearTimeout(timer);
  }, []);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(300)).current;
  const { startTour } = useTour();

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
            title: 'Gasto Rápido',
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

  // Nuevo bloque para manejar Deep Links (Para los Widgets de Apple Shortcuts)
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
        setTransactions(txRes.data);
        // Debugging for Vivienda
        const viviendaTxs = txRes.data.filter(t => t.category === 'Vivienda');
        console.log('--- DEBUG VIVIENDA ---');
        console.log('Pocket:', pkRes.data?.find(p => p.category === 'Vivienda'));
        console.log('Transactions:', viviendaTxs.map(t => ({ id: t.id, date: t.date_string, merchant: t.merchant, amount: t.amount, created_at: t.created_at })));
        console.log('----------------------');
      }
      if (pkRes.data) {
        setPockets(pkRes.data);
        // ROUTING LOGIC: If new user (no pockets), go to onboarding. Else, dashboard (only if no screen is already set by deep link).
        if (pkRes.data.length === 0) {
          setCurrentScreen('onboarding');
        } else {
          setCurrentScreen((prev) => {
            if (!prev || prev === 'onboarding') return 'dashboard';
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
          AsyncStorage.getItem('@save_magic_tour_pending').then(magicPending => {
            if (magicPending === 'true') return; // el magic_tour se encarga
            AsyncStorage.setItem('tour_action_menu_done', 'true');
            Animated.parallel([
              Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
              Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 10, useNativeDriver: true })
            ]).start(() => {
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
                    title: 'Gasto Rápido',
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
              }, 100);
            });
          });
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

  const triggerTransfer = (params: { fromId?: string, toId?: string, amount?: number }) => {
    setTransferParams(params);
    setShowPocketTransfer(true);
  };

    const renderScreen = () => {
    switch (currentScreen) {
      case 'dashboard': return <Dashboard transactions={transactions} pockets={pockets} session={session} isDataReady={isDataReady} onOpenScanner={() => setCurrentScreen('quick_expense')} onOpenScannerDemo={() => setCurrentScreen('demo_scanner')} onViewAll={() => setCurrentScreen('expenses')} onOpenChat={openChatWithContext} />;
      case 'scanner': return <Scanner onGoBack={() => setCurrentScreen('dashboard')} session={session} pockets={pockets} onSaveSuccess={() => { loadUserData(session?.user?.id); setCurrentScreen('expenses'); }} initialMode="camera" />;
      case 'quick_expense': return <Scanner onGoBack={() => setCurrentScreen('dashboard')} session={session} pockets={pockets} onSaveSuccess={() => { loadUserData(session?.user?.id); setCurrentScreen('expenses'); }} initialMode="manual" />;
      case 'demo_scanner': return <Scanner onGoBack={() => setCurrentScreen('dashboard')} session={session} pockets={pockets} onSaveSuccess={() => { loadUserData(session?.user?.id); setCurrentScreen('dashboard'); }} initialMode="demo" />;
      case 'expenses':
        return <Expenses 
          transactions={transactions} 
          pockets={pockets} 
          session={session} 
          onRefresh={() => loadUserData(session!.user.id)}
          onEditIncome={(tx) => {
            setEditIncomeTx(tx);
            setCurrentScreen('add_income');
          }}
        />;
      case 'pockets': return <Pockets session={session} pockets={pockets} transactions={transactions} onRefresh={() => loadUserData(session!.user.id)} onTransferPress={triggerTransfer} />;
      case 'history': return <HistoryScreen />;
      case 'profile_details': return <Profile session={session} transactions={transactions} pockets={pockets} onRefresh={() => loadUserData(session!.user.id)} onBack={() => setCurrentScreen('dashboard')} />;
      case 'add_income':
        return <AddIncome pockets={pockets} session={session} onCancel={() => setCurrentScreen('dashboard')} onSaveSuccess={() => { setCurrentScreen('dashboard'); loadUserData(session!.user.id); setEditIncomeTx(null); }} editTransaction={editIncomeTx} />;
      case 'onboarding': return <Onboarding session={session} onComplete={() => loadUserData(session?.user?.id)} />;
      default: return <Dashboard transactions={transactions} pockets={pockets} session={session} isDataReady={isDataReady} onOpenScanner={() => setCurrentScreen('scanner')} onViewAll={() => setCurrentScreen('expenses')} onOpenChat={openChatWithContext} />;
    }
  };

  // Pantallas a pantalla completa (Splash o Auth)
  if (isInitializing || !minSplashTimeElapsed || (session && (!isDataReady || !currentScreen))) {
    return <SplashScreen />;
  }

  if (!session) {
    return <Auth onLoginSuccess={() => {}} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {currentScreen !== 'scanner' && currentScreen !== 'quick_expense' && currentScreen !== 'demo_scanner' && currentScreen !== 'onboarding' && currentScreen !== 'add_income' && (
        <TopBar 
          title={currentScreen === 'dashboard' ? 'Save' : currentScreen === 'expenses' ? 'Movimientos' : currentScreen === 'pockets' ? 'Bolsillos' : 'Perfil'}
          userName={session.user?.user_metadata?.full_name || session.user?.user_metadata?.name || session.user?.email?.split('@')[0]}
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

      {session && isDataReady && currentScreen && currentScreen !== 'scanner' && currentScreen !== 'quick_expense' && currentScreen !== 'onboarding' && currentScreen !== 'add_income' && (
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
                      <Text style={[styles.menuLabel, { color: theme.colors.onSurface }]}>Gasto Rápido</Text>
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
          <TourProvider>
            <MainApp />
            <TourOverlay />
          </TourProvider>
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
