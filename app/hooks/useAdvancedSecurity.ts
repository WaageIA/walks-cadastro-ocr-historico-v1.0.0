"use client"

import { useEffect, useCallback, useRef } from "react"
import { useAuth } from "@/app/context/AuthContext"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface SecurityConfig {
  inactivityTimeout: number // em minutos
  warningTime: number // em minutos antes do timeout
  businessHoursStart: number // hora (0-23)
  businessHoursEnd: number // hora (0-23)
  maxActionsPerMinute: number
  offlineTimeout: number // em minutos
}

const defaultConfig: SecurityConfig = {
  inactivityTimeout: 30,
  warningTime: 5,
  businessHoursStart: 8,
  businessHoursEnd: 18,
  maxActionsPerMinute: 300, // Aumentado para uso normal
  offlineTimeout: 10,
}

// Função de debounce para evitar chamadas excessivas
const debounce = (func: Function, wait: number) => {
  let timeout: NodeJS.Timeout
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

export const useAdvancedSecurity = (config: Partial<SecurityConfig> = {}) => {
  const { logout, user } = useAuth()
  const router = useRouter()

  const finalConfig = { ...defaultConfig, ...config }
  const inactivityTimerRef = useRef<NodeJS.Timeout>()
  const warningTimerRef = useRef<NodeJS.Timeout>()
  const offlineTimerRef = useRef<NodeJS.Timeout>()
  const businessHoursTimerRef = useRef<NodeJS.Timeout>()
  const actionsCountRef = useRef<{ count: number; timestamp: number }>({ count: 0, timestamp: Date.now() })
  const warningShownRef = useRef(false)
  const lastActionRef = useRef<number>(0)

  // Função para logout forçado
  const forceLogout = useCallback(
    async (reason: string) => {
      console.log(`🚨 Logout forçado: ${reason}`)

      // Limpar todos os timers
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
      if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current)
      if (businessHoursTimerRef.current) clearTimeout(businessHoursTimerRef.current)

      // Limpar cache completo
      try {
        localStorage.clear()
        sessionStorage.clear()

        // Limpar cookies
        document.cookie.split(";").forEach((cookie) => {
          const eqPos = cookie.indexOf("=")
          const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim()
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
        })
      } catch (error) {
        console.error("Erro ao limpar cache:", error)
      }

      // Fazer logout
      await logout()

      toast.error(reason)

      router.push("/login")
    },
    [logout, router],
  )

  // Função para mostrar aviso de inatividade
  const showInactivityWarning = useCallback(() => {
    if (warningShownRef.current) return

    warningShownRef.current = true

    toast.warning(`Sua sessão expirará em ${finalConfig.warningTime} minutos por inatividade.`)

    // Timer para logout automático
    warningTimerRef.current = setTimeout(
      () => {
        forceLogout("Sessão expirada por inatividade")
      },
      finalConfig.warningTime * 60 * 1000,
    )
  }, [finalConfig.warningTime, forceLogout])

  // Reset do timer de inatividade
  const resetInactivityTimer = useCallback(() => {
    warningShownRef.current = false

    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current)

    const warningTime = (finalConfig.inactivityTimeout - finalConfig.warningTime) * 60 * 1000

    inactivityTimerRef.current = setTimeout(() => {
      showInactivityWarning()
    }, warningTime)
  }, [finalConfig.inactivityTimeout, finalConfig.warningTime, showInactivityWarning])

  // Detectar atividade suspeita (otimizado)
  const trackAction = useCallback(() => {
    const now = Date.now()
    const oneMinute = 60 * 1000

    // Evitar tracking muito frequente (debounce manual)
    if (now - lastActionRef.current < 2000) {
      // 500ms entre ações
      return
    }
    lastActionRef.current = now

    // Reset contador se passou mais de 1 minuto
    if (now - actionsCountRef.current.timestamp > oneMinute) {
      actionsCountRef.current = { count: 1, timestamp: now }
    } else {
      actionsCountRef.current.count++
    }

    // Verificar se excedeu limite (agora mais alto)
    if (actionsCountRef.current.count > finalConfig.maxActionsPerMinute) {
      console.warn(`🚨 Atividade suspeita: ${actionsCountRef.current.count} ações em 1 minuto`)
      forceLogout("Atividade suspeita detectada - muitas ações em pouco tempo")
      return
    }

    // Reset timer de inatividade
    resetInactivityTimer()
  }, [finalConfig.maxActionsPerMinute, forceLogout, resetInactivityTimer])

  // Verificar horário comercial
  const checkBusinessHours = useCallback(() => {
    const now = new Date()
    const hour = now.getHours()

    if (hour < finalConfig.businessHoursStart || hour >= finalConfig.businessHoursEnd) {
      toast.info("Sessão será encerrada em 5 minutos por segurança.")

      businessHoursTimerRef.current = setTimeout(
        () => {
          forceLogout("Acesso fora do horário comercial")
        },
        5 * 60 * 1000,
      ) // 5 minutos
    }
  }, [finalConfig.businessHoursStart, finalConfig.businessHoursEnd, forceLogout])

  // Monitorar status online/offline
  const handleOnlineStatus = useCallback(() => {
    const handleOffline = () => {
      toast.error("Conexão perdida")

      offlineTimerRef.current = setTimeout(
        () => {
          forceLogout("Conexão perdida por muito tempo")
        },
        finalConfig.offlineTimeout * 60 * 1000,
      )
    }

    const handleOnline = () => {
      if (offlineTimerRef.current) {
        clearTimeout(offlineTimerRef.current)
        toast.success("Conexão restaurada")
      }
    }

    window.addEventListener("offline", handleOffline)
    window.addEventListener("online", handleOnline)

    return () => {
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener("online", handleOnline)
    }
  }, [finalConfig.offlineTimeout, forceLogout])

  // Monitorar visibilidade da aba
  const handleVisibilityChange = useCallback(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Usuário saiu da aba - timer mais agressivo
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)

        inactivityTimerRef.current = setTimeout(
          () => {
            showInactivityWarning()
          },
          (finalConfig.inactivityTimeout / 2) * 60 * 1000,
        ) // Metade do tempo normal
      } else {
        // Usuário voltou - reset timer normal
        resetInactivityTimer()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [finalConfig.inactivityTimeout, resetInactivityTimer, showInactivityWarning])

  // Versão com debounce do trackAction
  const debouncedTrackAction = useCallback(
    debounce(trackAction, 1000), // 1 segundo de debounce
    [trackAction],
  )

  // Setup dos event listeners
  useEffect(() => {
    if (!user) return

    // Eventos de atividade otimizados (removidos mousemove e eventos excessivos)
    const activityEvents = ["mousedown", "click", "keydown", "touchstart"]

    // Eventos com debounce para evitar spam
    const debouncedEvents = ["scroll"]

    // Adicionar listeners normais
    activityEvents.forEach((event) => {
      document.addEventListener(event, trackAction, true)
    })

    // Adicionar listeners com debounce
    debouncedEvents.forEach((event) => {
      document.addEventListener(event, debouncedTrackAction, true)
    })

    // Inicializar timers
    resetInactivityTimer()

    // Verificar horário comercial a cada hora
    const businessHoursInterval = setInterval(checkBusinessHours, 60 * 60 * 1000)
    checkBusinessHours() // Verificar imediatamente

    // Setup monitoramento de conectividade e visibilidade
    const cleanupOnlineStatus = handleOnlineStatus()
    const cleanupVisibility = handleVisibilityChange()

    // Cleanup
    return () => {
      activityEvents.forEach((event) => {
        document.removeEventListener(event, trackAction, true)
      })

      debouncedEvents.forEach((event) => {
        document.removeEventListener(event, debouncedTrackAction, true)
      })

      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
      if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current)
      if (businessHoursTimerRef.current) clearTimeout(businessHoursTimerRef.current)

      clearInterval(businessHoursInterval)
      cleanupOnlineStatus()
      cleanupVisibility()
    }
  }, [
    user,
    trackAction,
    debouncedTrackAction,
    resetInactivityTimer,
    checkBusinessHours,
    handleOnlineStatus,
    handleVisibilityChange,
  ])

  return {
    forceLogout,
    trackAction,
    resetTimer: resetInactivityTimer,
  }
}
