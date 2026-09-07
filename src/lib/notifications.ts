// =====================================================================
// notifications.ts — recordatorios locales, sin backend.
// =====================================================================
// Dos notificaciones que el propio sistema operativo dispara solo,
// sin que Save necesite estar corriendo ni un servidor de por medio:
//
//   - Mañana (8am, todos los días): recordatorio fijo de registrar gastos.
//   - Noche (8pm, rota por día de la semana): frase corta -- para no
//     repetir la misma todos los días, se reparten 4 mensajes entre los
//     7 días usando triggers `weekly` independientes (cada uno fijo a
//     su propio día), en vez de un solo trigger `daily` con texto fijo.
//
// Se piden permisos y se programan UNA sola vez por instalación
// (@save_notifications_setup_done) -- si el usuario los negó, no se le
// vuelve a preguntar en cada apertura.
// =====================================================================

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch (error) {
  console.warn('expo-notifications no está disponible en este entorno (ej. Expo Go en Android SDK 53).');
}

const SETUP_DONE_KEY = '@save_notifications_setup_done';

const MORNING_ID = 'save_daily_morning_reminder';
const EVENING_ID_PREFIX = 'save_weekly_evening_';

const MORNING_MESSAGE = 'No olvides registrar tus gastos de hoy.';

// weekday de expo-notifications: 1 = domingo ... 7 = sábado.
const EVENING_MESSAGES: { weekday: number; body: string }[] = [
  { weekday: 1, body: 'El sabio guarda sus provisiones. — Proverbios 21:20' },
  { weekday: 2, body: 'Los planes bien pensados traen prosperidad. — Proverbios 21:5' },
  { weekday: 3, body: 'Jesús guarda tu vida; nosotros, tu bolsillo.' },
  { weekday: 4, body: 'Ahorrar también es avanzar.' },
  { weekday: 5, body: 'El sabio guarda sus provisiones. — Proverbios 21:20' },
  { weekday: 6, body: 'Los planes bien pensados traen prosperidad. — Proverbios 21:5' },
  { weekday: 7, body: 'Jesús guarda tu vida; nosotros, tu bolsillo.' },
];

if (Notifications) {
  // Sin esto, una notificación que llega con la app abierta no se muestra
  // -- queremos que sí se vea aunque el usuario esté adentro.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Pide permiso de notificaciones y programa los recordatorios fijos.
 * Idempotente: solo pregunta/programa una vez por instalación, sin
 * importar cuántas veces se llame ni si el usuario negó el permiso.
 */
export async function ensureDailyReminders(): Promise<void> {
  if (!Notifications) {
    console.log('Omitiendo ensureDailyReminders porque expo-notifications no está disponible.');
    return;
  }

  const alreadySetUp = await AsyncStorage.getItem(SETUP_DONE_KEY);
  if (alreadySetUp === 'true') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Recordatorios',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  // Se marca como "ya preguntado" pase lo que pase -- si dijo que no,
  // no lo volvemos a interrumpir en cada apertura de la app.
  await AsyncStorage.setItem(SETUP_DONE_KEY, 'true');

  if (finalStatus !== 'granted') return;

  await Notifications.scheduleNotificationAsync({
    identifier: MORNING_ID,
    content: { title: 'Save', body: MORNING_MESSAGE },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 8,
      minute: 0,
    },
  });

  await Promise.all(EVENING_MESSAGES.map(({ weekday, body }) =>
    Notifications.scheduleNotificationAsync({
      identifier: `${EVENING_ID_PREFIX}${weekday}`,
      content: { title: 'Save', body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday,
        hour: 20,
        minute: 0,
      },
    })
  ));
}
