import { type NextRequest, NextResponse } from "next/server"
import { encryptSensitiveFields } from "@/lib/security"

/**
 * Rota de API para envio de dados do cliente
 * AGORA COM CRIPTOGRAFIA NO BACKEND
 */
async function handleCustomerData(req: NextRequest) {
  try {
    const bodyText = await req.text()
    if (!bodyText) {
      return NextResponse.json({ success: false, message: "Body da requisição está vazio" }, { status: 400 })
    }

    let payload
    try {
      payload = JSON.parse(bodyText)
    } catch (parseError) {
      return NextResponse.json({ 
        success: false, 
        message: "JSON inválido", 
        details: parseError instanceof Error ? parseError.message : "Erro de parse"
      }, { status: 400 })
    }

    if (!payload.customer_data) {
      return NextResponse.json({ success: false, message: "Dados do cliente são obrigatórios" }, { status: 400 })
    }

    // --- CRIPTOGRAFIA NO LADO DO SERVIDOR ---
    const encryptedCustomerData = encryptSensitiveFields(payload.customer_data);
    
    // Atualiza o payload com os dados criptografados
    const securePayload = {
      ...payload,
      customer_data: encryptedCustomerData,
    };
    // Atualiza o metadado de segurança
    if (securePayload.metadata?.security) {
      securePayload.metadata.security.encrypted = true;
    }
    // --- FIM DA CRIPTOGRAFIA ---

    const webhookHeaders = {
      "Content-Type": "application/json",
      "X-API-Key": process.env.WEBHOOK_API_KEY || "",
      "User-Agent": "Walks-Bank-SaaS/1.0",
      "X-Source": "walks-bank-backend",
    }

    const webhookUrl = process.env.WEBHOOK_URL || "https://webhook.escalasdigitaischatboot.uk"
    const response = await fetch(`${webhookUrl}/webhook/customer-data`, {
      method: "POST",
      headers: webhookHeaders,
      body: JSON.stringify(securePayload),
    })

    const responseData = await response.json()
    
    if (response.ok) {
      const data = Array.isArray(responseData) ? responseData[0]?.response?.body : responseData
      return NextResponse.json({
        success: data?.success || true,
        message: data?.message || "Dados enviados com sucesso",
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          message: responseData.message || "Erro ao processar dados no webhook",
        },
        { status: response.status },
      )
    }
  } catch (error) {
    console.error("Erro na rota de API:", error.message);
    return NextResponse.json(
      {
        success: false,
        message: "Erro interno do servidor",
        details: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 },
    )
  }
}

export const POST = handleCustomerData
