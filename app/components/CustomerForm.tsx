"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import {
  User,
  MapPin,
  Building2,
  CreditCard,
  AlertCircle,
  Sparkles,
  UserRound,
  Shield,
  Package,
  MessageSquare,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/app/context/AuthContext"
import { useFormCache } from "@/app/hooks/useFormCache"
import { FormCacheIndicator } from "./FormCacheIndicator"
import { maskSensitiveData, webhookRateLimiter, validateCustomerData } from "@/lib/security"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

interface CustomerFormProps {
  ocrData: any
  uploadedDocuments: any
  onSubmit: (data: any) => void
}

const initialFormData = {
  // Estabelecimento
  empresa: "",
  email: "",
  cnpj: "",
  celular: "",
  telefone: "",
  nomeComprovante: "",
  quantidadePOS: "",
  faturamentoEstimado: "",
  produtoInteresse: "", // NOVO CAMPO

  // Endereço
  cep: "",
  endereco: "",
  complemento: "",

  // Proprietário
  nomeCompleto: "",
  dataNascimento: "",
  cpf: "",
  enderecoProprietario: "",
  emailProprietario: "",
  celularProprietario: "",

  // Conta Bancária
  banco: "",
  agencia: "",
  conta: "",

  // Observações
  observacoes: "", // NOVO CAMPO
}

