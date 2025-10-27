// app/chat/layout.tsx
import { ReactNode } from "react";

// For now, we don't enforce server-side auth here because Supabase sessions
// are client-side. Middleware or client components will handle redirects.
export default function ChatLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
