"use client"

import React from "react"

import { useCallback, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useApiClient } from "@/lib/api"
import { Upload, FileText, ImageIcon, X, CheckCircle, Clock, Sparkles, Camera, Smartphone, FolderOpen, Paperclip, PlusCircle } from 'lucide-react'

interface DocumentUploadProps {
  uploadedDocuments: any
  setUploadedDocuments: (docs: any) => void
  onDocumentsProcessed: (data: any) => void
  isProcessing: boolean
  setIsProcessing: (processing: boolean) => void
}

export default function DocumentUpload({
  uploadedDocuments,
  setUploadedDocuments,
  onDocumentsProcessed,
  isProcessing,
  setIsProcessing,
}: DocumentUploadProps) {
  const { toast } = useToast()
  const apiClient = useApiClient()
  const [isMobile, setIsMobile] = useState(false)
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({})
  const cameraInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({})

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

  const documentTypes = [
    {
      key: "rg_frente",
      title: "RG/CNH (Frente e Verso)",
      description: "Documento de identidade (frente)",
      acceptedFormats: "PNG, JPG, PDF",
      icon: FileText,
      cameraHint: "Posicione a FRENTE do documento",
      isOcrProcessed: true,
    },
    {
      key: "cnpj",
      title: "Comprovante CNPJ",
      description: "Cartão CNPJ ou Comprovante de Inscrição",
      acceptedFormats: "PNG, JPG, PDF",
      icon: FileText,
      cameraHint: "Capture o documento completo",
      isOcrProcessed: true,
    },
    {
      key: "address",
      title: "Comprovante de Endereço",
      description: "Conta de luz, água ou telefone",
      acceptedFormats: "PNG, JPG, PDF",
      icon: FileText,
      cameraHint: "Certifique-se que o endereço está legível",
      isOcrProcessed: true,
    },
    {
      key: "facade",
      title: "Foto da Fachada",
      description: "Foto externa do estabelecimento",
      acceptedFormats: "PNG, JPG",
      icon: ImageIcon,
      cameraHint: "Capture a fachada completa",
      isOcrProcessed: false,
    },
  ]

  const handleFileUpload = useCallback(
    (documentKey: string, file: File) => {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "Arquivo muito grande",
          description: "O arquivo deve ter no máximo 10MB",
          variant: "destructive",
        })
        return
      }

      const reader = new FileReader()
      reader.onload = (e) => {
        setUploadedDocuments((prev: any) => ({
          ...prev,
          [documentKey]: {
            file,
            preview: e.target?.result,
            name: file.name,
            size: file.size,
            captureMethod: file.name.includes("camera") ? "camera" : "upload",
          },
        }))
      }
      reader.readAsDataURL(file)

      toast({
        title: "Documento enviado",
        description: `${file.name} foi carregado com sucesso`,
      })
    },
    [setUploadedDocuments, toast],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent, documentKey: string) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) {
        handleFileUpload(documentKey, files[0])
      }
    },
    [handleFileUpload],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const openFileSelector = (documentKey: string) => {
    fileInputRefs.current[documentKey]?.click()
  }

  const openCamera = (documentKey: string) => {
    cameraInputRefs.current[documentKey]?.click()
  }

  const removeDocument = (documentKey: string) => {
    setUploadedDocuments((prev: any) => ({
      ...prev,
      [documentKey]: null,
    }))
  }

  const requiredDocs = ["rg_frente", "cnpj", "address", "facade"];
  const allDocumentsUploaded = requiredDocs.every(docKey => uploadedDocuments[docKey] !== null && uploadedDocuments[docKey] !== undefined);


  const processDocuments = async () => {
    setIsProcessing(true)
    try {
      const documentsBase64: { [key: string]: string } = {}
      for (const [key, doc] of Object.entries(uploadedDocuments)) {
        if (doc && doc.file) {
          const reader = new FileReader()
          const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
          })
          reader.readAsDataURL(doc.file)
          documentsBase64[key] = await base64Promise
        }
      }

      toast({
        title: "Processando documentos...",
        description: "Enviando para análise de OCR via n8n",
      })

      const result = await apiClient.processDocuments(documentsBase64)

      if (result.success) {
        setIsProcessing(false)
        onDocumentsProcessed(result.data)
        toast({
          title: "Documentos processados!",
          description: "Dados extraídos com sucesso via n8n",
        })
        if (result.data.needs_review?.length > 0) {
          toast({
            title: "Atenção - Revisão necessária",
            description: `Verifique os campos: ${result.data.needs_review.join(", ")}`,
            variant: "destructive",
          })
        }
      } else {
        throw new Error("Falha no processamento via n8n")
      }
    } catch (error) {
      setIsProcessing(false)
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido no OCR"
      toast({
        title: "Erro no processamento",
        description: errorMessage,
        variant: "destructive",
      })
      console.error("Erro no OCR via n8n:", error)
    }
  }

  const handleAttachOnly = () => {
    onDocumentsProcessed(null)
    toast({
      title: "Documentos anexados!",
      description: "Prossiga para o preenchimento manual do formulário",
    })
  }

  const renderDocumentCard = (docType: any) => {
    const isRgCard = docType.key === "rg_frente";
    const rgFrente = uploadedDocuments["rg_frente"];
    const rgVerso = uploadedDocuments["rg_verso"];
    const document = isRgCard ? rgFrente : uploadedDocuments[docType.key];
    const IconComponent = docType.icon;

    const renderFileInputs = (key: string) => (
      <>
        <input
          ref={(ref) => { fileInputRefs.current[key] = ref }}
          type="file"
          accept={docType.key === "facade" ? "image/*" : "image/*,.pdf"}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFileUpload(key, file)
          }}
          className="hidden"
          disabled={isProcessing}
        />
        <input
          ref={(ref) => { cameraInputRefs.current[key] = ref }}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) {
              const renamedFile = new File([file], `camera_${key}_${Date.now()}.jpg`, { type: file.type })
              handleFileUpload(key, renamedFile)
            }
          }}
          className="hidden"
          disabled={isProcessing}
        />
      </>
    );

    const renderFileInfo = (doc: any, key: string, title: string) => (
      <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <div>
                      <p className="font-bold text-green-900 text-sm">{title}</p>
                      <p className="font-medium text-green-800 text-sm">{doc.name}</p>
                      <div className="flex items-center space-x-2 text-xs text-green-600">
                          <span>{(doc.size / 1024 / 1024).toFixed(2)} MB</span>
                          {doc.captureMethod === "camera" && (
                              <Badge variant="outline" className="text-xs px-1 py-0">
                                  <Camera className="w-3 h-3 mr-1" /> Câmera
                              </Badge>
                          )}
                      </div>
                  </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeDocument(key)} className="text-red-600 hover:text-red-700 hover:bg-red-50" disabled={isProcessing}>
                  <X className="w-4 h-4" />
              </Button>
          </div>
          {doc.preview && (
              <div className="relative">
                  <img src={doc.preview} alt="Preview" className="w-full h-32 md:h-40 object-cover rounded-lg border" />
              </div>
          )}
      </div>
    );


    return (
      <Card key={docType.key} className="relative">
        <CardHeader className="pb-3 md:pb-4">
          <CardTitle className="flex items-center space-x-2 text-base md:text-lg">
            <IconComponent className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
            <span>{docType.title}</span>
            {(document || (isRgCard && rgVerso)) && (
              <Badge variant="secondary" className="ml-auto text-xs">
                <CheckCircle className="w-3 h-3 mr-1" />
                {isRgCard && rgFrente && rgVerso ? "Frente e Verso" : (document?.captureMethod === "camera" ? "Capturado" : "Carregado")}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!document ? (
            <>
              {!isMobile && (
                <div
                  className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors cursor-pointer"
                  onDrop={(e) => handleDrop(e, docType.key)}
                  onDragOver={handleDragOver}
                  onClick={() => openFileSelector(docType.key)}
                >
                  <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-700 mb-2">{docType.description}</p>
                  <p className="text-xs text-gray-500 mb-3">Arraste e solte ou clique para selecionar</p>
                  <p className="text-xs text-gray-400">Formatos: {docType.acceptedFormats}</p>
                </div>
              )}
              <div className={`grid ${isMobile ? "grid-cols-1 gap-3" : "grid-cols-2 gap-2"}`}>
                <Button variant="outline" onClick={() => openFileSelector(docType.key)} className="flex items-center justify-center space-x-2 h-12 md:h-10" disabled={isProcessing}>
                  <FolderOpen className="w-4 h-4" />
                  <span>Selecionar Arquivo</span>
                </Button>
                <Button variant="outline" onClick={() => openCamera(docType.key)} className="flex items-center justify-center space-x-2 h-12 md:h-10 border-blue-300 text-blue-700 hover:bg-blue-50" disabled={isProcessing}>
                  <Camera className="w-4 h-4" />
                  <span>Tirar Foto</span>
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {isRgCard ? (
                <>
                  {rgFrente && renderFileInfo(rgFrente, "rg_frente", "Frente")}
                  {rgVerso && renderFileInfo(rgVerso, "rg_verso", "Verso")}
                  {rgFrente && !rgVerso && (
                     <Button variant="link" onClick={() => openFileSelector("rg_verso")} className="p-0 h-auto text-blue-600 hover:text-blue-700 flex items-center space-x-1" disabled={isProcessing}>
                        <PlusCircle className="w-4 h-4" />
                        <span>Adicionar verso</span>
                    </Button>
                  )}
                </>
              ) : (
                renderFileInfo(document, docType.key, docType.title)
              )}
            </div>
          )}
          {renderFileInputs(isRgCard ? "rg_frente" : docType.key)}
          {isRgCard && renderFileInputs("rg_verso")}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Upload de Documentos</h2>
        <p className="text-gray-600">Envie os documentos necessários para o cadastro do cliente</p>
        {isMobile && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center justify-center space-x-2 text-blue-700">
              <Smartphone className="w-4 h-4" />
              <span className="text-sm font-medium">Modo Mobile Ativo</span>
            </div>
            <p className="text-xs text-blue-600 mt-1">Use a câmera para capturar documentos diretamente</p>
          </div>
        )}
      </div>

      {isProcessing && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <Clock className="w-5 h-5 text-blue-600 animate-spin" />
              <div>
                <p className="font-medium text-blue-900">Processando documentos via n8n...</p>
                <p className="text-sm text-blue-700">
                  Enviando {Object.keys(uploadedDocuments).filter(key => uploadedDocuments[key]).length} documentos para análise OCR
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {documentTypes.map(renderDocumentCard)}
      </div>

      <div className="flex flex-col items-center space-y-4 pt-6 md:pt-8">
        <div className="text-center mb-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Escolha como deseja continuar:</p>
          <div className="text-xs text-gray-500 space-y-1">
            <p>• <strong>Processar com IA:</strong> Extração automática dos dados</p>
            <p>• <strong>Anexar Documentos:</strong> Preenchimento manual do formulário</p>
          </div>
        </div>

        <Button
          onClick={processDocuments}
          disabled={!allDocumentsUploaded || isProcessing}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 md:px-8 py-3 text-base md:text-lg w-full md:w-auto"
          size="lg"
        >
          {isProcessing ? (
            <>
              <Clock className="w-5 h-5 mr-2 animate-spin" />
              Processando com IA...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 mr-2" />
              Processar Documentos com IA
            </>
          )}
        </Button>

        <div className="flex items-center space-x-4 w-full max-w-xs">
          <div className="flex-1 border-t border-gray-300"></div>
          <span className="text-sm text-gray-500 font-medium">OU</span>
          <div className="flex-1 border-t border-gray-300"></div>
        </div>

        <Button
          onClick={handleAttachOnly}
          disabled={!allDocumentsUploaded || isProcessing}
          variant="outline"
          className="border-gray-300 text-gray-700 hover:bg-gray-50 px-6 md:px-8 py-3 text-base md:text-lg w-full md:w-auto"
          size="lg"
        >
          <Paperclip className="w-5 h-5 mr-2" />
          Anexar Documentos e Continuar
        </Button>

        <p className="text-xs text-gray-500 text-center max-w-md">
          Pular processamento IA e preencher formulário manualmente
        </p>

        {!allDocumentsUploaded && (
          <div className="text-center">
            <p className="text-sm text-gray-500">Envie todos os documentos obrigatórios para continuar</p>
            <div className="flex justify-center mt-2 space-x-1">
              {requiredDocs.map((docKey) => (
                <div
                  key={docKey}
                  className={`w-2 h-2 rounded-full ${uploadedDocuments[docKey] ? "bg-green-500" : "bg-gray-300"}`}
                  title={docKey}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {isMobile && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium text-gray-900 mb-2 flex items-center">
            <Camera className="w-4 h-4 mr-2" />
            Dicas para Captura
          </h3>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Use boa iluminação natural quando possível</li>
            <li>• Mantenha o documento plano e centralizado</li>
            <li>• Evite sombras sobre o documento</li>
            <li>• Certifique-se que o texto está legível</li>
          </ul>
        </div>
      )}
    </div>
  )
}
