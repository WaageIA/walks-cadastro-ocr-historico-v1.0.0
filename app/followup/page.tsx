"use client"

import { useState } from "react"
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import FacadeUpload from "@/app/components/FacadeUpload"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/app/context/AuthContext"
import { useFormCache } from "@/app/hooks/useFormCache"
import FormCacheIndicator from "@/app/components/FormCacheIndicator"
import { cn } from "@/lib/utils"
import { Star, Loader2 } from "lucide-react"
import ProtectedRoute from "@/app/components/ProtectedRoute"
import AudioRecorderButton from "@/app/components/AudioRecorderButton"
import Header from "@/app/components/Header"
import { useAdvancedSecurity } from "@/app/hooks/useAdvancedSecurity"
import { validateEmail } from "@/lib/security"

interface FollowUpFormData {
  responsavel: string
  email: string
  telefone: string
  empresa: string
  produtoInteresse: string
  notaInteresse: number
  observacoes: string
}

const initialFormData: FollowUpFormData = {
  responsavel: "",
  email: "",
  telefone: "",
  empresa: "",
  produtoInteresse: "",
  notaInteresse: 0,
  observacoes: "",
}

export default function FollowUpPage() {
  const { toast } = useToast()
  const { user, setHasUnsavedData } = useAuth()
  const [facadeFile, setFacadeFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Hook de cache do formulário
  const {
    data: formData,
    updateData: setFormData,
    clearCache,
    isSaving,
    lastSaved,
  } = useFormCache<FollowUpFormData>({
    key: "followup_form",
    initialData: initialFormData,
    autoSave: true,
    saveDelay: 2000,
  })

  // Configurar segurança avançada
  useAdvancedSecurity({
    inactivityTimeout: 60, // 30 minutos
    warningTime: 5, // avisar 5 minutos antes
    businessHoursStart: 8, // 8h
    businessHoursEnd: 18, // 18h
    maxActionsPerMinute: 100, // máximo 100 ações por minuto
    offlineTimeout: 20, // 10 minutos offline
  })

  const handleInputChange = (field: keyof FollowUpFormData, value: string | number) => {
    setFormData((prev: FollowUpFormData) => ({
      ...prev,
      [field]: value,
    }))
    // setHasUnsavedData será chamado automaticamente pelo useFormCache
  }

  const handleStarClick = (rating: number) => {
    setFormData((prev: FollowUpFormData) => ({
      ...prev,
      notaInteresse: rating,
    }))
    // setHasUnsavedData será chamado automaticamente pelo useFormCache
  }

  const handleFacadeUpload = (file: File) => {
    setFacadeFile(file)
    setHasUnsavedData(true) // Manter apenas aqui
  }

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        const result = reader.result as string
        // Remove o prefixo "data:image/...;base64," para obter apenas o base64
        const base64 = result.split(",")[1]
        resolve(base64)
      }
      reader.onerror = (error) => reject(error)
    })
  }

  const handleTranscriptionReceived = (transcription: string) => {
    // Adicionar transcrição ao campo observações existente
    const currentObservations = formData.observacoes
    const newObservations = currentObservations
      ? `${currentObservations}\n\n[Áudio transcrito]: ${transcription}`
      : `[Áudio transcrito]: ${transcription}`

    setFormData((prev: FollowUpFormData) => ({
      ...prev,
      observacoes: newObservations,
    }))

    toast({
      title: "Áudio transcrito com sucesso!",
      description: "A transcrição foi adicionada às observações.",
    })

    setHasUnsavedData(true)
  }

  const handleSave = async () => {
    // Validação básica
    if (!formData.responsavel || !formData.telefone || !formData.empresa) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha pelo menos Responsável, Telefone e Empresa",
        variant: "destructive",
      })
      return
    }

    // Validar email se preenchido
    if (formData.email && formData.email.trim()) {
      const emailValidation = validateEmail(formData.email.trim())
      if (!emailValidation.valid) {
        toast({
          title: "Email inválido",
          description: emailValidation.error,
          variant: "destructive",
        })
        return
      }
    }

    setIsLoading(true)

    try {
      // Converter arquivo para base64 se existir
      let facadeBase64 = null
      if (facadeFile) {
        facadeBase64 = await convertFileToBase64(facadeFile)
      }

      // Preparar payload
      const payload = {
        followup_data: {
          responsavel: formData.responsavel,
          email: formData.email,
          telefone: formData.telefone,
          empresa: formData.empresa,
          produto_interesse: formData.produtoInteresse,
          nota_interesse: formData.notaInteresse,
          observacoes: formData.observacoes,
        },
        documents: {
          facade: facadeBase64,
        },
        metadata: {
          processed_at: new Date().toISOString(),
          source: "walks_bank_followup",
          version: "1.0.0",
          user_agent: "WalksBank-FollowUp/1.0.0",
          form_type: "follow_up",
          has_facade_photo: !!facadeFile,
          seller_id: user?.id, // ID do vendedor do Supabase
          facade_file_info: facadeFile
            ? {
                name: facadeFile.name,
                size: facadeFile.size,
                type: facadeFile.type,
              }
            : null,
        },
      }

      // URL do webhook
      const webhookUrl =
        process.env.NEXT_PUBLIC_WEBHOOK_URL?.replace("/webhook/customer-data", "/webhook/followup-data") ||
        "https://webhook.escalasdigitaischatboot.uk/webhook/followup-data"

      // Enviar para webhook
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "WalksBank-FollowUp/1.0.0",
        },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        // Tentar parsear a resposta JSON
        let responseData
        try {
          const responseText = await response.text()

          // Tentar parsear como JSON direto
          try {
            responseData = JSON.parse(responseText)
          } catch {
            // Se falhar, pode ser um array com response wrapper
            const parsedArray = JSON.parse(responseText)
            if (Array.isArray(parsedArray) && parsedArray[0]?.response?.body) {
              // Extrair o body do wrapper
              responseData = JSON.parse(parsedArray[0].response.body)
            } else {
              responseData = parsedArray
            }
          }
        } catch (jsonError) {
          // Se não conseguir parsear JSON, assumir sucesso se HTTP 200
          responseData = { success: true }
        }

        // Verificar se o processamento foi bem-sucedido
        if (responseData.success !== false) {
          toast({
            title: "Follow-up salvo com sucesso!",
            description: responseData.message || "Os dados foram enviados para processamento.",
          })

          // Limpar cache e formulário apenas se sucesso
          clearCache()
          setFacadeFile(null)
          setHasUnsavedData(false)
        } else {
          // Erro retornado pelo webhook - mostrar mensagem específica
          toast({
            title: "Erro ao salvar",
            description: responseData.message || "Erro no processamento dos dados",
            variant: "destructive",
          })
        }
      } else {
        throw new Error(`Erro HTTP: ${response.status}`)
      }
    } catch (error) {
      console.error("Erro ao enviar follow-up:", error)
      toast({
        title: "Erro ao salvar",
        description: "Ocorreu um erro ao enviar os dados. Tente novamente.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <ProtectedRoute>
      <Header />
      <div className="min-h-screen flex items-start md:items-center justify-center bg-gray-50 px-4 py-4 md:py-8">
        <Card className="w-full max-w-3xl mx-auto">
          <CardHeader className="text-center pb-4 md:pb-6">
            <div className="flex flex-col items-center gap-4">
              <h1 className="text-xl md:text-2xl font-bold">Cadastro de Follow-up</h1>
              <p className="text-gray-600">Complete as informações do follow-up</p>

              {/* Indicador de Cache */}
              <FormCacheIndicator isSaving={isSaving} lastSaved={lastSaved} isManualEntry={true} />
            </div>
          </CardHeader>
          <CardContent className="px-4 md:px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
              <div>
                <Label htmlFor="responsavel">Responsável *</Label>
                <Input
                  id="responsavel"
                  type="text"
                  value={formData.responsavel}
                  onChange={(e) => handleInputChange("responsavel", e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="telefone">Telefone *</Label>
                <Input
                  id="telefone"
                  type="tel"
                  value={formData.telefone}
                  onChange={(e) => handleInputChange("telefone", e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="empresa">Empresa *</Label>
                <Input
                  id="empresa"
                  type="text"
                  value={formData.empresa}
                  onChange={(e) => handleInputChange("empresa", e.target.value)}
                  required
                />
              </div>
              <div className="lg:col-span-2">
                <Label htmlFor="produtoInteresse">Produto de Interesse</Label>
                <Select
                  onValueChange={(value) => handleInputChange("produtoInteresse", value)}
                  value={formData.produtoInteresse}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione um produto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whitelabs-franquias">Whitelabs/Franquias</SelectItem>
                    <SelectItem value="marketplace">Marketplace</SelectItem>
                    <SelectItem value="banco-digital">Banco Digital</SelectItem>
                    <SelectItem value="tap-to-pay">Tap-to-Pay</SelectItem>
                    <SelectItem value="maquina-cartao">Máquina de Cartão</SelectItem>
                    <SelectItem value="pdv">PDV</SelectItem>
                    <SelectItem value="pdv-maquinha-cartao">PDV + maquinas de cartão</SelectItem>
                    <SelectItem value="totem">Totem</SelectItem>
                    <SelectItem value="walks-pay">Walks Pay</SelectItem>
                    <SelectItem value="outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="lg:col-span-2">
                <Label>Nota de Interesse</Label>
                <div className="flex items-center space-x-1 mt-2 flex-wrap">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <Star
                      key={rating}
                      className={cn(
                        "w-6 h-6 cursor-pointer transition-colors hover:scale-110",
                        rating <= formData.notaInteresse
                          ? "text-yellow-500 fill-yellow-500"
                          : "text-gray-300 hover:text-yellow-400",
                      )}
                      onClick={() => handleStarClick(rating)}
                    />
                  ))}
                  {formData.notaInteresse > 0 && (
                    <span className="ml-2 text-sm text-gray-600">{formData.notaInteresse} de 5 estrelas</span>
                  )}
                </div>
              </div>
              <div className="lg:col-span-2">
                <Label className="text-base font-medium mb-3 block">Anexar ou tirar foto da fachada</Label>
                <FacadeUpload onFileUpload={handleFacadeUpload} />
              </div>
              <div className="lg:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <Label htmlFor="observacoes">Observações</Label>
                  <AudioRecorderButton
                    onTranscriptionReceived={handleTranscriptionReceived}
                    webhookUrl={
                      process.env.NEXT_PUBLIC_WEBHOOK_URL?.replace(/\/webhook\/.*$/, "/webhook/audio_data") ||
                      "https://webhook.escalasdigitaischatboot.uk/webhook/audio_data"
                    }
                    disabled={isLoading}
                  />
                </div>
                <Textarea
                  id="observacoes"
                  placeholder="Digite suas observações sobre o lead ou estabelecimento..."
                  value={formData.observacoes}
                  onChange={(e) => handleInputChange("observacoes", e.target.value)}
                  rows={4}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="px-4 md:px-6 pt-4 md:pt-6">
            <Button onClick={handleSave} className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar Follow-up"
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </ProtectedRoute>
  )
}
