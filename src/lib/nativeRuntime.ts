import { Capacitor } from '@capacitor/core';
import { NATIVE_BACKGROUND, handleNativeBack } from './nativeEvents';
import { setNativeHaptic } from './haptic';
import { suspendAudio, unlockAudio } from './sound';

/** Installed assets are local; the web build needs no native plugins or server. */
export async function startNativeRuntime() {
  if (!Capacitor.isNativePlatform()) return;
  const [{ App }, { Haptics }] = await Promise.all([import('@capacitor/app'), import('@capacitor/haptics')]);
  setNativeHaptic(pattern => {
    const duration = typeof pattern === 'number' ? pattern : pattern.reduce((sum, ms, i) => sum + (i % 2 === 0 ? ms : 0), 0);
    void Haptics.vibrate({ duration }).catch(() => {});
  });
  await App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) {
      window.dispatchEvent(new Event(NATIVE_BACKGROUND));
      suspendAudio();
    }
    // Foregrounding never resumes a round; the player uses its existing resume button.
  });
  await App.addListener('backButton', () => {
    if (!handleNativeBack()) void App.minimizeApp().catch(() => {});
  });
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
}
