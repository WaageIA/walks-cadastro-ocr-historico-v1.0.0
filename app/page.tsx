"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Upload, UserCheck } from "lucide-react"
import DocumentUpload from "./components/DocumentUpload"
import CustomerForm from "./components/CustomerForm"
import Header from "./components/Header"
import ProtectedRoute from "./components/ProtectedRoute"
import { useAdvancedSecurity } from "./hooks/useAdvancedSecurity"

export default function ClienteGanhoPage() {
  const [activeTab, setActiveTab] = useState("upload")
  const [uploadedDocuments, setUploadedDocuments] = useState({
    rg: null,
    cnpj: null,
    address: null,
    facade: null,
  })
  const [ocrData, setOcrData] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // Configurar segurança avançada apenas uma vez
  useAdvancedSecurity({
    inactivityTimeout: 60,
    warningTime: 5,
    businessHoursStart: 8,
    businessHoursEnd: 18,
    maxActionsPerMinute: 100,
    offlineTimeout: 20,
  })

  const getProgress = () => {
    if (activeTab === "upload") return 25
    if (activeTab === "cadastro") return 75
    return 100
  }

  const handleDocumentsProcessed = (data: any) => {
    setOcrData(data)
    setActiveTab("cadastro")
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Header />

        <div className="container mx-auto px-4 py-8 max-w-6xl">
          {/* Progress Indicator */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Upload className={`w-5 h-5 ${activeTab === "upload" ? "text-blue-600" : "text-gray-400"}`} />
                <span className={`text-sm font-medium ${activeTab === "upload" ? "text-blue-600" : "text-gray-400"}`}>
                  Upload de Documentos
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <UserCheck className={`w-5 h-5 ${activeTab === "cadastro" ? "text-blue-600" : "text-gray-400"}`} />
                <span className={`text-sm font-medium ${activeTab === "cadastro" ? "text-blue-600" : "text-gray-400"}`}>
                  Dados do Cliente
                </span>
              </div>
            </div>
            <Progress value={getProgress()} className="h-2" />
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8">
              <TabsTrigger value="upload" className="flex items-center space-x-2">
                <Upload className="w-4 h-4" />
                <span>Upload de Documentos</span>
              </TabsTrigger>
              <TabsTrigger value="cadastro" className="flex items-center space-x-2">
                <UserCheck className="w-4 h-4" />
                <span>Dados do Cliente</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload">
              <DocumentUpload
                uploadedDocuments={uploadedDocuments}
                setUploadedDocuments={setUploadedDocuments}
                onDocumentsProcessed={handleDocumentsProcessed}
                isProcessing={isProcessing}
                setIsProcessing={setIsProcessing}
              />
            </TabsContent>

            <TabsContent value="cadastro">
              <CustomerForm
                ocrData={ocrData}
                uploadedDocuments={uploadedDocuments}
                onSubmit={(data) => {
                  console.log("✅ Dados do cliente enviados com sucesso:", data)
                  // Aqui você pode adicionar lógica adicional após o envio
                  // Por exemplo: redirecionar, mostrar mensagem de sucesso, etc.
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </ProtectedRoute>
  )
}
