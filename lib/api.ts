/**
 * Cliente API para comunicação com n8n webhook
 */

interface N8nConfig {
  webhookUrl: string
  timeout: number
  retries: number
}

class N8nClient {
  private config: N8nConfig
  private correlationId: string

  constructor(config?: Partial<N8nConfig>) {
    this.config = {
      webhookUrl:
        process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL || "https://webhook.escalasdigitaischatboot.uk/webhook/doc-ocr-dados",
      timeout: 60000, // 60 segundos para OCR
      retries: 2,
      ...config,
    }
    this.correlationId = this.generateCorrelationId()
  }

  private generateCorrelationId(): string {
    return `web-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    retries: number = this.config.retries,
  ): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Correlation-ID": this.correlationId,
          ...options.headers,
        },
      })

      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)

      if (retries > 0 && (error instanceof TypeError || error.name === "AbortError")) {
        console.warn(`Tentativa falhou, tentando novamente... (${retries} tentativas restantes)`)
        await new Promise((resolve) => setTimeout(resolve, 2000))
        return this.fetchWithRetry(url, options, retries - 1)
      }

      throw error
    }
  }

  async processDocuments(documents: Record<string, string>) {
    if (!this.config.webhookUrl) {
      throw new Error("URL do webhook n8n não configurada. Configure NEXT_PUBLIC_N8N_WEBHOOK_URL")
    }

    // Preparar payload para n8n
    const payload = {
      correlation_id: this.correlationId,
      timestamp: new Date().toISOString(),
      documents: documents,
      document_types: Object.keys(documents),
      total_documents: Object.keys(documents).length,
    }

    const response = await this.fetchWithRetry(this.config.webhookUrl, {
      method: "POST",
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
    }

    const result = await response.json()

    // Padronizar resposta para compatibilidade com componente
    return {
      success: true,
      data: result,
      correlation_id: this.correlationId,
      processed_at: new Date().toISOString(),
    }
  }

  async healthCheck() {
    if (!this.config.webhookUrl) {
      return {
        ok: false,
        status: 500,
        data: { error: "Webhook URL não configurada" },
      }
    }

    try {
      // Teste simples de conectividade
      const testPayload = {
        test: true,
        correlation_id: this.correlationId,
      }

      const response = await this.fetchWithRetry(
        this.config.webhookUrl,
        {
          method: "POST",
          body: JSON.stringify(testPayload),
        },
        1,
      )

      return {
        ok: response.ok,
        status: response.status,
        data: response.ok ? await response.json() : null,
      }
    } catch (error) {
      return {
        ok: false,
        status: 500,
        data: { error: error instanceof Error ? error.message : "Erro desconhecido" },
      }
    }
  }

  getCorrelationId(): string {
    return this.correlationId
  }

  renewCorrelationId(): string {
    this.correlationId = this.generateCorrelationId()
    return this.correlationId
  }
}

// Instância singleton
export const apiClient = new N8nClient()

// Hook para usar em componentes React
export function useApiClient() {
  return apiClient
}

// Tipos para TypeScript
export interface N8nResponse {
  success: boolean
  data: any
  correlation_id: string
  processed_at: string
}

export interface HealthStatus {
  ok: boolean
  status: number
  data: any
}

// Alias para compatibilidade com imports antigos
export { apiClient as api }
// (opcional) também como default
export default apiClient
