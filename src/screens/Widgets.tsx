import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch, DeviceEventEmitter } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, ScanLine, Plus, Wallet, RefreshCw, Moon, Sun } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { getTheme } from '../theme/theme';
import { notify } from '../lib/notify';
import { useCycleState, useUserCycles, type CycleState } from '../lib/useCycleState';
import { buildPocketSnapshot, DEFAULT_WIDGET_PREFERENCES, selectWidgetPocket, type WidgetPreferences } from '../widgets/model';
import { widgetPalette } from '../widgets/appearance';
import { APP_SCHEME, nativeWidgetsAvailable, publishWidgetSnapshot, readWidgetPreferences, saveWidgetPreferences, WIDGET_REFRESH_REQUESTED } from '../widgets/storage';
import { DEMO_CYCLE } from '../widgets/demo';

export function WidgetsScreen({ userId, onBack }: { userId: string; onBack: () => void }) {
  const { activeCycle } = useUserCycles();
  const { state, loading, error } = useCycleState(activeCycle?.id);
  return <WidgetSettings userId={userId} state={state} loading={loading} error={error} onBack={onBack} />;
}

export function WidgetDemoScreen() {
  const [scenario, setScenario] = useState('normal');
  const state = useMemo(() => ({ ...DEMO_CYCLE, pockets: DEMO_CYCLE.pockets.map(p => scenario === 'excess' ? { ...p, available: -18000, spent_month: p.allocated + 18000 } : p) }), [scenario]);
  return <WidgetSettings userId="widget-demo" state={scenario === 'empty' ? { ...state, pockets: [] } : state} demo scenario={scenario} onScenario={setScenario} />;
}

