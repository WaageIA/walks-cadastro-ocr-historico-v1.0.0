"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { RefreshCw, BarChart3, Users, Target, TrendingUp, Calendar } from "lucide-react"
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

import Header from "@/app/components/Header"
import ProtectedRoute from "@/app/components/ProtectedRoute"
import HistoricoItemComponent from "@/app/components/HistoricoItem"
import { useHistoricoData } from "@/app/hooks/useHistoricoData"

const COLORS = ["#3b82f6", "#10b981"]

export default function HistoricoPage() {
  const { historicoHoje, estatisticasMensais, loading, error, recarregarDados } = useHistoricoData()
  const [recarregando, setRecarregando] = useState(false)

  const handleRecarregar = async () => {
    setRecarregando(true)
    await recarregarDados()
    setRecarregando(false)
  }

  // Dados para o gráfico de barras
  const dadosGraficoBarras = [
    {
      name: "Follow-ups",
      value: estatisticasMensais.totalFollowups,
      fill: "#3b82f6",
    },
    {
      name: "Clientes Ganhos",
      value: estatisticasMensais.totalClientesGanhos,
      fill: "#10b981",
    },
  ]

  // Dados para o gráfico de pizza
  const dadosGraficoPizza = [
    {
      name: "Follow-ups",
      value: estatisticasMensais.totalFollowups,
      fill: "#3b82f6",
    },
    {
      name: "Clientes Ganhos",
      value: estatisticasMensais.totalClientesGanhos,
      fill: "#10b981",
    },
  ]

  if (error) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50">
          <Header />
          <main className="container mx-auto px-4 py-8">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-red-600 mb-4">Erro ao carregar dados</h1>
              <p className="text-gray-600 mb-4">{error}</p>
              <Button onClick={handleRecarregar} disabled={recarregando}>
                <RefreshCw className={`w-4 h-4 mr-2 ${recarregando ? "animate-spin" : ""}`} />
                Tentar novamente
              </Button>
            </div>
          </main>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Header />

        <main className="container mx-auto px-4 py-8">
          {/* Cabeçalho */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Histórico de Cadastros</h1>
              <p className="text-gray-600 mt-1">Acompanhe seu desempenho e histórico de atividades</p>
            </div>

            <Button onClick={handleRecarregar} disabled={loading || recarregando} variant="outline">
              <RefreshCw className={`w-4 h-4 mr-2 ${loading || recarregando ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>

          {/* Cards de Estatísticas */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total do Mês</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{estatisticasMensais.totalCadastros}</div>
                )}
                <p className="text-xs text-muted-foreground">cadastros realizados</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Follow-ups</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold text-blue-600">{estatisticasMensais.totalFollowups}</div>
                )}
                <p className="text-xs text-muted-foreground">prospecções realizadas</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Clientes Ganhos</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold text-green-600">{estatisticasMensais.totalClientesGanhos}</div>
                )}
                <p className="text-xs text-muted-foreground">conversões efetivadas</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Taxa de Conversão</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{estatisticasMensais.taxaConversao}%</div>
                )}
                <p className="text-xs text-muted-foreground">follow-up → cliente</p>
              </CardContent>
            </Card>
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <Card>
              <CardHeader>
                <CardTitle>Distribuição Mensal</CardTitle>
                <CardDescription>Comparativo entre Follow-ups e Clientes Ganhos</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <ChartContainer
                    config={{
                      followups: {
                        label: "Follow-ups",
                        color: "#3b82f6",
                      },
                      clientes: {
                        label: "Clientes Ganhos",
                        color: "#10b981",
                      },
                    }}
                    className="h-64"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dadosGraficoBarras}>
                        <XAxis dataKey="name" />
                        <YAxis />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="value" radius={4} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Proporção de Cadastros</CardTitle>
                <CardDescription>Visualização da distribuição dos tipos de cadastro</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <ChartContainer
                    config={{
                      followups: {
                        label: "Follow-ups",
                        color: "#3b82f6",
                      },
                      clientes: {
                        label: "Clientes Ganhos",
                        color: "#10b981",
                      },
                    }}
                    className="h-64"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={dadosGraficoPizza}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {dadosGraficoPizza.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <ChartTooltip content={<ChartTooltipContent />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Histórico do Dia */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Histórico de Hoje
                  </CardTitle>
                  <CardDescription>
                    Cadastros realizados hoje ({new Date().toLocaleDateString("pt-BR")})
                  </CardDescription>
                </div>
                <Badge variant="secondary">
                  {loading ? "..." : `${historicoHoje.length} ${historicoHoje.length === 1 ? "item" : "itens"}`}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center space-x-4">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-[250px]" />
                        <Skeleton className="h-4 w-[200px]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : historicoHoje.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum cadastro hoje</h3>
                  <p className="text-gray-600">Quando você realizar cadastros, eles aparecerão aqui.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {historicoHoje.map((item) => (
                    <HistoricoItemComponent key={item.id} item={item} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </ProtectedRoute>
  )
}
