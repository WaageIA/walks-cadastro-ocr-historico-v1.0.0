export interface ClienteFollowup {
  id: string
  responsavel: string | null
  email: string | null
  telefone: string | null
  empresa: string | null
  produto_interesse: string | null
  nota_interesse: number | null
  observacoes: string | null
  processed_at: string | null
  seller_id: string | null
  has_facade_photo: boolean | null
  facade_file_info: any | null
}

export interface ClienteGanho {
  id: string
  empresa: string | null
  email: string | null
  cnpj: string | null
  celular: string | null
  telefone: string | null
  nome_comprovante: string | null
  quantidade_pos: string | null
  faturamento_estimado: string | null
  produto_interesse: string | null
  cep: string | null
  endereco: string | null
  complemento: string | null
  nome_completo: string | null
  data_nascimento: string | null
  cpf: string | null
  endereco_proprietario: string | null
  email_proprietario: string | null
  celular_proprietario: string | null
  banco: string | null
  agencia: string | null
  conta: string | null
  observacoes: string | null
  ocr_data: any | null
  fields_from_ocr: any | null
  fields_manual: any | null
  documentos_anexados: any | null
  processed_at: string | null
  seller_id: string | null
}

export interface HistoricoItem {
  id: string
  tipo: "followup" | "cliente_ganho"
  nome: string
  empresa: string | null
  contato: string | null
  produto_interesse: string | null
  processed_at: string | null
  valor_estimado?: string | null
}

export interface EstatisticasMensais {
  totalCadastros: number
  totalFollowups: number
  totalClientesGanhos: number
  taxaConversao: number
  cadastrosHoje: number
}
