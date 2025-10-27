"use client";

// Auth hooks backed by Supabase. Expose a minimal shape used across the app.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type AnyFn = (...args: any[]) => any;

function pickMock<T extends AnyFn>(key: string): T | undefined {
  if (typeof window === "undefined") return undefined as any;
  const w = window as any;
  const mock = w.__E2E_AUTH_MOCK__?.[key];
  return typeof mock === "function" ? (mock as T) : undefined;
}

export function useAuth() {
  const mock = pickMock<() => { isSignedIn: boolean; isLoaded: boolean; userId?: string }>("useAuth");
  if (mock) return mock();
  const [isLoaded, setLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setUserId(data.user?.id ?? null);
      setLoaded(true);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setLoaded(true);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { isSignedIn: !!userId, isLoaded, userId };
}

export function useUser() {
  const mock = pickMock<() => { user: any; isLoaded: boolean }>("useUser");
  if (mock) return mock();
  const [isLoaded, setLoaded] = useState(false);
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setUser(data.user ?? null);
      setLoaded(true);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      setLoaded(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return { user, isLoaded };
}

export function useSignIn() {
  const mock = pickMock<() => { isLoaded: boolean; signIn: any; setActive: AnyFn }>("useSignIn");
  if (mock) return mock();
  const isLoaded = true;

  const signIn = useMemo(() => ({
    async create({ identifier, password }: { identifier: string; password: string }) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: identifier,
        password,
      });
      if (error) {
        const err: any = new Error(error.message);
        (err.errors as any) = [{ code: error.status === 400 ? "invalid_credentials" : "unknown", message: error.message }];
        throw err;
      }
      return { status: data.session ? "complete" : "needs_verification", createdSessionId: data.session?.access_token };
    },
    async authenticateWithRedirect({ strategy, redirectUrl, redirectUrlComplete }: { strategy: string; redirectUrl?: string; redirectUrlComplete?: string }) {
      if (strategy !== "oauth_google") throw new Error("Only oauth_google supported in this wrapper");
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectUrlComplete || redirectUrl },
      });
    },
  }), []);

  const setActive = async (_: any) => {};
  return { isLoaded, signIn, setActive };
}

export function useSignUp() {
  const mock = pickMock<() => { isLoaded: boolean; signUp: any; setActive: AnyFn }>("useSignUp");
  if (mock) return mock();
  const isLoaded = true;

  const signUp = useMemo(() => ({
    async create({ firstName, lastName, username, emailAddress, password }: { firstName?: string; lastName?: string; username?: string; emailAddress: string; password: string }) {
      const origin = typeof window !== "undefined" ? window.location.origin : undefined;
      const { data, error } = await supabase.auth.signUp({
        email: emailAddress,
        password,
        options: {
          data: { firstName, lastName, username },
          // Ensure the email verification link brings users back to our callback and then into chat
          ...(origin ? { emailRedirectTo: `${origin}/sso-callback?next=/chat` } : {}),
        },
      });
      if (error) {
        const err: any = new Error(error.message);
        (err.errors as any) = [{ code: "signup_failed", message: error.message }];
        throw err;
      }
      const complete = !!data.session || !!data.user?.email_confirmed_at;
      return { status: complete ? "complete" : "needs_verification", createdSessionId: data.session?.access_token };
    },
    async prepareEmailAddressVerification(_: any) { return { ok: true }; },
    async authenticateWithRedirect({ strategy, redirectUrl, redirectUrlComplete }: { strategy: string; redirectUrl?: string; redirectUrlComplete?: string }) {
      if (strategy !== "oauth_google") throw new Error("Only oauth_google supported in this wrapper");
      await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectUrlComplete || redirectUrl } });
    },
  }), []);

  const setActive = async (_: any) => {};
  return { isLoaded, signUp, setActive };
}

// Minimal sign-out client
export function useAuthClient() {
  return {
    loaded: true,
    async signOut(opts?: { redirectUrl?: string }) {
      await supabase.auth.signOut();
      if (typeof window !== "undefined") {
        window.location.href = opts?.redirectUrl || "/";
      }
    },
  } as const;
}

// Step-up verification shim
export function useReverification<T extends (...args: any[]) => any>(fn: T): T {
  return fn;
}
