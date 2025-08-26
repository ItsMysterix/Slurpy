// app/email-verify-page/layout.tsx
import { Suspense } from "react"

// Route segment config must live in a *server* file
export const revalidate = 0
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-50 to-clay-400/10 flex items-center justify-center">
          <span className="animate-pulse text-sage-500">Loading…</span>
        </div>
      }
    >
      {children}
    </Suspense>
  )
}
