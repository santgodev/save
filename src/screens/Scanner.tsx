import React, { useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, TextInput, Dimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { ReceiptText, ImagePlus as ImagePlusIcon, Camera as CameraIcon, X as XIcon, Store, Banknote, Calendar, Tag, Sparkles } from 'lucide-react-native';
import { theme, normalize } from '../theme/theme';
import { AnimatedProgressBar } from '../components/AnimatedProgressBar';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { GOOGLE_VISION_API_KEY, OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';

const { width } = Dimensions.get('window');

export const Scanner = ({ onGoBack, onSaveSuccess, session }: { onGoBack: () => void; onSaveSuccess: () => void; session?: any }) => {
  const [progress, setProgress] = useState(0);
  const [editableAmount, setEditableAmount] = useState<string>('0');
  const [image, setImage] = useState<string | null>(null);
  const [visionOutput, setVisionOutput] = useState<string | null>(null);
  const [isOpeningPicker, setIsOpeningPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [extractedData, setExtractedData] = useState<any>(null);

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

  const saveToSupabase = async () => {
    if (!extractedData) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsSaving(true);
    try {
      let user = session?.user;
      if (!user || !session?.access_token) throw new Error('Sesión no detectada.');

      const strictClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${session.access_token}` } },
        auth: { persistSession: false }
      });

      const iconMap: Record<string, string> = { 'Comida': 'Utensils', 'Transporte': 'Car', 'Ocio': 'Theater', 'Ahorros': 'PiggyBank', 'Ingresos': 'Banknote' };
      const merchant = extractedData.merchant || 'Desconocido';
      let cleanAmount = String(editableAmount).trim();
      if (cleanAmount.endsWith('.00') || cleanAmount.endsWith(',00')) cleanAmount = cleanAmount.slice(0, -3);
      const amount = parseFloat(cleanAmount.replace(/[^0-9]/g, ''));
      const date = extractedData.date || new Date().toLocaleString();
      const category = extractedData.category || 'Comida';

      const { error } = await strictClient.from('transactions').insert({
        user_id: user.id, merchant, amount: -Math.abs(amount), date_string: date, category, icon: iconMap[category] || 'ReceiptText', metadata: extractedData
      });

      if (error) throw error;
      await strictClient.from('user_events').insert({ user_id: user.id, event_type: 'scan_success', event_data: { merchant, count: 1 } });
      setIsSaving(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaveSuccess();
    } catch (error: any) {
      setIsSaving(false);
      alert(error.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
          messages: [{ role: 'system', content: 'Auditor experto para REGISTRO DE GASTOS PERSONALES. Identifica el local o tienda (marcas colombianas). JSON: merchant (establecimiento), amount (entero), date, category (Comida, Transporte, Ocio, Compras). Traduce Jeronimo Martins -> Tiendas ARA, Koba -> Tiendas D1. PROHIBIDO usar palabras de negocios como "proveedor".' }, { role: 'user', content: ocrText }],
          response_format: { type: 'json_object' }
        })
      });
      const oaiData = await oaiResp.json();
      clearInterval(fakeProgress);
      const result = JSON.parse(oaiData.choices[0].message.content);
      const amount = String(result.amount || '0').replace(/[^0-9]/g, '');
      setExtractedData({ merchant: result.merchant || 'Desconocido', amount, date: result.date || 'Hoy', category: result.category || 'Comida' });
      setEditableAmount(amount);
      setVisionOutput(`¡Procesado!`);
      setProgress(100);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error: any) {
      clearInterval(fakeProgress);
      setVisionOutput('Error al leer el ticket. Intenta de nuevo.');
      setProgress(0);
    }
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={styles.scannerContainer}>
      {!image && (
        <View style={styles.scannerInitialView}>
          <CameraIcon size={normalize(64)} color="rgba(255,255,255,0.4)" strokeWidth={1} />
          <Text style={styles.scannerInitialText}>Enfoca bien tu factura.</Text>
          <TouchableOpacity onPress={takePhoto} style={styles.mainCameraButton} activeOpacity={0.8}>
            <CameraIcon size={normalize(24)} color="#FFF" />
            <Text style={styles.mainCameraButtonText}>Tomar Foto</Text>
          </TouchableOpacity>
        </View>
      )}
      {image && <Image source={{ uri: image }} style={StyleSheet.absoluteFillObject} resizeMode="contain" />}
      <View style={[styles.scannerTopBar, { paddingTop: Math.max(insets.top, 16) + 16 }]}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => { if (image) { setImage(null); setVisionOutput(null); setExtractedData(null); setProgress(0); } else onGoBack(); }}>
          <XIcon size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <View style={[styles.scannerBadge, { backgroundColor: theme.colors.primary }]}>
          <Text style={styles.scannerBadgeText}>IA Activa</Text>
        </View>
      </View>
      <View style={[styles.scannerProgressContainer, { paddingBottom: Math.max(insets.bottom, 24) + normalize(40) }]}>
        <BlurView intensity={96} tint="light" style={styles.scannerProgressCard}>
          {progress < 100 ? (
            <View>
              <Text style={styles.scannerActionTitle}>{progress < 10 ? 'Preparando...' : 'Escaneando gasto...'}</Text>
              <AnimatedProgressBar percent={progress} color={theme.colors.primary} bgColor={theme.colors.surfaceContainerHighest} />
            </View>
          ) : (
            <View style={styles.beautifulResultCard}>
              <View style={[styles.aiVerificationShield, { backgroundColor: theme.colors.primaryContainer }]}>
                 <Sparkles size={14} color={theme.colors.primary} />
                 <Text style={styles.aiValidationText}>VERIFICADO POR IA</Text>
              </View>
              <View style={styles.premiumAmountBox}>
                <Text style={styles.premiumAmountLabel}>Monto total</Text>
                <View style={styles.modernAmountInputRow}>
                   <Text style={styles.modernCurrencySymbol}>$</Text>
                   <TextInput
                      style={styles.modernAmountInput}
                      value={editableAmount}
                      onChangeText={setEditableAmount}
                      keyboardType="numeric"
                      returnKeyType="done"
                      selectionColor={theme.colors.primary}
                   />
                   <Text style={styles.copBadge}>COP</Text>
                </View>
              </View>
              <View style={styles.dividerCustom} />
              <View style={styles.premiumDetailItem}>
                 <View style={[styles.premiumIconBox, { backgroundColor: theme.colors.background }]}><Store size={18} color={theme.colors.primary} /></View>
                 <View style={{ flex: 1 }}>
                    <Text style={styles.premiumDetailLabel}>Establecimiento</Text>
                    <Text style={styles.premiumDetailValue} numberOfLines={1}>{extractedData?.merchant}</Text>
                 </View>
              </View>
              <TouchableOpacity onPress={saveToSupabase} disabled={isSaving} style={styles.premiumConfirmBtn}>
                 <LinearGradient colors={theme.colors.brandGradient as any} style={styles.btnGradient} start={{x:0, y:0}} end={{x:1, y:0}}>
                    {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.premiumConfirmBtnText}>Guardar Gasto 🌿</Text>}
                 </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </BlurView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  scannerContainer: { flex: 1, backgroundColor: '#0A1210' },
  scannerTopBar: { position: 'absolute', top: 0, width: '100%', zIndex: 50, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' },
  closeBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  scannerBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  scannerBadgeText: { color: '#FFF', fontSize: normalize(10), fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  scannerProgressContainer: { marginTop: 'auto', paddingHorizontal: 16 },
  scannerProgressCard: { padding: normalize(20), borderRadius: normalize(28), overflow: 'hidden', borderWidth: 1, borderColor: '#EEE' },
  scannerActionTitle: { fontWeight: '800', color: theme.colors.onSurface, fontSize: normalize(16), marginBottom: 12 },
  scannerInitialView: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  scannerInitialText: { color: 'rgba(255,255,255,0.6)', fontSize: normalize(15), fontWeight: '600' },
  mainCameraButton: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.colors.primary, paddingHorizontal: 32, paddingVertical: 18, borderRadius: 35 },
  mainCameraButtonText: { color: '#FFF', fontSize: normalize(17), fontWeight: '800' },
  beautifulResultCard: { marginTop: 4 },
  aiVerificationShield: { flexDirection: 'row', gap: 8, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginBottom: 16 },
  aiValidationText: { fontSize: normalize(9), fontWeight: '900', color: theme.colors.primary, letterSpacing: 0.5 },
  premiumAmountBox: { alignItems: 'center', marginBottom: normalize(16) },
  premiumAmountLabel: { fontSize: normalize(11), color: theme.colors.onSurfaceVariant, fontWeight: '700' },
  modernAmountInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  modernCurrencySymbol: { fontSize: normalize(20), fontWeight: '700', color: theme.colors.onSurface },
  modernAmountInput: { fontSize: normalize(44), fontWeight: '900', color: theme.colors.onSurface, minWidth: 100, textAlign: 'center', letterSpacing: -1 },
  copBadge: { fontSize: normalize(11), fontWeight: '800', color: theme.colors.primary, marginLeft: 6 },
  dividerCustom: { height: 1.5, backgroundColor: theme.colors.surfaceContainerHigh, marginVertical: normalize(16) },
  premiumDetailItem: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: theme.colors.surfaceContainerLow, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.outlineVariant },
  premiumIconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  premiumDetailLabel: { fontSize: normalize(9), fontWeight: '800', color: theme.colors.onSurfaceVariant, opacity: 0.6, textTransform: 'uppercase' },
  premiumDetailValue: { fontSize: normalize(14), fontWeight: '800', color: theme.colors.onSurface },
  premiumConfirmBtn: { marginTop: 24, borderRadius: 18, overflow: 'hidden', height: normalize(56) },
  btnGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  premiumConfirmBtnText: { color: '#FFF', fontWeight: '900', fontSize: normalize(16) }
});
