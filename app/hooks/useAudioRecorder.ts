"use client"

import { useState, useRef, useCallback } from "react"

interface UseAudioRecorderOptions {
  onTranscriptionReceived?: (transcription: string) => void
  webhookUrl?: string
  maxDuration?: number // em segundos
}

interface AudioRecorderState {
  isRecording: boolean
  isProcessing: boolean
  duration: number
  error: string | null
  hasPermission: boolean
}

export function useAudioRecorder({
  onTranscriptionReceived,
  webhookUrl,
  maxDuration = 300, // 5 minutos
}: UseAudioRecorderOptions = {}) {
  const [state, setState] = useState<AudioRecorderState>({
    isRecording: false,
    isProcessing: false,
    duration: 0,
    error: null,
    hasPermission: false,
  })

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Verificar permissão do microfone
  const checkPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      setState((prev) => ({ ...prev, hasPermission: true, error: null }))
      return true
    } catch (error) {
      setState((prev) => ({
        ...prev,
        hasPermission: false,
        error: "Permissão de microfone negada. Permita o acesso ao microfone para usar esta funcionalidade.",
      }))
      return false
    }
  }, [])

  // Converter blob para base64
  const blobToBase64 = useCallback((blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // Remove o prefixo "data:audio/...;base64,"
        const base64 = result.split(",")[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }, [])

  // Enviar áudio para transcrição
  const sendForTranscription = useCallback(
    async (audioBlob: Blob) => {
      if (!webhookUrl || !onTranscriptionReceived) return

      setState((prev) => ({ ...prev, isProcessing: true, error: null }))

      try {
        const audioBase64 = await blobToBase64(audioBlob)

        const payload = {
          audio_data: {
            content: audioBase64,
            format: "webm", // ou "mp3" dependendo do formato
            duration: state.duration,
            size: audioBlob.size,
          },
          action: "transcribe",
          metadata: {
            source: "followup_audio",
            timestamp: new Date().toISOString(),
            user_agent: "WalksBank-AudioTranscription/1.0.0",
          },
        }

        // URL específica para transcrição de áudio
        const audioWebhookUrl = webhookUrl.replace(/\/webhook\/.*$/, "/webhook/audio_data")

        const response = await fetch(audioWebhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "WalksBank-AudioTranscription/1.0.0",
          },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          throw new Error(`Erro HTTP: ${response.status}`)
        }

        const result = await response.json()

        if (result.success && result.transcription) {
          onTranscriptionReceived(result.transcription)
          setState((prev) => ({ ...prev, isProcessing: false, error: null }))
        } else {
          throw new Error(result.error || "Erro na transcrição")
        }
      } catch (error) {
        console.error("Erro ao transcrever áudio:", error)
        setState((prev) => ({
          ...prev,
          isProcessing: false,
          error: "Erro ao transcrever áudio. Tente novamente.",
        }))
      }
    },
    [webhookUrl, onTranscriptionReceived, blobToBase64, state.duration],
  )

  // Iniciar gravação
  const startRecording = useCallback(async () => {
    const hasPermission = await checkPermission()
    if (!hasPermission) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      })

      streamRef.current = stream
      audioChunksRef.current = []

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4",
      })

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType,
        })
        sendForTranscription(audioBlob)
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start(1000) // Coleta dados a cada segundo

      setState((prev) => ({
        ...prev,
        isRecording: true,
        duration: 0,
        error: null,
      }))

      // Timer para duração
      timerRef.current = setInterval(() => {
        setState((prev) => {
          const newDuration = prev.duration + 1
          // Auto-stop se atingir duração máxima
          if (newDuration >= maxDuration) {
            stopRecording()
            return { ...prev, duration: newDuration }
          }
          return { ...prev, duration: newDuration }
        })
      }, 1000)
    } catch (error) {
      console.error("Erro ao iniciar gravação:", error)
      setState((prev) => ({
        ...prev,
        error: "Erro ao acessar microfone. Verifique as permissões.",
      }))
    }
  }, [checkPermission, sendForTranscription, maxDuration])

  // Parar gravação
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    setState((prev) => ({ ...prev, isRecording: false }))
  }, [state.isRecording])

  // Cancelar gravação
  const cancelRecording = useCallback(() => {
    stopRecording()
    setState((prev) => ({
      ...prev,
      isRecording: false,
      isProcessing: false,
      duration: 0,
      error: null,
    }))
  }, [stopRecording])

  // Formatar duração
  const formatDuration = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }, [])

  return {
    ...state,
    startRecording,
    stopRecording,
    cancelRecording,
    checkPermission,
    formatDuration,
  }
}