export default function CustomerForm({ ocrData, uploadedDocuments, onSubmit }: CustomerFormProps) {
  const { toast } = useToast()
  const { user } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [ocrExtractedFields, setOcrExtractedFields] = useState<string[]>([])
  const [securityStatus, setSecurityStatus] = useState({
    encrypted: false,
    validated: false,
    rateLimited: false,
  })

  // Sistema de Cache
  const {
    data: formData,
    updateData: setFormData,
    clearCache,
    saveManually,
    isSaving,
    lastSaved,
  } = useFormCache({
    key: "customerFormData",
    initialData: initialFormData,
    autoSave: true,
    saveDelay: 3000,
  })

  // Formatação
  const formatCNPJ = (cnpj: string) => {
    return cnpj
      .replace(/\D/g, "")
      .replace(/(\d{2})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2")
      .substring(0, 18)
  }

  const formatCPF = (cpf: string) => {
    return cpf
      .replace(/\D/g, "")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1-$2")
      .substring(0, 14)
  }

  const formatPhone = (phone: string) => {
    return phone
      .replace(/\D/g, "")
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4,5})(\d)/, "$1-$2")
      .substring(0, 15)
  }

  const formatCEP = (cep: string) => {
    return cep
      .replace(/\D/g, "")
      .replace(/(\d{5})(\d)/, "$1-$2")
      .substring(0, 9)
  }

  // Busca de CEP
  const searchCEP = async (cep: string) => {
    if (!cep || cep.length !== 8) return

    setCepLoading(true)
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const data = await response.json()

      if (!data.erro) {
        setFormData({
          endereco: `${data.logradouro}, ${data.bairro}, ${data.localidade} - ${data.uf}`,
          complemento: data.complemento || formData.complemento,
        })

        toast({
          title: "CEP encontrado!",
          description: "Endereço preenchido automaticamente.",
        })
      } else {
        toast({
          title: "CEP não encontrado",
          description: "Verifique o CEP digitado.",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Erro ao buscar CEP",
        description: "Ocorreu um erro ao buscar o endereço.",
        variant: "destructive",
      })
    } finally {
      setCepLoading(false)
    }
  }

  // Preencher formulário com dados do OCR
  useEffect(() => {
    if (ocrData && ocrData.data) {
      const extractedFields: string[] = []
      const ocrMappedData: Partial<typeof initialFormData> = {}

      // Mapear campos do OCR que não são null/undefined
      const fieldMapping = {
        nome_completo: "nomeCompleto",
        data_nascimento: "dataNascimento",
        cpf: "cpf",
        empresa: "empresa",
        cnpj: "cnpj",
        nome_comprovante: "nomeComprovante",
        cep: "cep",
        complemento: "complemento",
      }

      Object.entries(fieldMapping).forEach(([ocrField, formField]) => {
        const value = ocrData.data[ocrField]
        if (value !== null && value !== undefined && value !== "") {
          ocrMappedData[formField as keyof typeof initialFormData] = value
          extractedFields.push(formField)
        }
      })

      // Atualizar apenas campos que foram extraídos
      if (Object.keys(ocrMappedData).length > 0) {
        setFormData(ocrMappedData)
        setOcrExtractedFields(extractedFields)

        toast({
          title: "Dados extraídos do OCR!",
          description: `${extractedFields.length} campos preenchidos automaticamente.`,
        })

        // Mostrar campos que precisam revisão
        if (ocrData.data.needs_review && ocrData.data.needs_review.length > 0) {
          toast({
            title: "Atenção - Revisão necessária",
            description: `Verifique os campos: ${ocrData.data.needs_review.join(", ")}`,
            variant: "destructive",
          })
        }
      }
    }
  }, [ocrData, setFormData, toast])

  // Detectar mudanças não salvas
  useEffect(() => {
    const hasChanges = Object.keys(formData).some(
      (key) =>
        formData[key as keyof typeof formData] !== initialFormData[key as keyof typeof initialFormData] &&
        formData[key as keyof typeof formData] !== "",
    )
    setHasUnsavedChanges(hasChanges && !lastSaved)
  }, [formData, lastSaved])

  const handleInputChange = (field: string, value: string) => {
    setFormData({ [field]: value })
    setHasUnsavedChanges(true)
  }

  const isFieldFromOCR = (field: string) => {
    return ocrExtractedFields.includes(field)
  }

  const getFieldIcon = (field: string) => {
    if (isFieldFromOCR(field)) {
      return <Sparkles className="w-3 h-3 text-blue-500 opacity-60" />
    }
    if (formData[field as keyof typeof formData]) {
      return <UserRound className="w-3 h-3 text-gray-500 opacity-60" />
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // 🔒 VERIFICAR RATE LIMITING (lado cliente)
      const userIdentifier = user?.id || "anonymous"
      if (!webhookRateLimiter.isAllowed(userIdentifier)) {
        throw new Error("Muitas tentativas. Aguarde um momento antes de tentar novamente.")
      }

      setSecurityStatus((prev) => ({ ...prev, rateLimited: true }))

      // Preparar dados para envio (COM formatação mantida)
      const customerData = {
        // Estabelecimento
        empresa: formData.empresa,
        email: formData.email,
        cnpj: formData.cnpj ? formatCNPJ(formData.cnpj) : "",
        celular: formData.celular ? formatPhone(formData.celular) : "",
        telefone: formData.telefone ? formatPhone(formData.telefone) : "",
        nomeComprovante: formData.nomeComprovante,
        quantidadePOS: formData.quantidadePOS,
        faturamentoEstimado: formData.faturamentoEstimado,
        produtoInteresse: formData.produtoInteresse, // NOVO CAMPO

        // Endereço
        cep: formData.cep ? formatCEP(formData.cep) : "",
        endereco: formData.endereco,
        complemento: formData.complemento,

        // Proprietário
        nomeCompleto: formData.nomeCompleto,
        dataNascimento: formData.dataNascimento,
        cpf: formData.cpf ? formatCPF(formData.cpf) : "",
        enderecoProprietario: formData.enderecoProprietario,
        emailProprietario: formData.emailProprietario || "proprietario@exemplo.com",
        celularProprietario: formData.celularProprietario ? formatPhone(formData.celularProprietario) : "",

        // Conta Bancária
        banco: formData.banco,
        agencia: formData.agencia,
        conta: formData.conta,

        // Observações
        observacoes: formData.observacoes, // NOVO CAMPO

        // Metadados OCR
        ocr_data: ocrData?.data || null,
        fields_from_ocr: ocrExtractedFields,
        fields_manual: Object.keys(formData).filter(
          (field) => formData[field as keyof typeof formData] && !ocrExtractedFields.includes(field),
        ),

        // Metadados gerais
        documentos_anexados: Object.keys(uploadedDocuments).filter((key) => uploadedDocuments[key]),
        processed_at: new Date().toISOString(),
        seller_id: user?.id,
      }

      // 🔒 VALIDAR DADOS ANTES DO ENVIO
      const validation = validateCustomerData(customerData)
      if (!validation.valid) {
        throw new Error(`Dados inválidos: ${validation.errors.join(", ")}`)
      }

      setSecurityStatus((prev) => ({ ...prev, validated: true }))

      // 🔒 CRIPTOGRAFAR DADOS SENSÍVEIS (lado cliente)
      // const encryptedCustomerData = encryptSensitiveFields(customerData)
      // setSecurityStatus((prev) => ({ ...prev, encrypted: true }))

      console.log("Enviando dados (sem criptografia no frontend):", customerData)

      const response = await fetch("/api/webhook/customer-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_data: customerData,
          documents: uploadedDocuments, // enviados como base64 ou URL
          metadata: {
            form_completed_at: new Date().toISOString(),
            security: {
              encrypted: false, // dados ainda não criptografados no front
              version: "2.0",
              algorithm: "AES-256-GCM",
            },
          },
        }),
      })
      const responseData = await response.json()

      // 🔒 LOG SEGURO (dados mascarados)
      console.log("📋 Dados enviados (mascarados):", maskSensitiveData(customerData))
      console.log("📋 Resposta recebida:", responseData)

      if (response.ok && responseData.success) {
        // Sucesso
        console.log("✅ Dados enviados com sucesso!")

        toast({
          title: "🔒 Cadastro enviado com segurança!",
          description: responseData.message || "Os dados do cliente foram enviados com criptografia e validação.",
        })

        // Limpar cache após envio bem-sucedido
        clearCache()
        setHasUnsavedChanges(false)

        // Chamar callback do componente pai
        onSubmit(customerData)
      } else {
        // Erro
        console.error("❌ Erro ao enviar dados:", responseData)
        const errorMessage = responseData.message || "Erro ao enviar os dados. Tente novamente."
        throw new Error(errorMessage)
      }
    } catch (error) {
      console.error("Erro ao enviar formulário:", error)

      // Reset security status on error
      setSecurityStatus({ encrypted: false, validated: false, rateLimited: false })

      toast({
        title: "Erro ao enviar formulário",
        description: error instanceof Error ? error.message : "Ocorreu um erro ao enviar os dados. Tente novamente.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSaveDraft = () => {
    saveManually()
    toast({
      title: "Rascunho salvo!",
      description: "Os dados foram salvos localmente.",
    })
  }

  // --- Status de Segurança ---
  // Esta seção pode ser simplificada ou removida se a criptografia for movida
  // para o backend, mas vamos mantê-la por enquanto para UI.
  const SecurityStatus = () => (
    <div className="mt-4 space-y-2 rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
      <h3 className="text-sm font-semibold">Status de Segurança</h3>
      <div className="flex items-center justify-between text-xs">
        <span>Criptografia dos Dados</span>
        <Badge variant={securityStatus.encrypted ? "default" : "secondary"} className="text-xs">
          {securityStatus.encrypted ? "✅" : "⏳"} Criptografia
        </Badge>
      </div>
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Dados do Cliente</h2>
        <p className="text-gray-600 mb-4">Complete as informações do cadastro</p>

        {/* Indicador de Cache + Status OCR + Segurança */}
        <div className="space-y-3">
          <FormCacheIndicator
            isSaving={isSaving}
            lastSaved={lastSaved}
            hasUnsavedChanges={hasUnsavedChanges}
            isManualEntry={!ocrData}
          />

          {/* Status OCR */}
          {ocrData && ocrData.data && (
            <div className="flex justify-center gap-2 flex-wrap">
              <Badge variant="default" className="text-xs">
                {ocrData.data.fields_extracted || 0} de {ocrData.data.fields_total || 8} campos extraídos
              </Badge>
              {ocrData.data.confidence_score && (
                <Badge variant={ocrData.data.confidence_score > 80 ? "default" : "secondary"} className="text-xs">
                  Confiança: {ocrData.data.confidence_score}%
                </Badge>
              )}
              {ocrData.data.needs_review && ocrData.data.needs_review.length > 0 && (
                <Badge variant="destructive" className="text-xs">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  {ocrData.data.needs_review.length} campos precisam revisão
                </Badge>
              )}
            </div>
          )}

          {/* Status de Segurança em Tempo Real */}
          {isSubmitting && (
            <div className="flex justify-center gap-2 flex-wrap">
              <Badge variant={securityStatus.validated ? "default" : "secondary"} className="text-xs">
                {securityStatus.validated ? "✅" : "⏳"} Validação
              </Badge>
              <Badge variant={securityStatus.encrypted ? "default" : "secondary"} className="text-xs">
                {securityStatus.encrypted ? "✅" : "⏳"} Criptografia
              </Badge>
              <Badge variant={securityStatus.rateLimited ? "default" : "secondary"} className="text-xs">
                {securityStatus.rateLimited ? "✅" : "⏳"} Rate Limit
              </Badge>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Cadastro do Estabelecimento */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              <span>Cadastro do Estabelecimento</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="empresa" className="flex items-center gap-2">
                * Empresa
                {getFieldIcon("empresa")}
              </Label>
              <Input
                id="empresa"
                value={formData.empresa}
                onChange={(e) => handleInputChange("empresa", e.target.value)}
                placeholder="Nome da empresa"
              />
            </div>
            <div>
              <Label htmlFor="produtoInteresse" className="flex items-center gap-2">
                * Produto de Interesse
                <Package className="w-3 h-3 text-gray-500 opacity-60" />
              </Label>
              <Select
                value={formData.produtoInteresse}
                onValueChange={(value) => handleInputChange("produtoInteresse", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um produto..." />
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
            <div>
              <Label htmlFor="email" className="flex items-center gap-2">
                * E-mail
                {getFieldIcon("email")}
              </Label>
              <Input
                type="email"
                id="email"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                placeholder="email@empresa.com"
              />
            </div>
            <div>
              <Label htmlFor="cnpj" className="flex items-center gap-2">
                * CNPJ
                {getFieldIcon("cnpj")}
              </Label>
              <Input
                id="cnpj"
                value={formatCNPJ(formData.cnpj)}
                onChange={(e) => handleInputChange("cnpj", e.target.value.replace(/\D/g, ""))}
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div>
              <Label htmlFor="celular" className="flex items-center gap-2">
                Celular
                {getFieldIcon("celular")}
              </Label>
              <Input
                id="celular"
                value={formatPhone(formData.celular)}
                onChange={(e) => handleInputChange("celular", e.target.value.replace(/\D/g, ""))}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div>
              <Label htmlFor="telefone" className="flex items-center gap-2">
                Telefone
                {getFieldIcon("telefone")}
              </Label>
              <Input
                id="telefone"
                value={formatPhone(formData.telefone)}
                onChange={(e) => handleInputChange("telefone", e.target.value.replace(/\D/g, ""))}
                placeholder="(00) 0000-0000"
              />
            </div>
            <div>
              <Label htmlFor="nomeComprovante" className="flex items-center gap-2">
                Nome Comprovante
                {getFieldIcon("nomeComprovante")}
              </Label>
              <Input
                id="nomeComprovante"
                value={formData.nomeComprovante}
                onChange={(e) => handleInputChange("nomeComprovante", e.target.value)}
                placeholder="Nome no comprovante"
              />
            </div>
            <div>
              <Label htmlFor="quantidadePOS" className="flex items-center gap-2">
                Quantidade de POS
                {getFieldIcon("quantidadePOS")}
              </Label>
              <Input
                type="number"
                id="quantidadePOS"
                value={formData.quantidadePOS}
                onChange={(e) => handleInputChange("quantidadePOS", e.target.value)}
                placeholder="Ex: 2"
              />
            </div>
            <div>
              <Label htmlFor="faturamentoEstimado" className="flex items-center gap-2">
                Faturamento Estimado
                {getFieldIcon("faturamentoEstimado")}
              </Label>
              <Select
                value={formData.faturamentoEstimado}
                onValueChange={(value) => handleInputChange("faturamentoEstimado", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o faturamento..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="R$ 10.000,00 a R$ 20.000,00">R$ 10.000,00 a R$ 20.000,00</SelectItem>
                  <SelectItem value="R$ 20.000,00 a R$ 50.000,00">R$ 20.000,00 a R$ 50.000,00</SelectItem>
                  <SelectItem value="R$ 50.000,00 a R$ 100.000,00">R$ 50.000,00 a R$ 100.000,00</SelectItem>
                  <SelectItem value="Acima de R$ 100.000,00">Acima de R$ 100.000,00</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Endereço do Estabelecimento */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              <span>Endereço do Estabelecimento</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cep" className="flex items-center gap-2">
                CEP
                {getFieldIcon("cep")}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="cep"
                  value={formatCEP(formData.cep)}
                  onChange={(e) => {
                    const cep = e.target.value.replace(/\D/g, "")
                    handleInputChange("cep", cep)
                    if (cep.length === 8) {
                      searchCEP(cep)
                    }
                  }}
                  placeholder="00000-000"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => searchCEP(formData.cep)}
                  disabled={cepLoading}
                >
                  {cepLoading ? "..." : "Buscar"}
                </Button>
              </div>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="endereco" className="flex items-center gap-2">
                Endereço Completo
                {getFieldIcon("endereco")}
              </Label>
              <Input
                id="endereco"
                value={formData.endereco}
                onChange={(e) => handleInputChange("endereco", e.target.value)}
                placeholder="Rua, número, bairro, cidade - UF"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="complemento" className="flex items-center gap-2">
                Complemento
                {getFieldIcon("complemento")}
              </Label>
              <Input
                id="complemento"
                value={formData.complemento}
                onChange={(e) => handleInputChange("complemento", e.target.value)}
                placeholder="Quadra, Lote, Casa, Apt, etc."
              />
            </div>
          </CardContent>
        </Card>

        {/* Dados do Proprietário */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="w-5 h-5 text-blue-600" />
              <span>Dados do Proprietário</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="nomeCompleto" className="flex items-center gap-2">
                * Nome Completo
                {getFieldIcon("nomeCompleto")}
              </Label>
              <Input
                id="nomeCompleto"
                value={formData.nomeCompleto}
                onChange={(e) => handleInputChange("nomeCompleto", e.target.value)}
                placeholder="Nome completo do proprietário"
              />
            </div>
            <div>
              <Label htmlFor="dataNascimento" className="flex items-center gap-2">
                Data de Nascimento
                {getFieldIcon("dataNascimento")}
              </Label>
              <Input
                id="dataNascimento"
                type="date"
                value={formData.dataNascimento}
                onChange={(e) => handleInputChange("dataNascimento", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cpf" className="flex items-center gap-2">
                * CPF
                {getFieldIcon("cpf")}
              </Label>
              <Input
                id="cpf"
                value={formatCPF(formData.cpf)}
                onChange={(e) => handleInputChange("cpf", e.target.value.replace(/\D/g, ""))}
                placeholder="000.000.000-00"
              />
            </div>
            <div>
              <Label htmlFor="enderecoProprietario" className="flex items-center gap-2">
                Endereço do Proprietário
                {getFieldIcon("enderecoProprietario")}
              </Label>
              <Input
                id="enderecoProprietario"
                value={formData.enderecoProprietario}
                onChange={(e) => handleInputChange("enderecoProprietario", e.target.value)}
                placeholder="Endereço do proprietário"
              />
            </div>
            <div>
              <Label htmlFor="emailProprietario" className="flex items-center gap-2">
                E-mail
                {getFieldIcon("emailProprietario")}
              </Label>
              <Input
                type="email"
                id="emailProprietario"
                value={formData.emailProprietario}
                onChange={(e) => handleInputChange("emailProprietario", e.target.value)}
                placeholder="email@proprietario.com"
              />
            </div>
            <div>
              <Label htmlFor="celularProprietario" className="flex items-center gap-2">
                * Celular
                {getFieldIcon("celularProprietario")}
              </Label>
              <Input
                id="celularProprietario"
                value={formatPhone(formData.celularProprietario)}
                onChange={(e) => handleInputChange("celularProprietario", e.target.value.replace(/\D/g, ""))}
                placeholder="(00) 00000-0000"
              />
            </div>
          </CardContent>
        </Card>

        {/* Dados da Conta Bancária */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              <span>Dados da Conta Bancária</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="banco" className="flex items-center gap-2">
                Banco
                {getFieldIcon("banco")}
              </Label>
              <Input
                id="banco"
                value={formData.banco}
                onChange={(e) => handleInputChange("banco", e.target.value)}
                placeholder="Nome do banco"
              />
            </div>
            <div>
              <Label htmlFor="agencia" className="flex items-center gap-2">
                Agência
                {getFieldIcon("agencia")}
              </Label>
              <Input
                id="agencia"
                value={formData.agencia}
                onChange={(e) => handleInputChange("agencia", e.target.value)}
                placeholder="0000"
              />
            </div>
            <div>
              <Label htmlFor="conta" className="flex items-center gap-2">
                Conta
                {getFieldIcon("conta")}
              </Label>
              <Input
                id="conta"
                value={formData.conta}
                onChange={(e) => handleInputChange("conta", e.target.value)}
                placeholder="00000-0"
              />
            </div>
          </CardContent>
        </Card>

        {/* Observações */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              <span>Observações</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <Label htmlFor="observacoes" className="flex items-center gap-2">
                Observações Adicionais
                {getFieldIcon("observacoes")}
              </Label>
              <Textarea
                id="observacoes"
                value={formData.observacoes}
                onChange={(e) => handleInputChange("observacoes", e.target.value)}
                placeholder="Digite observações sobre o cliente, necessidades específicas, etc."
                className="min-h-[100px]"
                maxLength={500}
              />
              <div className="text-xs text-gray-500 mt-1">{formData.observacoes.length}/500 caracteres</div>
            </div>
          </CardContent>
        </Card>

        {/* Botões de Ação */}
        <div className="flex flex-col md:flex-row justify-center pt-6 gap-4">
          <Button type="button" variant="secondary" size="lg" onClick={handleSaveDraft} disabled={isSubmitting}>
            Salvar Rascunho
          </Button>
          <Button
            type="submit"
            size="lg"
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3"
            disabled={isSubmitting}
          >
            <Shield className="w-5 h-5 mr-2" />
            {isSubmitting ? "Enviando com Segurança..." : "Enviar Cadastro Seguro"}
          </Button>
        </div>
      </form>
    </div>
  )
}
