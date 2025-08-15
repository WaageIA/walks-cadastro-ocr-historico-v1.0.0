import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"
import { AuthProvider } from "@/app/context/AuthContext"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Walks Bank - Cadastro de Clientes",
  description: "Sistema de cadastro de clientes com OCR automático",
  generator: "v0.dev",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
        <footer className="fixed bottom-2 right-4 text-xs text-gray-400 z-10">
          v1.0.1 • Powered by Waage AI Solutions
        </footer>
      </body>
    </html>
  )
}
