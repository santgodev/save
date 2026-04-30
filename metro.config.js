const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Ignorar el directorio .agents para que Metro bundler no lance errores ENOENT
config.resolver.blockList = [
  ...Array.from(config.resolver.blockList || []),
  /\.agents\/.*/
];

module.exports = withNativeWind(config, { input: "./app/global.css" });
