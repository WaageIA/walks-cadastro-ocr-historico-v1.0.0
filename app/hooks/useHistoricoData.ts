"use client"

import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/app/context/AuthContext"
import type { ClienteFollowup, ClienteGanho, HistoricoItem, EstatisticasMensais } from "@/app/types/database"

export function useHistoricoData() {
  const { user } = useAuth()
  const [historicoHoje, setHistoricoHoje] = useState<HistoricoItem[]>([])
  const [estatisticasMensais, setEstatisticasMensais] = useState<EstatisticasMensais>({
    totalCadastros: 0,
    totalFollowups: 0,
    totalClientesGanhos: 0,
    taxaConversao: 0,
    cadastrosHoje: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Função para buscar histórico do dia
  const fetchHistoricoHoje = useCallback(async () => {
    if (!user?.id) {
      console.log("❌ Usuário não encontrado para buscar histórico")
      return
    }

    try {
      console.log("🔍 Buscando histórico do dia para seller_id:", user.id)

      const hoje = new Date()
      const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
      const fimHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1)

      // Buscar follow-ups do dia
      const { data: followups, error: errorFollowups } = await supabase
        .from("cliente_followup")
        .select("id, responsavel, empresa, telefone, email, produto_interesse, processed_at")
        .eq("seller_id", user.id)
        .gte("processed_at", inicioHoje.toISOString())
        .lt("processed_at", fimHoje.toISOString())
        .order("processed_at", { ascending: false })

      if (errorFollowups) {
        console.error("❌ Erro ao buscar follow-ups:", errorFollowups)
        throw errorFollowups
      }

      // Buscar clientes ganhos do dia
      const { data: clientesGanhos, error: errorClientesGanhos } = await supabase
        .from("cliente_ganho")
        .select("id, nome_completo, empresa, celular, email, produto_interesse, faturamento_estimado, processed_at")
        .eq("seller_id", user.id)
        .gte("processed_at", inicioHoje.toISOString())
        .lt("processed_at", fimHoje.toISOString())
        .order("processed_at", { ascending: false })

      if (errorClientesGanhos) {
        console.error("❌ Erro ao buscar clientes ganhos:", errorClientesGanhos)
        throw errorClientesGanhos
      }

      console.log("📊 Follow-ups encontrados:", followups?.length || 0)
      console.log("📊 Clientes ganhos encontrados:", clientesGanhos?.length || 0)

      // Combinar e formatar dados
      const historicoFormatado: HistoricoItem[] = [
        ...(followups || []).map((item: ClienteFollowup) => ({
          id: item.id,
          tipo: "followup" as const,
          nome: item.responsavel || "Nome não informado",
          empresa: item.empresa,
          contato: item.telefone || item.email,
          produto_interesse: item.produto_interesse,
          processed_at: item.processed_at,
        })),
        ...(clientesGanhos || []).map((item: ClienteGanho) => ({
          id: item.id,
          tipo: "cliente_ganho" as const,
          nome: item.nome_completo || "Nome não informado",
          empresa: item.empresa,
          contato: item.celular || item.email,
          produto_interesse: item.produto_interesse,
          processed_at: item.processed_at,
          valor_estimado: item.faturamento_estimado,
        })),
      ].sort((a, b) => {
        const dateA = new Date(a.processed_at || 0).getTime()
        const dateB = new Date(b.processed_at || 0).getTime()
        return dateB - dateA
      })

      setHistoricoHoje(historicoFormatado)
      console.log("✅ Histórico do dia carregado:", historicoFormatado.length, "itens")
    } catch (error) {
      console.error("❌ Erro ao buscar histórico do dia:", error)
      setError("Erro ao carregar histórico do dia")
    }
  }, [user?.id])

  // Função para buscar estatísticas mensais
  const fetchEstatisticasMensais = useCallback(async () => {
    if (!user?.id) {
      console.log("❌ Usuário não encontrado para buscar estatísticas")
      return
    }

    try {
      console.log("📈 Buscando estatísticas mensais para seller_id:", user.id)

      const hoje = new Date()
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
      const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1)
      const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
      const fimHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1)

      // Buscar follow-ups do mês
      const { data: followupsMes, error: errorFollowupsMes } = await supabase
        .from("cliente_followup")
        .select("id")
        .eq("seller_id", user.id)
        .gte("processed_at", inicioMes.toISOString())
        .lt("processed_at", fimMes.toISOString())

      if (errorFollowupsMes) {
        console.error("❌ Erro ao buscar follow-ups do mês:", errorFollowupsMes)
        throw errorFollowupsMes
      }

      // Buscar clientes ganhos do mês
      const { data: clientesGanhosMes, error: errorClientesGanhosMes } = await supabase
        .from("cliente_ganho")
        .select("id")
        .eq("seller_id", user.id)
        .gte("processed_at", inicioMes.toISOString())
        .lt("processed_at", fimMes.toISOString())

      if (errorClientesGanhosMes) {
        console.error("❌ Erro ao buscar clientes ganhos do mês:", errorClientesGanhosMes)
        throw errorClientesGanhosMes
      }

      // Buscar cadastros de hoje
      const { data: followupsHoje, error: errorFollowupsHoje } = await supabase
        .from("cliente_followup")
        .select("id")
        .eq("seller_id", user.id)
        .gte("processed_at", inicioHoje.toISOString())
        .lt("processed_at", fimHoje.toISOString())

      const { data: clientesGanhosHoje, error: errorClientesGanhosHoje } = await supabase
        .from("cliente_ganho")
        .select("id")
        .eq("seller_id", user.id)
        .gte("processed_at", inicioHoje.toISOString())
        .lt("processed_at", fimHoje.toISOString())

      if (errorFollowupsHoje || errorClientesGanhosHoje) {
        console.error("❌ Erro ao buscar dados de hoje")
      }

      const totalFollowups = followupsMes?.length || 0
      const totalClientesGanhos = clientesGanhosMes?.length || 0
      const totalCadastros = totalFollowups + totalClientesGanhos
      const cadastrosHoje = (followupsHoje?.length || 0) + (clientesGanhosHoje?.length || 0)
      const taxaConversao = totalFollowups > 0 ? (totalClientesGanhos / totalFollowups) * 100 : 0

      const estatisticas: EstatisticasMensais = {
        totalCadastros,
        totalFollowups,
        totalClientesGanhos,
        taxaConversao: Math.round(taxaConversao * 100) / 100,
        cadastrosHoje,
      }

      setEstatisticasMensais(estatisticas)
      console.log("✅ Estatísticas mensais carregadas:", estatisticas)
    } catch (error) {
      console.error("❌ Erro ao buscar estatísticas mensais:", error)
      setError("Erro ao carregar estatísticas mensais")
    }
  }, [user?.id])

  // Função para recarregar todos os dados
  const recarregarDados = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      await Promise.all([fetchHistoricoHoje(), fetchEstatisticasMensais()])
    } catch (error) {
      console.error("❌ Erro ao recarregar dados:", error)
    } finally {
      setLoading(false)
    }
  }, [fetchHistoricoHoje, fetchEstatisticasMensais])

  // Carregar dados iniciais
  useEffect(() => {
    if (user?.id) {
      recarregarDados()
    } else {
      setLoading(false)
    }
  }, [user?.id, recarregarDados])

  return {
    historicoHoje,
    estatisticasMensais,
    loading,
    error,
    recarregarDados,
  }
}
