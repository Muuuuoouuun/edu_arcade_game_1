import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.muuuuoouuun.arcana',
  appName: '아르카나 수비대',
  webDir: 'dist-mobile',
  backgroundColor: '#102c25',
  android: { backgroundColor: '#102c25' },
  // No server.url: Arcana starts from local bundled assets, including fonts and art.
  // A separate app ID preserves the installed legacy arcade. Its sandbox is not migrated.
};

export default config;
