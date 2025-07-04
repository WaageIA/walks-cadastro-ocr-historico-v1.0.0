"use client"

import { Badge } from "@/components/ui/badge"
import { CheckCircle, Clock, AlertCircle } from "lucide-react"

interface FormCacheIndicatorProps {
  isSaving?: boolean
  lastSaved?: Date | null
  hasUnsavedChanges?: boolean
  isManualEntry?: boolean
}

export function FormCacheIndicator({
  isSaving = false,
  lastSaved = null,
  hasUnsavedChanges = false,
  isManualEntry = true,
}: FormCacheIndicatorProps) {
  const getSaveStatus = () => {
    if (isSaving) {
      return {
        text: "Salvando...",
        variant: "secondary" as const,
        icon: <Clock className="w-3 h-3" />,
      }
    }

    if (hasUnsavedChanges) {
      return {
        text: "Não salvo",
        variant: "outline" as const,
        icon: <AlertCircle className="w-3 h-3" />,
      }
    }

    if (lastSaved) {
      return {
        text: "Salvo",
        variant: "secondary" as const,
        icon: <CheckCircle className="w-3 h-3" />,
      }
    }

    return {
      text: "Não salvo",
      variant: "outline" as const,
      icon: <AlertCircle className="w-3 h-3" />,
    }
  }

  const saveStatus = getSaveStatus()

  const formatLastSaved = (date: Date) => {
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) {
      return "agora mesmo"
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60)
      return `há ${minutes} min`
    } else {
      return date.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    }
  }

  return (
    <div className="flex justify-center gap-2 mt-4 mb-6">
      <Badge variant="secondary" className="bg-gray-100 text-gray-700">
        {isManualEntry ? "Preenchimento Manual" : "Preenchimento Automático"}
      </Badge>

      <Badge
        variant={saveStatus.variant}
        className={`flex items-center gap-1 ${
          saveStatus.text === "Não salvo"
            ? "bg-orange-50 text-orange-700 border-orange-200"
            : saveStatus.text === "Salvo"
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-blue-50 text-blue-700 border-blue-200"
        }`}
      >
        {saveStatus.icon}
        {saveStatus.text}
      </Badge>

      {lastSaved && !isSaving && (
        <Badge variant="outline" className="bg-gray-50 text-gray-600 text-xs">
          Salvo {formatLastSaved(lastSaved)}
        </Badge>
      )}
    </div>
  )
}

export default FormCacheIndicator
