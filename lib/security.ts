import CryptoJS from "crypto-js"

/*
 * 🔒 CONFIGURAÇÕES DE SEGURANÇA
 * (agora 100 % compatível com browser / Next.js)
 */
export const SECURITY_CONFIG = {
  // Rate-limiting
  RATE_LIMIT_WEBHOOK: Number.parseInt(process.env.WEBHOOK_RATE_LIMIT || "10"),
  RATE_LIMIT_WINDOW: 60 * 1000, // 1 min

  // Criptografia
  ENCRYPTION_ALGORITHM: "AES-256", // CryptoJS usa AES-256 por padrão
  ENCRYPTION_KEY_LENGTH: 32,

  // HMAC
  HMAC_ALGORITHM: "SHA-256",

  // Cabeçalhos HTTP de segurança
  SECURITY_HEADERS: {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
  },
} as const

// 🔓 Informações públicas exibidas no frontend
export const SECURITY_INFO = {
  RATE_LIMIT_WEBHOOK: SECURITY_CONFIG.RATE_LIMIT_WEBHOOK,
  HAS_IP_WHITELIST: !!process.env.WEBHOOK_ALLOWED_IPS,
  ENCRYPTION_ALGORITHM: SECURITY_CONFIG.ENCRYPTION_ALGORITHM,
  HMAC_ALGORITHM: SECURITY_CONFIG.HMAC_ALGORITHM,
} as const

/* -------------------------------------------------------------------------- */
/*                               Rate-limiter                                 */
/* -------------------------------------------------------------------------- */

class RateLimiter {
  private requests = new Map<string, number[]>()

  isAllowed(identifier: string) {
    const now = Date.now()
    const windowStart = now - SECURITY_CONFIG.RATE_LIMIT_WINDOW
    const recent = (this.requests.get(identifier) || []).filter((t) => t > windowStart)

    if (recent.length >= SECURITY_CONFIG.RATE_LIMIT_WEBHOOK) return false
    recent.push(now)
    this.requests.set(identifier, recent)
    return true
  }

  reset(identifier: string) {
    this.requests.delete(identifier)
  }
}

export const webhookRateLimiter = new RateLimiter()

/* -------------------------------------------------------------------------- */
/*                       🔐  Criptografia / Descriptografia                   */
/* -------------------------------------------------------------------------- */

/**
 * Encripta campos sensíveis usando AES-256 (CryptoJS)
 */
export function encryptSensitiveFields<T extends Record<string, any>>(data: T): T {
  const encryptionKey = process.env.NEXT_PUBLIC_DATA_ENCRYPTION_KEY || process.env.DATA_ENCRYPTION_KEY

  if (!encryptionKey || encryptionKey.length !== SECURITY_CONFIG.ENCRYPTION_KEY_LENGTH) {
    return data
  }

  const encrypted = { ...data } as Record<string, any>
  const sensitive = ["cpf", "cnpj", "conta", "agencia"]

  sensitive.forEach((field) => {
    if (typeof encrypted[field] === "string" && encrypted[field]) {
      try {
        encrypted[field] = {
          encrypted: CryptoJS.AES.encrypt(encrypted[field], encryptionKey).toString(),
          algorithm: SECURITY_CONFIG.ENCRYPTION_ALGORITHM,
        }
      } catch (err) {
        console.error(`Erro ao criptografar ${field}:`, err.message)
      }
    }
  })

  return encrypted as T
}

/**
 * Descriptografa campos sensíveis; usado apenas em ambiente servidor
 */
export function decryptSensitiveFields<T extends Record<string, any>>(data: T): T {
  const encryptionKey = process.env.NEXT_PUBLIC_DATA_ENCRYPTION_KEY || process.env.DATA_ENCRYPTION_KEY
  if (!encryptionKey) return data

  const decrypted = { ...data } as Record<string, any>

  Object.entries(decrypted).forEach(([field, value]) => {
    if (value && typeof value === "object" && (value as any).encrypted) {
      try {
        decrypted[field] = CryptoJS.AES.decrypt((value as any).encrypted, encryptionKey).toString(CryptoJS.enc.Utf8)
      } catch (err) {
        console.error(`Erro ao descriptografar ${field}:`, err.message)
      }
    }
  })

  return decrypted as T
}

