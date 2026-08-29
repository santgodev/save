import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, Platform,
  Modal, ScrollView, ActivityIndicator, TextInput, KeyboardAvoidingView,
  Keyboard, LayoutAnimation, Animated
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Bell, X, Sparkles, Send, Target, Trash2, AlertTriangle, RotateCcw, MessageSquare } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../lib/supabase';
import { logEvent, EVENTS } from '../lib/events';
import { BottomSheet } from './BottomSheet';
import { useCycleState, useUserCycles } from '../lib/useCycleState';
import { formatMoney } from '../lib/format';
import { notify } from '../lib/notify';

interface TopBarProps {
  title: string;
  userAvatar?: string | null;
  userName?: string | null;
  userId?: string;
  transactions?: any[];
  pockets?: any[];
  showChat?: boolean;
  onShowChatChange?: (show: boolean) => void;
  initialMessage?: string;
  clearHistoryOnOpen?: boolean;
  onHistoryCleared?: () => void;
  onAvatarPress?: () => void;
}

type Message = {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
  retryText?: string;
};

// Preguntas sugeridas: se elige un subconjunto al azar cada vez que se
// muestran (saludo inicial y después de cada respuesta), para que no se
// sientan siempre las mismas 2 opciones.
const SUGGESTED_QUESTIONS = [
  '¿Cómo voy este mes?',
  '¿En qué se me va más la plata?',
  '¿Voy a alcanzar a llegar a fin de mes?',
  'Dame un consejo para ahorrar hoy',
  '¿Cuánto llevo gastado esta semana?',
  '¿Qué bolsillo tengo más apretado?',
];

function getRandomSuggestions(n: number, exclude?: string): string[] {
  const pool = SUGGESTED_QUESTIONS.filter(q => q !== exclude);
  const picked: string[] = [];
  while (picked.length < n && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

let hasShownGreeting = false;

export const MiniAnimatedSaveLogo = () => {
  const { theme } = useTheme();
  
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const slideTextAnim = useRef(new Animated.Value(-25)).current; 
  const containerShift = useRef(new Animated.Value(20)).current;

  const playAnimation = () => {
    logoOpacity.setValue(0);
    textOpacity.setValue(0);
    slideTextAnim.setValue(-25);
    containerShift.setValue(20);

    Animated.sequence([
      Animated.timing(logoOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(100),
      Animated.parallel([
        Animated.spring(containerShift, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }),
        Animated.timing(textOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(slideTextAnim, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }),
      ])
    ]).start();
  };

  useEffect(() => {
    playAnimation();
    const interval = setInterval(() => {
      playAnimation();
    }, 15000 + Math.random() * 10000); // Random interval between 15s and 25s
    return () => clearInterval(interval);
  }, []);

  const fontSize = 22;

  return (
    <Animated.View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', transform: [{ translateX: containerShift }] }}>
      <Animated.Text style={{ fontSize, fontWeight: '900', fontFamily: theme.fonts.headline, color: theme.colors.primary, zIndex: 10, opacity: logoOpacity }}>
        S
      </Animated.Text>
      <Animated.View style={{ zIndex: 1, flexDirection: 'row', opacity: textOpacity, transform: [{ translateX: slideTextAnim }] }}>
        <Text style={{ fontSize, fontWeight: '900', fontFamily: theme.fonts.headline, color: (theme.colors as any).pastel?.salmon || '#F0927B' }}>A</Text>
        <Text style={{ fontSize, fontWeight: '900', fontFamily: theme.fonts.headline, color: (theme.colors as any).pastel?.teal || '#8AD6CE' }}>V</Text>
        <Text style={{ fontSize, fontWeight: '900', fontFamily: theme.fonts.headline, color: (theme.colors as any).pastel?.lavender || '#D2A9D1' }}>E</Text>
      </Animated.View>
    </Animated.View>
  );
};

// Puntos animados estilo iMessage para el indicador de "escribiendo...".
// Cada punto sube y baja en cascada (0ms / 150ms / 300ms de diferencia).
const TypingDots = ({ color }: { color: string }) => {
  const dots = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;

  useEffect(() => {
    const loops = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 350, useNativeDriver: true }),
          Animated.delay((2 - i) * 150),
        ])
      )
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, []);

  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={{
            width: 7, height: 7, borderRadius: 3.5, backgroundColor: color,
            opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
            transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
          }}
        />
      ))}
    </View>
  );
};

