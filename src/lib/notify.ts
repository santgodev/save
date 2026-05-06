// Wrapper único sobre Alert.alert. ÚNICA forma de notificar al usuario
// fuera de UI inline. NO uses `alert(...)` pelado de RN — se ve barato
// y no soporta título ni acciones.
//
// Uso:
//   notify.error("No pudimos guardar el ingreso.");
//   notify.success("Listo", "Memoria actualizada.");
//   notify.confirm("Eliminar gasto", "¿Seguro?", { onConfirm: () => doDelete(), destructive: true });

import { Alert, AlertButton } from 'react-native';

type ConfirmOptions = {
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Si es true, el botón de confirmar usa estilo destructivo (rojo en iOS). */
  destructive?: boolean;
};

function error(message: string, title = 'Ups') {
  Alert.alert(title, message);
}

function success(title: string, message?: string) {
  Alert.alert(title, message ?? '');
}

function info(title: string, message?: string) {
  Alert.alert(title, message ?? '');
}

function confirm(title: string, message: string, opts: ConfirmOptions) {
  const buttons: AlertButton[] = [
    {
      text: opts.cancelLabel ?? 'Cancelar',
      style: 'cancel',
      onPress: opts.onCancel,
    },
    {
      text: opts.confirmLabel ?? 'Confirmar',
      style: opts.destructive ? 'destructive' : 'default',
      onPress: () => { void opts.onConfirm(); },
    },
  ];
  Alert.alert(title, message, buttons);
}

export const notify = { error, success, info, confirm };