/* -------------------------------------------------------------------------- */
/*                              Assinaturas HMAC                              */
/* -------------------------------------------------------------------------- */

/**
 * Gera cabeçalhos de segurança com HMAC SHA-256
 */
export function generateSecurityHeaders(payload: string): Record<string, string> {
  const timestamp = Date.now().toString()
  const secret = process.env.WEBHOOK_HMAC_SECRET || ""

  const signature = secret ? CryptoJS.HmacSHA256(payload + timestamp, secret).toString(CryptoJS.enc.Hex) : ""

  return {
    "Content-Type": "application/json",
    "X-Timestamp": timestamp,
    "X-Signature": signature,
    "User-Agent": "Walks-Bank-SaaS/1.0",
    ...SECURITY_CONFIG.SECURITY_HEADERS,
  }
}

/**
 * Valida os cabeçalhos de segurança recebidos
 */
export function validateSecurityHeaders(
  headers: Record<string, string>,
  payload: string,
): { valid: boolean; error?: string } {
  const secret = process.env.WEBHOOK_HMAC_SECRET
  if (!secret) {
    console.log("⚠️ WEBHOOK_HMAC_SECRET não configurada, pulando validação HMAC")
    return { valid: true }
  }

  // Buscar headers de forma case-insensitive
  const xSignature = headers["x-signature"] || headers["X-Signature"] || headers["X-SIGNATURE"]
  const xTimestamp = headers["x-timestamp"] || headers["X-Timestamp"] || headers["X-TIMESTAMP"]

  if (!xSignature || !xTimestamp) {
    console.log("🚫 Headers ausentes:", {
      hasSignature: !!xSignature,
      hasTimestamp: !!xTimestamp,
      availableHeaders: Object.keys(headers),
    })
    return { valid: false, error: "Headers ausentes" }
  }

  // timestamp ±5 min
  const diff = Math.abs(Date.now() - Number.parseInt(xTimestamp))
  if (diff > 5 * 60 * 1000) {
    console.log("🚫 Timestamp expirado:", {
      timestamp: xTimestamp,
      currentTime: Date.now(),
      diff: diff,
    })
    return { valid: false, error: "Timestamp expirado" }
  }

  const expected = CryptoJS.HmacSHA256(payload + xTimestamp, secret).toString(CryptoJS.enc.Hex)
  if (xSignature !== expected) {
    console.log("🚫 Assinatura inválida:", {
      received: xSignature,
      expected: expected,
      payloadLength: payload.length,
      timestamp: xTimestamp,
    })
    return { valid: false, error: "Assinatura inválida" }
  }

  console.log("✅ Validação HMAC bem-sucedida")
  return { valid: true }
}

/* -------------------------------------------------------------------------- */
/*                       IP-whitelist  (sem alterações)                       */
/* -------------------------------------------------------------------------- */

export function validateIPWhitelist(clientIP: string) {
  const allowed = process.env.WEBHOOK_ALLOWED_IPS
  if (!allowed) return true
  const list = allowed.split(",").map((ip) => ip.trim())
  return list.includes(clientIP) || list.includes("*")
}

/* -------------------------------------------------------------------------- */
/*                 Mascaramento de dados sensíveis para logs                  */
/* -------------------------------------------------------------------------- */

export function maskSensitiveData<T extends Record<string, any>>(data: T): T {
  const clone = { ...data } as Record<string, any>
  const sensitive = ["cpf", "cnpj", "conta", "agencia", "celular", "telefone", "celularProprietario"]

  sensitive.forEach((field) => {
    if (typeof clone[field] === "string" && clone[field]) {
      const value = clone[field] as string
      clone[field] =
        value.length > 4 ? value.slice(0, 2) + "*".repeat(value.length - 4) + value.slice(-2) : "*".repeat(value.length)
    }
  })

  return clone as T
}

