import React, { useState, useMemo } from 'react';
import {
  View, Text, Image, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, TextInput, Dimensions, Platform, TouchableWithoutFeedback, Keyboard, KeyboardAvoidingView
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
import { normalizeMerchant } from '../utils/merchant';
import { logEvent, EVENTS } from '../lib/events';

const { width, height } = Dimensions.get('window');

export const Scanner = ({ onGoBack, onSaveSuccess, session, pockets }: { onGoBack: () => void; onSaveSuccess: () => void; session?: any; pockets?: any[] }) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    scannerContainer: { flex: 1, backgroundColor: '#0A1A18' }, // Darker Teal-Slate for premium focus
    scannerTopBar: { position: 'absolute', top: 0, width: '100%', zIndex: 100, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center' },
    closeBtn: { 
      width: 48, 
      height: 48, 
      borderRadius: 24, 
      backgroundColor: 'rgba(255,255,255,0.1)', 
      alignItems: 'center', 
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.15)'
    },
    scannerBadge: { 
      paddingHorizontal: 14, 
      paddingVertical: 8, 
      borderRadius: 20, 
      borderWidth: 1.5, 
      borderColor: 'rgba(255,255,255,0.4)',
      ...theme.shadows.premium 
    },
    scannerBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5 },
    
    scannerInitialView: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    scannerInitialText: { color: 'rgba(255,255,255,0.6)', fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 40, textAlign: 'center' },
    
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
      backgroundColor: theme.colors.glassWhite,
      borderWidth: 1.5, 
      borderColor: 'rgba(255,255,255,0.8)',
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
      backgroundColor: theme.colors.primaryContainer,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: theme.colors.primary + '30'
    },
    aiValidationText: { fontSize: 10, fontWeight: '900', color: theme.colors.primary, letterSpacing: 1, textTransform: 'uppercase' },
    
    premiumAmountBox: { alignItems: 'center', marginBottom: 24 },
    premiumAmountLabel: { fontSize: 12, color: theme.colors.primary, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
    modernAmountInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    modernCurrencySymbol: { fontSize: 24, fontWeight: '800', color: theme.colors.onSurface, marginRight: 4 },
    modernAmountInput: { fontSize: 52, fontWeight: '900', color: theme.colors.onSurface, textAlign: 'center', letterSpacing: -2, minWidth: 120 },
    copBadge: { fontSize: 12, fontWeight: '900', color: theme.colors.primary, marginLeft: 8 },
    
    dividerCustom: { height: 1.5, backgroundColor: theme.colors.divider, marginVertical: 24 },
    
    premiumDetailItem: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 16, 
      backgroundColor: 'rgba(255,255,255,0.5)', 
      padding: 18, 
      borderRadius: 24, 
      borderWidth: 1, 
      borderColor: theme.colors.divider,
      marginBottom: 12
    },
    premiumIconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primaryContainer },
    premiumDetailLabel: { fontSize: 10, fontWeight: '900', color: theme.colors.primary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
    premiumDetailInput: { fontSize: 16, fontWeight: '800', color: theme.colors.onSurface, paddingVertical: 4 },
    premiumDetailValue: { fontSize: 16, fontWeight: '800', color: theme.colors.onSurface },
    originalTicketBadge: { fontSize: 10, fontWeight: '800', color: theme.colors.secondary, marginTop: 4, fontStyle: 'italic' },
    
    categoryPicker: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 24 },
    catChip: { 
      paddingHorizontal: 16, 
      paddingVertical: 10, 
      borderRadius: 14, 
      backgroundColor: theme.colors.primaryContainer,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.5)'
    },
    catChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    catText: { fontSize: 13, fontWeight: '800', color: theme.colors.primary },
    catTextActive: { color: '#FFF' },
    
    premiumConfirmBtn: { borderRadius: 24, overflow: 'hidden', height: 64, ...theme.shadows.soft },
    btnGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    premiumConfirmBtnText: { color: '#FFF', fontWeight: '900', fontSize: 17, letterSpacing: -0.3 }
  }), [theme]);

  const [progress, setProgress] = useState(0);
  const [editableAmount, setEditableAmount] = useState<string>('');
  const [image, setImage] = useState<string | null>(null);
  const [visionOutput, setVisionOutput] = useState<string | null>(null);
  const [isOpeningPicker, setIsOpeningPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [isManualMode, setIsManualMode] = useState(false);
  const [editableMerchant, setEditableMerchant] = useState('');
  
  // Extract dynamic categories from pockets (fallback to default if empty)
  const availableCategories = useMemo(() => {
    const defaultCats = ['Comida', 'Transporte', 'Ocio', 'Ahorros', 'Otros'];
    if (!pockets || pockets.length === 0) return defaultCats;
    
    // Get unique categories from pockets
    const pocketCats = pockets.map(p => p.category).filter(Boolean);
    const uniqueCats = Array.from(new Set([...pocketCats, ...defaultCats]));
    return uniqueCats;
  }, [pockets]);

  const [selectedCategory, setSelectedCategory] = useState(availableCategories[0]);

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
    // OCR + LLM parsing is now server-side via the `ocr-receipt` Edge Function.
    // No API keys leave the phone; we only send the image + our JWT.
    setProgress(10);
    const fakeProgress = setInterval(() => setProgress(p => (p < 85 ? p + 3 : p)), 120);
    try {
      logEvent(EVENTS.SCANNER_OPENED);

      // Pass the user's access token explicitly. Without this supabase-js
      // may fall back to the anon key when the session isn't fully loaded,
      // and the Edge Function will return 401.
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        throw new Error('No hay sesión activa. Vuelve a iniciar sesión.');
      }

      const { data, error } = await supabase.functions.invoke('ocr-receipt', {
        body: { image_base64: base64 },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      clearInterval(fakeProgress);

      if (error) throw error;
      const parsed = data?.parsed ?? {};

      const dOCR = new Date();
      const fallbackDate = `${dOCR.getFullYear()}-${String(dOCR.getMonth() + 1).padStart(2, '0')}-${String(dOCR.getDate()).padStart(2, '0')}`;
      const finalDate = parsed.date || fallbackDate;
      const amount = String(parsed.amount || '0').replace(/[^0-9]/g, '');
      const isValid =
        parsed &&
        typeof parsed.amount === 'number' &&
        parsed.amount > 0 &&
        parsed.merchant &&
        parsed.merchant !== 'Desconocido';

      setExtractedData({
        merchant: parsed.merchant || 'Desconocido',
        amount,
        date: finalDate,
        category: 'Comida',
      });

      setEditableAmount(amount);
      setEditableMerchant(parsed.merchant || '');
      // We still let the user pick the category in the UI.

      if (!isValid) setIsManualMode(true);
      setProgress(100);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      clearInterval(fakeProgress);
      console.warn('[scanner] ocr failed', error);
      setIsManualMode(true);
      setProgress(100);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const saveToSupabase = async () => {
    if (isSaving) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsSaving(true);
    try {
      const user = session?.user;
      if (!user) throw new Error('Sesión no detectada.');

      const iconMap: Record<string, string> = { 'Comida': 'utensils', 'Transporte': 'car', 'Ocio': 'theater', 'Ahorros': 'piggy-bank' };
      const amountValue = parseFloat(editableAmount.replace(/[^0-9.]/g, ''));
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const { error } = await supabase.rpc('register_expense', {
        p_user_id: user.id,
        p_merchant: editableMerchant || 'Factura Escaneada',
        p_amount: Math.abs(amountValue),
        p_category: selectedCategory,
        p_icon: iconMap[selectedCategory] || 'receipt-text',
        p_date_string: today
      });

      if (error) throw error;

      setIsSaving(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaveSuccess();
    } catch (error: any) {
      setIsSaving(false);
      console.error(error);
      alert('Error guardando el gasto.');
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView style={[styles.scannerContainer, { backgroundColor: theme.colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        
        {image && (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }]}>
            <Image source={{ uri: image }} style={{ width: '100%', height: '100%', opacity: 0.6 }} resizeMode="contain" />
          </View>
        )}

        <View style={[styles.scannerTopBar, { paddingTop: Math.max(insets.top, 16) + 16 }]}>
          <TouchableOpacity 
            style={[styles.closeBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} 
            onPress={() => { if (image) { setImage(null); setExtractedData(null); setProgress(0); } else onGoBack(); Keyboard.dismiss(); }}
          >
            <XIcon size={24} color={theme.colors.onSurface} strokeWidth={2.5} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={[styles.scannerBadge, { backgroundColor: theme.colors.primaryContainer, borderColor: theme.colors.primary + '30' }]}>
            <Text style={[styles.scannerBadgeText, { color: theme.colors.primary }]}>Ingresar Gasto</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingBottom: Math.max(insets.bottom, 24) + 20 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {(image && progress > 0 && progress < 100) ? (
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }]}>
               <BlurView intensity={20} tint="dark" style={{ padding: 40, borderRadius: 32, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
                 <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginBottom: 24 }} />
                 <Text style={{ color: '#FFF', fontSize: 20, fontWeight: '900', marginBottom: 12, textAlign: 'center' }}>
                   {progress < 40 ? 'Escaneando...' : 'Analizando con IA...'}
                 </Text>
                 <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 24 }}>
                   Save está extrayendo los datos de tu factura
                 </Text>
                 <View style={{ width: 140 }}>
                   <AnimatedProgressBar percent={progress} color={theme.colors.primary} bgColor="rgba(255,255,255,0.1)" />
                 </View>
               </BlurView>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 16 }}>
               {!image && (
                 <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                    <TouchableOpacity onPress={takePhoto} style={[styles.mainCameraButton, { flex: 1, backgroundColor: theme.colors.surface, borderWidth: 1.5, borderColor: theme.colors.outlineVariant }]} activeOpacity={0.8}>
                      <CameraIcon size={20} color={theme.colors.primary} />
                      <Text style={[styles.mainCameraButtonText, { color: theme.colors.primary, fontSize: 13 }]}>Cámara</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={pickImage} style={[styles.mainCameraButton, { flex: 1, backgroundColor: theme.colors.surface, borderWidth: 1.5, borderColor: theme.colors.outlineVariant }]} activeOpacity={0.8}>
                      <ImagePlusIcon size={20} color={theme.colors.primary} />
                      <Text style={[styles.mainCameraButtonText, { color: theme.colors.primary, fontSize: 13 }]}>Galería</Text>
                    </TouchableOpacity>
                 </View>
               )}

               <BlurView intensity={Platform.OS === 'ios' ? 95 : 100} tint="light" style={styles.scannerProgressCard}>
                  {image && progress === 100 && (
                    <View style={styles.aiVerificationShield}>
                      <Sparkles size={14} color={theme.colors.primary} fill={theme.colors.primary} />
                      <Text style={styles.aiValidationText}>Escaneo Inteligente</Text>
                    </View>
                  )}

                  {!image && (
                    <Text style={[styles.aiValidationText, { textAlign: 'center', marginBottom: 16, color: theme.colors.onSurfaceVariant }]}>
                      AGREGAR MANUALMENTE
                    </Text>
                  )}

                  <View style={styles.premiumAmountBox}>
                    <Text style={styles.premiumAmountLabel}>Monto</Text>
                    <View style={styles.modernAmountInputRow}>
                      <Text style={styles.modernCurrencySymbol}>$</Text>
                      <TextInput
                        style={styles.modernAmountInput}
                        value={editableAmount}
                        onChangeText={setEditableAmount}
                        keyboardType="numeric"
                        selectionColor={theme.colors.primary}
                        placeholder="0"
                        placeholderTextColor={theme.colors.outlineVariant}
                      />
                      <Text style={styles.copBadge}>COP</Text>
                    </View>
                  </View>

                  <View style={styles.premiumDetailItem}>
                     <View style={[styles.premiumIconBox, { backgroundColor: theme.colors.surfaceContainerHighest }]}><Store size={20} color={theme.colors.onSurface} /></View>
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
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
                      {availableCategories.map((cat) => (
                        <TouchableOpacity 
                          key={cat} 
                          onPress={() => setSelectedCategory(cat)}
                          style={[styles.catChip, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }, selectedCategory === cat && styles.catChipActive]}
                        >
                          <Text style={[styles.catText, selectedCategory === cat && styles.catTextActive]}>{cat}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  <TouchableOpacity 
                    onPress={saveToSupabase} 
                    disabled={isSaving || parseInt(editableAmount.replace(/[^0-9]/g, '') || '0') <= 0} 
                    style={[styles.premiumConfirmBtn, (isSaving || parseInt(editableAmount.replace(/[^0-9]/g, '') || '0') <= 0) && { opacity: 0.5 }]}
                    activeOpacity={0.9}
                  >
                    <LinearGradient colors={theme.colors.brandGradient as any} style={styles.btnGradient} start={{x:0, y:0}} end={{x:1, y:0}}>
                      {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.premiumConfirmBtnText}>Guardar Gasto</Text>}
                    </LinearGradient>
                  </TouchableOpacity>
               </BlurView>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
};
