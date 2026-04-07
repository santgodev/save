import React, { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from '../src/lib/supabase';
import { INITIAL_POCKETS, SUPABASE_URL, SUPABASE_ANON_KEY } from '../src/constants';
import { getTheme } from '../src/theme/theme';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';
import { Screen } from '../src/types';
import { RealtimeChannel, createClient } from '@supabase/supabase-js';

// Components & Screens
import { TopBar } from '../src/components/TopBar';
import { BottomNav } from '../src/components/BottomNav';
import { Dashboard } from '../src/screens/Dashboard';
import { Scanner } from '../src/screens/Scanner';
import { Expenses } from '../src/screens/Expenses';
import { Pockets } from '../src/screens/Pockets';
import { Profile } from '../src/screens/Profile';
import { Auth } from '../src/screens/Auth';
import { Onboarding } from '../src/screens/Onboarding';
import { AddIncome } from '../src/screens/AddIncome';
import { PocketTransfer } from '../src/screens/PocketTransfer';
import { Camera, X, Repeat, TrendingUp, Sparkles } from 'lucide-react-native';

const { width, height } = Dimensions.get('window');

function MainApp() {
  const { theme } = useTheme();
  // Changed initial state to null to prevent flashing Dashboard on slow loads/first login
  const [currentScreen, setCurrentScreen] = useState<Screen | null>(null);
  const [transferParams, setTransferParams] = useState<{ fromId?: string, amount?: number } | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [pockets, setPockets] = useState<any[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [isDataReady, setIsDataReady] = useState(false);
  const [isFetchingData, setIsFetchingData] = useState(false);
  
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(300)).current;

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
    try {
      const activeAccessToken = session?.access_token || '';
      const strictClient = activeAccessToken ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${activeAccessToken}` } }
      }) : supabase;

      const [txRes, pkRes] = await Promise.all([
        strictClient.from('transactions').select('*').order('created_at', { ascending: false }),
        strictClient.from('pockets').select('*').order('name')
      ]);

      if (txRes.data) setTransactions(txRes.data);
      if (pkRes.data) {
        setPockets(pkRes.data);
        // ROUTING LOGIC: If new user (no pockets), go to onboarding. Else, dashboard.
        if (pkRes.data.length === 0) {
          setCurrentScreen('onboarding');
        } else if (!currentScreen || currentScreen === 'onboarding') {
          setCurrentScreen('dashboard');
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
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 10, useNativeDriver: true })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 300, duration: 200, useNativeDriver: true })
      ]).start(() => setActionMenuVisible(false));
    }
  };

  const triggerTransfer = (params: { fromId?: string, amount?: number }) => {
    setTransferParams(params);
    setCurrentScreen('pocket_transfer');
  };

  const renderScreen = () => {
    // 1. Initial boot or session authentication in progress
    if (isInitializing) {
      return (
        <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.onSurfaceVariant }]}>Preparando tu experiencia Premium...</Text>
        </View>
      );
    }

    // 2. Not logged in -> Show Auth
    if (!session) return <Auth onLoginSuccess={() => loadUserData(session?.user?.id)} />;

    // 3. Logged in but data not yet synced -> Premium Loading
    if (!isDataReady || !currentScreen) {
      return (
        <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
           <View style={{ backgroundColor: theme.colors.primary + '10', padding: 24, borderRadius: 100, marginBottom: 20 }}>
              <Sparkles size={48} color={theme.colors.primary} />
           </View>
          <Text style={[styles.loadingText, { color: theme.colors.onSurface, fontSize: 18, fontWeight: '900' }]}>Blindando tus Datos</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700', marginTop: 4 }}>Sincronizando con la red...</Text>
        </View>
      );
    }

    // 4. Data ready -> Show appropriate screen
    switch (currentScreen) {
      case 'dashboard': return <Dashboard transactions={transactions} pockets={pockets} session={session} isDataReady={isDataReady} onOpenScanner={() => setCurrentScreen('scanner')} />;
      case 'scanner': return <Scanner onGoBack={() => setCurrentScreen('dashboard')} session={session} pockets={pockets} onSaveSuccess={() => { loadUserData(session?.user?.id); setCurrentScreen('expenses'); }} />;
      case 'expenses': return <Expenses transactions={transactions} session={session} pockets={pockets} onRefresh={() => loadUserData(session!.user.id)} />;
      case 'pockets': return <Pockets session={session} pockets={pockets} transactions={transactions} onRefresh={() => loadUserData(session!.user.id)} onTransferPress={triggerTransfer} />;
      case 'profile': return <Profile session={session} transactions={transactions} pockets={pockets} onRefresh={() => loadUserData(session!.user.id)} />;
      case 'add_income': return <AddIncome session={session} pockets={pockets} onCancel={() => setCurrentScreen('dashboard')} onSaveSuccess={() => { loadUserData(session?.user?.id); setCurrentScreen('dashboard'); }} />;
      case 'pocket_transfer': return <PocketTransfer session={session} pockets={pockets} initialParams={transferParams ?? undefined} onCancel={() => { setTransferParams(null); setCurrentScreen('pockets'); }} onSaveSuccess={() => { setTransferParams(null); loadUserData(session!.user.id); setCurrentScreen('pockets'); }} />;
      case 'onboarding': return <Onboarding session={session} onComplete={() => loadUserData(session?.user?.id)} />;
      default: return <Dashboard transactions={transactions} pockets={pockets} session={session} isDataReady={isDataReady} onOpenScanner={() => setCurrentScreen('scanner')} />;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {currentScreen !== 'scanner' && currentScreen !== 'onboarding' && currentScreen !== 'add_income' && !isInitializing && session && isDataReady && currentScreen && (
        <TopBar 
          title={currentScreen === 'dashboard' ? 'Save' : currentScreen === 'expenses' ? 'Movimientos' : currentScreen === 'pockets' ? 'Bolsillos' : 'Perfil'}
          userName={session.user?.user_metadata?.full_name || session.user?.user_metadata?.name || session.user?.email?.split('@')[0]}
          userAvatar={session.user?.user_metadata?.avatar_url || session.user?.user_metadata?.picture}
        />
      )}

      <View style={styles.mainArea}>
        {renderScreen()}
      </View>

      {session && isDataReady && currentScreen && currentScreen !== 'scanner' && currentScreen !== 'onboarding' && currentScreen !== 'add_income' && currentScreen !== 'pocket_transfer' && (
        <BottomNav activeScreen={currentScreen} setScreen={(s: any) => setCurrentScreen(s)} onAddPress={() => toggleActionMenu(true)} />
      )}

      {actionMenuVisible && (
        <Animated.View style={[styles.actionMenu, { opacity: fadeAnim }]}>
           <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => toggleActionMenu(false)} />
           <Animated.View style={[styles.menuContent, { transform: [{ translateY: slideAnim }], backgroundColor: theme.colors.surface }]}>
              <View style={[styles.menuHandle, { backgroundColor: theme.colors.outlineVariant }]} />
              <Text style={[styles.menuTitle, { color: theme.colors.onSurface }]}>Centro de Comando</Text>
              
              <View style={styles.menuGrid}>
                 <TouchableOpacity activeOpacity={0.8} style={styles.menuItem} onPress={() => { toggleActionMenu(false); setCurrentScreen('add_income'); }}>
                    <View style={[styles.menuIcon, { backgroundColor: theme.colors.primaryContainer + '40' }]}><TrendingUp size={28} color={theme.colors.primary} /></View>
                    <Text style={[styles.menuLabel, { color: theme.colors.onSurface }]}>Inyectar Capital</Text>
                 </TouchableOpacity>

                 <TouchableOpacity activeOpacity={0.8} style={styles.menuItem} onPress={() => { toggleActionMenu(false); setCurrentScreen('scanner'); }}>
                    <View style={[styles.menuIcon, { backgroundColor: theme.colors.secondaryContainer + '40' }]}><Camera size={28} color={theme.colors.secondary} /></View>
                    <Text style={[styles.menuLabel, { color: theme.colors.onSurface }]}>Auditoría Directa</Text>
                 </TouchableOpacity>

                 <TouchableOpacity activeOpacity={0.8} style={styles.menuItem} onPress={() => { toggleActionMenu(false); setCurrentScreen('pocket_transfer'); }}>
                    <View style={[styles.menuIcon, { backgroundColor: theme.colors.tertiaryContainer + '40' }]}><Repeat size={28} color={theme.colors.tertiary} /></View>
                    <Text style={[styles.menuLabel, { color: theme.colors.onSurface }]}>Transferir Fondos</Text>
                 </TouchableOpacity>
              </View>

              <TouchableOpacity style={[styles.closeMenu, { backgroundColor: theme.colors.surfaceContainerLow }]} onPress={() => toggleActionMenu(false)}>
                 <Text style={[styles.closeMenuTxt, { color: theme.colors.onSurfaceVariant }]}>Cerrar panel</Text>
              </TouchableOpacity>
           </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

export default function App() {
  const [session, setSession] = useState<any>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => setSession(currentSession));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => subscription.unsubscribe();
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider userId={session?.user?.id}>
        <MainApp />
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
