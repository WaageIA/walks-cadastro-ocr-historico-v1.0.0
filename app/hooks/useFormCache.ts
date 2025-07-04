"use client"

import { useState, useEffect, useCallback } from "react"

interface UseFormCacheOptions {
  key: string
  initialData?: any
  autoSave?: boolean
  saveDelay?: number
}

export function useFormCache<T extends Record<string, any>>({
  key,
  initialData = {},
  autoSave = true,
  saveDelay = 3000,
}: UseFormCacheOptions) {
  const [data, setData] = useState<T>(initialData)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // Carregar dados do cache na inicialização
  useEffect(() => {
    try {
      const cached = localStorage.getItem(`form_cache_${key}`)
      if (cached) {
        const parsedData = JSON.parse(cached)
        setData({ ...initialData, ...parsedData.data })
        setLastSaved(parsedData.timestamp ? new Date(parsedData.timestamp) : null)
      }
    } catch (error) {
      console.error("Erro ao carregar cache do formulário:", error)
    }
  }, [key])

  // Função para salvar no cache
  const saveToCache = useCallback(
    (dataToSave: T) => {
      try {
        setIsSaving(true)
        const cacheData = {
          data: dataToSave,
          timestamp: new Date().toISOString(),
        }
        localStorage.setItem(`form_cache_${key}`, JSON.stringify(cacheData))
        setLastSaved(new Date())

        // Simular delay de salvamento para feedback visual
        setTimeout(() => {
          setIsSaving(false)
        }, 300)
      } catch (error) {
        console.error("Erro ao salvar cache do formulário:", error)
        setIsSaving(false)
      }
    },
    [key],
  )

  // Auto-save com debounce
  useEffect(() => {
    if (!autoSave) return

    const timeoutId = setTimeout(() => {
      // Só salva se há dados diferentes do inicial
      const hasChanges = Object.keys(data).some((key) => data[key] !== initialData[key] && data[key] !== "")

      if (hasChanges) {
        saveToCache(data)
      }
    }, saveDelay)

    return () => clearTimeout(timeoutId)
  }, [data, autoSave, saveDelay, saveToCache, initialData])

  // Função para atualizar dados
  const updateData = useCallback((updates: Partial<T> | ((prev: T) => T)) => {
    setData((prev) => {
      if (typeof updates === "function") {
        return updates(prev)
      }
      return { ...prev, ...updates }
    })
  }, [])

  // Função para limpar cache
  const clearCache = useCallback(() => {
    try {
      localStorage.removeItem(`form_cache_${key}`)
      setData(initialData)
      setLastSaved(null)
    } catch (error) {
      console.error("Erro ao limpar cache do formulário:", error)
    }
  }, [key, initialData])

  // Função para salvar manualmente
  const saveManually = useCallback(() => {
    saveToCache(data)
  }, [data, saveToCache])

  // Verificar se há dados em cache
  const hasCache = useCallback(() => {
    try {
      const cached = localStorage.getItem(`form_cache_${key}`)
      return !!cached
    } catch {
      return false
    }
  }, [key])

  return {
    data,
    updateData,
    clearCache,
    saveManually,
    hasCache,
    isSaving,
    lastSaved,
  }
}
