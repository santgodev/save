import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, Platform,
  Modal, ScrollView, ActivityIndicator, TextInput, KeyboardAvoidingView,
  Keyboard, TouchableWithoutFeedback, PanResponder, LayoutAnimation, Alert
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Bell, X, Sparkles, Send, Target, Trash2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { calculateFinancialProfile } from '../utils/profileUtils';
import { supabase } from '../lib/supabase';
import { logEvent, EVENTS } from '../lib/events';

interface TopBarProps {
  title: string;
  userAvatar?: string | null;
  userName?: string | null;
  userId?: string;
  transactions?: any[];
  pockets?: any[];
}

const QUICK_QUESTIONS = [
  '¿Por qué se me va la plata tan rápido?',
  '¿Voy a alcanzar a llegar a fin de mes?',
  '¿En qué me estoy pasando de piña?',
  '¿Qué bolsillo tiene más plata?',
  'Dame un consejo para ahorrar ya.',
];

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

export const TopBar = ({ title, userAvatar, userName, userId, transactions = [], pockets = [] }: TopBarProps) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [hasNewInsights, setHasNewInsights] = useState(false);
  const [isScoreMinimized, setIsScoreMinimized] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

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

    // Parser simple para negritas (**), saltos de línea con viñetas y dinero ($XX.XXX o XXk)
    const parts = cleanText.split(/(\*\*.*?\*\*|\n- |\$ ?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d{1,3}k)/g);
    
    return (
      <View>
        {cleanText.length > 0 && (
          <Text style={style}>
            {parts.map((part, i) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <Text key={i} style={{ fontWeight: '800' }}>{part.slice(2, -2)}</Text>;
              }
              if (part === '\n- ') {
                 return <Text key={i}>{"\n\u2022 "}</Text>;
              }
              // Detect money amounts
              if (part.match(/^(\$ ?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d{1,3}k)$/)) {
                return (
                  <Text key={i} style={{ 
                    backgroundColor: msg.role === 'assistant' ? theme.colors.primary + '20' : 'rgba(255,255,255,0.2)',
                    color: msg.role === 'assistant' ? theme.colors.primary : '#FFF',
                    fontWeight: '900',
                  }}>
                    {` ${part} `}
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
    const totalGasto = transactions
      .filter(t => parseFloat(t.amount) < 0)
      .reduce((acc, t) => acc + Math.abs(parseFloat(t.amount)), 0);
      
    let insight = "Todo se ve bien por ahora. 👍";
    const criticalPocket = pockets.find(p => {
      const alloc = parseFloat(p.allocated_budget || '0');
      const avail = parseFloat(p.budget || '0');
      if (alloc <= 0) return false;
      return ((alloc - avail) / alloc) >= 0.8;
    });

    if (criticalPocket) {
      insight = `Ojo parce, ya casi te gastas todo en **${criticalPocket.name}** 👀`;
    } else if (totalGasto > 0) {
      insight = `Llevas **$${Math.round(totalGasto).toLocaleString('es-CO')}** gastados. Vas a buen ritmo.`;
    }

    return `Hola${userName ? ` ${userName.split(' ')[0]}` : ''}! 👋 Te resumo rápido:\n${insight}\n\n[BOTON:¿Cómo voy este mes?][BOTON:Ver mis gastos][BOTON:Dame un consejo]`;
  };

  const profileData = useMemo(() => calculateFinancialProfile(transactions, [], pockets), [transactions, pockets]);

  // ---------------------------------------------------------------------------
  // Persisted history: load from chat_messages on every chat open so that the
  // conversation survives app reloads and feels continuous.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!showChat) return;
    let cancelled = false;

    (async () => {
      logEvent(EVENTS.CHAT_OPENED);

      try {
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
      }
    })();

    return () => { cancelled = true; };
  }, [showChat, userId]);

  const clearChat = async () => {
    Alert.alert(
      "Reiniciar chat",
      "¿Estás seguro de que quieres borrar toda la conversación? Save olvidará el contexto de esta charla.",
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Borrar", 
          style: "destructive",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            if (userId) {
              try {
                await supabase.from('chat_messages').delete().eq('user_id', userId);
              } catch (e) {
                console.warn('[chat] error clearing history', e);
              }
            }
            setMessages([{ role: 'assistant', content: getProactiveGreeting() }]);
          }
        }
      ]
    );
  };

  // NOTE: system prompt construction now happens entirely on the server,
  // inside the `chat-advisor` Edge Function (see supabase/functions/_shared/prompts.ts).
  // The client no longer needs to assemble context or ship it with the request.

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    const userMsg: Message = { role: 'user', content: trimmed };
    const newMessages: Message[] = [...messages, userMsg];
    setMessages(newMessages);
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

      // Diagnostic log: remove once the 401 is resolved.
      console.log('[chat] session debug', {
        hasSession: !!session,
        hasToken: !!accessToken,
        tokenPreview: accessToken ? accessToken.slice(0, 24) + '…' : null,
        userId: session?.user?.id ?? null,
        expiresAt: session?.expires_at ?? null,
        nowEpoch: Math.floor(Date.now() / 1000),
      });

      if (!accessToken) {
        throw new Error('No hay sesión activa. Por favor vuelve a iniciar sesión.');
      }

      const { data, error } = await supabase.functions.invoke('chat-advisor', {
        body: { message: trimmed },
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
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.warn('[chat] invoke failed', e);
      const errMsg = e instanceof Error ? e.message : 'Ups, no pude conectarme con Save IA en este momento. Revisa tu conexión.';
      setMessages(prev => [...prev, { role: 'assistant', content: errMsg }]);
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
      borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)',
      backgroundColor: theme.colors.primaryContainer,
    },
    avatarImage: { width: '100%', height: '100%' },
    avatarFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary },
    avatarInitials: { color: '#fff', fontSize: 14, fontWeight: '800' },
    topBarTitle: { ...theme.typography.caption, color: theme.colors.primary, fontSize: 10, letterSpacing: 2, opacity: 0.6 },
    iconButton: {
      width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
      borderRadius: 12, backgroundColor: theme.colors.primaryContainer,
      borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)',
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

    // Typing indicator
    typingBubble: {
      alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: theme.colors.glassWhite, paddingHorizontal: 16, paddingVertical: 12,
      borderRadius: 20, borderBottomLeftRadius: 6,
      borderWidth: 1, borderColor: theme.colors.divider,
      marginBottom: 12,
    },
    typingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.primary },

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

  return (
    <>
      <BlurView intensity={Platform.OS === 'ios' ? 80 : 100} tint="light" style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) + 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)} style={styles.avatarContainer}>
            {userAvatar ? (
              <Image source={{ uri: userAvatar }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{getInitials(userName)}</Text>
              </View>
            )}
          </TouchableOpacity>
          {!!userName && (
            <Text style={{ ...theme.typography.label, fontSize: 9, color: theme.colors.primary }}>
              {userName.split(' ')[0]}
            </Text>
          )}
        </View>

        <View style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: -1 }}>
          <Text style={styles.topBarTitle}>{title}</Text>
        </View>

        <TouchableOpacity style={styles.iconButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowChat(true); setHasNewInsights(false); }} activeOpacity={0.7}>
          <Sparkles size={18} color={theme.colors.primary} strokeWidth={2.5} />
          {hasNewInsights && <View style={styles.indicator} />}
        </TouchableOpacity>
      </BlurView>

      <Modal visible={showChat} animationType="slide" transparent={false}>
        <KeyboardAvoidingView style={styles.chatContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={{ flex: 1 }}>

              {/* Header */}
              <View style={[styles.chatHeader, { paddingTop: Math.max(insets.top, 20) + 16 }]}>
                <View style={styles.chatHeaderLeft}>
                  <View style={styles.sageAvatar}>
                    <Sparkles size={22} color={theme.colors.primary} />
                  </View>
                  <View>
                    <Text style={styles.chatTitle}>Tu asesor financiero</Text>
                    <Text style={styles.chatSubtitle}>
                      Estado: {profileData.score >= 80 ? '🟢 Al día' : profileData.score >= 50 ? '🟡 Cuidado' : '🔴 Te estás pasando'}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <TouchableOpacity style={styles.closeBtn} onPress={clearChat}>
                    <Trash2 size={16} color={theme.colors.error} strokeWidth={2.5} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.closeBtn} onPress={() => { setShowChat(false); }}>
                    <X size={18} color={theme.colors.onSurface} strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Score strip */}
              <View 
                {...PanResponder.create({
                  onStartShouldSetPanResponder: () => true,
                  onPanResponderRelease: (e, gestureState) => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    if (gestureState.dx < -20) setIsScoreMinimized(true);
                    else if (gestureState.dx > 20) setIsScoreMinimized(false);
                    else setIsScoreMinimized(!isScoreMinimized);
                  }
                }).panHandlers}
                style={[styles.scoreStrip, { 
                  backgroundColor: profileData.score >= 80 ? '#D1FAE5' : profileData.score >= 50 ? '#FEF3C7' : '#FEE2E2',
                  alignSelf: isScoreMinimized ? 'flex-end' : 'stretch',
                  width: isScoreMinimized ? 44 : 'auto',
                  height: isScoreMinimized ? 44 : 'auto',
                  padding: isScoreMinimized ? 0 : 12,
                  justifyContent: 'center',
                }]}>
                <Target size={18} color={profileData.score >= 80 ? '#10B981' : profileData.score >= 50 ? '#F59E0B' : '#EF4444'} />
                {!isScoreMinimized && (
                  <Text style={[styles.scoreText, { 
                    flex: 1, flexWrap: 'wrap',
                    color: profileData.score >= 80 ? '#065F46' : profileData.score >= 50 ? '#92400E' : '#991B1B' 
                  }]}>
                    Health Score: {profileData.score}/100 · {profileData.scoreMessage}
                  </Text>
                )}
              </View>

              {/* Mensajes */}
              <ScrollView
                ref={scrollRef}
                style={{ flex: 1 }}
                contentContainerStyle={styles.messagesList}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
              >
                {messages.map((msg, idx) => (
                  <View key={idx} style={[styles.bubbleWrap, msg.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}>
                    {msg.role === 'assistant' && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Sparkles size={12} color={theme.colors.primary} />
                        <Text style={{ fontSize: 10, fontWeight: '900', color: theme.colors.primary, letterSpacing: 0.8 }}>SAVE AI</Text>
                      </View>
                    )}
                    <View style={msg.role === 'user' ? styles.bubbleUserInner : styles.bubbleAssistantInner}>
                      {renderMessageContent(
                        msg,
                        msg.role === 'user' ? styles.bubbleUserText : styles.bubbleAssistantText
                      )}
                      {msg.role === 'assistant' && msg.content.includes('[ACTION:TRANSFER]') && (
                        <TouchableOpacity 
                          style={{ marginTop: 12, backgroundColor: theme.colors.primary, paddingVertical: 10, borderRadius: 12, alignItems: 'center' }}
                          onPress={() => { setShowChat(false); /* Navegar a transfer */ }}
                        >
                          <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 13 }}>Mover dinero ahora</Text>
                        </TouchableOpacity>
                      )}
                      {msg.role === 'assistant' && msg.content.includes('[ACTION:POCKETS]') && (
                        <TouchableOpacity 
                          style={{ marginTop: 12, backgroundColor: theme.colors.primary, paddingVertical: 10, borderRadius: 12, alignItems: 'center' }}
                          onPress={() => { setShowChat(false); /* Navegar a pockets */ }}
                        >
                          <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 13 }}>Ver mis bolsillos</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}

                {isTyping && (
                  <View style={styles.typingBubble}>
                    <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                      <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant, fontWeight: '700' }}>Save está analizando...</Text>
                    </View>
                  </View>
                )}

                {/* Preguntas rápidas (solo si el chat está vacío o recién inició) */}
                {messages.length <= 1 && !isTyping && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={{ fontSize: 11, fontWeight: '900', color: theme.colors.onSurfaceVariant, letterSpacing: 0.8, marginBottom: 10 }}>
                      PREGUNTAS RÁPIDAS
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {QUICK_QUESTIONS.map((q, i) => (
                        <TouchableOpacity
                          key={i}
                          style={styles.chip}
                          onPress={() => sendMessage(q)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.chipText}>{q}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
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
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};
