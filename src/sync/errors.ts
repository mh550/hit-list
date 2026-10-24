export type ServerError = { message: string; code?: string };

/** A supabase-js error as an Error that keeps its code (a caller may check '42501', '55000'…). */
export const serverError = (error: ServerError) => Object.assign(new Error(error.message), { code: error.code });

/** What a caught value says, for a `console.warn` or the sync store's lastError. */
export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));
