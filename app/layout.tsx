// app/layout.tsx
import type React from "react";
import type { Metadata } from "next";
import { Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { makeNonce } from "@/lib/csp";
import Providers from "@/components/providers";
import { Toaster } from "@/components/ui/toaster";

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
  // Use existing icon from /public to avoid 404s
  icons: [{ rel: "icon", url: "/Slurpy.ico" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = makeNonce();
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${jakarta.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <meta name="csp-nonce" content={nonce} />
        <Providers>
          {children}
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
