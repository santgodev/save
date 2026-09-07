const { withXcodeProject } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');
const plist = require('@expo/plist');

// Font registration in the app does not register fonts in its widget extension.
// Copy the same font assets to the extension and its Resources build phase.
module.exports = function withWidgetFonts(config) {
  return withXcodeProject(config, config => {
    const project = config.modResults;
    const target = project.pbxTargetByName('ExpoWidgetsTarget');
    if (!target) throw new Error('expo-widgets must run before with-widget-fonts.');
    const targetEntry = Object.entries(project.pbxNativeTargetSection()).find(([, value]) => value === target);
    if (!targetEntry) throw new Error('Widget target UUID not found.');
    const targetId = targetEntry[0];
    const root = config.modRequest.projectRoot;
    const directory = path.join(config.modRequest.platformProjectRoot, 'ExpoWidgetsTarget');
    fs.mkdirSync(directory, { recursive: true });
    const fonts = [
      ['@expo-google-fonts/outfit/700Bold/Outfit_700Bold.ttf', 'Outfit_700Bold.ttf'],
      ['@expo-google-fonts/outfit/900Black/Outfit_900Black.ttf', 'Outfit_900Black.ttf'],
      ['@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf', 'Inter_400Regular.ttf'],
      ['@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf', 'Inter_700Bold.ttf'],
    ];
    const group = project.findPBXGroupKey({ name: 'ExpoWidgetsTarget' });
    for (const [source, fileName] of fonts) {
      fs.copyFileSync(require.resolve(source, { paths: [root] }), path.join(directory, fileName));
      const resource = `ExpoWidgetsTarget/${fileName}`;
      if (!project.hasFile(resource)) project.addResourceFile(resource, { target: targetId }, group);
    }
    const infoPath = path.join(directory, 'Info.plist');
    const info = plist.parse(fs.readFileSync(infoPath, 'utf8'));
    info.UIAppFonts = fonts.map(([, fileName]) => fileName);
    fs.writeFileSync(infoPath, plist.build(info));
    return config;
  });
};
