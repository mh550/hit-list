/** What a caught value says, for a `console.warn` or the sync store's lastError. */
export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));
