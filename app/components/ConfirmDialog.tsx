"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertTriangle, Info } from "lucide-react"

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  requirePassword?: boolean
  variant?: "default" | "destructive"
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  requirePassword = false,
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [password, setPassword] = useState("")
  const [passwordError, setPasswordError] = useState("")

  const handleConfirm = () => {
    if (requirePassword) {
      if (!password || password.length < 3) {
        setPasswordError("Senha deve ter pelo menos 3 caracteres")
        return
      }
      // Aqui você pode adicionar validação real da senha do usuário
    }

    setPassword("")
    setPasswordError("")
    onConfirm()
  }

  const handleCancel = () => {
    setPassword("")
    setPasswordError("")
    onCancel()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {variant === "destructive" ? (
              <AlertTriangle className="w-6 h-6 text-red-500" />
            ) : (
              <Info className="w-6 h-6 text-blue-500" />
            )}
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription className="text-left">{message}</DialogDescription>
        </DialogHeader>

        {requirePassword && (
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Digite sua senha para confirmar:</Label>
            <Input
              id="confirm-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setPasswordError("")
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleConfirm()
                }
              }}
              placeholder="Sua senha"
              className={passwordError ? "border-red-500" : ""}
              autoFocus
            />
            {passwordError && <p className="text-sm text-red-500">{passwordError}</p>}
          </div>
        )}

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={handleCancel}>
            {cancelText}
          </Button>
          <Button variant={variant === "destructive" ? "destructive" : "default"} onClick={handleConfirm}>
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
