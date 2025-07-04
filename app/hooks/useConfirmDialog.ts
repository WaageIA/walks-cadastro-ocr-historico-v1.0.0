"use client"

import { useState, useCallback } from "react"

interface ConfirmDialogOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  requirePassword?: boolean
  variant?: "default" | "destructive"
}

interface ConfirmDialogState {
  isOpen: boolean
  options: ConfirmDialogOptions | null
  onConfirm: (() => void) | null
  onCancel: (() => void) | null
}

export const useConfirmDialog = () => {
  const [dialogState, setDialogState] = useState<ConfirmDialogState>({
    isOpen: false,
    options: null,
    onConfirm: null,
    onCancel: null,
  })

  const showConfirmDialog = useCallback(
    (options: ConfirmDialogOptions, onConfirm?: () => void, onCancel?: () => void): Promise<boolean> => {
      return new Promise((resolve) => {
        setDialogState({
          isOpen: true,
          options: {
            confirmText: "Confirmar",
            cancelText: "Cancelar",
            variant: "default",
            ...options,
          },
          onConfirm: () => {
            setDialogState((prev) => ({ ...prev, isOpen: false }))
            onConfirm?.()
            resolve(true)
          },
          onCancel: () => {
            setDialogState((prev) => ({ ...prev, isOpen: false }))
            onCancel?.()
            resolve(false)
          },
        })
      })
    },
    [],
  )

  const closeDialog = useCallback(() => {
    setDialogState((prev) => ({ ...prev, isOpen: false }))
  }, [])

  return {
    dialogState,
    showConfirmDialog,
    closeDialog,
  }
}
