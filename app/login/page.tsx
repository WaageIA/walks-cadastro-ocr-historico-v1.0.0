"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/app/context/AuthContext"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useAuth()
  const { toast } = useToast()
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email || !password) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha e-mail e senha",
        variant: "destructive",
      })
      return
    }

    // Validação rigorosa de email (mantendo a mesma validação)
    const emailRegex =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

    // Lista de domínios válidos comuns (mantendo a mesma lista)
    const validDomains = [
      "gmail.com",
      "outlook.com",
      "hotmail.com",
      "yahoo.com",
      "icloud.com",
      "live.com",
      "msn.com",
      "aol.com",
      "protonmail.com",
      "zoho.com",
      "uol.com.br",
      "bol.com.br",
      "terra.com.br",
      "ig.com.br",
      "globo.com",
      "r7.com",
      "oi.com.br",
      "vivo.com.br",
      "tim.com.br",
      "claro.com.br",
    ]

    if (!emailRegex.test(email)) {
      toast({
        title: "Email inválido",
        description: "Digite um endereço de email válido",
        variant: "destructive",
      })
      return
    }

    // Validação adicional de domínio (mantendo a mesma validação)
    const emailDomain = email.split("@")[1]?.toLowerCase()
    const isValidDomain =
      validDomains.includes(emailDomain) || /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/.test(emailDomain)

    if (!isValidDomain) {
      toast({
        title: "Domínio de email inválido",
        description: "Use um provedor de email válido (Gmail, Outlook, etc.)",
        variant: "destructive",
      })
      return
    }

    if (password.length < 3) {
      toast({
        title: "Senha muito curta",
        description: "A senha deve ter pelo menos 3 caracteres",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)

    try {
      await login(email, password)

      toast({
        title: "Login realizado com sucesso!",
        description: "Redirecionando...",
      })

      router.push("/home")
    } catch (error) {
      let errorMessage = "Erro desconhecido"
      let errorTitle = "Erro no login"

      if (error instanceof Error) {
        errorMessage = error.message

        // Personalizar títulos baseado no tipo de erro
        if (error.message.includes("Email ou senha")) {
          errorTitle = "Credenciais Inválidas"
        } else if (error.message.includes("confirmado")) {
          errorTitle = "Email Não Confirmado"
        } else if (error.message.includes("tentativas")) {
          errorTitle = "Muitas Tentativas"
        }
      }

      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
        duration: 5000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <Card className="w-full max-w-md bg-slate-900">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img src="/logo-walks-horizontal.png" alt="WALKS Logo" className="h-12 w-auto object-contain" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">Bem-vindo</h1>
            <p className="text-gray-300">Faça login para continuar</p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white">
                E-mail
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Digite seu e-mail"
                required
                disabled={isLoading}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white">
                Senha
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite sua senha"
                required
                disabled={isLoading}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Entrando...
                </>
              ) : (
                "Entrar"
              )}
            </Button>
            <div className="text-center">
              <Link href="#" className="text-sm text-blue-400 hover:text-blue-300 hover:underline">
                Esqueceu a senha?
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
