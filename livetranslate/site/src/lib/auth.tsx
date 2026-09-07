import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, type Church, type Role } from './supabase';

export type Membership = { church_id: number; role: Role; churches: Church };

type Ctx = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  memberships: Membership[];
  isPlatformAdmin: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};
const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) { setMemberships([]); setIsPlatformAdmin(false); return; }
    const [m, p] = await Promise.all([
      supabase.from('memberships').select('church_id, role, churches(*)').order('church_id'),
      supabase.from('platform_admins').select('user_id').maybeSingle(),
    ]);
    setMemberships(((m.data ?? []) as unknown) as Membership[]);
    setIsPlatformAdmin(!!p.data);
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, s) => {
      setSession(s);
      await loadProfile(s);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await loadProfile(data.session);
  }, [loadProfile]);

  const signOut = useCallback(async () => { await supabase.auth.signOut(); }, []);

  const value = useMemo<Ctx>(() => ({
    loading, session, user: session?.user ?? null, memberships, isPlatformAdmin, refresh, signOut,
  }), [loading, session, memberships, isPlatformAdmin, refresh, signOut]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
