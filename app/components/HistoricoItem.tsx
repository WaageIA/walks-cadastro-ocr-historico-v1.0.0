import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, Building2, Phone, Package, DollarSign } from "lucide-react"
import type { HistoricoItem } from "@/app/types/database"

interface HistoricoItemProps {
  item: HistoricoItem
}

export default function HistoricoItemComponent({ item }: HistoricoItemProps) {
  const formatarHorario = (processed_at: string | null) => {
    if (!processed_at) return "Horário não informado"

    try {
      const data = new Date(processed_at)
      return data.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch (error) {
      return "Horário inválido"
    }
  }

  const getBadgeVariant = (tipo: string) => {
    return tipo === "followup" ? "secondary" : "default"
  }

  const getBadgeText = (tipo: string) => {
    return tipo === "followup" ? "Follow-up" : "Cliente Ganho"
  }

  return (
    <Card className="hover:shadow-md transition-shadow duration-200">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="font-medium text-gray-900 truncate">{item.nome}</h4>
              <Badge variant={getBadgeVariant(item.tipo)} className="text-xs">
                {getBadgeText(item.tipo)}
              </Badge>
            </div>

            <div className="space-y-1 text-sm text-gray-600">
              {item.empresa && (
                <div className="flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  <span className="truncate">{item.empresa}</span>
                </div>
              )}

              {item.contato && (
                <div className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  <span className="truncate">{item.contato}</span>
                </div>
              )}

              {item.produto_interesse && (
                <div className="flex items-center gap-1">
                  <Package className="w-3 h-3" />
                  <span className="truncate">{item.produto_interesse}</span>
                </div>
              )}

              {item.valor_estimado && (
                <div className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  <span className="truncate">R$ {item.valor_estimado}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 text-xs text-gray-500 ml-2">
            <Clock className="w-3 h-3" />
            <span>{formatarHorario(item.processed_at)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