function WidgetSettings({ userId, state, demo = false, loading, error, onBack, scenario, onScenario }: {
  userId: string; state: CycleState | null; demo?: boolean; loading?: boolean; error?: string | null;
  onBack?: () => void; scenario?: string; onScenario?: (value: string) => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [preferences, setPreferences] = useState<WidgetPreferences>(DEFAULT_WIDGET_PREFERENCES);
  const [ready, setReady] = useState(false);
  const [darkPreview, setDarkPreview] = useState(theme.isDark);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const previewTheme = getTheme(darkPreview ? 'sageDark' : 'sage');
  const pocket = selectWidgetPocket(state, preferences);
  const snapshot = useMemo(() => buildPocketSnapshot(state, preferences, {
    signedIn: scenario !== 'signedOut', demo, scheme: APP_SCHEME,
    light: widgetPalette(false, pocket?.id), dark: widgetPalette(true, pocket?.id),
  }), [state, preferences, demo, pocket?.id, scenario]);
  const colors = darkPreview ? snapshot.dark : snapshot.light;
  const available = nativeWidgetsAvailable();
  useEffect(() => {
    let active = true;
    void readWidgetPreferences(userId).then(value => { if (active) { setPreferences(value); setReady(true); } });
    return () => { active = false; };
  }, [userId]);
  useEffect(() => {
    if (!demo || !ready) return;
    try { publishWidgetSnapshot(snapshot); } catch { setMessage('No pudimos actualizar el widget. Inténtalo de nuevo.'); }
  }, [demo, ready, snapshot]);
  const update = async (next: WidgetPreferences) => {
    if (saving || !ready) return;
    setSaving(true);
    try { await saveWidgetPreferences(userId, next); setPreferences(next); }
    catch { notify.error('No pudimos guardar la configuración del widget.'); }
    finally { setSaving(false); }
  };
  const styles = useMemo(() => StyleSheet.create({
    page: { flex: 1, backgroundColor: theme.colors.background },
    content: { paddingTop: insets.top + theme.spacing.lg, paddingHorizontal: theme.spacing.lg, paddingBottom: insets.bottom + 100, gap: theme.spacing.lg },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    title: { ...theme.typography.h1, fontFamily: theme.fonts.headline, color: theme.colors.onSurface },
    heading: { ...theme.typography.h3, fontFamily: theme.fonts.headline, color: theme.colors.onSurface },
    body: { ...theme.typography.body, fontFamily: theme.fonts.body, color: theme.colors.onSurfaceVariant },
    text: { ...theme.typography.bodyMedium, fontFamily: theme.fonts.body, color: theme.colors.onSurface },
    surface: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.xl, padding: theme.spacing.md, gap: theme.spacing.md },
    tap: { minHeight: 44, justifyContent: 'center' },
    option: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    preview: { padding: theme.spacing.md, borderRadius: theme.radius.xl, gap: 8, backgroundColor: colors.background, borderWidth: 1, borderColor: previewTheme.colors.outlineVariant },
    chip: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceContainerHigh },
    primary: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.lg, padding: theme.spacing.md, minHeight: 52, alignItems: 'center' },
  }), [theme, insets, colors.background, previewTheme.colors.outlineVariant]);
  return <View style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.row}>{onBack ? <TouchableOpacity accessibilityLabel="Volver" onPress={onBack} style={styles.tap}><ArrowLeft color={theme.colors.onSurface} /></TouchableOpacity> : <Text style={styles.text}>SAVE DEV · DATOS DE EJEMPLO</Text>}<Text style={[styles.text, { color: theme.colors.primary, fontFamily: theme.fonts.headline }]}>save</Text></View>
    <View style={{ gap: 8 }}><Text style={styles.title}>Save, a primera vista.</Text><Text style={styles.body}>Tu bolsillo favorito y el escáner, siempre a mano.</Text></View>
    <View style={{ gap: 12 }}>
      <View style={styles.row}><Text style={styles.text}>Mi bolsillo · vista previa</Text><TouchableOpacity accessibilityLabel={darkPreview ? 'Vista previa clara' : 'Vista previa oscura'} style={styles.tap} onPress={() => setDarkPreview(!darkPreview)}>{darkPreview ? <Sun color={theme.colors.onSurface} size={22} /> : <Moon color={theme.colors.onSurface} size={22} />}</TouchableOpacity></View>
      <View style={styles.preview} accessible accessibilityLabel={`${snapshot.title}. ${snapshot.amount}. ${snapshot.detail}`}>
        <View style={styles.row}><View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flex: 1 }}><Wallet size={20} color={colors.tint} /><Text numberOfLines={1} style={[theme.typography.title, { fontFamily: theme.fonts.headline, color: colors.text, flex: 1 }]}>{snapshot.title}</Text></View><Text style={{ fontFamily: theme.fonts.headline, color: colors.tint }}>save</Text></View>
        <Text style={[theme.typography.caption, { color: colors.secondary, fontFamily: theme.fonts.body, marginTop: 8 }]}>{snapshot.overdrawn ? 'EXCESO' : 'TE QUEDA'}</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[theme.typography.display, { color: colors.text, fontFamily: 'Outfit-Black' }]}>{snapshot.amount}</Text>
        {!snapshot.hideAmounts ? <View style={{ height: 6, backgroundColor: colors.track, borderRadius: 4, overflow: 'hidden' }}><View style={{ width: `${snapshot.remaining * 100}%`, height: 6, backgroundColor: snapshot.overdrawn ? colors.error : colors.accent }} /></View> : null}
        <Text style={[theme.typography.bodySmall, { color: colors.secondary, fontFamily: theme.fonts.body }]}>{snapshot.status === 'ready' ? snapshot.detail : snapshot.status === 'signedOut' ? 'Abre Save para ver tu bolsillo.' : 'Elige un bolsillo en Save.'}</Text>
        <View style={[styles.row, { marginTop: 8 }]}><Text style={[theme.typography.caption, { color: colors.secondary }]}>{demo ? 'Datos de ejemplo' : `Actualizado ${snapshot.updatedLabel}`}</Text><View style={{ flexDirection: 'row', gap: 14 }}><Plus color={colors.tint} size={20} /><ScanLine color={colors.tint} size={20} /></View></View>
      </View>
    </View>
    {demo ? <View style={{ gap: 12 }}><Text style={styles.heading}>Prueba cada estado</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[['normal', 'Disponible'], ['excess', 'Exceso'], ['empty', 'Sin bolsillos'], ['signedOut', 'Sin sesión']].map(([value, label]) => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: scenario === value }} onPress={() => onScenario?.(value)} style={[styles.chip, scenario === value && { backgroundColor: theme.colors.primaryContainer }]}><Text style={styles.text}>{label}</Text></TouchableOpacity>)}</View><Text style={styles.body}>Los cambios de esta pantalla se envían al widget instalado. No se conectan a tus cuentas ni registran movimientos.</Text></View> : null}
    <View style={styles.surface}><Text style={styles.heading}>Elige tu bolsillo</Text>{loading ? <Text style={styles.body}>Cargando bolsillos…</Text> : error ? <Text style={styles.body}>No pudimos cargar tus bolsillos. Vuelve a intentarlo.</Text> : !state?.pockets.length ? <Text style={styles.body}>Tus bolsillos aparecerán aquí cuando los crees.</Text> : state.pockets.map(p => <TouchableOpacity key={p.id} disabled={saving || !ready} style={styles.option} onPress={() => void update({ ...preferences, pocketId: p.id })} accessibilityRole="radio" accessibilityState={{ checked: pocket?.id === p.id }}><Text style={[styles.text, { flex: 1 }]}>{p.name}</Text>{pocket?.id === p.id ? <Check color={theme.colors.primary} /> : null}</TouchableOpacity>)}</View>
    <View style={styles.surface}><View style={styles.row}><View style={{ flex: 1, gap: 4 }}><Text style={styles.text}>Ocultar montos</Text><Text style={styles.body}>Muestra el bolsillo sin revelar cifras.</Text></View><Switch accessibilityLabel="Ocultar montos en los widgets" disabled={saving || !ready} value={preferences.hideAmounts} onValueChange={hideAmounts => void update({ ...preferences, hideAmounts })} trackColor={{ true: theme.colors.primary }} /></View></View>
    <View style={styles.surface}><View style={styles.row}><ScanLine color={theme.colors.primary} /><Text style={[styles.heading, { flex: 1 }]}>Escanear factura</Text></View><Text style={styles.body}>Añade el acceso a tu pantalla bloqueada. Un toque abre el escáner dentro de Save.</Text></View>
    <View style={{ gap: 12 }}><Text style={styles.heading}>Añádelo a tu iPhone</Text><Text style={styles.body}>1. Mantén pulsada la pantalla de inicio.</Text><Text style={styles.body}>2. Toca Editar → Añadir widget y busca {demo ? 'Save Dev' : 'Save'}.</Text><Text style={styles.body}>3. Elige Mi bolsillo y el tamaño que prefieras.</Text><Text style={styles.body}>Para el escáner, personaliza la pantalla bloqueada y añade el widget de Save.</Text></View>
    {!available ? <Text style={styles.body}>La vista previa está disponible aquí. Para añadir widgets necesitas la build de iPhone con widgets instalados.</Text> : null}
    <TouchableOpacity style={styles.primary} accessibilityRole="button" onPress={() => { try { if (demo) publishWidgetSnapshot(snapshot); else DeviceEventEmitter.emit(WIDGET_REFRESH_REQUESTED); setMessage(available ? 'Actualización solicitada. Revisa tu pantalla de inicio.' : 'Estás viendo una vista previa. Instala Save Dev en el iPhone para probar el widget.'); } catch { notify.error('No pudimos actualizar el widget.'); } }}><View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><RefreshCw color={theme.colors.onPrimary} size={18} /><Text style={[styles.text, { color: theme.colors.onPrimary }]}>Actualizar widgets</Text></View></TouchableOpacity>
    {message ? <Text accessibilityLiveRegion="polite" style={styles.body}>{message}</Text> : null}
  </ScrollView></View>;
}
