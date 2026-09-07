/** @jsxImportSource react */
import { HStack, VStack, Text, Image, Spacer, Link, ProgressView } from '@expo/ui/swift-ui';
import { accessibilityLabel, background, containerBackground, cornerRadius, font, foregroundStyle, frame, minimumScaleFactor, padding, privacySensitive, tint, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { PocketSnapshot } from './model';

// Widget functions run in the extension's isolated JS runtime. Keep all runtime
// logic inside the function and pass serializable, already formatted data only.
const PocketLayout = (props: PocketSnapshot, env: WidgetEnvironment<{ hideAmounts?: boolean }>) => {
  'widget';
  const colors = env.colorScheme === 'dark' ? props.dark : props.light;
  const medium = env.widgetFamily === 'systemMedium';
  const hidden = props.hideAmounts || env.configuration?.hideAmounts || env.isLuminanceReduced;
  const stale = env.date.getTime() - props.updatedAt >= 24 * 60 * 60 * 1000;
  const open = `${props.scheme}:///?widget=${props.status === 'ready' ? 'pockets' : 'widgets'}&pocketId=${encodeURIComponent(props.pocketId)}`;
  const ink = env.widgetRenderingMode === 'accented' ? 'primary' : colors.text;
  const muted = env.widgetRenderingMode === 'accented' ? 'secondary' : colors.secondary;
  return (
    <VStack alignment="leading" spacing={6} modifiers={[containerBackground(colors.background, 'widget'), widgetURL(open)]}>
      <HStack spacing={6}>
        <Image systemName="wallet.bifold.fill" size={16} color={colors.accent} />
        <Text modifiers={[font({ family: 'Outfit-Bold', size: 18, textStyle: 'headline' }), foregroundStyle(ink), minimumScaleFactor(0.75)]}>{props.title}</Text>
        <Spacer />
        {medium ? <Text modifiers={[font({ family: 'Outfit-Bold', size: 14 }), foregroundStyle(colors.tint)]}>save</Text> : null}
      </HStack>
      <Spacer minLength={0} />
      {props.status === 'ready' ? (
        <VStack alignment="leading" spacing={3}>
          <Text modifiers={[font({ family: 'Inter-Bold', size: 10, textStyle: 'caption2' }), foregroundStyle(muted)]}>{props.demo ? 'VISTA DE PRUEBA' : props.overdrawn && !hidden ? 'EXCESO' : 'TE QUEDA'}</Text>
          <Text modifiers={[font({ family: 'Outfit-Black', size: medium ? 38 : 32, textStyle: 'largeTitle' }), foregroundStyle(ink), minimumScaleFactor(0.5), privacySensitive(), accessibilityLabel(hidden ? 'Monto oculto' : `${props.overdrawn ? 'Exceso' : 'Disponible'}: ${props.amount}`)]}>{hidden ? '••••' : props.amount}</Text>
          {!hidden ? <ProgressView value={props.remaining} modifiers={[tint(props.overdrawn ? colors.error : colors.accent), privacySensitive()]} /> : null}
          <Text modifiers={[font({ family: 'Inter-Regular', size: 11, textStyle: 'caption' }), foregroundStyle(muted)]}>{hidden ? 'Montos ocultos' : props.detail}</Text>
        </VStack>
      ) : (
        <Text modifiers={[font({ family: 'Inter-Regular', size: 14, textStyle: 'body' }), foregroundStyle(ink)]}>{props.status === 'signedOut' ? 'Abre Save para ver tu bolsillo.' : props.status === 'missing' ? 'Elige otro bolsillo en Save.' : 'Configura tu primer bolsillo en Save.'}</Text>
      )}
      <Spacer minLength={0} />
      <HStack spacing={6}>
        <Text modifiers={[font({ family: 'Inter-Regular', size: 10, textStyle: 'caption2' }), foregroundStyle(muted)]}>{stale ? 'Abre Save para actualizar' : props.demo ? 'Datos de ejemplo' : `Actualizado ${props.updatedLabel}`}</Text>
        <Spacer />
        {medium && props.status === 'ready' ? <Link destination={`${props.scheme}:///?widget=quick_expense&pocketId=${encodeURIComponent(props.pocketId)}`} modifiers={[accessibilityLabel('Registrar gasto en este bolsillo')]}><Text modifiers={[font({ family: 'Inter-Bold', size: 12 }), foregroundStyle(colors.tint), padding({ horizontal: 10, vertical: 8 }), background(colors.track), cornerRadius(12)]}>+ Gasto</Text></Link> : null}
        {medium ? <Link destination={`${props.scheme}:///?widget=scanner`} modifiers={[accessibilityLabel('Escanear factura')]}><Image systemName="viewfinder" size={20} modifiers={[foregroundStyle(colors.tint), frame({ width: 44, height: 36 }), background(colors.track), cornerRadius(12)]} /></Link> : null}
      </HStack>
    </VStack>
  );
};

const ScannerLayout = (props: { scheme: string }, env: WidgetEnvironment) => {
  'widget';
  return (
    <HStack spacing={8} modifiers={[widgetURL(`${props.scheme}:///?widget=scanner`), accessibilityLabel('Save. Escanear factura')]}>
      <Image systemName="viewfinder" size={env.widgetFamily === 'accessoryCircular' ? 26 : 20} />
      {env.widgetFamily !== 'accessoryCircular' ? <VStack alignment="leading" spacing={0}><Text modifiers={[font({ textStyle: 'headline', weight: 'bold' })]}>Escanear</Text>{env.widgetFamily === 'accessoryRectangular' ? <Text modifiers={[font({ textStyle: 'caption' })]}>Factura en Save</Text> : null}</VStack> : null}
    </HStack>
  );
};

export const SavePocketWidget = createWidget<PocketSnapshot, { hideAmounts?: boolean }>('SavePocket', PocketLayout);
export const SaveScannerWidget = createWidget('SaveScanner', ScannerLayout);
