const base = require('./app.json').expo;

module.exports = () => {
  const variant = process.env.APP_VARIANT || 'production';
  if (!['production', 'development', 'preview'].includes(variant)) {
    throw new Error('APP_VARIANT must be production, development or preview.');
  }
  const testing = variant !== 'production';
  const backendUrl = process.env.EXPO_PUBLIC_DEV_SUPABASE_URL || '';
  const backendKey = process.env.EXPO_PUBLIC_DEV_SUPABASE_ANON_KEY || '';
  const dataMode = testing ? (process.env.SAVE_DEV_DATA_MODE || 'demo') : 'live';
  if (testing && !['demo', 'staging'].includes(dataMode)) throw new Error('Invalid SAVE_DEV_DATA_MODE.');
  if (testing && dataMode === 'staging' && (!backendUrl || !backendKey || backendUrl === process.env.EXPO_PUBLIC_SUPABASE_URL)) {
    throw new Error('Staging requires separate EXPO_PUBLIC_DEV_SUPABASE_URL and EXPO_PUBLIC_DEV_SUPABASE_ANON_KEY.');
  }
  const bundleIdentifier = testing ? `${base.ios.bundleIdentifier}.${variant === 'development' ? 'dev' : 'preview'}` : base.ios.bundleIdentifier;
  const scheme = testing ? `saveapp-${variant === 'development' ? 'dev' : 'preview'}` : base.scheme;
  return {
    ...base,
    name: testing ? `Save ${variant === 'development' ? 'Dev' : 'Preview'}` : base.name,
    icon: testing ? './assets/images/icon-dev.png' : base.icon,
    scheme,
    ios: { ...base.ios, bundleIdentifier },
    // A native widget binary must never consume updates built for the old runtime.
    runtimeVersion: { policy: 'fingerprint' },
    extra: {
      ...base.extra,
      appVariant: variant,
      dataMode,
      appScheme: scheme,
      ...(testing ? { devBackendUrl: dataMode === 'staging' ? backendUrl : '', devBackendKey: dataMode === 'staging' ? backendKey : '' } : {}),
    },
    plugins: [
      ...base.plugins,
      ['expo-dev-client', { addGeneratedScheme: variant === 'development' }],
      ...(variant === 'development' ? [
        ['expo-widgets', {
          bundleIdentifier: `${bundleIdentifier}.widgets`,
          groupIdentifier: `group.${bundleIdentifier}.widgets`,
          widgets: [
            { name: 'SavePocket', displayName: 'Mi bolsillo', description: 'Tu dinero disponible, justo cuando lo necesitas.',
              supportedFamilies: ['systemSmall', 'systemMedium'],
              configuration: { title: 'Mi bolsillo', parameters: {
                hideAmounts: { title: 'Ocultar montos', type: 'boolean', default: false },
              } } },
            { name: 'SaveScanner', displayName: 'Escanear factura', description: 'Abre el escáner de Save desde tu pantalla bloqueada.',
              supportedFamilies: ['accessoryCircular', 'accessoryRectangular', 'accessoryInline'] },
          ],
        }],
        './plugins/with-widget-fonts',
      ] : []),
    ],
  };
};