export const TopBar = ({
  title, userAvatar, userName, userId, transactions = [], pockets = [],
  showChat: propsShowChat, onShowChatChange, initialMessage,
  clearHistoryOnOpen, onHistoryCleared, onAvatarPress
}: TopBarProps) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [greetingTitle, setGreetingTitle] = useState('');

  useEffect(() => {
    if (hasShownGreeting) return;
    hasShownGreeting = true;

    // Sin nombre real (ej. login con Apple sin compartirlo) no inventamos
    // uno -- ni el email, ni un "Amigo" genérico. Un saludo sin nombre en
    // vez de uno con un nombre falso.
    let text: string;
    if (userName) {
      const hours = new Date().getHours();
      let g = 'Hola';
      if (hours < 12) g = 'Buenos días';
      else if (hours < 18) g = 'Buenas tardes';
      else g = 'Buenas noches';
      text = `${g}, ${userName.split(' ')[0]}`;
    } else {
      text = 'Qué bueno tenerte en Save';
    }
    setGreetingTitle(text);

    setTimeout(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setGreetingTitle('');
    }, 5000);
  }, [userName]);

  const [internalShowChat, setInternalShowChat] = useState(false);
  const showChat = propsShowChat !== undefined ? propsShowChat : internalShowChat;
  const setShowChat = (val: boolean) => {
    if (onShowChatChange) onShowChatChange(val);
    else setInternalShowChat(val);
  };

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [hasNewInsights, setHasNewInsights] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // session_id estable mientras el chat está abierto. Antes el cliente no
  // enviaba session_id, así que el server caía al default gen_random_uuid()
  // de chat_messages — un id distinto por cada turno = "1 sesión = 1 mensaje".
  // Ahora cada apertura del chat es UNA sesión coherente.
  const sessionIdRef = useRef<string>(
    `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  );

  // Obtain the active cycle ID from the global cache (free: already fetched by Dashboard/Pockets)
  const { activeCycle } = useUserCycles();

  // Sync with source of truth — requires cycleId to actually fetch from Supabase
  const { state: monthState } = useCycleState(activeCycle?.id);

  // Auto-send initial message when chat is opened from outside
  useEffect(() => {
    if (showChat && initialMessage && !isHistoryLoading && messages.length <= 1) {
      sendMessage(initialMessage);
    }
  }, [showChat, initialMessage, isHistoryLoading]);

  const renderMessageContent = (msg: Message, style: any) => {
    // Extraer botones
    const buttonRegex = /\[BOTON:(.*?)\]/g;
    const buttons: string[] = [];
    let match;
    while ((match = buttonRegex.exec(msg.content)) !== null) {
      buttons.push(match[1]);
    }

    // Limpiar texto
    let cleanText = msg.content.replace(buttonRegex, '').replace(/\[ACTION:.*\]/g, '').trim();

    // Detect money amounts
    const pocketNames = pockets.map(p => p.name).filter(n => n.length > 2);
    // Definimos regex sin grupos capturadores internos
    const moneyRegexRaw = /\$ ?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d{1,3}k/;
    const pocketRegexRaw = pocketNames.length > 0 
      ? new RegExp(`${pocketNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}`, 'gi')
      : null;

    // Solo un grupo capturador exterior para el split
    const combinedRegex = pocketRegexRaw 
      ? new RegExp(`(\\*\\*.*?\\*\\*|\\n- |${moneyRegexRaw.source}|${pocketRegexRaw.source})`, 'g')
      : new RegExp(`(\\*\\*.*?\\*\\*|\\n- |${moneyRegexRaw.source})`, 'g');

    const parts = cleanText.split(combinedRegex);
    
    return (
      <View>
        {cleanText.length > 0 && (
          <Text style={style}>
            {parts.map((part, i) => {
              if (!part) return null;
              if (part.startsWith('**') && part.endsWith('**')) {
                return <Text key={i} style={{ fontWeight: '800' }}>{part.slice(2, -2)}</Text>;
              }
              if (part === '\n- ') {
                 return <Text key={i}>{"\n\u2022 "}</Text>;
              }
              // Detect money amounts
              if (part.match(moneyRegexRaw)) {
                return (
                  <Text key={i} style={{ 
                    color: theme.colors.primary,
                    fontWeight: '900',
                  }}>
                    {part}
                  </Text>
                );
              }
              // Detect pocket names
              if (pocketRegexRaw && part.match(pocketRegexRaw)) {
                return (
                  <Text key={i} style={{ 
                    color: theme.colors.onSurface, 
                    fontWeight: '900',
                  }}>
                    {part}
                  </Text>
                );
              }
              return part;
            })}
          </Text>
        )}
        
        {buttons.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {buttons.map((btn, i) => (
              <TouchableOpacity 
                key={i} 
                style={{ 
                  backgroundColor: msg.role === 'user' ? 'rgba(255,255,255,0.2)' : theme.colors.primaryContainer, 
                  paddingHorizontal: 12, paddingVertical: 8, 
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: msg.role === 'user' ? 'transparent' : theme.colors.primary + '40'
                }}
                onPress={() => sendMessage(btn)}
              >
                <Text style={{ 
                  color: msg.role === 'user' ? '#FFF' : theme.colors.primary, 
                  fontSize: 12, fontWeight: '700' 
                }}>
                  {btn}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };



  const getProactiveGreeting = () => {
    // Usamos el estado real del mes (RPC) para el saludo proactivo.
    // Esto garantiza que el número del saludo coincida con el Dashboard
    // y con lo que dirá la IA después.
    const totalGastoMonth = monthState?.spent_month ?? 0;
      
    let insight = "";
    const criticalPocket = (monthState?.pockets || []).find(p => {
      if (!p.allocated || p.allocated <= 0) return false;
      return (p.spent_month / p.allocated) >= 0.8;
    });

    if (criticalPocket) {
      insight = `Atención: El bolsillo ${criticalPocket.name} está al 80%.`;
    } else if (totalGastoMonth > 0) {
      insight = `Consumo actual del mes: ${formatMoney(totalGastoMonth)}.`;
    }

    // Saludo coherente con el paradigma read-only del advisor (v6):
    // pregunta directa "qué quieres saber" en lugar de "cómo te ayudo".
    const suggestions = getRandomSuggestions(2).map(q => `[BOTON:${q}]`).join('');
    return `Hola${userName ? ` ${userName.split(' ')[0]}` : ''}. ${insight}\n¿Qué quieres saber de tus números?\n\n${suggestions}`;
  };

  // ---------------------------------------------------------------------------
  // Persisted history: load from chat_messages on every chat open so that the
  // conversation survives app reloads and feels continuous.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!showChat) return;
    let cancelled = false;

    (async () => {
      logEvent(EVENTS.CHAT_OPENED);
      setIsHistoryLoading(true);

      try {
        if (clearHistoryOnOpen) {
          if (userId) {
            await supabase.from('chat_messages').delete().eq('user_id', userId);
          }
          sessionIdRef.current = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
          if (!cancelled) {
            setMessages([{ role: 'assistant', content: getProactiveGreeting() }]);
            if (onHistoryCleared) onHistoryCleared();
          }
          return; // omit loading
        }

        if (userId) {
          const { data, error } = await supabase
            .from('chat_messages')
            .select('role,content,created_at')
            .eq('user_id', userId)
            .in('role', ['user', 'assistant'])
            .order('created_at', { ascending: true })
            .limit(50);

          if (!error && data && !cancelled) {
            const restored: Message[] = data.map(d => ({
              role: d.role as 'user' | 'assistant',
              content: d.content,
            }));
            if (restored.length > 0) {
              setMessages(restored);
              return;
            }
          }
        }

        // Fallback greeting when there's no history.
        if (cancelled) return;
        setMessages([{ role: 'assistant', content: getProactiveGreeting() }]);
      } catch (e) {
        console.warn('[chat] history load failed', e);
      } finally {
        if (!cancelled) setIsHistoryLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [showChat, userId]);

  const clearChat = async () => {
    notify.confirm(
      "Reiniciar chat",
      "Save olvidará el contexto de esta conversación.",
      {
        confirmLabel: "Borrar",
        destructive: true,
        onConfirm: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          if (userId) {
            try {
              await supabase.from('chat_messages').delete().eq('user_id', userId);
            } catch (e) {
              console.warn('[chat] error clearing history', e);
            }
          }
          // Reset del session_id: empezar conversación nueva.
          sessionIdRef.current = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
          setMessages([{ role: 'assistant', content: getProactiveGreeting() }]);
        },
      },
    );
  };

  // NOTE: system prompt construction now happens entirely on the server,
  // inside the `chat-advisor` Edge Function (see supabase/functions/_shared/prompts.ts).
  // The client no longer needs to assemble context or ship it with the request.

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    const userMsg: Message = { role: 'user', content: trimmed };
    // Forma funcional -- igual que las otras dos actualizaciones de este
    // archivo. Con [...messages, userMsg] (la versión anterior) el mensaje
    // del usuario se arma con la copia de `messages` que quedó cerrada en
    // el render donde se creó este `onPress` -- si tocar un botón DENTRO
    // de la lista de mensajes dispara cualquier otro re-render justo antes
    // (por ejemplo el propio scroll, o el listener del teclado), esa copia
    // puede quedar vieja y el mensaje nuevo se pierde en el aire. Con la
    // forma funcional siempre se parte del estado real más reciente.
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      // All the OpenAI + context-building work now happens server-side in the
      // `chat-advisor` Edge Function. We explicitly attach the user's access
      // token so the function can identify them via RLS — supabase-js otherwise
      // falls back to the anon key when the session isn't fully loaded, which
      // makes the server return 401.
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      const accessToken = session?.access_token;

      if (!accessToken) {
        throw new Error('No hay sesión activa. Vuelve a iniciar sesión.');
      }

      const { data, error } = await supabase.functions.invoke('chat-advisor', {
        body: { message: trimmed, session_id: sessionIdRef.current },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (error) {
        // supabase-js wraps the HTTP response in error.context so we can read
        // the real server message. Without this we only see "non-2xx status".
        let serverBody: string | null = null;
        try {
          // @ts-ignore — error.context exists at runtime on FunctionsHttpError.
          const resp: Response | undefined = (error as any).context;
          if (resp) serverBody = await resp.text();
        } catch {/* ignore */}
        console.warn('[chat] edge function error', { message: error.message, serverBody });
        throw new Error(serverBody ? `Servidor: ${serverBody}` : error.message);
      }

      const reply = (data?.reply as string | undefined) ?? 'No pude procesar esa consulta. Intenta de nuevo.';
      // Sugerencias después de cada respuesta, no solo en el saludo -- para
      // que siempre haya un siguiente paso obvio sin tener que pensar qué
      // preguntar. Al azar, para que no se sientan siempre las mismas 2.
      const suggestions = getRandomSuggestions(2, trimmed).map(q => `[BOTON:${q}]`).join('');
      setMessages(prev => [...prev, { role: 'assistant', content: `${reply}\n\n${suggestions}` }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.warn('[chat] invoke failed', e);
      const errMsg = e instanceof Error ? e.message : 'No pude conectarme con Save. Revisa tu conexión e intenta de nuevo.';
      // isError + retryText: para que la burbuja se vea distinta a una
      // respuesta real de la IA, y para poder reintentar el mismo mensaje
      // sin que la persona tenga que retipearlo.
      setMessages(prev => [...prev, { role: 'assistant', content: errMsg, isError: true, retryText: trimmed }]);
    } finally {
      setIsTyping(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  };

  const styles = useMemo(() => StyleSheet.create({
    topBar: {
      position: 'absolute', top: 0, left: 0, right: 0,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 24, paddingBottom: 20, zIndex: 50,
      backgroundColor: theme.colors.glassWhite,
      borderBottomWidth: 1, borderBottomColor: theme.colors.divider,
      ...theme.shadows.soft
    },
    avatarContainer: {
      width: 40, height: 40, borderRadius: 14, overflow: 'hidden',
      borderWidth: 1.5, borderColor: theme.colors.divider,
      backgroundColor: theme.colors.primaryContainer,
    },
    // Escala un poco más allá del marco -- avatarContainer recorta el
    // sobrante (overflow: hidden), así la foto se ve más "llena" sin
    // importar qué tan lejos/chico salga el sujeto en la foto original.
    avatarImage: { width: '100%', height: '100%', transform: [{ scale: 1.35 }] },
    avatarFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary, transform: [{ scale: 1.35 }] },
    avatarInitials: { color: '#fff', fontSize: 18, fontWeight: '800' },
    topBarTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.onSurface, letterSpacing: -0.2 },
    iconButton: {
      width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
      borderRadius: 12, backgroundColor: theme.colors.primaryContainer,
      borderWidth: 1.5, borderColor: theme.colors.divider,
    },
    indicator: {
      position: 'absolute', top: -2, right: -2, width: 12, height: 12,
      borderRadius: 6, backgroundColor: theme.colors.error, borderWidth: 2, borderColor: '#FFF',
    },

    // Chat modal
    chatContainer: { flex: 1, backgroundColor: theme.colors.background },
    chatHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 24, paddingBottom: 16,
      borderBottomWidth: 1, borderBottomColor: theme.colors.divider,
      backgroundColor: theme.colors.glassWhite,
    },
    chatHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    sageAvatar: {
      width: 42, height: 42, borderRadius: 14,
      backgroundColor: theme.colors.primaryContainer,
      alignItems: 'center', justifyContent: 'center',
    },
    chatTitle: { fontSize: 18, fontWeight: '900', color: theme.colors.onSurface },
    chatSubtitle: { fontSize: 12, color: theme.colors.onSurfaceVariant, fontWeight: '700', marginTop: 1 },
    closeBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: theme.colors.surfaceContainerLow,
      alignItems: 'center', justifyContent: 'center',
    },

    // Score strip
    scoreStrip: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      marginHorizontal: 16, marginTop: 12, marginBottom: 4,
      padding: 12, borderRadius: 16,
      backgroundColor: theme.colors.primaryContainer,
    },
    scoreText: { fontSize: 13, fontWeight: '800', color: theme.colors.primary },

    // Messages
    messagesList: { paddingHorizontal: 16, paddingVertical: 12 },
    bubbleWrap: { marginBottom: 12 },
    bubbleUser: { alignSelf: 'flex-end', maxWidth: '80%' },
    bubbleAssistant: { alignSelf: 'flex-start', maxWidth: '85%' },
    bubbleUserInner: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 16, paddingVertical: 12,
      borderRadius: 20, borderBottomRightRadius: 6,
    },
    bubbleAssistantInner: {
      backgroundColor: theme.colors.glassWhite,
      paddingHorizontal: 16, paddingVertical: 12,
      borderRadius: 20, borderBottomLeftRadius: 6,
      borderWidth: 1, borderColor: theme.colors.divider,
      ...theme.shadows.soft,
    },
    bubbleUserText: { color: '#FFF', fontSize: 15, fontWeight: '600', lineHeight: 22 },
    bubbleAssistantText: { color: theme.colors.onSurface, fontSize: 15, fontWeight: '500', lineHeight: 22 },
    // Burbuja de error: distinta a propósito de una respuesta real, para
    // que no se confunda "Save contestó esto" con "algo se rompió".
    bubbleErrorInner: {
      backgroundColor: theme.colors.errorContainer + '40',
      paddingHorizontal: 16, paddingVertical: 12,
      borderRadius: 20, borderBottomLeftRadius: 6,
      borderWidth: 1, borderColor: theme.colors.error + '50',
    },
    bubbleErrorText: { color: theme.colors.error, fontSize: 15, fontWeight: '500', lineHeight: 22 },

    // Typing indicator
    typingBubble: {
      alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: theme.colors.glassWhite, paddingHorizontal: 16, paddingVertical: 12,
      borderRadius: 20, borderBottomLeftRadius: 6,
      borderWidth: 1, borderColor: theme.colors.divider,
      marginBottom: 12,
    },
    // Quick chips
    chipsSection: { paddingBottom: 8, paddingHorizontal: 16 },
    chip: {
      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
      backgroundColor: theme.colors.primaryContainer,
      marginRight: 8, borderWidth: 1, borderColor: theme.colors.primary + '30',
    },
    chipText: { fontSize: 13, fontWeight: '800', color: theme.colors.primary },

    // Input bar
    inputBar: {
      flexDirection: 'row', alignItems: 'flex-end', gap: 10,
      paddingHorizontal: 16, paddingVertical: 12,
      borderTopWidth: 1, borderTopColor: theme.colors.divider,
      backgroundColor: theme.colors.glassWhite,
    },
    input: {
      flex: 1, minHeight: 44, maxHeight: 100,
      backgroundColor: theme.colors.surfaceContainerLow,
      borderRadius: 22, paddingHorizontal: 18, paddingVertical: 11,
      fontSize: 15, color: theme.colors.onSurface, fontWeight: '500',
      borderWidth: 1, borderColor: theme.colors.outlineVariant,
    },
    sendBtn: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: theme.colors.primary,
      alignItems: 'center', justifyContent: 'center',
      ...theme.shadows.soft,
    },
  }), [theme]);

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0][0]?.toUpperCase() || '?';
  };

  // Las fotos de Google (googleusercontent.com) a veces vienen sin recorte
  // forzado -- el círculo de la foto queda centrado en un lienzo cuadrado
  // con esquinas transparentes, y como el contenedor tiene fondo de color
  // detrás, ese relleno se nota como un marco vacío alrededor de la foto.
  // Forzamos el sufijo de tamaño+recorte cuadrado que ya usa el CDN de
  // Google para esto, en vez de confiar en el tamaño que venga.
  const resolvedAvatarUri = userAvatar && userAvatar.includes('googleusercontent.com')
    ? userAvatar.replace(/=s\d+-c$/, '') + '=s200-c'
    : userAvatar;

  return (
    <>
      <BlurView intensity={Platform.OS === 'ios' ? 80 : 100} tint={theme.isDark ? 'dark' : 'light'} style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) + 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); if (onAvatarPress) onAvatarPress(); }} style={styles.avatarContainer}>
            {resolvedAvatarUri ? (
              <Image source={{ uri: resolvedAvatarUri }} style={styles.avatarImage} resizeMode="cover" />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{getInitials(userName)}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ position: 'absolute', left: 0, right: 0, top: Math.max(insets.top, 16) + 12, bottom: 16, alignItems: 'center', justifyContent: 'center', zIndex: 0 }} pointerEvents="none">
          {greetingTitle ? (
            <Text style={styles.topBarTitle}>{greetingTitle}</Text>
          ) : (
            <MiniAnimatedSaveLogo />
          )}
        </View>

        <TouchableOpacity style={styles.iconButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowChat(true); setHasNewInsights(false); }} activeOpacity={0.7}>
          <Sparkles size={18} color={theme.colors.primary} strokeWidth={2.5} />
          {hasNewInsights && <View style={styles.indicator} />}
        </TouchableOpacity>
      </BlurView>

      <Modal visible={showChat} animationType="slide" transparent={false}>
        <KeyboardAvoidingView style={styles.chatContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ flex: 1 }}>

              {/* Header — mismo estilo que el ChatMockup del Paywall */}
              <View style={[styles.chatHeader, { paddingTop: Math.max(insets.top, 20) + 16 }]}>
                <View style={styles.chatHeaderLeft}>
                  {/* Avatar: círculo primario con MessageSquare, igual al mockup */}
                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <MessageSquare size={18} color={theme.colors.onPrimary} />
                  </View>
                  <View>
                    {/* Nombre + punto verde en la misma fila, igual al mockup */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: theme.colors.onSurface, fontFamily: theme.fonts.headline }}>Save IA</Text>
                      <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#4CAF50' }} />
                      <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant }}>en línea</Text>
                    </View>
                    <Text style={styles.chatSubtitle}>Tu asistente financiero</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <TouchableOpacity style={styles.closeBtn} onPress={() => { Keyboard.dismiss(); setShowClearConfirm(true); }}>
                    <Trash2 size={16} color={theme.colors.error} strokeWidth={2.5} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.closeBtn} onPress={() => { setShowChat(false); }}>
                    <X size={18} color={theme.colors.onSurface} strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              </View>


              {/* Mensajes */}
              <ScrollView
                ref={scrollRef}
                style={{ flex: 1 }}
                contentContainerStyle={styles.messagesList}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                onScrollBeginDrag={Keyboard.dismiss}
              >
                {isHistoryLoading ? (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 40 }}>
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.onSurfaceVariant, marginTop: 12 }}>Cargando conversación...</Text>
                  </View>
                ) : (
                  <>
                    {messages.map((msg, idx) => (
                      <View key={idx} style={[styles.bubbleWrap, msg.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}>
                        {msg.role === 'assistant' && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                            {msg.isError ? (
                              <>
                                <AlertTriangle size={12} color={theme.colors.error} />
                                <Text style={{ fontSize: 10, fontWeight: '900', color: theme.colors.error, letterSpacing: 0.8 }}>NO SE PUDO ENVIAR</Text>
                              </>
                            ) : (
                              <Text style={{ fontSize: 11, fontWeight: '800', color: theme.colors.onSurfaceVariant }}>Save IA</Text>
                            )}
                          </View>
                        )}
                        <View style={
                          msg.role === 'user' ? styles.bubbleUserInner
                          : msg.isError ? styles.bubbleErrorInner
                          : styles.bubbleAssistantInner
                        }>
                          {renderMessageContent(
                            msg,
                            msg.role === 'user' ? styles.bubbleUserText
                            : msg.isError ? styles.bubbleErrorText
                            : styles.bubbleAssistantText
                          )}
                          {msg.isError && msg.retryText && (
                            <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-start' }}
                              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); sendMessage(msg.retryText!); }}
                            >
                              <RotateCcw size={13} color={theme.colors.error} />
                              <Text style={{ fontSize: 13, fontWeight: '800', color: theme.colors.error }}>Reintentar</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    ))}
                  </>
                )}

                {isTyping && (
                  <View style={styles.typingBubble}>
                    <TypingDots color={theme.colors.primary} />
                  </View>
                )}

              </ScrollView>

              {/* Input bar */}
              <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: ¿En qué estoy gastando más?"
                  placeholderTextColor={theme.colors.onSurfaceVariant + '70'}
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                  returnKeyType="send"
                  onSubmitEditing={() => sendMessage(inputText)}
                  blurOnSubmit={false}
                />
                <TouchableOpacity
                  style={[styles.sendBtn, (!inputText.trim() || isTyping) && { opacity: 0.4 }]}
                  onPress={() => sendMessage(inputText)}
                  disabled={!inputText.trim() || isTyping}
                >
                  <Send size={18} color="#FFF" />
                </TouchableOpacity>
              </View>

            </View>
        </KeyboardAvoidingView>

        <BottomSheet visible={showClearConfirm} onClose={() => setShowClearConfirm(false)} title="Nueva Conversación">
          <View style={{ alignItems: 'center', marginBottom: 28 }}>
            {/* Insignia de dos tonos -- mismo lenguaje que el modal de
                bienvenida del tutorial y el de cierre de mes: anillo tenue
                por fuera, círculo sólido adentro. */}
            <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: theme.colors.primary + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', ...theme.shadows.md }}>
                <Sparkles size={26} color="#FFF" />
              </View>
            </View>
            <Text style={{ fontSize: 15, color: theme.colors.onSurfaceVariant, textAlign: 'center', lineHeight: 22, paddingHorizontal: 16 }}>
              Save olvidará el contexto de la conversación actual para empezar desde cero con un análisis fresco.
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.85}
            style={{ width: '100%', backgroundColor: theme.colors.primary, paddingVertical: 20, borderRadius: 24, alignItems: 'center', ...theme.shadows.lg }}
            onPress={async () => {
              setShowClearConfirm(false);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              if (userId) {
                try {
                  await supabase.from('chat_messages').delete().eq('user_id', userId);
                } catch (e) {
                  console.warn('[chat] error clearing history', e);
                }
              }
              sessionIdRef.current = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
              setMessages([{ role: 'assistant', content: getProactiveGreeting() }]);
            }}
          >
            <Text style={{ fontFamily: theme.fonts.headline, color: '#FFFFFF', fontSize: 17, fontWeight: '900' }}>Empezar de nuevo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ paddingVertical: 16, alignItems: 'center' }}
            onPress={() => setShowClearConfirm(false)}
          >
            <Text style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700', fontSize: 15 }}>Cancelar</Text>
          </TouchableOpacity>
        </BottomSheet>
      </Modal>
    </>
  );
};
