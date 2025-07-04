"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { supabase } from "@/lib/supabase"
import type { User } from "@supabase/supabase-js"
import { useConfirmDialog } from "@/app/hooks/useConfirmDialog"
import ConfirmDialog from "@/app/components/ConfirmDialog"

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  secureLogout: () => Promise<void>
  refreshSession: () => void
  loading: boolean
  checkUnsavedData: () => boolean
  setHasUnsavedData: (hasUnsaved: boolean) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasUnsavedData, setHasUnsavedData] = useState(false)

  const { dialogState, showConfirmDialog, closeDialog } = useConfirmDialog()

  // Verificar se há dados não salvos
  const checkUnsavedData = useCallback(() => {
    // Verificar localStorage para dados de formulários
    const formCaches = ["customer_form", "followup_form"]

    for (const cacheKey of formCaches) {
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        try {
          const data = JSON.parse(cached)
          // Verificar se há dados preenchidos (excluir campos vazios e iniciais)
          const hasData = Object.entries(data).some(([key, value]) => {
            if (key === "notaInteresse" && value === 0) return false
            return value && value !== "" && value !== 0
          })
          if (hasData) return true
        } catch (error) {
          console.error("Erro ao verificar cache:", error)
        }
      }
    }

    return hasUnsavedData
  }, [hasUnsavedData])

  // Limpeza completa do sistema
  const performCompleteCleanup = useCallback(async () => {
    try {
      console.log("🧹 Iniciando limpeza completa do sistema...")

      // 1. Logout do Supabase
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error("Erro no logout do Supabase:", error)
      }

      // 2. Limpar localStorage
      localStorage.clear()

      // 3. Limpar sessionStorage
      sessionStorage.clear()

      // 4. Limpar cookies
      document.cookie.split(";").forEach((cookie) => {
        const eqPos = cookie.indexOf("=")
        const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim()
        if (name) {
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`
        }
      })

      // 5. Limpar cache do navegador (se possível)
      if ("caches" in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
      }

      // 6. Reset estados
      setHasUnsavedData(false)

      console.log("✅ Limpeza completa finalizada")
    } catch (error) {
      console.error("❌ Erro durante limpeza:", error)
    }
  }, [])

  // Verificar se o Supabase está configurado
  useEffect(() => {
    // Se não estiver configurado, apenas definir loading como false
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.warn("⚠️ Supabase não configurado. Configure as variáveis de ambiente.")
      setLoading(false)
      return
    }

    const getInitialSession = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession()

        if (error) {
          console.error("Erro ao obter sessão:", error)
        } else {
          setUser(session?.user ?? null)
        }
      } catch (error) {
        console.error("Erro ao verificar sessão inicial:", error)
      } finally {
        setLoading(false)
      }
    }

    getInitialSession()
  }, [])

  // Monitorar mudanças de autenticação apenas se configurado
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth state changed:", event, session?.user?.email)

      setUser(session?.user ?? null)
      setLoading(false)

      // Log de eventos para debug
      if (event === "SIGNED_IN") {
        console.log("✅ Usuário logado:", session?.user?.email)
      } else if (event === "SIGNED_OUT") {
        console.log("🚪 Usuário deslogado")
        // Limpar dados não salvos ao fazer logout
        setHasUnsavedData(false)
      } else if (event === "TOKEN_REFRESHED") {
        console.log("🔄 Token renovado")
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const login = async (email: string, password: string): Promise<void> => {
    // Verificar se está configurado antes de tentar login
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error("Supabase não configurado. Configure as variáveis de ambiente.")
    }

    try {
      setLoading(true)

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password,
      })

      if (error) {
        console.error("❌ Erro no login:", error)

        // Mapear erros do Supabase para mensagens amigáveis
        let errorMessage = "Erro desconhecido"

        switch (error.message) {
          case "Invalid login credentials":
            errorMessage = "Email ou senha incorretos"
            break
          case "Email not confirmed":
            errorMessage = "Email não confirmado. Verifique sua caixa de entrada"
            break
          case "Too many requests":
            errorMessage = "Muitas tentativas. Tente novamente em alguns minutos"
            break
          case "User not found":
            errorMessage = "Usuário não encontrado"
            break
          default:
            errorMessage = error.message || "Erro ao fazer login"
        }

        // Remover o throw error e usar toast diretamente
        throw new Error(errorMessage)
      }

      if (!data.user) {
        throw new Error("Erro ao autenticar usuário")
      }

      console.log("✅ Login bem-sucedido:", data.user.email)
      // O estado será atualizado automaticamente pelo onAuthStateChange
    } catch (error) {
      console.error("🚨 Erro no login:", error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  // Logout simples (sem confirmação)
  const logout = useCallback(async () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return
    }

    try {
      setLoading(true)
      await performCompleteCleanup()
      console.log("🚪 Logout realizado com sucesso")
    } catch (error) {
      console.error("Erro no logout:", error)
    } finally {
      setLoading(false)
    }
  }, [performCompleteCleanup])

  // Logout seguro (com confirmação)
  const secureLogout = useCallback(async () => {
    const hasUnsaved = checkUnsavedData()

    if (hasUnsaved) {
      const confirmed = await showConfirmDialog({
        title: "Dados não salvos",
        message: "Você tem dados não salvos que serão perdidos. Deseja realmente sair?",
        confirmText: "Sim, sair mesmo assim",
        cancelText: "Cancelar",
        variant: "destructive",
      })

      if (!confirmed) return
    } else {
      const confirmed = await showConfirmDialog({
        title: "Confirmar logout",
        message: "Deseja realmente sair do sistema?",
        confirmText: "Sair",
        cancelText: "Cancelar",
      })

      if (!confirmed) return
    }

    await logout()
  }, [checkUnsavedData, showConfirmDialog, logout])

  const refreshSession = useCallback(async () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return
    }

    try {
      const { data, error } = await supabase.auth.refreshSession()

      if (error) {
        console.error("Erro ao renovar sessão:", error)
      } else {
        console.log("🔄 Sessão renovada com sucesso")
      }
    } catch (error) {
      console.error("Erro ao renovar sessão:", error)
    }
  }, [])

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    login,
    logout,
    secureLogout,
    refreshSession,
    loading,
    checkUnsavedData,
    setHasUnsavedData,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}

      {/* Dialog de confirmação */}
      {dialogState.options && (
        <ConfirmDialog
          isOpen={dialogState.isOpen}
          title={dialogState.options.title}
          message={dialogState.options.message}
          confirmText={dialogState.options.confirmText}
          cancelText={dialogState.options.cancelText}
          requirePassword={dialogState.options.requirePassword}
          variant={dialogState.options.variant}
          onConfirm={dialogState.onConfirm || (() => {})}
          onCancel={dialogState.onCancel || (() => {})}
        />
      )}
    </AuthContext.Provider>
  )
}
