import React, { useState, useMemo } from 'react';
import {
  View, Text, Image, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, TextInput, Dimensions, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { ReceiptText, ImagePlus as ImagePlusIcon, Camera as CameraIcon, X as XIcon, Store, Banknote, Calendar, Tag, Sparkles } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { normalize } from '../theme/theme';
import { AnimatedProgressBar } from '../components/AnimatedProgressBar';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { GOOGLE_VISION_API_KEY, OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';
import { normalizeMerchant } from '../utils/merchant';

const { width, height } = Dimensions.get('window');

export const Scanner = ({ onGoBack, onSaveSuccess, session, pockets }: { onGoBack: () => void; onSaveSuccess: () => void; session?: any; pockets?: any[] }) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    scannerContainer: { flex: 1, backgroundColor: '#111311' }, // Deep Midnight for focus
    scannerTopBar: { position: 'absolute', top: 0, width: '100%', zIndex: 100, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center' },
    closeBtn: { 
      width: 48, 
      height: 48, 
      borderRadius: 24, 
      backgroundColor: 'rgba(255,255,255,0.15)', 
      alignItems: 'center', 
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)'
    },
    scannerBadge: { 
      paddingHorizontal: 14, 
      paddingVertical: 8, 
      borderRadius: 20, 
      borderWidth: 1.5, 
      borderColor: '#FFF',
      ...theme.shadows.premium 
    },
    scannerBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5 },
    
    scannerInitialView: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    scannerInitialText: { color: 'rgba(255,255,255,0.7)', fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 40, textAlign: 'center' },
    
    mainCameraButton: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 14, 
      width: '100%',
      backgroundColor: theme.colors.primary, 
      paddingVertical: 20, 
      borderRadius: 24,
      justifyContent: 'center',
      ...theme.shadows.premium,
      marginBottom: 16
    },
    mainCameraButtonText: { color: '#FFF', fontSize: 17, fontWeight: '900', letterSpacing: -0.5 },
    
    scannerProgressContainer: { position: 'absolute', bottom: 0, width: '100%', paddingHorizontal: 16 },
    scannerProgressCard: { 
      padding: 24, 
      borderRadius: 36, 
      overflow: 'hidden', 
      backgroundColor: theme.colors.surface,
      borderWidth: 1, 
      borderColor: theme.colors.outlineVariant,
      ...theme.shadows.premium 
    },
    scannerActionTitle: { fontWeight: '900', color: theme.colors.onSurface, fontSize: 18, marginBottom: 16, letterSpacing: -0.5 },
    
    beautifulResultCard: { marginTop: 4 },
    aiVerificationShield: { 
      flexDirection: 'row', 
      gap: 8, 
      alignSelf: 'center', 
      paddingHorizontal: 16, 
      paddingVertical: 8, 
      borderRadius: 16, 
      backgroundColor: theme.colors.primaryContainer + '60',
      marginBottom: 24,
      borderWidth: 1,
      borderColor: theme.colors.primary + '20'
    },
    aiValidationText: { fontSize: 10, fontWeight: '900', color: theme.colors.primary, letterSpacing: 1, textTransform: 'uppercase' },
    
    premiumAmountBox: { alignItems: 'center', marginBottom: 24 },
    premiumAmountLabel: { fontSize: 12, color: theme.colors.onSurfaceVariant, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
    modernAmountInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    modernCurrencySymbol: { fontSize: 24, fontWeight: '800', color: theme.colors.onSurface, marginRight: 4 },
    modernAmountInput: { fontSize: 52, fontWeight: '900', color: theme.colors.onSurface, textAlign: 'center', letterSpacing: -2, minWidth: 120 },
    copBadge: { fontSize: 12, fontWeight: '900', color: theme.colors.primary, marginLeft: 8 },
    
    dividerCustom: { height: 1.5, backgroundColor: theme.colors.outlineVariant, marginVertical: 24, opacity: 0.5 },
    
    premiumDetailItem: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 16, 
      backgroundColor: theme.colors.surfaceContainerLow, 
      padding: 18, 
      borderRadius: 24, 
      borderWidth: 1, 
      borderColor: theme.colors.outlineVariant,
      marginBottom: 12
    },
    premiumIconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface },
    premiumDetailLabel: { fontSize: 10, fontWeight: '900', color: theme.colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
    premiumDetailInput: { fontSize: 16, fontWeight: '800', color: theme.colors.onSurface, paddingVertical: 4 },
    premiumDetailValue: { fontSize: 16, fontWeight: '800', color: theme.colors.onSurface },
    originalTicketBadge: { fontSize: 10, fontWeight: '800', color: theme.colors.secondary, marginTop: 4, fontStyle: 'italic' },
    
    categoryPicker: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 24 },
    catChip: { 
      paddingHorizontal: 16, 
      paddingVertical: 10, 
      borderRadius: 14, 
      backgroundColor: theme.colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant
    },
    catChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    catText: { fontSize: 13, fontWeight: '800', color: theme.colors.onSurfaceVariant },
    catTextActive: { color: '#FFF' },
    
    premiumConfirmBtn: { borderRadius: 24, overflow: 'hidden', height: 64, ...theme.shadows.soft },
    btnGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    premiumConfirmBtnText: { color: '#FFF', fontWeight: '900', fontSize: 17, letterSpacing: -0.3 }
  }), [theme]);

  const [progress, setProgress] = useState(0);
  const [editableAmount, setEditableAmount] = useState<string>('0');
  const [image, setImage] = useState<string | null>(null);
  const [visionOutput, setVisionOutput] = useState<string | null>(null);
  const [isOpeningPicker, setIsOpeningPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [isManualMode, setIsManualMode] = useState(false);
  const [editableMerchant, setEditableMerchant] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Comida');

  const isValidTransaction = (data: any) => {
    return (
      data &&
      typeof data.amount === 'number' &&
      data.amount > 0 &&
      data.merchant &&
      data.merchant !== 'Desconocido'
    );
  };

  const takePhoto = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsOpeningPicker(true);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setIsOpeningPicker(false);
      alert('Se necesita permiso para acceder a la cámara.');
      return;
    }

    let result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    setIsOpeningPicker(false);

    if (!result.canceled) {
      const base64Image = result.assets[0].base64;
      setImage(result.assets[0].uri);
      setVisionOutput(null);
      setExtractedData(null);
      if (base64Image) performTextDetection(base64Image);
    }
  };

  const pickImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsOpeningPicker(true);
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });
    setIsOpeningPicker(false);
    if (!result.canceled) {
      const base64Image = result.assets[0].base64;
      setImage(result.assets[0].uri);
      setVisionOutput(null);
      setExtractedData(null);
      if (base64Image) performTextDetection(base64Image);
    }
  };

  const performTextDetection = async (base64: string) => {
    setProgress(10);
    const fakeProgress = setInterval(() => setProgress(p => (p < 55 ? p + 2 : p)), 100);
    try {
      const vResp = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ image: { content: base64 }, features: [{ type: 'TEXT_DETECTION' }] }] })
      });
      const vData = await vResp.json();
      const ocrText = vData.responses?.[0]?.fullTextAnnotation?.text;
      if (!ocrText || ocrText.trim().length < 15) throw new Error('No logré leer bien la foto.');

      setProgress(60);
      const oaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ 
            role: 'system', 
            content: 'Auditor experto para la app "Save". Estamos en el año 2026. Identifica el establecimiento, monto y fecha. JSON: merchant, amount (entero), date (YYYY-MM-DD), category (Comida, Transporte, Ocio, Otros).' 
          }, { role: 'user', content: ocrText }],
          response_format: { type: 'json_object' }
        })
      });
      const oaiData = await oaiResp.json();
      clearInterval(fakeProgress);
      const result = JSON.parse(oaiData.choices[0].message.content);
      
      const finalDate = result.date || new Date().toISOString().split('T')[0];
      const isValid = isValidTransaction(result);
      const amount = String(result.amount || '0').replace(/[^0-9]/g, '');
      
      setExtractedData({ 
        merchant: result.merchant || 'Desconocido', 
        amount, 
        date: finalDate, 
        category: result.category || 'Comida' 
      });
      
      setEditableAmount(amount);
      setEditableMerchant(result.merchant || '');
      setSelectedCategory(result.category || 'Comida');
      
      if (!isValid) setIsManualMode(true);
      setProgress(100);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      clearInterval(fakeProgress);
      setIsManualMode(true);
      setProgress(100);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const saveToSupabase = async () => {
    if (!extractedData || isSaving) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsSaving(true);
    try {
      const user = session?.user;
      if (!user) throw new Error('Sesión no detectada.');

      const strictClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${session.access_token}` } }
      });

      const iconMap: Record<string, string> = { 'Comida': 'Utensils', 'Transporte': 'Car', 'Ocio': 'Theater', 'Ahorros': 'PiggyBank' };
      const amountValue = parseFloat(editableAmount.replace(/[^0-9.]/g, ''));
      const today = new Date().toISOString().split('T')[0];

      const { error } = await strictClient.from('transactions').insert({
        user_id: user.id, 
        merchant: editableMerchant || 'Factura Escaneada', 
        amount: -Math.abs(amountValue), 
        date_string: today,
        category: selectedCategory, 
        icon: iconMap[selectedCategory] || 'ReceiptText'
      });

      if (error) throw error;
      
      // Update pocket
      const p = (pockets || []).find(pk => pk.category === selectedCategory);
      if (p) await strictClient.from('pockets').update({ budget: (p.budget || 0) - Math.abs(amountValue) }).eq('id', p.id);

      setIsSaving(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaveSuccess();
    } catch (error: any) {
      setIsSaving(false);
      alert(error.message);
    }
  };

  return (
    <View style={styles.scannerContainer}>
      {!image && (
        <View style={styles.scannerInitialView}>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: 40, borderRadius: 100, marginBottom: 40 }}>
            <CameraIcon size={80} color="rgba(255,255,255,0.4)" strokeWidth={1} />
          </View>
          <Text style={styles.scannerInitialText}>Captura tu comprobante para que la Pro-AI analice tu gasto.</Text>
          
          <TouchableOpacity onPress={takePhoto} style={styles.mainCameraButton} activeOpacity={0.8}>
            <CameraIcon size={24} color="#FFF" />
            <Text style={styles.mainCameraButtonText}>Tomar Fotografía</Text>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={pickImage} style={[styles.mainCameraButton, { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)' }]} activeOpacity={0.8}>
            <ImagePlusIcon size={24} color="#FFF" />
            <Text style={styles.mainCameraButtonText}>Seleccionar Galería</Text>
          </TouchableOpacity>
        </View>
      )}

      {image && <Image source={{ uri: image }} style={StyleSheet.absoluteFillObject} resizeMode="contain" />}
      
      <View style={[styles.scannerTopBar, { paddingTop: Math.max(insets.top, 16) + 16 }]}>
        <TouchableOpacity 
          style={styles.closeBtn} 
          onPress={() => { if (image) { setImage(null); setExtractedData(null); setProgress(0); } else onGoBack(); }}
        >
          <XIcon size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <View style={[styles.scannerBadge, { backgroundColor: theme.colors.primary }]}>
          <Text style={styles.scannerBadgeText}>Auditoría Directa</Text>
        </View>
      </View>

      {(image || isManualMode) && (
        <View style={[styles.scannerProgressContainer, { paddingBottom: Math.max(insets.bottom, 24) + 20 }]}>
          <BlurView intensity={Platform.OS === 'ios' ? 95 : 100} tint="light" style={styles.scannerProgressCard}>
            {progress < 100 ? (
              <View>
                <Text style={styles.scannerActionTitle}>{progress < 30 ? 'Desencriptando...' : 'Analizando Factura...'}</Text>
                <AnimatedProgressBar percent={progress} color={theme.colors.primary} bgColor={theme.colors.surfaceContainerHigh} />
              </View>
            ) : (
              <ScrollView style={styles.beautifulResultCard} scrollEnabled={false}>
                <View style={styles.aiVerificationShield}>
                  <Sparkles size={14} color={theme.colors.primary} fill={theme.colors.primary} />
                  <Text style={styles.aiValidationText}>Escaneo Inteligente</Text>
                </View>

                <View style={styles.premiumAmountBox}>
                  <Text style={styles.premiumAmountLabel}>Total Identificado</Text>
                  <View style={styles.modernAmountInputRow}>
                    <Text style={styles.modernCurrencySymbol}>$</Text>
                    <TextInput
                      style={styles.modernAmountInput}
                      value={editableAmount}
                      onChangeText={setEditableAmount}
                      keyboardType="numeric"
                      selectionColor={theme.colors.primary}
                    />
                    <Text style={styles.copBadge}>COP</Text>
                  </View>
                </View>

                <View style={styles.premiumDetailItem}>
                   <View style={styles.premiumIconBox}><Store size={20} color={theme.colors.primary} /></View>
                   <View style={{ flex: 1 }}>
                      <Text style={styles.premiumDetailLabel}>Establecimiento</Text>
                      <TextInput 
                        style={styles.premiumDetailInput}
                        value={editableMerchant}
                        onChangeText={setEditableMerchant}
                        placeholder="Nombre del Comercio"
                        placeholderTextColor={theme.colors.onSurfaceVariant + '80'}
                      />
                   </View>
                </View>

                <View style={styles.categoryPicker}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {['Comida', 'Transporte', 'Ocio', 'Ahorros', 'Otros'].map((cat) => (
                      <TouchableOpacity 
                        key={cat} 
                        onPress={() => setSelectedCategory(cat)}
                        style={[styles.catChip, selectedCategory === cat && styles.catChipActive]}
                      >
                        <Text style={[styles.catText, selectedCategory === cat && styles.catTextActive]}>{cat}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                <TouchableOpacity 
                  onPress={saveToSupabase} 
                  disabled={isSaving} 
                  style={styles.premiumConfirmBtn}
                  activeOpacity={0.9}
                >
                  <LinearGradient colors={theme.colors.brandGradient as any} style={styles.btnGradient} start={{x:0, y:0}} end={{x:1, y:0}}>
                    {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.premiumConfirmBtnText}>Blindar Transacción</Text>}
                  </LinearGradient>
                </TouchableOpacity>
              </ScrollView>
            )}
          </BlurView>
        </View>
      )}
    </View>
  );
};
