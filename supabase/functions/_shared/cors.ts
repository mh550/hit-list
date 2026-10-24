// CORS headers for every Edge Function response. The app (React Native) sends no Origin, so these matter only for a
// browser caller (Supabase Studio, a future web build); supabase-js sends the headers listed here.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
