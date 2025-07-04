"use client"

import React, { useCallback, useRef, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { ImageIcon, X, CheckCircle, Camera, FolderOpen } from "lucide-react"

interface FacadeUploadProps {
  onFileUpload?: (file: File) => void
  className?: string
}

export default function FacadeUpload({ onFileUpload, className }: FacadeUploadProps) {
  const { toast } = useToast()
  const [uploadedFile, setUploadedFile] = useState<{
    file: File
    preview: string
    name: string
    size: number
    captureMethod: "camera" | "upload"
  } | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)

  // Detectar se é mobile
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(
        window.innerWidth <= 768 ||
          /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
      )
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  const handleFileUpload = useCallback(
    (file: File) => {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "Arquivo muito grande",
          description: "O arquivo deve ter no máximo 10MB",
          variant: "destructive",
        })
        return
      }

      // Verificar se é imagem
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Formato inválido",
          description: "Apenas imagens são aceitas (PNG, JPG, JPEG)",
          variant: "destructive",
        })
        return
      }

      const reader = new FileReader()
      reader.onload = (e) => {
        const fileData = {
          file,
          preview: e.target?.result as string,
          name: file.name,
          size: file.size,
          captureMethod: file.name.includes("camera") ? ("camera" as const) : ("upload" as const),
        }

        setUploadedFile(fileData)
        onFileUpload?.(file)
      }
      reader.readAsDataURL(file)

      toast({
        title: "Foto da fachada enviada",
        description: `${file.name} foi carregado com sucesso`,
      })
    },
    [onFileUpload, toast],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) {
        handleFileUpload(files[0])
      }
    },
    [handleFileUpload],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const openFileSelector = () => {
    fileInputRef.current?.click()
  }

  const openCamera = () => {
    cameraInputRef.current?.click()
  }

  const removeFile = () => {
    setUploadedFile(null)
  }

  return (
    <div className={className}>
      <Card>
        <CardContent className="p-4 space-y-4">
          {!uploadedFile ? (
            <>
              {/* Área de Drag & Drop (Desktop) */}
              {!isMobile && (
                <div
                  className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors cursor-pointer"
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={openFileSelector}
                >
                  <ImageIcon className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-700 mb-2">Foto da Fachada</p>
                  <p className="text-xs text-gray-500 mb-3">Arraste e solte ou clique para selecionar</p>
                  <p className="text-xs text-gray-400">Formatos: PNG, JPG, JPEG</p>
                </div>
              )}

              {/* Botões de Ação */}
              <div className={`grid ${isMobile ? "grid-cols-1 gap-3" : "grid-cols-2 gap-2"}`}>
                <Button
                  variant="outline"
                  onClick={openFileSelector}
                  className="flex items-center justify-center space-x-2 h-12 md:h-10"
                >
                  <FolderOpen className="w-4 h-4" />
                  <span>Selecionar Arquivo</span>
                </Button>

                <Button
                  variant="outline"
                  onClick={openCamera}
                  className="flex items-center justify-center space-x-2 h-12 md:h-10 border-blue-300 text-blue-700 hover:bg-blue-50"
                >
                  <Camera className="w-4 h-4" />
                  <span>Tirar Foto</span>
                </Button>
              </div>

              {/* Dica para Mobile */}
              {isMobile && (
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1">Foto externa do estabelecimento</p>
                  <p className="text-xs text-blue-600">Capture a fachada completa em boa iluminação</p>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              {/* Informações do Arquivo */}
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="font-medium text-green-800 text-sm">{uploadedFile.name}</p>
                    <div className="flex items-center space-x-2 text-xs text-green-600">
                      <span>{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB</span>
                      {uploadedFile.captureMethod === "camera" && (
                        <Badge variant="outline" className="text-xs px-1 py-0">
                          <Camera className="w-3 h-3 mr-1" />
                          Câmera
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={removeFile}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Preview da Imagem */}
              <div className="relative">
                <img
                  src={uploadedFile.preview || "/placeholder.svg"}
                  alt="Preview da fachada"
                  className="w-full h-32 md:h-40 object-cover rounded-lg border"
                />
                {uploadedFile.captureMethod === "camera" && (
                  <div className="absolute top-2 right-2">
                    <Badge variant="secondary" className="text-xs">
                      <Camera className="w-3 h-3 mr-1" />
                      Foto
                    </Badge>
                  </div>
                )}
              </div>

              {/* Botões de Ação para Arquivo Carregado */}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={openFileSelector} className="text-xs">
                  <FolderOpen className="w-3 h-3 mr-1" />
                  Trocar Arquivo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openCamera}
                  className="text-xs text-blue-700 border-blue-300 hover:bg-blue-50"
                >
                  <Camera className="w-3 h-3 mr-1" />
                  Nova Foto
                </Button>
              </div>
            </div>
          )}

          {/* Input para Upload de Arquivo */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFileUpload(file)
            }}
            className="hidden"
          />

          {/* Input para Captura de Câmera */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                // Renomear arquivo para indicar que foi capturado
                const renamedFile = new File([file], `camera_facade_${Date.now()}.jpg`, {
                  type: file.type,
                })
                handleFileUpload(renamedFile)
              }
            }}
            className="hidden"
          />
        </CardContent>
      </Card>
    </div>
  )
}
