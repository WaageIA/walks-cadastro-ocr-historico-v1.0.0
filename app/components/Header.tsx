"use client"

import { useRouter } from "next/navigation"
import { useAuth } from "@/app/context/AuthContext"
import { Button } from "@/components/ui/button"
import { LogOut } from "lucide-react"
import { useState } from "react"

export default function Header() {
  const router = useRouter()
  const { secureLogout } = useAuth()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogoClick = () => {
    router.push("/home")
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await secureLogout()
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div
              className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center cursor-pointer hover:bg-blue-700 transition-colors duration-200"
              onClick={handleLogoClick}
              role="button"
              aria-label="Voltar ao menu principal"
            >
              <span className="text-white font-bold text-lg">W</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Walks Bank</h1>
              <p className="text-sm text-gray-600">Cadastro de Clientes</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-900">Sistema OCR</p>
              <p className="text-xs text-gray-500">Powered by Waage</p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-2 bg-transparent"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">{isLoggingOut ? "Saindo..." : "Sair"}</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
