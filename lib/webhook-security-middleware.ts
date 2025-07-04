import { NextRequest, NextResponse } from "next/server"
import { validateSecurityHeaders, validateIPWhitelist, webhookRateLimiter, SECURITY_CONFIG } from "./security"

/**
 * Middleware de segurança para webhooks
 * Use este middleware em suas rotas de API para validar requisições
 */
export function withWebhookSecurity(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      // 1. Validar método HTTP
      if (req.method !== "POST") {
        return NextResponse.json(
          { error: "Método não permitido", code: "METHOD_NOT_ALLOWED" },
          { status: 405, headers: SECURITY_CONFIG.SECURITY_HEADERS },
        )
      }

      // 2. Validar IP (se whitelist estiver configurada)
      const clientIP = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown"
      if (!validateIPWhitelist(clientIP)) {
        console.warn(`🚫 Acesso negado para IP: ${clientIP}`)
        return NextResponse.json(
          { error: "Acesso negado", code: "IP_NOT_ALLOWED" },
          { status: 403, headers: SECURITY_CONFIG.SECURITY_HEADERS },
        )
      }

      // 3. Rate Limiting
      if (!webhookRateLimiter.isAllowed(clientIP)) {
        console.warn(`🚫 Rate limit excedido para IP: ${clientIP}`)
        return NextResponse.json(
          { error: "Muitas requisições", code: "RATE_LIMIT_EXCEEDED" },
          { status: 429, headers: SECURITY_CONFIG.SECURITY_HEADERS },
        )
      }

      // 4. Validar Content-Type
      const contentType = req.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        return NextResponse.json(
          { error: "Content-Type deve ser application/json", code: "INVALID_CONTENT_TYPE" },
          { status: 400, headers: SECURITY_CONFIG.SECURITY_HEADERS },
        )
      }

      // 5. Obter payload para validação HMAC (sem consumir o request)
      const payload = await req.text()
      if (!payload) {
        return NextResponse.json(
          { error: "Payload vazio", code: "EMPTY_PAYLOAD" },
          { status: 400, headers: SECURITY_CONFIG.SECURITY_HEADERS },
        )
      }

      // 6. Validar headers de segurança
      const headers = Object.fromEntries(req.headers.entries())
      const validation = validateSecurityHeaders(headers, payload)

      if (!validation.valid) {
        console.warn(`🚫 Validação de segurança falhou: ${validation.error}`)
        return NextResponse.json(
          { error: "Falha na validação de segurança", code: "SECURITY_VALIDATION_FAILED", details: validation.error },
          { status: 401, headers: SECURITY_CONFIG.SECURITY_HEADERS },
        )
      }

      // 7. Validar JSON
      try {
        JSON.parse(payload)
      } catch (error) {
        return NextResponse.json(
          { error: "JSON inválido", code: "INVALID_JSON" },
          { status: 400, headers: SECURITY_CONFIG.SECURITY_HEADERS },
        )
      }

      console.log(`✅ Requisição validada com sucesso para IP: ${clientIP}`)

      // 8. Criar nova requisição com o mesmo payload
      const newReq = new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: payload,
      })

      // 9. Executar handler original
      const response = await handler(newReq as NextRequest)

      // 10. Adicionar headers de segurança à resposta
      Object.entries(SECURITY_CONFIG.SECURITY_HEADERS).forEach(([key, value]) => {
        response.headers.set(key, value)
      })

      return response
    } catch (error) {
      console.error("❌ Erro no middleware de segurança:", error)
      return NextResponse.json(
        { error: "Erro interno de segurança", code: "SECURITY_ERROR", details: error instanceof Error ? error.message : "Erro desconhecido" },
        { status: 500, headers: SECURITY_CONFIG.SECURITY_HEADERS },
      )
    }
  }
}

/**
 * Exemplo de uso em uma rota de API:
 *
 * // app/api/webhook/customer-data/route.ts
 * import { withWebhookSecurity } from '@/lib/webhook-security-middleware'
 *
 * export const POST = withWebhookSecurity(async (req: NextRequest) => {
 *   // Sua lógica de processamento aqui
 *   const data = await req.json()
 *
 *   return NextResponse.json({ success: true, message: 'Dados processados com sucesso' })
 * })
 */
