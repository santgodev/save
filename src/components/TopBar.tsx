import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, Platform,
  Modal, ScrollView, ActivityIndicator, TextInput, KeyboardAvoidingView,
  Keyboard, TouchableWithoutFeedback
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Bell, X, Sparkles, Send, Target } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { calculateFinancialProfile } from '../utils/profileUtils';

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
  const scrollRef = useRef<ScrollView>(null);

  const profileData = useMemo(() => calculateFinancialProfile(transactions, [], pockets), [transactions, pockets]);

  // Mensaje de bienvenida al abrir por primera vez
  useEffect(() => {
    if (showChat && messages.length === 0) {
      const totalGasto = transactions
        .filter(t => parseFloat(t.amount) < 0)
        .reduce((acc, t) => acc + Math.abs(parseFloat(t.amount)), 0);

      const greeting = `Hola${userName ? ` ${userName.split(' ')[0]}` : ''}! 👋 Soy tu asistente de Save.\n\nEste mes llevas ${totalGasto > 0 ? `$ ${Math.round(totalGasto).toLocaleString('es-CO')} en gastos` : 'sin gastos registrados aún'}. Tu puntaje financiero es **${profileData.score}/100**.\n\n¿En qué te puedo ayudar?`;

      setMessages([{ role: 'assistant', content: greeting }]);
    }
  }, [showChat]);

  const buildSystemContext = () => {
    const now = new Date();
    const currentMonth = now.getMonth();

    const monthlyTx = transactions.filter(tx => {
      const d = new Date(tx.date_string || tx.created_at);
      return d.getMonth() === currentMonth;
    });

    const gastos = monthlyTx.filter(t => parseFloat(t.amount) < 0);
    const ingresos = monthlyTx.filter(t => parseFloat(t.amount) > 0);

    const totalGasto = gastos.reduce((acc, t) => acc + Math.abs(parseFloat(t.amount)), 0);
    const totalIngreso = ingresos.reduce((acc, t) => acc + Math.abs(parseFloat(t.amount)), 0);

    // Agrupar por categoría
    const porCategoria: Record<string, number> = {};
    gastos.forEach(t => {
      const cat = t.category || 'Otros';
      porCategoria[cat] = (porCategoria[cat] || 0) + Math.abs(parseFloat(t.amount));
    });
    const topCats = Object.entries(porCategoria)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat, amt]) => `${cat}: $${Math.round(amt).toLocaleString('es-CO')}`)
      .join(', ');

    const bolsillosInfo = pockets
      .map(p => `${p.name} (presupuesto: $${(p.budget || 0).toLocaleString('es-CO')})`)
      .join(', ');

    return `Eres el asistente de Save (antes llamado Sage), un coach financiero experto en Colombia. Tu estilo es:
- 🇨🇴 Colombiano muy parcero, amigable y directo.
- ⚡ RESPUESTAS ULTRA-CORTAS: Máximo 2 oraciones breves por respuesta. No saludes siempre.
- 🎯 ACCIONABLE: Si sugieres arreglar un bolsillo o mover plata, termina tu respuesta con el código [ACTION:TRANSFER]. Si sugieres revisar bolsillos, usa [ACTION:POCKETS]. Si sugieres ver gastos, usa [ACTION:EXPENSES].

DATOS REALES DEL USUARIO:
- Mes actual: ${now.toLocaleDateString('es-CO', { month: 'long' })}
- Gastado: $${Math.round(totalGasto).toLocaleString('es-CO')} | Ingresado: $${Math.round(totalIngreso).toLocaleString('es-CO')}
- Health Score: ${profileData.score}/100.
- Top gastos: ${topCats || 'Sin datos'}.
- Bolsillos: ${bolsillosInfo || 'Sin bolsillos'}.

No inventes cifras. Responde directo a la pregunta.`;
  };

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
      const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
      if (!OPENAI_API_KEY) throw new Error('No API key');

      const apiMessages = [
        { role: 'system', content: buildSystemContext() },
        ...newMessages.map(m => ({ role: m.role, content: m.content }))
      ];

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: apiMessages,
          temperature: 0.7,
          max_tokens: 400
        })
      });

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || 'No pude procesar esa consulta. Intenta de nuevo.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ups, no pude conectarme con Sage IA en este momento. Revisa tu conexión.' }]);
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
                    <Text style={styles.chatTitle}>Asistente Save</Text>
                    <Text style={styles.chatSubtitle}>IA Personalizada</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.closeBtn} onPress={() => { setShowChat(false); }}>
                  <X size={18} color={theme.colors.onSurface} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>

              {/* Score strip */}
              <View style={styles.scoreStrip}>
                <Target size={16} color={theme.colors.primary} />
                <Text style={styles.scoreText}>
                  Health Score: {profileData.score}/100 · {profileData.scoreMessage}
                </Text>
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
                      <Text style={msg.role === 'user' ? styles.bubbleUserText : styles.bubbleAssistantText}>
                        {msg.content.replace(/\[ACTION:.*\]/g, '').trim()}
                      </Text>
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
                  placeholder="Pregúntale algo a Save..."
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
