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
import { normalizeMerchant } from '../utils/merchant';

const { width } = Dimensions.get('window');

export const Scanner = ({ onGoBack, onSaveSuccess, session }: { onGoBack: () => void; onSaveSuccess: () => void; session?: any }) => {
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

  const saveToSupabase = async () => {
    if (!extractedData || isSaving) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsSaving(true);
    try {
      const user = session?.user;
      if (!user || !session?.access_token) throw new Error('Sesión no detectada.');

      // Cliente con token de sesión para RLS seguro
      const strictClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${session.access_token}` } },
        auth: { persistSession: false }
      });

      const iconMap: Record<string, string> = { 'Comida': 'Utensils', 'Transporte': 'Car', 'Ocio': 'Theater', 'Ahorros': 'PiggyBank', 'Ingresos': 'Banknote' };
      const merchantOriginal = editableMerchant || extractedData?.merchant || 'Desconocido';
      const merchantCanonical = normalizeMerchant(merchantOriginal);

      // Parsing de monto Robusto
      let cleanAmount = String(editableAmount).trim();
      if (cleanAmount.includes(',') && !cleanAmount.includes('.')) {
        cleanAmount = cleanAmount.replace(',', '.');
      }
      const amountValue = parseFloat(cleanAmount.replace(/[^0-9.]/g, ''));
      
      if (isNaN(amountValue)) throw new Error('El monto ingresado no es válido.');

      const today = new Date().toISOString().split('T')[0];
      const ticketDate = extractedData.date || today;
      const category = selectedCategory || extractedData.category || 'Comida';

      const { error } = await strictClient.from('transactions').insert({
        user_id: user.id, 
        merchant: merchantOriginal, 
        canonical_merchant: merchantCanonical,
        amount: -Math.abs(amountValue), 
        date_string: today, // REGISTRO DE CAJA (HOY)
        receipt_date: ticketDate, // FECHA ORIGINAL DEL PAPEL
        category, 
        icon: iconMap[category] || 'ReceiptText', 
        metadata: { ...extractedData, original_ticket_date: ticketDate }
      });

      if (error) throw error;

      // Tracking avanzado del evento
      await strictClient.from('user_events').insert({ 
        user_id: user.id, 
        event_type: 'scan_success', 
        event_data: { 
          merchant: merchantOriginal, 
          canonical: merchantCanonical, 
          amount: amountValue 
        } 
      });

      setIsSaving(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaveSuccess();
    } catch (error: any) {
      console.error('Save Error:', error);
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
          messages: [{ 
            role: 'system', 
            content: 'Auditor experto para la app "Save". Estamos en el año 2026. Identifica el establecimiento, monto y fecha. IMPORTANTE: Todas las transacciones pertenecen al año 2026; si detectas años como 2024 o 2025, CORRÍGELOS a 2026. JSON: merchant, amount (entero), date (YYYY-MM-DD), category (Comida, Transporte, Ocio, Otros).' 
          }, { role: 'user', content: ocrText }],
          response_format: { type: 'json_object' }
        })
      });
      const oaiData = await oaiResp.json();
      clearInterval(fakeProgress);
      const result = JSON.parse(oaiData.choices[0].message.content);
      
      // BLINDAJE 2026: Corrección forzada en código si la IA falla
      let finalDate = result.date || new Date().toISOString().split('T')[0];
      if (finalDate.includes('2024') || finalDate.includes('2025')) {
        finalDate = finalDate.replace(/2024|2025/g, '2026');
      } else if (!finalDate.includes('2026')) {
        // Asegurar que al menos tenga el formato correcto para 2026
        const parts = finalDate.split('-');
        if (parts.length === 3) finalDate = `2026-${parts[1]}-${parts[2]}`;
      }

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
      
      if (!isValid) {
        setIsManualMode(true);
        setVisionOutput('No logré capturar todo. Por favor completa los datos.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        setVisionOutput(`¡Procesado!`);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      
      setProgress(100);
    } catch (error: any) {
      console.error('OCR Error:', error);
      clearInterval(fakeProgress);
      setIsManualMode(true);
      setVisionOutput('Error al leer el ticket. Ingresa los datos manualmente.');
      setProgress(100);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      // Tracking: Registro de fallo para mejora de producto
      try {
        const strictClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: `Bearer ${session.access_token}` } },
          auth: { persistSession: false }
        });
        await strictClient.from('user_events').insert({ 
          user_id: session?.user?.id, 
          event_type: 'scan_failed', 
          event_data: { error: error.message || 'Unknown OCR error' } 
        });
      } catch (e) { /* silent fail */ }
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
          <TouchableOpacity onPress={pickImage} style={[styles.mainCameraButton, { backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }]} activeOpacity={0.8}>
            <ImagePlusIcon size={normalize(24)} color="#FFF" />
            <Text style={styles.mainCameraButtonText}>Elegir de Galería</Text>
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
      {(image || isManualMode) && (
        <View style={[styles.scannerProgressContainer, { paddingBottom: Math.max(insets.bottom, 24) + normalize(40) }]}>
          <BlurView intensity={96} tint="light" style={styles.scannerProgressCard}>
            {progress < 100 ? (
              <View>
                <Text style={styles.scannerActionTitle}>{progress < 25 ? 'Iniciando IA...' : 'Analizando factura...'}</Text>
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
                    <TextInput 
                      style={styles.premiumDetailInput}
                      value={editableMerchant}
                      onChangeText={setEditableMerchant}
                      placeholder="Nombre del lugar"
                    />
                 </View>
              </View>

              <View style={[styles.premiumDetailItem, { marginTop: 12, backgroundColor: theme.colors.surfaceContainerHighest }]}>
                 <View style={[styles.premiumIconBox, { backgroundColor: theme.colors.background }]}><Calendar size={18} color={theme.colors.primary} /></View>
                 <View style={{ flex: 1 }}>
                    <Text style={styles.premiumDetailLabel}>Registro de Gasto (Hoy)</Text>
                    <Text style={styles.premiumDetailValue}>{new Date().toLocaleDateString('es-CO')}</Text>
                    <Text style={styles.originalTicketBadge}>Ticket del {extractedData?.date || 'Desconocido'}</Text>
                 </View>
              </View>

              <View style={styles.categoryPickerRow}>
                {['Comida', 'Transporte', 'Ocio', 'Ahorros'].map((cat) => (
                  <TouchableOpacity 
                    key={cat} 
                    onPress={() => setSelectedCategory(cat)}
                    style={[styles.smallCatChip, selectedCategory === cat && { backgroundColor: theme.colors.primaryContainer }]}
                  >
                    <Text style={[styles.smallCatText, selectedCategory === cat && { color: theme.colors.primary, fontWeight: '900' }]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
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
      )}
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
  premiumDetailInput: { fontSize: normalize(15), fontWeight: '700', color: theme.colors.onSurface, paddingVertical: 4 },
  originalTicketBadge: { fontSize: normalize(9), fontWeight: '800', color: theme.colors.secondary, marginTop: 4, fontStyle: 'italic' },
  categoryPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, marginBottom: 8 },
  smallCatChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: theme.colors.surfaceContainerLow },
  smallCatText: { fontSize: normalize(11), fontWeight: '800', color: theme.colors.onSurfaceVariant },
  premiumConfirmBtn: { marginTop: 24, borderRadius: 18, overflow: 'hidden', height: normalize(56) },
  btnGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  premiumConfirmBtnText: { color: '#FFF', fontWeight: '900', fontSize: normalize(16) }
});
