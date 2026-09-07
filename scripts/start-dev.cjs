const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const expo = require.resolve('expo/bin/cli');
const result = spawnSync(process.execPath, [expo, 'start', '--dev-client', ...process.argv.slice(2)], {
  cwd: root, stdio: 'inherit', env: { ...process.env, APP_VARIANT: 'development', SAVE_DEV_DATA_MODE: process.env.SAVE_DEV_DATA_MODE || 'demo', EXPO_NO_CACHE: '1' },
});
process.exit(result.status ?? 1);
