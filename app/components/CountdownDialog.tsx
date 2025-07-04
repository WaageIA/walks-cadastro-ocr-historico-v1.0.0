"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Clock, AlertTriangle } from "lucide-react"

interface CountdownDialogProps {
  isOpen: boolean
  title: string
  message: string
  countdown: number // em segundos
  onTimeout: () => void
  onExtend: () => void
  onCancel?: () => void
}

export default function CountdownDialog({
  isOpen,
  title,
  message,
  countdown,
  onTimeout,
  onExtend,
  onCancel,
}: CountdownDialogProps) {
  const [timeLeft, setTimeLeft] = useState(countdown)

  useEffect(() => {
    if (!isOpen) {
      setTimeLeft(countdown)
      return
    }

    setTimeLeft(countdown) // Reset inicial

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          setTimeout(() => onTimeout(), 100) // Delay para evitar conflitos
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isOpen, countdown]) // Remover onTimeout das dependências

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const progressValue = timeLeft > 0 ? ((countdown - timeLeft) / countdown) * 100 : 100

  return (
    <Dialog open={isOpen} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-orange-500" />
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription className="text-left">{message}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Clock className="w-8 h-8 text-orange-500" />
            <span className="text-3xl font-bold text-orange-500">{formatTime(timeLeft)}</span>
          </div>

          <Progress value={progressValue} className="h-2" />

          <p className="text-sm text-gray-600 text-center">
            Sua sessão será encerrada automaticamente quando o tempo acabar.
          </p>
        </div>

        <DialogFooter className="flex gap-2">
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
          )}
          <Button onClick={onExtend} className="flex-1">
            Estender Sessão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
