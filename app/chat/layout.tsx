// app/chat/layout.tsx
import { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function ChatLayout({ children }: { children: ReactNode }) {
  // E2E bypass keeps SSR smooth in tests
  if (process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true") {
    return <>{children}</>;
  }

  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/chat");
  return <>{children}</>;
}
