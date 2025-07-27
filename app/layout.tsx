import type React from "react"
import type { Metadata } from "next"
import { ClerkProvider } from "@clerk/nextjs"
import { Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "next-themes"

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
})
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "Slurpy - AI Therapy Chat",
  description: "Your empathetic AI companion for mental wellness and emotional support.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${cormorant.variable} ${jakarta.variable}`} suppressHydrationWarning>
        <body className="font-sans antialiased">
          {/* Only change: give next-themes the right defaults */}
          <ThemeProvider
            attribute="class"              // Tailwind dark mode via class on <html>
            defaultTheme="system"          // respect OS theme by default
            enableSystem                   // allow system switching
            disableTransitionOnChange      // avoid flashing on toggle
            // storageKey="slurpy-theme"   // optional: persist under custom key
            // themes={['light','dark']}    // optional: lock to these
          >
            {children}
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
