import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Dimensions, KeyboardAvoidingView, Platform, ActivityIndicator, Switch, Keyboard } from 'react-native';
import { X, CheckCircle2, Circle, ArrowRight, Sparkles, Wallet, DollarSign, Percent, Briefcase, Tag, PlusCircle, Check, Utensils, Car, Home, Zap, Heart, Gamepad, PiggyBank, GraduationCap, Info, RotateCcw } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../lib/supabase';
import { formatMoney, formatMoneyDigits } from '../lib/format';
import { useCurrency } from '../lib/CurrencyContext';
import { notify } from '../lib/notify';
import { TourStep } from '../components/tour/TourStep';
import { useTour } from '../components/tour/TourContext';
import type { TourStepType } from '../components/tour/TourContext';
import type { Session } from '@supabase/supabase-js';

const { width } = Dimensions.get('window');
const formatCurrency = formatMoneyDigits;

export const AddIncome = ({ pockets, session, onCancel, onSaveSuccess, editTransaction }: { pockets: any[], session: Session, onCancel: () => void, onSaveSuccess: () => void, editTransaction?: any }) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { symbol } = useCurrency();
  
  const isEditing = !!editTransaction;
  const POCKET_COLORS = theme.colors.chartColors as string[];
  const colorOf = (id: string, idx: number): string =>
    id === 'Otros' ? theme.colors.primary : POCKET_COLORS[idx % POCKET_COLORS.length];
    
  const CatIcon = ({ id, color, size = 20 }: { id: string; color: string; size?: number }) => {
    const map: any = {
      Alimentación: Utensils, Transporte: Car, Vivienda: Home,
      Servicios: Zap, Salud: Heart, Ocio: Gamepad, Ahorros: PiggyBank, Educación: GraduationCap,
    };
    const Icon = map[id] || Tag;
    return <Icon size={size} color={color} />;
  };

  const initialDistType = (editTransaction?.metadata?.mode === 'manual' || pockets.filter(p => !p.is_default_free).length === 0) ? 'single' : 'smart';
  const initialAmount = editTransaction ? Math.abs(editTransaction.amount).toString() : '';

  // NOTA: el ciclo al que se asigna este ingreso lo decide el servidor
  // (register_income resuelve el ciclo abierto del usuario, o crea uno
  // nuevo si p_cycle_mode = 'start_fresh'). El cliente no necesita ni debe
  // mandar un cycle_id.

  const [distType, setDistType] = useState<'smart' | 'single'>(initialDistType);
  const [amount, setAmount] = useState(initialAmount ? formatCurrency(initialAmount) : '');
  const [source, setSource] = useState<'Sueldo' | 'Venta' | 'Extra'>((editTransaction?.merchant as any) || 'Sueldo');
  const [cycleMode, setCycleMode] = useState<'accumulate' | 'start_fresh'>('accumulate');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const defaultRules = useMemo(() => {
    let initialRules: any[] = [];
    let priority = 0;
    pockets.forEach(p => {
      if (p.is_default_free) return;
      // Prioridad de sugerencia para el monto a asignar:
      // 1. planned_budget (meta que el usuario configuró manualmente) → preferida
      // 2. allocated_budget (lo que se le asignó en el último ingreso) → fallback
      //    razonable si nunca configuró una meta explícita
      // Esto solo pre-llena el campo; el usuario siempre puede editarlo.
      const suggested = (p.planned_budget && p.planned_budget > 0) ? p.planned_budget : p.allocated_budget;
      if (suggested && suggested > 0) {
        priority += 1;
        initialRules.push({ pocket_id: p.id, priority, type: 'fixed', value: suggested });
      }
    });

    // Primer ingreso de la persona (todavía no existe ninguna regla real):
    // sugerimos un 10% al bolsillo de ahorro para empezar el hábito sin
    // que se sienta una meta dura. Es solo una sugerencia precargada -- el
    // usuario la puede cambiar o poner en 0 sin ninguna fricción. Solo
    // aplica una vez: en cuanto exista una regla real, defaultRules ya no
    // entra aquí.
    if (initialRules.length === 0 && !isEditing) {
      const ahorroPocket = pockets.find(p => p.category === 'Ahorros' && !p.is_default_free);
      if (ahorroPocket) {
        initialRules.push({ pocket_id: ahorroPocket.id, priority: 1, type: 'percentage', value: 10 });
      }
    }

    return initialRules;
  }, [pockets, isEditing]);

  const [rules, setRules] = useState<any[]>(defaultRules);
  const [existingSourceId, setExistingSourceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastIncomeAmount, setLastIncomeAmount] = useState<number | null>(null);

  // Estado para creación de bolsillo inline (sin cerrar la pantalla)
  const [showNewPocketInline, setShowNewPocketInline] = useState(false);
  const [inlineName, setInlineName] = useState('');
  const [inlineCreating, setInlineCreating] = useState(false);
  const [localNewPockets, setLocalNewPockets] = useState<any[]>([]);

  // Tutorial guiado: solo 1 tour real, que apunta a cualquier bolsillo que
  // la persona toque primero (no solo al primero de la lista). El mensaje
  // de "reparto automático" ya NO es un tour flotante -- ver el texto fijo
  // arriba de la lista de bolsillos, más abajo en el render. Un tour
  // apuntando ahí se veía roto cuando la lista estaba lejos de la pantalla
  // visible: la flecha no alcanzaba a señalar nada con sentido.
  const { startTour } = useTour();
  const addIncomeToggleFiredRef = useRef(false);

  // Antes esto revisaba el flag de AsyncStorage DESPUÉS del focus, y como
  // esa consulta es async, el teclado alcanzaba a empezar a abrirse antes
  // de que Keyboard.dismiss() lo cerrara -- se veía como un parpadeo feo
  // de "abre y cierra de un golpe". Precargamos el flag UNA vez al montar
  // la pantalla, para saber de entrada (sin esperar nada) si hay que
  // evitar que el teclado se abra la primera vez.
  const [toggleTourAlreadySeen, setToggleTourAlreadySeen] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem('tour_addincome_toggle_done').then(done => setToggleTourAlreadySeen(!!done));
  }, []);

  // true solo en la ventana exacta en la que el campo NO debe abrir
  // teclado: no se ha visto el tour todavía y no se ha disparado en esta
  // sesión. En cuanto se dispara, esto pasa a false y el campo vuelve a
  // comportarse normal.
  const suppressKeyboardForToggleTour = !isEditing && toggleTourAlreadySeen === false && !addIncomeToggleFiredRef.current;

  // Aparece la primera vez que la persona toca CUALQUIER bolsillo -- ya sea
  // el switch $/% o el campo del valor. No podíamos depender solo del
  // switch: mucha gente nunca lo toca, simplemente escribe el monto y
  // listo. Se dispara al FOCUS del campo (no al escribir ni al soltarlo),
  // así que interrumpe lo menos posible -- pasa justo cuando recién entra,
  // antes de que haya empezado a teclear nada. El campo ya trae
  // showSoftInputOnFocus={false} mientras suppressKeyboardForToggleTour es
  // true, así que el teclado nunca llega a abrirse -- no hace falta
  // cerrarlo de un golpe.
  const maybeShowToggleTour = (pocketId: string) => {
    if (isEditing || addIncomeToggleFiredRef.current || toggleTourAlreadySeen !== false) return;
    addIncomeToggleFiredRef.current = true;
    AsyncStorage.setItem('tour_addincome_toggle_done', 'true');
    // Por si el teclado de OTRO campo (como el del monto principal, que sí
    // tiene autoFocus) seguía abierto -- ese no lo estamos suprimiendo.
    Keyboard.dismiss();
    setTimeout(() => {
      startTour([{
        // El nombre incluye el pocket_id porque CADA bolsillo de la lista
        // registra su propio switch bajo su propio nombre (ver más abajo)
        // -- así el tour apunta exactamente al que se tocó, sin importar
        // cuál de la lista haya sido.
        name: `addincome_toggle_${pocketId}`,
        title: 'Monto fijo o porcentaje',
        description: (
          <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: '600', color: theme.colors.onPrimary + 'B3' }}>
            Usa <Text style={{ color: theme.colors.onPrimary, fontWeight: '900' }}>&quot;$&quot;</Text> si este bolsillo siempre recibirá la misma cantidad. Usa <Text style={{ color: theme.colors.onPrimary, fontWeight: '900' }}>&quot;%&quot;</Text> si prefieres que reciba un porcentaje de cada ingreso.
          </Text>
        ),
        iconName: 'CreditCard',
        order: 1
      }]);
    }, 450);
  };

  // allPockets incluye bolsillos creados inline sin cerrar la pantalla
  const allPockets = useMemo(() => [...pockets, ...localNewPockets], [pockets, localNewPockets]);
  const variosPocket = allPockets.find(p => p.is_default_free) || allPockets.find(p => p.name.toLowerCase() === 'libre') || allPockets.find(p => p.name.toLowerCase() === 'varios') || allPockets[0];
  const initialSinglePocket = (initialDistType === 'single' && editTransaction?.metadata?.distribution) 
    ? Object.keys(editTransaction.metadata.distribution)[0] 
    : (variosPocket?.id || pockets[0]?.id);
  const [singlePocketId, setSinglePocketId] = useState<string>(initialSinglePocket);

  useEffect(() => {
    const fetchRules = async () => {
      try {
        const { data, error } = await supabase
          .from('income_sources')
          .select('id, distribution_rules, amount')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1);

        let dbRules = (!error && data && data.length > 0) ? (data[0].distribution_rules || []) : [];

        if (!error && data && data.length > 0) {
          setExistingSourceId(data[0].id);
        }

        if (!error && data && data.length > 0 && data[0].amount) {
          const prevAmount = data[0].amount;
          setLastIncomeAmount(prevAmount);
          setAmount(prev => prev ? prev : formatCurrency(prevAmount));
        }

        // SYNC: Si el usuario editó el presupuesto del bolsillo en la pestaña Pockets,
        // queremos que esa meta se refleje en las reglas de distribución fijas.
        dbRules = dbRules.map((rule: any) => {
          if (rule.type === 'fixed') {
            const pocket = pockets.find(p => p.id === rule.pocket_id);
            if (pocket && !pocket.is_default_free) {
              // Si el usuario edita el presupuesto a 0, queremos que la regla también sea 0.
              const plan = (pocket.planned_budget !== null && pocket.planned_budget !== undefined) 
                ? Number(pocket.planned_budget) 
                : (typeof pocket.allocated_budget === 'number' ? pocket.allocated_budget : rule.value);
              return { ...rule, value: plan };
            }
          }
          return rule;
        });

        // Ensure new pockets with a budget are added to the rules
        const pocketsInRules = new Set(dbRules.map((r: any) => r.pocket_id));
        let maxPriority = dbRules.reduce((max: number, r: any) => Math.max(max, r.priority || 0), 0);

        pockets.forEach(p => {
          if (!p.is_default_free && !pocketsInRules.has(p.id)) {
            maxPriority += 1;
            const plan = (p.planned_budget !== null && p.planned_budget !== undefined) 
              ? Number(p.planned_budget) 
              : (p.allocated_budget && p.allocated_budget > 0 ? p.allocated_budget : 0);
            dbRules.push({
              pocket_id: p.id,
              priority: maxPriority,
              type: 'fixed',
              value: plan
            });
          }
        });

        // Only switch to single if there are NO rules (i.e. user has NO custom pockets)
        if (dbRules.length === 0 && distType === 'smart') {
          setDistType('single');
        }

        // Prevent layout shift by only updating if the fetched rules are actually different
        if (JSON.stringify(dbRules) !== JSON.stringify(rules)) {
          setRules(dbRules);
        }
      } catch (e) {
        console.error('Error fetching rules:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRules();
  }, [session.user.id, pockets]);

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    header: { 
      position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', 
      justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 20, zIndex: 100, 
      backgroundColor: theme.colors.background
    },
    closeBtn: { 
      width: 48, height: 48, borderRadius: 24, backgroundColor: theme.colors.glassWhite, 
      alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: theme.colors.divider,
      ...theme.shadows.soft
    },
    scannerBadge: { 
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, 
      borderColor: theme.colors.divider, backgroundColor: theme.colors.glassWhite,
      ...theme.shadows.soft 
    },
    scannerBadgeText: { color: theme.colors.primary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.5 },
    
    scroll: { paddingHorizontal: 24, paddingBottom: 24 },
    
    // --- Premium Amount Box ---
    premiumAmountBox: { alignItems: 'center', marginTop: 10, marginBottom: 32 },
    premiumAmountLabel: { fontSize: 12, color: theme.colors.primary, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    modernAmountInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    modernCurrencySymbol: { fontSize: 24, fontWeight: '700', color: theme.colors.onSurface, marginRight: 4 },
    modernAmountInput: { fontSize: 52, fontWeight: '800', color: theme.colors.onSurface, textAlign: 'center', letterSpacing: -2, minWidth: 120 },
    
    dividerCustom: { height: 1.5, backgroundColor: theme.colors.divider, marginVertical: 24 },
    
    sectionContainer: { marginBottom: 32 },
    sectionTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.onSurface, marginBottom: 16, letterSpacing: -0.3 },
    
    // --- Chips (Source and Dist Type) ---
    chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
    catChip: { 
      paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, 
      backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.divider 
    },
    catChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    catText: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },
    catTextActive: { color: theme.colors.onPrimary },
    
    // --- Premium Segmented Control ---
    segmentedControl: {
      flexDirection: 'row', backgroundColor: theme.colors.surfaceContainerLow,
      borderRadius: 16, padding: 4, marginBottom: 24,
    },
    segmentBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 8, paddingVertical: 12, borderRadius: 12,
    },
    segmentBtnActive: { backgroundColor: theme.colors.surface, ...theme.shadows.sm },
    segmentText: { fontSize: 13, fontWeight: '700', color: theme.colors.onSurfaceVariant },
    segmentTextActive: { color: theme.colors.primary, fontWeight: '800' },
    
    pocketsList: { gap: 14 },
    pocketItem: { 
      flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: 24, backgroundColor: theme.colors.surface,
      borderWidth: 1, borderColor: theme.colors.divider,
      ...theme.shadows.sm
    },
    pocketItemSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryContainer, borderWidth: 1.5 },
    pocketName: { fontSize: 16, fontWeight: '700', color: theme.colors.onSurface },
    
    ruleCard: { borderRadius: 24, padding: 20, backgroundColor: theme.colors.surfaceContainerLow, borderColor: 'transparent', shadowOpacity: 0, elevation: 0 },
    ruleHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    priorityBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    ruleTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: theme.colors.onSurface },
    typeSwitch: { flexDirection: 'row', borderRadius: 12, padding: 4, backgroundColor: theme.colors.surfaceContainerLow },
    typeToggle: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    ruleInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rulePrefix: { fontSize: 24, fontWeight: '700', color: theme.colors.primary },
    ruleInput: { flex: 1, fontSize: 24, fontWeight: '800', color: theme.colors.onSurface },
    previewResultTag: { backgroundColor: theme.colors.primaryContainer, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14 },
    previewResultTxt: { color: theme.colors.primary, fontSize: 14, fontWeight: '800' },
    
    footer: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 24), backgroundColor: theme.colors.background, borderTopWidth: 1, borderTopColor: theme.colors.divider },
    premiumConfirmBtn: { borderRadius: 20, overflow: 'hidden', height: 60, backgroundColor: theme.colors.primary, ...theme.shadows.premium },
    btnInner: { flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
    premiumConfirmBtnText: { color: theme.colors.onPrimary, fontWeight: '900', fontSize: 16 },
    saveBtnDisabled: { opacity: 0.6 },
  }), [theme]);

  const val = parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;

  const getDistributionPreview = () => {
    const distribution: Record<string, number> = {};
    if (val <= 0) return { distribution, remainingCascade: 0 };

    if (distType === 'smart') {
      let remaining = val;
      // Only include rules whose pocket still exists — rules referencing
      // deleted pockets are silently ignored (amount falls through to Libre).
      const validPocketIds = new Set(allPockets.map(p => p.id));
      const sortedRules = [...rules]
        .filter(r => r.pocket_id && validPocketIds.has(r.pocket_id))
        .sort((a, b) => a.priority - b.priority);

      sortedRules.forEach(rule => {
        let amt = 0;
        if (rule.type === 'fixed') {
          amt = Math.min(remaining, rule.value);
        } else if (rule.type === 'percentage') {
          amt = Math.min(remaining, Math.round(val * (rule.value / 100)));
        }
        if (amt > 0) {
          distribution[rule.pocket_id] = (distribution[rule.pocket_id] || 0) + amt;
          remaining -= amt;
        }
      });
      
      const remainingCascade = remaining;

      if (remaining > 0 && variosPocket) {
        distribution[variosPocket.id] = (distribution[variosPocket.id] || 0) + remaining;
      }
      return { distribution, remainingCascade };
    }

    if (distType === 'single') {
      if (singlePocketId) distribution[singlePocketId] = val;
      return { distribution, remainingCascade: 0 };
    }

    return { distribution, remainingCascade: 0 };
  };

  const { distribution: preview, remainingCascade } = getDistributionPreview();

  const handleSave = async () => {
    let finalPreview = { ...preview };
    if (!val || val <= 0) return notify.error('Ingresa un monto válido.');
    if (Object.keys(finalPreview).length === 0) return notify.error('No hay bolsillos asignados.');

    setIsSaving(true);
    try {
      let rpcName = isEditing ? 'update_income_with_reversal' : 'register_income';
      let rpcPayload = isEditing ? {
        p_tx_id: editTransaction.id,
        p_user_id: session.user.id,
        p_new_amount: val,
        p_new_distribution: finalPreview,
        p_new_merchant: source
      } : {
        p_user_id: session.user.id,
        p_amount: val,
        p_distribution: finalPreview,
        p_mode: distType === 'smart' ? 'equal' : 'manual',
        p_merchant: source,
        p_cycle_mode: cycleMode,
        p_rollover_mode: 'sweep_to_savings'
      };

      const { error } = await supabase.rpc(rpcName, rpcPayload);

      if (error) throw error;

      // Mantener income_sources.distribution_rules sincronizado con la última
      // repartición "smart" que el usuario realmente usó, en vez de dejarlo
      // congelado en lo que se guardó una sola vez durante el onboarding.
      // Best-effort: el ingreso ya quedó registrado vía RPC, así que un
      // fallo aquí no debe bloquear el flujo principal.
      if (!isEditing && distType === 'smart') {
        try {
          if (existingSourceId) {
            await supabase.from('income_sources').update({ distribution_rules: rules, amount: val }).eq('id', existingSourceId);
          } else {
            await supabase.from('income_sources').insert({
              user_id: session.user.id,
              name: 'Ingreso Principal',
              amount: val,
              frequency: 'monthly',
              next_date: new Date().toISOString().split('T')[0],
              distribution_rules: rules,
              is_active: true,
              metadata: { income_type: 'fixed' }
            });
          }
        } catch (syncErr) {
          console.error('[AddIncome] income_sources sync error:', syncErr);
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
      setTimeout(() => onSaveSuccess(), 1800);
    } catch (e: any) {
      console.error('[AddIncome] handleSave error:', e);
      const isInsufficientFunds = e?.code === '23514' || String(e?.message || '').includes('pockets_allocated_budget_non_negative');
      notify.error(isInsufficientFunds
        ? 'Ya moviste esa plata a otro bolsillo. Ajusta el reparto.'
        : 'Error guardando el ingreso.');
    } finally {
      setIsSaving(false);
    }
  };

  const createPocketInline = async () => {
    if (!inlineName.trim()) return;
    setInlineCreating(true);
    try {
      const cleanName = inlineName.trim();
      const capitalizedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
      const { data: newPocket, error } = await supabase.from('pockets').insert({
        user_id: session.user.id,
        name: capitalizedName,
        category: capitalizedName,
        allocated_budget: 0,
        planned_budget: null,
        icon: 'tag'
      }).select().single();
      if (error) throw error;
      // Agregar al estado local para que aparezca inmediatamente en la lista
      setLocalNewPockets(prev => [...prev, newPocket]);
      const maxPriority = rules.reduce((m: number, r: any) => Math.max(m, r.priority || 0), 0);
      setRules(prev => [...prev, { pocket_id: newPocket.id, priority: maxPriority + 1, type: 'fixed', value: 0 }]);
      setInlineName('');
      setShowNewPocketInline(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      notify.error('No se pudo crear el bolsillo.');
    } finally {
      setInlineCreating(false);
    }
  };

  if (saved) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: theme.colors.primaryContainer, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <CheckCircle2 size={40} color={theme.colors.primary} />
        </View>
        <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.onSurface, marginBottom: 8, letterSpacing: -0.5 }}>¡Listo!</Text>
        <Text style={{ fontSize: 16, color: theme.colors.onSurfaceVariant, fontWeight: '700', marginBottom: 32, textAlign: 'center' }}>
          {formatMoney(val)} distribuidos en tus bolsillos
        </Text>
        <View style={{ width: '100%', gap: 10 }}>
          {Object.entries(preview).filter(([_, v]) => v > 0).map(([id, addValue]) => {
            const p = pockets.find(p => p.id === id);
            return p ? (
              <View key={id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: theme.colors.glassWhite, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.divider }}>
                <Text style={{ fontWeight: '800', color: theme.colors.onSurface }}>{p.name}</Text>
                <Text style={{ fontWeight: '900', color: theme.colors.primary }}>+ {formatMoney(addValue)}</Text>
              </View>
            ) : null;
          })}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 16 }]}>
        <TouchableOpacity style={styles.closeBtn} onPress={onCancel}>
          <X size={24} color={theme.colors.onSurface} strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={styles.scannerBadge}>
           <Text style={styles.scannerBadgeText}>{isEditing ? 'Editar Ingreso' : 'Ingresar Plata'}</Text>
        </View>
        <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          {__DEV__ && (
            // SOLO DESARROLLO -- resetea el anuncio del switch $/% para
            // poder probarlo de nuevo sin desinstalar la app. No lo
            // dispara directamente: limpia su bandera y su ref para que
            // vuelva a aparecer al tocar el switch de cualquier bolsillo,
            // igual que en producción. __DEV__ es false en cualquier build
            // de producción (incluyendo TestFlight/App Store).
            <TouchableOpacity
              onPress={async () => {
                await AsyncStorage.removeItem('tour_addincome_toggle_done');
                addIncomeToggleFiredRef.current = false;
                setToggleTourAlreadySeen(false);
              }}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <RotateCcw size={20} color={theme.colors.warning} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingTop: Math.max(insets.top, 20) + 104 }]}>
            
            {/* --- AMOUNT HERO --- */}
            <View style={styles.premiumAmountBox}>
              <Text style={styles.premiumAmountLabel}>¿Cuánto Entró?</Text>
              <View style={styles.modernAmountInputRow}>
                <Text style={styles.modernCurrencySymbol}>{symbol}</Text>
                <TextInput
                  style={styles.modernAmountInput}
                  value={amount}
                  onChangeText={(t) => setAmount(formatCurrency(t))}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={theme.colors.onSurfaceVariant + '40'}
                  autoFocus
                />
              </View>
              {/* Sugerencia del último monto ingresado — solo si campo vacío y no editando */}
              {!isEditing && lastIncomeAmount && !amount ? (
                <TouchableOpacity
                  onPress={() => {
                    setAmount(formatCurrency(String(lastIncomeAmount)));
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  style={{
                    marginTop: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    backgroundColor: theme.colors.primaryContainer,
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: theme.colors.primary + '30',
                    alignSelf: 'center',
                  }}
                >
                  <RotateCcw size={13} color={theme.colors.primary} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: theme.colors.primary }}>
                    Usar último: {formatMoney(lastIncomeAmount)}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>


            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>¿De dónde viene?</Text>
              <View style={[styles.segmentedControl, { marginBottom: 0 }]}>
                {(['Sueldo', 'Venta', 'Extra'] as const).map(type => (
                  <TouchableOpacity
                    key={type}
                    activeOpacity={0.8}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSource(type); }}
                    style={[styles.segmentBtn, source === type && styles.segmentBtnActive]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {type === 'Sueldo' && <Briefcase size={16} color={source === type ? theme.colors.primary : theme.colors.onSurfaceVariant} />}
                      {type === 'Venta' && <Tag size={16} color={source === type ? theme.colors.primary : theme.colors.onSurfaceVariant} />}
                      {type === 'Extra' && <PlusCircle size={16} color={source === type ? theme.colors.primary : theme.colors.onSurfaceVariant} />}
                      <Text style={[styles.segmentText, source === type && styles.segmentTextActive]}>{type}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {!isEditing && (
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>¿A qué mes pertenece?</Text>
                <View style={[styles.segmentedControl, { marginBottom: 0 }]}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCycleMode('accumulate'); }}
                    style={[styles.segmentBtn, cycleMode === 'accumulate' && styles.segmentBtnActive]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <ArrowRight size={16} color={cycleMode === 'accumulate' ? theme.colors.primary : theme.colors.onSurfaceVariant} />
                      <Text style={[styles.segmentText, cycleMode === 'accumulate' && styles.segmentTextActive]}>Al mes actual</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCycleMode('start_fresh'); }}
                    style={[styles.segmentBtn, cycleMode === 'start_fresh' && styles.segmentBtnActive]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Sparkles size={16} color={cycleMode === 'start_fresh' ? theme.colors.primary : theme.colors.onSurfaceVariant} />
                      <Text style={[styles.segmentText, cycleMode === 'start_fresh' && styles.segmentTextActive]}>A un mes nuevo</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={[styles.sectionContainer, { marginBottom: 0 }]}>
              <Text style={styles.sectionTitle}>¿Cómo quieres repartir este ingreso?</Text>
            <View style={styles.segmentedControl}>
              <TouchableOpacity 
                activeOpacity={0.8} 
                style={[styles.segmentBtn, distType === 'smart' && styles.segmentBtnActive]} 
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDistType('smart'); }}
              >
                <Sparkles size={18} color={distType === 'smart' ? theme.colors.primary : theme.colors.onSurfaceVariant} />
                <Text style={[styles.segmentText, distType === 'smart' && styles.segmentTextActive]}>Automático</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                activeOpacity={0.8} 
                style={[styles.segmentBtn, distType === 'single' && styles.segmentBtnActive]} 
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDistType('single'); }}
              >
                <Wallet size={18} color={distType === 'single' ? theme.colors.primary : theme.colors.onSurfaceVariant} />
                <Text style={[styles.segmentText, distType === 'single' && styles.segmentTextActive]}>Elegir bolsillo</Text>
              </TouchableOpacity>
            </View>

            {distType === 'smart' && (
              // Texto fijo, no un tour: cuando la lista de bolsillos queda
              // lejos en pantallas chicas, un tour apuntando ahí no tenía a
              // dónde señalar y se veía roto. Esto siempre está a la vista,
              // justo donde hace falta, sin depender de que nada se mida.
              <Text style={{ ...theme.typography.bodySmall, color: theme.colors.onSurfaceVariant, marginBottom: 14, lineHeight: 18 }}>
                Save reparte esto automáticamente entre tus bolsillos, cada vez que registres un ingreso.
              </Text>
            )}

            <View style={styles.pocketsList}>
              {distType === 'smart' ? (
                <>
                  {[...rules].sort((a, b) => a.priority - b.priority).map((rule, index) => {
                    const p = allPockets.find(p => p.id === rule.pocket_id);
                    if (!p) return null;
                    const pIndex = allPockets.findIndex(pocket => pocket.id === p.id);
                    const color = colorOf(p.category || p.name, pIndex !== -1 ? pIndex : index);
                    const addValue = preview[p.id] || 0;

                    const typeSwitchInner = (
                      <View style={styles.typeSwitch}>
                            <TouchableOpacity
                              style={[styles.typeToggle, rule.type === 'fixed' && { backgroundColor: color }]}
                              onPress={() => {
                                maybeShowToggleTour(rule.pocket_id);
                                const newRules = [...rules];
                                const idx = newRules.findIndex(r => r.pocket_id === rule.pocket_id);
                                newRules[idx] = { ...rule, type: 'fixed' };
                                setRules(newRules);
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              }}
                            >
                              <DollarSign size={14} color={rule.type === 'fixed' ? '#FFF' : theme.colors.onSurfaceVariant} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.typeToggle, rule.type === 'percentage' && { backgroundColor: color }]}
                              onPress={() => {
                                maybeShowToggleTour(rule.pocket_id);
                                const newRules = [...rules];
                                const idx = newRules.findIndex(r => r.pocket_id === rule.pocket_id);
                                newRules[idx] = { ...rule, type: 'percentage' };
                                setRules(newRules);
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              }}
                            >
                              <Percent size={14} color={rule.type === 'percentage' ? '#FFF' : theme.colors.onSurfaceVariant} />
                            </TouchableOpacity>
                          </View>
                    );

                    return (
                      <View key={rule.pocket_id} style={[styles.ruleCard, { backgroundColor: theme.isDark ? color + '28' : color + '1A' }]}>
                        <View style={styles.ruleHeader}>
                          <View style={[styles.priorityBadge, { backgroundColor: color, width: 28, height: 28, borderRadius: 10 }]}>
                            <CatIcon id={p.category || p.name} color="#FFF" size={14} />
                          </View>
                          <Text style={styles.ruleTitle}>{p.name}</Text>

                          <TourStep name={`addincome_toggle_${rule.pocket_id}`}>{typeSwitchInner}</TourStep>
                        </View>

                        <View style={styles.ruleInputRow}>
                          <Text style={styles.rulePrefix}>{rule.type === 'fixed' ? '$' : '%'}</Text>
                          <TextInput
                            style={styles.ruleInput}
                            value={rule.value > 0 ? (rule.type === 'fixed' ? formatMoneyDigits(String(rule.value)) : String(rule.value)) : ''}
                            onFocus={() => maybeShowToggleTour(rule.pocket_id)}
                            showSoftInputOnFocus={!suppressKeyboardForToggleTour}
                            onChangeText={(t) => {
                              const v = parseInt(t.replace(/\D/g, '')) || 0;
                              const newRules = [...rules];
                              const idx = newRules.findIndex(r => r.pocket_id === rule.pocket_id);
                              newRules[idx] = { ...rule, value: v };
                              setRules(newRules);
                            }}
                            placeholder="0"
                            placeholderTextColor={theme.colors.onSurfaceVariant + '40'}
                            keyboardType="numeric"
                          />
                          
                          <View style={[styles.previewResultTag, { backgroundColor: theme.colors.surface }]}>
                            <Text style={[styles.previewResultTxt, { color }]}>+ {formatMoney(addValue)}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}

                  {(() => {
                    if (!variosPocket || remainingCascade <= 0) return null;
                    const vIndex = pockets.findIndex(p => p.id === variosPocket.id);
                    const vColor = colorOf(variosPocket.category || variosPocket.name, vIndex !== -1 ? vIndex : 0);
                    return (
                      <View style={[styles.ruleCard, { backgroundColor: theme.isDark ? vColor + '28' : vColor + '1A', opacity: 0.8 }]}>
                        <View style={styles.ruleHeader}>
                           <Text style={styles.ruleTitle}>{variosPocket.name} (Sobrante)</Text>
                        </View>
                        <View style={styles.ruleInputRow}>
                            <View style={{ flex: 1 }} />
                            <View style={[styles.previewResultTag, { backgroundColor: theme.colors.surface }]}>
                              <Text style={[styles.previewResultTxt, { color: vColor }]}>+ {formatMoney(remainingCascade)}</Text>
                            </View>
                        </View>
                      </View>
                    );
                  })()}

                  {/* ── Crear nuevo bolsillo inline ── */}
                  {showNewPocketInline ? (
                    <View style={[styles.ruleCard, { backgroundColor: theme.colors.surfaceContainerLow }]}>
                      <Text style={[styles.sectionTitle, { fontSize: 14, marginBottom: 12 }]}>Nombre del bolsillo</Text>
                      <View style={[styles.ruleInputRow, { backgroundColor: theme.colors.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: theme.colors.outlineVariant, marginBottom: 14 }]}>
                        <TextInput
                          style={[styles.ruleInput, { flex: 1, fontSize: 16 }]}
                          value={inlineName}
                          onChangeText={setInlineName}
                          placeholder="Ej: Mercado, Salidas, Viajes…"
                          placeholderTextColor={theme.colors.onSurfaceVariant + '60'}
                          autoFocus
                          maxLength={30}
                        />
                      </View>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity
                          onPress={() => { setShowNewPocketInline(false); setInlineName(''); }}
                          style={{ flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.outlineVariant }}
                        >
                          <Text style={{ fontWeight: '800', color: theme.colors.onSurfaceVariant, fontSize: 14 }}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={createPocketInline}
                          disabled={inlineCreating || !inlineName.trim()}
                          style={{ flex: 2, paddingVertical: 13, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary, opacity: (!inlineName.trim() && !inlineCreating) ? 0.5 : 1 }}
                        >
                          {inlineCreating
                            ? <ActivityIndicator size="small" color="#FFF" />
                            : <Text style={{ fontWeight: '900', color: '#FFF', fontSize: 14 }}>Crear bolsillo</Text>
                          }
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => { setShowNewPocketInline(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      style={[styles.ruleCard, { borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.primary + '55', backgroundColor: 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 18 }]}
                    >
                      <PlusCircle size={16} color={theme.colors.primary} />
                      <Text style={{ fontSize: 14, fontWeight: '800', color: theme.colors.primary }}>Nuevo bolsillo</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : allPockets.map((p, idx) => {
                  const isSingleSelected = distType === 'single' && singlePocketId === p.id;
                  const color = colorOf(p.category || p.name, idx);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      activeOpacity={0.8}
                      style={[styles.pocketItem, isSingleSelected ? {
                        backgroundColor: theme.isDark ? color + '28' : color + '1A',
                        borderColor: 'transparent',
                        shadowColor: color,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.22,
                        shadowRadius: 14,
                        elevation: 5,
                      } : {
                        backgroundColor: theme.colors.surfaceContainerLow,
                        borderColor: 'transparent',
                        shadowOpacity: 0,
                        elevation: 0,
                      }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSinglePocketId(p.id);
                      }}
                    >
                      <View style={[{
                        width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center'
                      }, {
                        backgroundColor: isSingleSelected ? color : theme.colors.surfaceContainerHighest,
                      }]}>
                        <CatIcon id={p.category || p.name} color={isSingleSelected ? '#FFF' : theme.colors.onSurfaceVariant} size={18} />
                      </View>
                      <Text style={[styles.pocketName, { flex: 1, marginLeft: 12, color: isSingleSelected ? theme.colors.onSurface : theme.colors.onSurfaceVariant, fontFamily: (theme.fonts as any).headline }]}>
                        {p.name}
                      </Text>
                      {isSingleSelected
                        ? <View style={[{ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, { backgroundColor: color }]}><Check size={12} color="#FFF" strokeWidth={3} /></View>
                        : <View style={[{ width: 20, height: 20, borderRadius: 10 }, { backgroundColor: theme.colors.surfaceContainerHighest }]} />}
                    </TouchableOpacity>
                  );
                })}
            </View>
            </View>
          </ScrollView>

          <View style={[styles.footer, { flexDirection: 'row', gap: 12 }]}>
            <TouchableOpacity activeOpacity={0.9} style={[styles.premiumConfirmBtn, { flex: 1 }, (!val || Object.keys(preview).length === 0) && styles.saveBtnDisabled]} onPress={handleSave} disabled={isSaving || !val || Object.keys(preview).length === 0}>
              <View style={styles.btnInner}>
                {isSaving ? <ActivityIndicator color={theme.colors.onPrimary} /> : (
                  <>
                    <Text style={styles.premiumConfirmBtnText}>{isEditing ? 'Guardar Cambios' : 'Guardar'}</Text>
                    <ArrowRight size={22} color={theme.colors.onPrimary} />
                  </>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
};
