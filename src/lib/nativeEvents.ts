/** Native signals also used by the browser integration harness. */
export const NATIVE_BACKGROUND = 'arcade:background';
export const NATIVE_BACK = 'arcade:back';

/** Close the active dialog first, then let the game pause, then navigate the hub. */
export function handleNativeBack(): boolean {
  const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')]
    .filter(dialog => !dialog.closest('[inert], [aria-hidden="true"]'));
  const dialog = dialogs.at(-1);
  const escape = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
  if (dialog) {
    dialog.dispatchEvent(escape);
    // Mandatory choices without a close action must never dismiss the whole game.
    return true;
  }
  // Real keyboard events target an element. Existing game handlers inspect
  // target.closest(), so dispatching directly on Window would bypass that contract.
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  target.dispatchEvent(escape);
  if (escape.defaultPrevented) return true;
  return !window.dispatchEvent(new Event(NATIVE_BACK, { cancelable: true }));
}
