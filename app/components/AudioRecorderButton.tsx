"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Mic, MicOff, Square, Loader2, AlertCircle } from "lucide-react"
import { useAudioRecorder } from "@/app/hooks/useAudioRecorder"
import { cn } from "@/lib/utils"

interface AudioRecorderButtonProps {
  onTranscriptionReceived: (transcription: string) => void
  webhookUrl: string
  className?: string
  disabled?: boolean
}

export default function AudioRecorderButton({
  onTranscriptionReceived,
  webhookUrl,
  className = "",
  disabled = false,
}: AudioRecorderButtonProps) {
  const {
    isRecording,
    isProcessing,
    duration,
    error,
    hasPermission,
    startRecording,
    stopRecording,
    cancelRecording,
    formatDuration,
  } = useAudioRecorder({
    onTranscriptionReceived,
    webhookUrl,
    maxDuration: 300, // 5 minutos
  })

  const handleClick = () => {
    if (isRecording) {
      stopRecording()
    } else if (!isProcessing) {
      startRecording()
    }
  }

  const getButtonContent = () => {
    if (isProcessing) {
      return (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Transcrevendo...
        </>
      )
    }

    if (isRecording) {
      return (
        <>
          <Square className="w-4 h-4 mr-2 fill-current" />
          Parar ({formatDuration(duration)})
        </>
      )
    }

    return (
      <>
        <Mic className="w-4 h-4 mr-2" />
        Gravar áudio
      </>
    )
  }

  const getButtonVariant = () => {
    if (isRecording) return "destructive"
    if (isProcessing) return "secondary"
    return "outline"
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={getButtonVariant()}
          size="sm"
          onClick={handleClick}
          disabled={disabled || isProcessing}
          className={cn(
            "transition-all duration-200",
            isRecording && "animate-pulse",
            isProcessing && "cursor-not-allowed",
          )}
        >
          {getButtonContent()}
        </Button>

        {isRecording && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={cancelRecording}
            className="text-gray-500 hover:text-gray-700"
          >
            <MicOff className="w-4 h-4 mr-1" />
            Cancelar
          </Button>
        )}
      </div>

      {/* Status indicators */}
      {isRecording && (
        <Badge variant="destructive" className="w-fit animate-pulse">
          <div className="w-2 h-2 bg-white rounded-full mr-2 animate-ping" />
          Gravando - {formatDuration(duration)}
        </Badge>
      )}

      {isProcessing && (
        <Badge variant="secondary" className="w-fit">
          <Loader2 className="w-3 h-3 mr-2 animate-spin" />
          Processando transcrição...
        </Badge>
      )}

      {error && (
        <Badge variant="destructive" className="w-fit">
          <AlertCircle className="w-3 h-3 mr-2" />
          {error}
        </Badge>
      )}

      {!hasPermission && !isRecording && !isProcessing && (
        <p className="text-xs text-gray-500 mt-1">💡 Clique para permitir acesso ao microfone</p>
      )}
    </div>
  )
}
