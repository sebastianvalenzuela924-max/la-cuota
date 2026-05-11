import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { saldamosSupabase } from '@/integrations/supabase/saldamos-client';

type AuthResult = {
  error: Error | null;
  requiresEmailConfirmation?: boolean;
};

type SaldamosAuthCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

const SaldamosAuthContext = createContext<SaldamosAuthCtx | undefined>(undefined);

export function SaldamosAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const initialSessionResolved = useRef(false);

  useEffect(() => {
    const { data: sub } = saldamosSupabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (initialSessionResolved.current) setLoading(false);
    });

    saldamosSupabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      initialSessionResolved.current = true;
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string): Promise<AuthResult> => {
    const { error } = await saldamosSupabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string): Promise<AuthResult> => {
    const redirectUrl = `${window.location.origin}/saldos`;
    const { data, error } = await saldamosSupabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl },
    });
    return { error, requiresEmailConfirmation: !data.session };
  };

  const signOut = async () => {
    setLoading(true);
    await saldamosSupabase.auth.signOut();
    setLoading(false);
  };

  return (
    <SaldamosAuthContext.Provider value={{ session, user: session?.user ?? null, loading, signIn, signUp, signOut }}>
      {children}
    </SaldamosAuthContext.Provider>
  );
}

export function useSaldamosAuth() {
  const ctx = useContext(SaldamosAuthContext);
  if (!ctx) throw new Error('useSaldamosAuth must be used within SaldamosAuthProvider');
  return ctx;
}
