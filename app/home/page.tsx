"use client"

import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { UserPlus, Users, BarChart3 } from "lucide-react"

import Header from "@/app/components/Header"
import ProtectedRoute from "@/app/components/ProtectedRoute"

export default function HomePage() {
  const router = useRouter()

  const handleNavigateToCustomer = () => {
    router.push("/")
  }

  const handleNavigateToFollowup = () => {
    router.push("/followup")
  }

  const handleNavigateToHistorico = () => {
    router.push("/historico")
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Header />

        <main className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Bem-vindo ao Walks Bank</h1>
            <p className="text-gray-600">Sistema de cadastro de clientes com OCR integrado</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="hover:shadow-lg transition-shadow duration-200">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <UserPlus className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Cadastro de Cliente</CardTitle>
                    <CardDescription>Cadastrar novo cliente com OCR</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4">
                  Utilize a tecnologia OCR para extrair dados automaticamente dos documentos e agilizar o processo de
                  cadastro.
                </p>
                <Button onClick={handleNavigateToCustomer} className="w-full">
                  Iniciar Cadastro
                </Button>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow duration-200">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Follow-up</CardTitle>
                    <CardDescription>Cadastrar lead para follow-up</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4">
                  Registre informações de prospects e potenciais clientes para acompanhamento posterior.
                </p>
                <Button onClick={handleNavigateToFollowup} className="w-full bg-transparent" variant="outline">
                  Cadastrar Lead
                </Button>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow duration-200">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Histórico</CardTitle>
                    <CardDescription>Ver histórico de cadastros</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4">
                  Acompanhe seu desempenho e visualize o histórico completo de cadastros realizados.
                </p>
                <Button onClick={handleNavigateToHistorico} className="w-full bg-transparent" variant="outline">
                  Ver Histórico
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}
