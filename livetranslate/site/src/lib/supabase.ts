import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
if (!url || !key) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY ausentes no .env');

// Chave PUBLICÁVEL (anon): segura no navegador — tudo que ela alcança passa por RLS.
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});

export type Church = {
  id: number; slug: string; name: string; logo_path: string | null; logo_is_light: boolean; speaker_lang: string;
  plan: 'starter' | 'growth' | 'congregation'; status: 'trial' | 'active' | 'past_due' | 'canceled';
  trial_ends_at: string | null; sermon_recipients: string[]; livekit_room: string;
  country: string | null; billing_currency: 'usd' | 'brl';   // 0009: moeda decidida pelo país
  // 0010: assinatura no Stripe (us | br)
  stripe_account: 'us' | 'br' | null; stripe_subscription_id: string | null;
  current_period_end: string | null; cancel_at_period_end: boolean;
  language_limit: number | null;   // 0012: override da plataforma (null = limite do plano)
};
export type Role = 'admin' | 'operator';

export function logoUrl(path: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from('logos').getPublicUrl(path).data.publicUrl;
}
