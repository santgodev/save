import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import Constants from 'expo-constants';
import { DEFAULT_WIDGET_PREFERENCES, type PocketSnapshot, type WidgetPreferences } from './model';

export const WIDGET_PREFERENCES_CHANGED = 'save_widget_preferences_changed';
export const WIDGET_REFRESH_REQUESTED = 'save_widget_refresh_requested';
export const APP_SCHEME: string = Constants.expoConfig?.extra?.appScheme || 'saveapp';
export const IS_WIDGET_DEMO = Constants.expoConfig?.extra?.dataMode === 'demo';
const key = (userId: string) => `save.widgets.preferences.v1.${userId}`;

export async function readWidgetPreferences(userId: string): Promise<WidgetPreferences> {
  try {
    const stored = JSON.parse(await AsyncStorage.getItem(key(userId)) || 'null');
    return { pocketId: typeof stored?.pocketId === 'string' ? stored.pocketId : null, hideAmounts: stored?.hideAmounts === true };
  } catch { return { ...DEFAULT_WIDGET_PREFERENCES }; }
}
export async function saveWidgetPreferences(userId: string, value: WidgetPreferences) {
  await AsyncStorage.setItem(key(userId), JSON.stringify(value));
  DeviceEventEmitter.emit(WIDGET_PREFERENCES_CHANGED, userId);
}
export function nativeWidgetsAvailable() {
  return Platform.OS === 'ios' && !!requireOptionalNativeModule('ExpoWidgets');
}
export function publishWidgetSnapshot(snapshot: PocketSnapshot) {
  if (!nativeWidgetsAvailable()) return false;
  // A conditional require prevents missing-native-module crashes in Expo Go and web.
  const { SavePocketWidget, SaveScannerWidget } = require('./native') as typeof import('./native');
  SavePocketWidget.updateTimeline([
    { date: new Date(snapshot.updatedAt), props: snapshot },
    { date: new Date(snapshot.updatedAt + 24 * 60 * 60 * 1000), props: snapshot },
  ]);
  SaveScannerWidget.updateSnapshot({ scheme: snapshot.scheme });
  return true;
}
