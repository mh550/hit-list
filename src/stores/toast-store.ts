import { AccessibilityInfo } from 'react-native';
import { create } from 'zustand';

/** How long a toast stays up. */
export const TOAST_MS = 3000;

// One short line over the screens (ToastHost in app/_layout.tsx), e.g. 'Sent to @ana' after the Send sheet closed.
interface ToastState {
  text: string | null;
}

export const useToastStore = create<ToastState>(() => ({ text: null }));

let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Shows `text` for TOAST_MS; a newer toast replaces it and gets its own time. Announced here, once, however many
 * hosts draw it (a native modal screen draws its own, since it covers the root's).
 */
export function showToast(text: string): void {
  if (timer) clearTimeout(timer);
  useToastStore.setState({ text });
  AccessibilityInfo.announceForAccessibility(text);
  timer = setTimeout(() => {
    timer = null;
    useToastStore.setState({ text: null });
  }, TOAST_MS);
}

/** Takes the line down now (and its timer): tests, and a rider change if one ever needs it. */
export function clearToast(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  useToastStore.setState({ text: null });
}
