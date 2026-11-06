import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.muuuuoouuun.arcade',
  appName: '플레이그라운드',
  webDir: 'dist',
  backgroundColor: '#102c25',
  android: { backgroundColor: '#102c25' },
  // No server.url: all games, fonts and art are packaged for offline startup.
};

export default config;
