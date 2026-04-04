import React, { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from '../src/lib/supabase';
import { INITIAL_POCKETS, SUPABASE_URL, SUPABASE_ANON_KEY } from '../src/constants';
import { theme } from '../src/theme/theme';
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

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [pockets, setPockets] = useState<any[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [session, setSession] = useState<any>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // 1. On mount: check existing session AND listen for auth changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setIsInitializing(false);
    }).catch(() => {
      setIsInitializing(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      subscription.unsubscribe();
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  // 2. When session changes, load user data
  useEffect(() => {
    if (session?.user) {
      loadUserData(session.user.id);
    }
  }, [session?.user?.id]);

  const loadUserData = async (userId: string) => {
    try {
      const activeAccessToken = session?.access_token || '';
      const strictClient = activeAccessToken ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${activeAccessToken}` } }
      }) : supabase;

      // Fetch Pockets
      const { data: fetchedPockets } = await strictClient
        .from('pockets')
        .select('*')
        .filter('user_id', 'eq', userId);

      if (fetchedPockets && fetchedPockets.length === 0) {
        const { data: newPockets } = await strictClient.from('pockets').insert(
          INITIAL_POCKETS.map(p => ({
            user_id: userId,
            name: p.name,
            category: p.category,
            budget: p.budget,
            icon: p.icon
          }))
        ).select();
        setPockets(newPockets || INITIAL_POCKETS);
      } else if (fetchedPockets) {
        setPockets(fetchedPockets);
      }

      // Fetch Transactions
      await fetchTransactions();

      // Clean up old channel before creating new one
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      // Real-time subscriptions — unique channel name to avoid conflicts
      const channelName = `db-changes-${Date.now()}`;
      const txChannel = supabase.channel(channelName);
      
      txChannel.on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'transactions' },
        () => fetchTransactions()
      );
      
      txChannel.on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'pockets' },
        () => {
          supabase.from('pockets').select('*').filter('user_id', 'eq', userId)
            .then(({ data }) => data && setPockets(data));
        }
      );
      
      txChannel.subscribe();
      channelRef.current = txChannel;

    } catch (error) {
      console.error('Data load error:', error);
    }
  };

  const fetchTransactions = async () => {
    try {
      const activeAccessToken = session?.access_token || '';
      const strictClient = activeAccessToken ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${activeAccessToken}` } }
      }) : supabase;

      const { data, error } = await strictClient
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setTransactions(data);
    } catch (error) {
      console.error('Fetch error:', error);
    }
  };

  const renderScreen = () => {
    if (isInitializing) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Cargando...</Text>
        </View>
      );
    }

    if (!session) {
      return <Auth onLoginSuccess={() => {}} />;
    }

    switch (currentScreen) {
      case 'dashboard': return <Dashboard transactions={transactions} />;
      case 'scanner': return (
        <Scanner 
          onGoBack={() => setCurrentScreen('dashboard')} 
          session={session}
          onSaveSuccess={() => {
            fetchTransactions();
            setCurrentScreen('expenses');
          }}
        />
      );
      case 'expenses': return <Expenses transactions={transactions} onRefresh={fetchTransactions} />;
      case 'pockets': return <Pockets pockets={pockets} transactions={transactions} session={session} onRefresh={() => loadUserData(session?.user?.id)} />;
      case 'profile': return <Profile session={session} transactions={transactions} pockets={pockets} onRefresh={fetchTransactions} />;
      default: return <Dashboard transactions={transactions} />;
    }
  };

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        {currentScreen !== 'scanner' && !isInitializing && session && (
          <TopBar
            title={currentScreen === 'dashboard' ? 'Save' : currentScreen === 'expenses' ? 'Tus Gastos' : currentScreen === 'pockets' ? 'Bolsillos' : 'Tu Perfil'}
            userAvatar={session.user?.user_metadata?.avatar_url || session.user?.user_metadata?.picture || null}
            userName={session.user?.user_metadata?.full_name || session.user?.user_metadata?.name || session.user?.email?.split('@')[0] || null}
          />
        )}

        <View style={[styles.mainArea, { backgroundColor: currentScreen === 'scanner' ? '#000' : theme.colors.background }]}>
          {renderScreen()}
        </View>

        {session && currentScreen !== 'scanner' && <BottomNav activeScreen={currentScreen} setScreen={setCurrentScreen} />}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  mainArea: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, color: theme.colors.onSurfaceVariant, fontWeight: '600' }
});
