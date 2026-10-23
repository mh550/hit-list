import { create } from 'zustand';

/** How long a toast stays up. */
export const TOAST_MS = 3000;

// One short line over the screens (ToastHost in app/_layout.tsx), e.g. 'Sent to @ana' after the Send sheet closed.
interface ToastState {
  text: string | null;
}

export const useToastStore = create<ToastState>(() => ({ text: null }));

let timer: ReturnType<typeof setTimeout> | null = null;

/** Shows `text` for TOAST_MS; a newer toast replaces it and gets its own time. */
export function showToast(text: string): void {
  if (timer) clearTimeout(timer);
  useToastStore.setState({ text });
  timer = setTimeout(() => {
    timer = null;
    useToastStore.setState({ text: null });
  }, TOAST_MS);
}
