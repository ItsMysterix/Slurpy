import type React from "react"
import type { Metadata } from "next"
import { ClerkProvider } from "@clerk/nextjs"                 
import { Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google"
import "./globals.css"

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
      <html lang="en" className={`${cormorant.variable} ${jakarta.variable}`}>
        <body className="font-sans antialiased">{children}</body>
      </html>
    </ClerkProvider>
  )
}
