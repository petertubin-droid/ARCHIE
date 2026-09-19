import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, getSupabase } from '@/lib/supabase-lazy';
import type { DbProfile, DbUserPaidStatus } from '@/types/database';

export type AccountType = 'client' | 'pro_worker';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: DbProfile | null;
  paidStatus: DbUserPaidStatus | null;
  isPaid: boolean;
  isAdmin: boolean;
  loading: boolean;
  configured: boolean;
}

interface SignUpResult {
  error: string | null;
  needsConfirmation: boolean;
}

interface SignInResult {
  error: string | null;
  isAdmin: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signUp: (email: string, password: string, accountType?: AccountType) => Promise<SignUpResult>;
  signInWithGoogle: (accountType?: AccountType) => Promise<{ error: string | null }>;
  signInWithOtp: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
  refreshPaidStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    profile: null,
    paidStatus: null,
    isPaid: false,
    isAdmin: false,
    loading: true,
    configured: isSupabaseConfigured,
  });

  async function loadProfile(userId: string): Promise<DbProfile | null> {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, role, account_type, full_name, phone, avatar_url, marketplace_id, created_at, updated_at')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      if (import.meta.env.DEV) console.error('[auth] Failed to load profile:', error.message);
      return null;
    }
    return data as DbProfile | null;
  }

  /**
   * Load the user's paid/subscription status from `user_paid_status`.
   * RLS allows users to read only their own row.
   */
  async function loadPaidStatus(userId: string): Promise<{ status: DbUserPaidStatus | null; isPaid: boolean }> {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('user_paid_status')
      .select('user_id, is_paid, plan, paid_until, payment_provider, provider_customer_id, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      if (import.meta.env.DEV) console.error('[auth] Failed to load paid status:', error.message);
      return { status: null, isPaid: false };
    }
    const status = data as DbUserPaidStatus | null;
    let isPaid = false;
    if (status && status.is_paid) {
      if (status.paid_until) {
        const expiry = new Date(status.paid_until).getTime();
        isPaid = Date.now() <= expiry;
      } else {
        isPaid = true; // paid with no expiry = lifetime
      }
    }
    return { status, isPaid };
  }

  async function refreshProfile() {
    if (!state.user) return;
    const profile = await loadProfile(state.user.id);
    const { status, isPaid } = await loadPaidStatus(state.user.id);
    setState((s) => ({ ...s, profile, isAdmin: profile?.role === 'admin', paidStatus: status, isPaid }));
  }

  async function refreshPaidStatus() {
    if (!state.user) return;
    const { status, isPaid } = await loadPaidStatus(state.user.id);
    setState((s) => ({ ...s, paidStatus: status, isPaid }));
  }

  /**
   * Set account_type on the user's profile row after signup.
   * Falls back to upsert if the profile row doesn't exist yet (trigger may not have fired).
   */
  async function setAccountType(userId: string, email: string, accountType: AccountType) {
    const supabase = await getSupabase();
    // First try to update existing row
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ account_type: accountType })
      .eq('id', userId);
    if (updateError) {
      // Row might not exist yet, try upsert
      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert({ id: userId, email, role: 'user', account_type: accountType }, { onConflict: 'id' });
      if (upsertError && import.meta.env.DEV) {
        console.error('[auth] setAccountType upsert failed:', upsertError.message);
      }
    }
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    let mounted = true;

    getSupabase().then((supabase) => {
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!mounted) return;
      if (error) {
        if (import.meta.env.DEV) console.error('[auth] getSession error:', error.message);
        setState({ session: null, user: null, profile: null, paidStatus: null, isPaid: false, isAdmin: false, loading: false, configured: true });
        return;
      }
      const session = data.session;
      const user = session?.user ?? null;
      const profile = user ? await loadProfile(user.id) : null;
      const { status: paidStatus, isPaid } = user ? await loadPaidStatus(user.id) : { status: null, isPaid: false };
      if (!mounted) return;
      setState({ session, user, profile, paidStatus, isPaid, isAdmin: profile?.role === 'admin', loading: false, configured: true });
    }).catch((err) => {
      if (import.meta.env.DEV) console.error('[auth] getSession threw:', err);
      if (mounted) setState((s) => ({ ...s, loading: false }));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        const user = session?.user ?? null;
        const profile = user ? await loadProfile(user.id) : null;
        const { status: paidStatus, isPaid } = user ? await loadPaidStatus(user.id) : { status: null, isPaid: false };
        if (!mounted) return;
        setState({ session, user, profile, paidStatus, isPaid, isAdmin: profile?.role === 'admin', loading: false, configured: true });
      })();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    }); // close getSupabase().then()
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      signIn: async (email, password) => {
        const supabase = await getSupabase();
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { error: error.message, isAdmin: false };
        const user = data.user;
        const profile = user ? await loadProfile(user.id) : null;
        const { status: paidStatus, isPaid } = user ? await loadPaidStatus(user.id) : { status: null, isPaid: false };
        const isAdmin = profile?.role === 'admin';
        setState((s) => ({
          ...s,
          session: data.session,
          user,
          profile,
          paidStatus,
          isPaid,
          isAdmin,
          loading: false,
        }));
        return { error: null, isAdmin };
      },
      signUp: async (email, password, accountType = 'client') => {
        const supabase = await getSupabase();
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) return { error: error.message, needsConfirmation: false };
        const needsConfirmation = !data.session;
        // If auto-signed-in, set account type on profile immediately
        if (data.user && !needsConfirmation) {
          await setAccountType(data.user.id, email, accountType);
          const profile = await loadProfile(data.user.id);
          const { status: paidStatus, isPaid } = await loadPaidStatus(data.user.id);
          setState((s) => ({ ...s, session: data.session, user: data.user, profile, paidStatus, isPaid, isAdmin: false, loading: false }));
        }
        return { error: null, needsConfirmation };
      },
      signInWithGoogle: async (accountType = 'client') => {
        // Store selected account type in localStorage so we can set it after OAuth redirect
        if (accountType) localStorage.setItem('frelux_pending_account_type', accountType);
        const supabase = await getSupabase();
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: `${window.location.origin}/login?redirect=/dashboard`,
          },
        });
        return { error: error ? error.message : null };
      },
      signInWithOtp: async (email) => {
        const supabase = await getSupabase();
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/login?redirect=/dashboard`,
          },
        });
        return { error: error ? error.message : null };
      },
      signOut: async () => {
        const supabase = await getSupabase();
        await supabase.auth.signOut();
        setState((s) => ({ ...s, session: null, user: null, profile: null, paidStatus: null, isPaid: false, isAdmin: false }));
      },
      resetPassword: async (email) => {
        const supabase = await getSupabase();
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login`,
        });
        return { error: error ? error.message : null };
      },
      refreshProfile,
      refreshPaidStatus,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
