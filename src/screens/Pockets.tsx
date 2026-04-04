import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Animated, StyleSheet, ScrollView, Dimensions, Pressable, TextInput, Modal, Alert
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { 
  ChevronRight, ChevronLeft, X, Plus, Trash2 
} from 'lucide-react-native';
import { theme, normalize } from '../theme/theme';
import { CategoryIcon } from '../components/CategoryIcon';
import { AnimatedProgressBar } from '../components/AnimatedProgressBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';
import { supabase } from '../lib/supabase';

const { width, height } = Dimensions.get('window');

const MONTHS = [
  { label: 'Enero', value: 0 }, { label: 'Febrero', value: 1 }, { label: 'Marzo', value: 2 },
  { label: 'Abril', value: 3 }, { label: 'Mayo', value: 4 }, { label: 'Junio', value: 5 },
  { label: 'Julio', value: 6 }, { label: 'Agosto', value: 7 }, { label: 'Septiembre', value: 8 },
  { label: 'Octubre', value: 9 }, { label: 'Noviembre', value: 10 }, { label: 'Diciembre', value: 11 }
];

export const Pockets = ({ pockets, transactions, session, onRefresh }: { pockets: any[], transactions: any[], session: any, onRefresh: () => void }) => {
  const insets = useSafeAreaInsets();
  const [selectedPocket, setSelectedPocket] = useState<any | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  
  // Custom Modals State
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBudget, setNewBudget] = useState('100000');
  
  const [editBudgetModal, setEditBudgetModal] = useState(false);
  const [editVal, setEditVal] = useState('');
  
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [pocketToDelete, setPocketToDelete] = useState<string | null>(null);

  const sheetAnim = useRef(new Animated.Value(height)).current;

  // Reactively sync selected pocket with updated props after a DB refresh
  useEffect(() => {
    if (selectedPocket) {
      const updated = pockets.find(p => p.id === selectedPocket.id);
      if (updated) setSelectedPocket(updated);
    }
  }, [pockets]);

  // -- CRUD ACTIONS --
  const updatePocketBudget = async (id: string, budgetStr: string) => {
     try {
       const budget = parseFloat(budgetStr.replace(/[^0-9]/g, '')) || 0;
       const activeAccessToken = session?.access_token || '';
       const strictClient = activeAccessToken ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
         global: { headers: { Authorization: `Bearer ${activeAccessToken}` } }
       }) : supabase;
       
       await strictClient.from('pockets').update({ budget }).eq('id', id);
       setEditVal(budget.toString());
       onRefresh();
       setEditBudgetModal(false);
       Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
     } catch (e) {
       console.log('Error updating pocket:', e);
     }
  };

  const deletePocket = async (id: string) => {
    try {
      const activeAccessToken = session?.access_token || '';
      const strictClient = activeAccessToken ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${activeAccessToken}` } }
      }) : supabase;
      
      await strictClient.from('pockets').delete().eq('id', id);
      onRefresh();
      closePocket();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (e) {
      console.log('Error deleting pocket:', e);
    }
  };

  const confirmDelete = (id: string | undefined) => {
    if(!id) return;
    setPocketToDelete(id);
    setDeleteConfirmVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const syncPocketToCloud = async () => {
    try {
      if(!newName) return;
      const budget = parseFloat(newBudget.replace(/[^0-9]/g, '')) || 0;
      const activeAccessToken = session?.access_token || '';
      const strictClient = activeAccessToken ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${activeAccessToken}` } }
      }) : supabase;
      
      await strictClient.from('pockets').insert({
        user_id: session?.user?.id,
        name: newName,
        category: 'Otros',
        budget,
        icon: 'Tag'
      });
      
      setNewName('');
      setAddModalVisible(false);
      onRefresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.log('Error creating pocket:', e);
    }
  };

  // -- CALCULATIONS --
  const getPocketSpending = (category: string) => {
    return transactions
      .filter(tx => {
        const txDate = new Date(tx.date_string || tx.created_at);
        return tx.category === category && txDate.getMonth() === selectedMonth && txDate.getFullYear() === 2026;
      })
      .reduce((acc, tx) => acc + Math.abs(parseFloat(tx.amount || 0)), 0);
  };

  const getPocketTransactions = (category: string) => {
    return transactions.filter(tx => {
      const txDate = new Date(tx.date_string || tx.created_at);
      return tx.category === category && txDate.getMonth() === selectedMonth && txDate.getFullYear() === 2026;
    }).sort((a, b) => new Date(b.date_string || b.created_at).getTime() - new Date(a.date_string || a.created_at).getTime());
  };

  const totalBudget = pockets.reduce((acc, p) => acc + (p.budget || 0), 0);
  const totalSpent = pockets.reduce((acc, p) => acc + getPocketSpending(p.category), 0);

  const changeMonth = (dir: 'next' | 'prev') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (dir === 'next') setSelectedMonth((prev) => (prev + 1) % 12);
    else setSelectedMonth((prev) => (prev - 1 + 12) % 12);
  };

  const openPocket = (pocket: any) => {
    setSelectedPocket(pocket);
    setEditVal(pocket.budget.toString());
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 50, friction: 8 }).start();
  };

  const closePocket = () => {
    Animated.timing(sheetAnim, { toValue: height, duration: 250, useNativeDriver: true }).start(() => setSelectedPocket(null));
  };

  const POCKET_COLORS: Record<string, string[]> = {
    'Comida': ['#7D907E', '#5B6259'],
    'Transporte': ['#6B8E9B', '#415A63'],
    'Ocio': ['#C9A959', '#8C753E'],
    'Otros': ['#5B6259', '#2D3436'],
    'Ahorros': ['#A28D7F', '#6D5D54'],
    'default': ['#7D907E', '#6B8E9B']
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={[styles.scrollPadding, { paddingTop: normalize(120) }]} 
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intelligentMonthPickerInline}>
          <TouchableOpacity onPress={() => changeMonth('prev')} style={styles.monthArrow}>
             <ChevronLeft size={20} color={theme.colors.onSurfaceVariant} />
          </TouchableOpacity>
          <View style={styles.monthIndicator}>
             <Text style={styles.monthDisplayLabel}>{MONTHS[selectedMonth].label}</Text>
             {selectedMonth === new Date().getMonth() && <View style={styles.currentMonthDot} />}
          </View>
          <TouchableOpacity onPress={() => changeMonth('next')} style={styles.monthArrow}>
             <ChevronRight size={20} color={theme.colors.onSurfaceVariant} />
          </TouchableOpacity>
        </View>

        <View style={styles.topStats}>
           <Text style={styles.topLabel}>PRESUPUESTO EN {MONTHS[selectedMonth].label.toUpperCase()}</Text>
           <Text style={styles.topAmount}>$ {totalBudget.toLocaleString('es-CO')}</Text>
           <View style={styles.globalProgressWrapper}>
             <AnimatedProgressBar 
                percent={Math.min((totalSpent / (totalBudget || 1)) * 100, 100)} 
                color={theme.colors.primary} 
                bgColor="rgba(0,0,0,0.05)" 
              />
              <View style={styles.progressLabelRow}>
                 <Text style={styles.progressText}>$ {totalSpent.toLocaleString('es-CO')} usados</Text>
                 <Text style={styles.progressPct}>{Math.round((totalSpent / (totalBudget || 1)) * 100)}%</Text>
              </View>
           </View>
        </View>

        <View style={styles.gridHeader}>
           <Text style={styles.gridTitle}>Bolsillos</Text>
        </View>

        <View style={styles.pocketGrid}>
           {pockets.map((pocket, i) => {
              const spent = getPocketSpending(pocket.category);
              const remaining = Math.max((pocket.budget || 0) - spent, 0);
              const colors = POCKET_COLORS[pocket.category] || POCKET_COLORS.default;
              
              return (
                <TouchableOpacity key={pocket.id || i} style={styles.pocketCardContainer} activeOpacity={0.8} onPress={() => openPocket(pocket)}>
                  <LinearGradient colors={colors as any} style={styles.pocketCard} start={{x:0, y:0}} end={{x:1, y:1}}>
                    <View style={styles.pocketIconBox}>
                        <CategoryIcon iconName={pocket.icon} size={normalize(18)} color="#FFF" />
                    </View>
                    <Text style={styles.pocketName}>{pocket.name}</Text>
                    <BlurView intensity={20} tint="light" style={styles.pocketOverlayStatus}>
                      <Text style={styles.statusText} numberOfLines={1}>{remaining > 0 ? `$${remaining.toLocaleString('es-CO')}` : 'Límite'}</Text>
                      <ChevronRight size={12} color="#FFF" />
                    </BlurView>
                  </LinearGradient>
                </TouchableOpacity>
              );
            })}

            {/* ADD POCKET BUTTON Card */}
            <TouchableOpacity 
              style={styles.pocketCardContainer} 
              activeOpacity={0.8} 
              onPress={() => setAddModalVisible(true)}
            >
              <View style={[styles.pocketCard, styles.addPocketCard]}>
                <View style={styles.addIconCircle}>
                   <Plus size={24} color={theme.colors.primary} />
                </View>
                <Text style={styles.addPocketText}>Nueva categoría</Text>
              </View>
            </TouchableOpacity>
        </View>
        <View style={{ height: normalize(120) }} />
      </ScrollView>

      {/* CUSTOM ADD MODAL */}
      <Modal visible={addModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nuevo Bolsillo</Text>
            <TextInput 
              style={styles.modalInput} 
              placeholder="Nombre (ej. Suscripciones)"
              value={newName}
              onChangeText={setNewName}
            />
            <TextInput 
              style={styles.modalInput} 
              placeholder="Presupuesto"
              keyboardType="numeric"
              value={newBudget}
              onChangeText={setNewBudget}
            />
            <View style={styles.modalActions}>
               <TouchableOpacity onPress={() => setAddModalVisible(false)} style={styles.modalCancel}><Text style={styles.modalCancelTxt}>Cancelar</Text></TouchableOpacity>
               <TouchableOpacity onPress={syncPocketToCloud} style={styles.modalSave}><Text style={styles.modalSaveTxt}>Crear</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* CUSTOM EDIT BUDGET MODAL */}
      <Modal visible={editBudgetModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
               <Text style={styles.modalTitle}>Gestionar Bolsillo</Text>
               <TouchableOpacity onPress={() => confirmDelete(selectedPocket?.id)}>
                  <Trash2 size={20} color={theme.colors.error} />
               </TouchableOpacity>
            </View>
            
            <Text style={styles.modalLabel}>Nuevo tope para {selectedPocket?.name}:</Text>
            <TextInput 
              style={styles.modalInput} 
              keyboardType="numeric"
              value={editVal}
              onChangeText={setEditVal}
              autoFocus
            />
            <View style={styles.modalActions}>
               <TouchableOpacity onPress={() => setEditBudgetModal(false)} style={styles.modalCancel}><Text style={styles.modalCancelTxt}>Cancelar</Text></TouchableOpacity>
               <TouchableOpacity onPress={() => updatePocketBudget(selectedPocket?.id, editVal)} style={styles.modalSave}><Text style={styles.modalSaveTxt}>Guardar Cambios</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL DE CONFIRMACIÓN PREMIUM (DANGER ZONE) */}
      <Modal visible={deleteConfirmVisible} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[styles.modalContent, { 
             alignSelf: 'center', 
             width: width * 0.85, 
             paddingHorizontal: 28, 
             paddingVertical: 32, 
             borderRadius: 35,
             backgroundColor: '#FFF',
             alignItems: 'center'
          }]}>
            <View style={{ backgroundColor: 'rgba(160, 62, 64, 0.08)', width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
               <Trash2 size={28} color={theme.colors.error} />
            </View>
            
            <Text style={[styles.modalTitle, { textAlign: 'center', fontSize: normalize(19), lineHeight: 26, marginBottom: 8 }]}>¿Seguro que quieres eliminar este bolsillo?</Text>
            <Text style={[styles.modalLabel, { textAlign: 'center', fontSize: normalize(12), opacity: 0.5, marginBottom: 28, color: theme.colors.onSurfaceVariant }]}>Esta acción borrará todo el historial y configuraciones permanentemente de Save.</Text>
            
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
               <TouchableOpacity 
                  onPress={() => setDeleteConfirmVisible(false)} 
                  style={[styles.modalCancel, { flex: 1, height: 54, borderWidth: 0, backgroundColor: theme.colors.surfaceContainerLow, borderRadius: 20, justifyContent: 'center', alignItems: 'center' }]}
               >
                  <Text style={[styles.modalCancelTxt, { color: theme.colors.onSurfaceVariant, fontSize: normalize(14), fontWeight: '700' }]}>Atrás</Text>
               </TouchableOpacity>

               <TouchableOpacity 
                  onPress={() => {
                    if (pocketToDelete) {
                      deletePocket(pocketToDelete);
                      setDeleteConfirmVisible(false);
                      setEditBudgetModal(false);
                    }
                  }} 
                  style={[styles.modalSave, { flex: 1, height: 54, backgroundColor: theme.colors.error, borderRadius: 20, justifyContent: 'center', alignItems: 'center' }]}
               >
                  <Text style={[styles.modalSaveTxt, { fontSize: normalize(14), fontWeight: '800' }]}>Sí, eliminar</Text>
               </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* DETALLE Bottom Sheet */}
      {selectedPocket && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          <Pressable style={styles.backdrop} onPress={closePocket}>
             <Animated.View style={[styles.backdropTint, { opacity: sheetAnim.interpolate({ inputRange: [0, height], outputRange: [1, 0] }) }]} />
          </Pressable>
          <Animated.View style={[styles.bottomSheet, { transform: [{ translateY: sheetAnim }] }]}>
             <View style={styles.sheetHandle} />
             <View style={styles.sheetHeader}>
                <View style={styles.sheetTitleContainer}>
                   <View style={[styles.pocketIconBox, { backgroundColor: (POCKET_COLORS[selectedPocket.category] || POCKET_COLORS.default)[0], marginBottom: 0 }]}>
                      <CategoryIcon iconName={selectedPocket.icon} size={normalize(20)} color="#FFF" />
                   </View>
                   <View style={{ marginLeft: 15 }}>
                      <Text style={styles.sheetTitle}>{selectedPocket.name}</Text>
                      <Text style={styles.sheetSubtitle}>Historial de {MONTHS[selectedMonth].label} 2026</Text>
                   </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                   <TouchableOpacity 
                     onPress={() => confirmDelete(selectedPocket.id)} 
                     style={[styles.closeBtn, { backgroundColor: 'rgba(160, 62, 64, 0.08)' }]}
                   >
                     <Trash2 size={18} color={theme.colors.error} />
                   </TouchableOpacity>
                   <TouchableOpacity onPress={closePocket} style={styles.closeBtn}>
                     <X size={20} color={theme.colors.onSurfaceVariant} />
                   </TouchableOpacity>
                </View>
             </View>

             <View style={styles.sheetStats}>
                <TouchableOpacity 
                   style={styles.sheetStatItem}
                   onPress={() => setEditBudgetModal(true)}
                >
                   <Text style={styles.sheetStatLabel}>ASIGNADO (Toca para editar)</Text>
                   <Text style={styles.sheetStatValue}>$ {(selectedPocket.budget || 0).toLocaleString('es-CO')}</Text>
                </TouchableOpacity>
                <View style={styles.sheetStatItem}>
                   <Text style={styles.sheetStatLabel}>EFECTUADO</Text>
                   <Text style={[styles.sheetStatValue, { color: theme.colors.error }]}>$ {getPocketSpending(selectedPocket.category).toLocaleString('es-CO')}</Text>
                </View>
             </View>

             <ScrollView style={styles.historyList} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
                {getPocketTransactions(selectedPocket.category).length === 0 ? (
                   <View style={styles.emptyContainer}>
                      <Text style={styles.noData}>Nada para {MONTHS[selectedMonth].label}</Text>
                   </View>
                ) : (
                  getPocketTransactions(selectedPocket.category).map((tx, idx) => (
                    <View key={tx.id || idx} style={styles.txItem}>
                       <View style={styles.txInfo}>
                          <Text style={styles.txMerchant}>{tx.merchant}</Text>
                          <Text style={styles.txDate}>{new Date(tx.date_string || tx.created_at).toLocaleDateString()}</Text>
                       </View>
                       <Text style={styles.txAmount}>$ {Math.abs(tx.amount).toLocaleString('es-CO')}</Text>
                    </View>
                  ))
                )}
             </ScrollView>

          </Animated.View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  intelligentMonthPickerInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    backgroundColor: '#FFF',
    marginHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 20,
    marginBottom: 20,
    ...theme.shadows.soft,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)'
  },
  monthArrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' },
  monthIndicator: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 15 },
  monthDisplayLabel: { fontSize: normalize(16), fontWeight: '900', color: theme.colors.onSurface, letterSpacing: -0.5 },
  currentMonthDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.primary, marginLeft: 8 },

  scrollPadding: { paddingHorizontal: normalize(24), paddingBottom: 120 },
  topStats: { marginBottom: normalize(32) },
  topLabel: { fontSize: normalize(9), fontWeight: '900', color: theme.colors.primary, opacity: 0.8 },
  topAmount: { fontSize: normalize(44), fontWeight: '900', color: theme.colors.onSurface, letterSpacing: -2, marginVertical: normalize(8) },
  globalProgressWrapper: { marginTop: normalize(16) },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  progressText: { fontSize: normalize(13), color: theme.colors.onSurfaceVariant, fontWeight: '600', opacity: 0.7 },
  progressPct: { fontSize: normalize(13), color: theme.colors.primary, fontWeight: '900' },

  gridHeader: { marginBottom: normalize(20) },
  gridTitle: { fontSize: normalize(22), fontWeight: '900', color: theme.colors.onSurface, letterSpacing: -0.5 },

  pocketGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: normalize(16) },
  pocketCardContainer: { width: (width - normalize(48) - normalize(16)) / 2 },
  pocketCard: { borderRadius: normalize(28), padding: normalize(18), height: normalize(160), overflow: 'hidden', ...theme.shadows.soft },
  pocketIconBox: { width: normalize(42), height: normalize(42), borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: normalize(16) },
  pocketName: { fontSize: normalize(15), fontWeight: '900', color: '#FFF' },
  pocketOverlayStatus: { position: 'absolute', bottom: 10, left: 10, right: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusText: { fontSize: normalize(10), color: '#FFF', fontWeight: '900' },

  addPocketCard: { 
    backgroundColor: theme.colors.surfaceContainerLow, 
    borderWidth: 2, 
    borderColor: theme.colors.outlineVariant, 
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center', 
    gap: 12 
  },
  addIconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', ...theme.shadows.soft },
  addPocketText: { fontSize: normalize(12), fontWeight: '800', color: theme.colors.onSurfaceVariant, textAlign: 'center' },

  backdrop: { ...StyleSheet.absoluteFillObject },
  backdropTint: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  bottomSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.75, backgroundColor: '#FFF', borderTopLeftRadius: 40, borderTopRightRadius: 40, padding: 25, ...theme.shadows.premium },
  sheetHandle: { width: 40, height: 4, backgroundColor: theme.colors.outlineVariant, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 30 },
  sheetTitleContainer: { flexDirection: 'row', alignItems: 'center' },
  sheetTitle: { fontSize: normalize(24), fontWeight: '900', color: theme.colors.onSurface },
  sheetSubtitle: { fontSize: normalize(12), color: theme.colors.onSurfaceVariant, fontWeight: '600' },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' },
  sheetStats: { flexDirection: 'row', gap: 15, marginBottom: 30, backgroundColor: theme.colors.surfaceContainerLow, padding: 15, borderRadius: 25 },
  sheetStatItem: { flex: 1 },
  sheetStatLabel: { fontSize: normalize(8), fontWeight: '900', color: theme.colors.onSurfaceVariant, opacity: 0.6, marginBottom: 4 },
  sheetStatValue: { fontSize: normalize(14), fontWeight: '900', color: theme.colors.onSurface },

  historyList: { flex: 1 },
  txItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  txInfo: { flex: 1 },
  txMerchant: { fontSize: normalize(14), fontWeight: '800', color: theme.colors.onSurface },
  txDate: { fontSize: normalize(11), color: theme.colors.onSurfaceVariant, opacity: 0.7 },
  txAmount: { fontSize: normalize(15), fontWeight: '900', color: theme.colors.onSurface },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 25 },
  modalContent: { width: '100%', backgroundColor: '#FFF', borderRadius: 30, padding: 25, ...theme.shadows.premium },
  modalTitle: { fontSize: normalize(20), fontWeight: '900', color: theme.colors.onSurface, marginBottom: 20 },
  modalLabel: { fontSize: normalize(12), color: theme.colors.onSurfaceVariant, marginBottom: 10, fontWeight: '600' },
  modalInput: { backgroundColor: theme.colors.surfaceContainerLow, borderRadius: 15, padding: 15, fontSize: normalize(16), color: theme.colors.onSurface, marginBottom: 20, borderWidth: 1, borderColor: theme.colors.outlineVariant },
  modalActions: { flexDirection: 'row', gap: 15, justifyContent: 'flex-end' },
  modalCancel: { padding: 15 },
  modalCancelTxt: { color: theme.colors.onSurfaceVariant, fontWeight: '700' },
  modalSave: { backgroundColor: theme.colors.primary, paddingVertical: 12, paddingHorizontal: 25, borderRadius: 15 },
  modalSaveTxt: { color: '#FFF', fontWeight: '900' },

  emptyContainer: { alignItems: 'center', marginTop: 40 },
  noData: { fontSize: normalize(13), color: theme.colors.onSurfaceVariant, fontStyle: 'italic', marginTop: 10, textAlign: 'center' },
  deletePocketBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 16, 
    borderRadius: 16, 
    backgroundColor: 'rgba(160, 62, 64, 0.05)',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(160, 62, 64, 0.1)',
    marginTop: 20
  },
  deletePocketTxt: { 
    color: theme.colors.error, 
    fontSize: normalize(14), 
    fontWeight: '800',
    letterSpacing: -0.3
  }
});
