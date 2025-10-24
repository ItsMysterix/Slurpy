// app/layout.tsx
import type React from "react";
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { makeNonce } from "@/lib/csp";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Slurpy - AI Therapy Chat",
  description: "Your empathetic AI companion for mental wellness and emotional support.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = makeNonce();
  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      // Clerk v5 redirect props on Provider (non-deprecated)
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/chat"
      signUpFallbackRedirectUrl="/chat"
      // signInForceRedirectUrl="/chat"
      // signUpForceRedirectUrl="/chat"
    >
      <html
        lang="en"
        className={`${cormorant.variable} ${jakarta.variable}`}
        suppressHydrationWarning
      >
        <body className="font-sans antialiased">
          <meta name="csp-nonce" content={nonce} />
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
            // storageKey="slurpy-theme" // uncomment to persist under a custom key
          >
            {children}
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