/* -------------------------------------------------------------------------- */
/*                     Validação básica dos dados fornecidos                  */
/* -------------------------------------------------------------------------- */

/**
 * Validação robusta de email
 */
export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email) return { valid: false, error: "Email é obrigatório" }

  // Formato básico
  const basicFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!basicFormat.test(email)) {
    return { valid: false, error: "Formato de email inválido" }
  }

  // Detectar erros comuns de digitação em domínios populares
  const domain = email.split("@")[1]?.toLowerCase()
  const commonErrors = {
    "gmail.comm": "gmail.com",
    "gmail.co": "gmail.com",
    "gmail.con": "gmail.com",
    "gmail.cm": "gmail.com",
    "gmai.com": "gmail.com",
    "gmial.com": "gmail.com",
    "hotmail.comm": "hotmail.com",
    "hotmail.co": "hotmail.com",
    "hotmail.con": "hotmail.com",
    "hotmail.cm": "hotmail.com",
    "hotmial.com": "hotmail.com",
    "outlook.comm": "outlook.com",
    "outlook.co": "outlook.com",
    "outlook.con": "outlook.com",
    "outlook.cm": "outlook.com",
    "outlok.com": "outlook.com",
    "yahoo.comm": "yahoo.com",
    "yahoo.co": "yahoo.com",
    "yahoo.con": "yahoo.com",
    "yahoo.cm": "yahoo.com",
    "yahooo.com": "yahoo.com",
    "yaho.com": "yahoo.com",
  }

  if (commonErrors[domain]) {
    return {
      valid: false,
      error: `Você quis dizer ${email.split("@")[0]}@${commonErrors[domain]}?`,
    }
  }

  // Validar TLDs básicos
  const validTLDs = [
    "com",
    "org",
    "net",
    "edu",
    "gov",
    "mil",
    "int",
    "br",
    "co.uk",
    "com.br",
    "org.br",
    "net.br",
    "edu.br",
    "gov.br",
    "de",
    "fr",
    "it",
    "es",
    "pt",
    "ru",
    "jp",
    "cn",
    "in",
    "io",
    "co",
    "me",
    "tv",
    "info",
    "biz",
    "name",
  ]

  const tld = domain.split(".").slice(-2).join(".") // Para casos como co.uk
  const simpleTld = domain.split(".").pop() // Para casos simples como .com

  if (!validTLDs.includes(tld) && !validTLDs.includes(simpleTld)) {
    return { valid: false, error: "Domínio de email inválido" }
  }

  return { valid: true }
}

export function validateCustomerData(data: Record<string, any>) {
  const errors: string[] = []
  const required = ["empresa", "email", "cnpj", "nomeCompleto", "cpf", "celularProprietario"]

  required.forEach((f) => {
    if (!data[f] || (typeof data[f] === "string" && !data[f].trim())) errors.push(`Campo obrigatório: ${f}`)
  })

  // Validação robusta do email do estabelecimento
  if (data.email) {
    const emailValidation = validateEmail(data.email)
    if (!emailValidation.valid) {
      errors.push(`Email do estabelecimento: ${emailValidation.error}`)
    }
  }

  // Validação robusta do email do proprietário
  if (data.emailProprietario) {
    const emailValidation = validateEmail(data.emailProprietario)
    if (!emailValidation.valid) {
      errors.push(`Email do proprietário: ${emailValidation.error}`)
    }
  }

  if (data.cnpj && !/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(data.cnpj)) errors.push("CNPJ inválido")
  if (data.cpf && !/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(data.cpf)) errors.push("CPF inválido")

  return { valid: errors.length === 0, errors }
}
