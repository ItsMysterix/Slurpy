"use client"

// Thin client-only wrappers around Clerk hooks that allow Playwright to inject
// test doubles via window.__E2E_AUTH_MOCK__. In production, fall back to the
// real hooks from @clerk/nextjs.

type AnyFn = (...args: any[]) => any

function pickMock<T extends AnyFn>(key: string): T | undefined {
  if (typeof window === "undefined") return undefined as any
  const w = window as any
  const mock = w.__E2E_AUTH_MOCK__?.[key]
  return typeof mock === "function" ? (mock as T) : undefined
}

export function useSignUp() {
  const mock = pickMock("useSignUp")
  if (mock) return mock()
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useSignUp: real } = require("@clerk/nextjs")
  try {
    return real()
  } catch (e) {
    if (process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true") {
      return {
        isLoaded: true,
        signUp: {
          create: async () => ({ status: "complete", createdSessionId: "sess_e2e" }),
          prepareEmailAddressVerification: async () => ({ ok: true }),
          authenticateWithRedirect: async () => undefined,
        },
        setActive: async () => ({ ok: true }),
      }
    }
    throw e
  }
}

export function useAuth() {
  const mock = pickMock("useAuth")
  if (mock) return mock()
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useAuth: real } = require("@clerk/nextjs")
  try {
    return real()
  } catch (e) {
    if (process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true") {
      return { isSignedIn: true, userId: "user_e2e" }
    }
    throw e
  }
}

export function useSignIn() {
  const mock = pickMock("useSignIn")
  if (mock) return mock()
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useSignIn: real } = require("@clerk/nextjs")
  try {
    return real()
  } catch (e) {
    if (process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true") {
      return { isLoaded: true }
    }
    throw e
  }
}

export function useUser() {
  const mock = pickMock("useUser")
  if (mock) return mock()
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useUser: real } = require("@clerk/nextjs")
  try {
    return real()
  } catch (e) {
    if (process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true") {
      return { user: { id: "user_e2e", firstName: "Testy" } }
    }
    throw e
  }
}

export function useClerk() {
  const mock = pickMock("useClerk")
  if (mock) return mock()
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useClerk: real } = require("@clerk/nextjs")
  try {
    return real()
  } catch (e) {
    if (process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true") {
      return { loaded: true }
    }
    throw e
  }
}
