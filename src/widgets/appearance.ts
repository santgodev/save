import { getDeterministicColor, getTheme } from '../theme/theme';
import type { WidgetPalette } from './model';

export function widgetPalette(dark: boolean, pocketId = ''): WidgetPalette {
  const theme = getTheme(dark ? 'sageDark' : 'sage');
  return {
    background: theme.colors.background, text: theme.colors.onSurface,
    secondary: dark ? '#B2C2B8' : theme.colors.onPrimaryContainer,
    accent: pocketId ? getDeterministicColor(pocketId, theme.colors.pocketFlatColors) : theme.colors.pastel.teal,
    tint: dark ? theme.colors.primary : theme.colors.onPrimaryContainer,
    track: theme.colors.surfaceContainerHigh, error: theme.colors.error,
  };
}
