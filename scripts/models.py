"""
Modelos Pydantic para validação rigorosa de dados
"""

from pydantic import BaseModel, Field, validator, EmailStr
from typing import Dict, List, Optional, Union, Any
from datetime import datetime
import re
import base64
from enum import Enum

class DocumentType(str, Enum):
    """Tipos de documento aceitos"""
    RG = "rg"
    CNPJ = "cnpj"
    ADDRESS = "address"
    FACADE = "facade"

class TaskStatus(str, Enum):
    """Status possíveis de uma tarefa"""
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    SUCCESS = "SUCCESS"
    FAILURE = "FAILURE"
    REVOKED = "REVOKED"

# ============================================================================
# MODELOS DE REQUEST (ENTRADA)
# ============================================================================

class DocumentUploadRequest(BaseModel):
    """Modelo para upload de documentos"""
    documents: Dict[DocumentType, str] = Field(
        ...,
        description="Dicionário com documentos em base64",
        example={
            "rg": "iVBORw0KGgoAAAANSUhEUgAA...",
            "cnpj": "iVBORw0KGgoAAAANSUhEUgAA..."
        }
    )

    @validator('documents')
    def validate_documents(cls, v):
        """Valida se há pelo menos um documento e se são base64 válidos"""
        if not v:
            raise ValueError("Pelo menos um documento deve ser fornecido")

        # Verificar se há documentos válidos
        valid_docs = {k: doc for k, doc in v.items() if doc and doc.strip()}
        if not valid_docs:
            raise ValueError("Nenhum documento válido fornecido")

        # Validar base64 para cada documento
        for doc_type, base64_data in valid_docs.items():
            try:
                # Tentar decodificar base64
                decoded = base64.b64decode(base64_data, validate=True)

                # Verificar tamanho (máximo 10MB)
                if len(decoded) > 10 * 1024 * 1024:
                    raise ValueError(f"Documento {doc_type} muito grande (máximo 10MB)")

                # Verificar se parece ser uma imagem (magic numbers básicos)
                if not (decoded.startswith(b'\xff\xd8') or  # JPEG
                       decoded.startswith(b'\x89PNG') or   # PNG
                       decoded.startswith(b'%PDF')):       # PDF
                    raise ValueError(f"Documento {doc_type} não parece ser uma imagem ou PDF válido")

            except Exception as e:
                raise ValueError(f"Documento {doc_type} contém base64 inválido: {str(e)}")

        return valid_docs

class SingleDocumentRequest(BaseModel):
    """Modelo para processamento de documento único"""
    document_type: DocumentType = Field(..., description="Tipo do documento")
    base64_image: str = Field(..., description="Imagem em base64")

    @validator('base64_image')
    def validate_base64_image(cls, v):
        """Valida se é um base64 válido de imagem"""
        try:
            decoded = base64.b64decode(v, validate=True)

            if len(decoded) > 10 * 1024 * 1024:
                raise ValueError("Imagem muito grande (máximo 10MB)")

            if not (decoded.startswith(b'\xff\xd8') or
                   decoded.startswith(b'\x89PNG')):
                raise ValueError("Arquivo não é uma imagem válida")

            return v
        except Exception as e:
            raise ValueError(f"Base64 inválido: {str(e)}")

class CustomerDataValidationRequest(BaseModel):
    """Modelo para validação de dados do cliente"""
    # Estabelecimento
    empresa: Optional[str] = Field(None, max_length=200)
    email: Optional[EmailStr] = None
    cnpj: Optional[str] = Field(None, pattern=r'^\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}$')
    celular: Optional[str] = Field(None, pattern=r'^\(\d{2}\)\s\d{4,5}-\d{4}$')
    telefone: Optional[str] = Field(None, pattern=r'^\(\d{2}\)\s\d{4}-\d{4}$')

    # Endereço
    cep: Optional[str] = Field(None, pattern=r'^\d{5}-\d{3}$')
    endereco: Optional[str] = Field(None, max_length=300)
    complemento: Optional[str] = Field(None, max_length=100)

    # Proprietário
    nome_completo: Optional[str] = Field(None, max_length=150)
    cpf: Optional[str] = Field(None, pattern=r'^\d{3}\.\d{3}\.\d{3}-\d{2}$')
    data_nascimento: Optional[str] = Field(None, pattern=r'^\d{4}-\d{2}-\d{2}$')

    # Conta Bancária
    banco: Optional[str] = Field(None, max_length=100)
    agencia: Optional[str] = Field(None, pattern=r'^\d{4,5}$')
    conta: Optional[str] = Field(None, pattern=r'^\d{5,10}-?\d?$')

    @validator('cnpj')
    def validate_cnpj(cls, v):
        """Valida CNPJ com algoritmo oficial"""
        if not v:
            return v

        # Remover formatação para validação
        clean_cnpj = re.sub(r'[^\d]', '', v)

        if len(clean_cnpj) != 14:
            raise ValueError("CNPJ deve ter 14 dígitos")

        # Algoritmo de validação do CNPJ
        def calculate_digit(cnpj_digits, weights):
            total = sum(int(digit) * weight for digit, weight in zip(cnpj_digits, weights))
            remainder = total % 11
            return 0 if remainder < 2 else 11 - remainder

        weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        digit1 = calculate_digit(clean_cnpj[:12], weights1)

        weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        digit2 = calculate_digit(clean_cnpj[:13], weights2)

        if clean_cnpj[12:14] != f"{digit1}{digit2}":
            raise ValueError("CNPJ inválido")

        return v

    @validator('cpf')
    def validate_cpf(cls, v):
        """Valida CPF com algoritmo oficial"""
        if not v:
            return v

        # Remover formatação para validação
        clean_cpf = re.sub(r'[^\d]', '', v)

        if len(clean_cpf) != 11:
            raise ValueError("CPF deve ter 11 dígitos")

        # Verificar se todos os dígitos são iguais
        if len(set(clean_cpf)) == 1:
            raise ValueError("CPF inválido")

        # Algoritmo de validação do CPF
        def calculate_digit(cpf_digits, weights):
            total = sum(int(digit) * weight for digit, weight in zip(cpf_digits, weights))
            remainder = total % 11
            return 0 if remainder < 2 else 11 - remainder

        weights1 = list(range(10, 1, -1))
        digit1 = calculate_digit(clean_cpf[:9], weights1)

        weights2 = list(range(11, 1, -1))
        digit2 = calculate_digit(clean_cpf[:10], weights2)

        if clean_cpf[9:11] != f"{digit1}{digit2}":
            raise ValueError("CPF inválido")

        return v

# ============================================================================
# MODELOS DE RESPONSE (SAÍDA)
# ============================================================================

class ValidationError(BaseModel):
    """Modelo para erros de validação"""
    field: str = Field(..., description="Campo com erro")
    message: str = Field(..., description="Mensagem de erro")
    value: Optional[str] = Field(None, description="Valor que causou o erro")

class APIResponse(BaseModel):
    """Modelo base para respostas da API"""
    success: bool = Field(..., description="Indica se a operação foi bem-sucedida")
    timestamp: datetime = Field(default_factory=datetime.now, description="Timestamp da resposta")
    correlation_id: Optional[str] = Field(None, description="ID de correlação para rastreamento")

class ErrorResponse(APIResponse):
    """Modelo para respostas de erro"""
    success: bool = Field(default=False)
    error: str = Field(..., description="Mensagem de erro")
    error_code: str = Field(..., description="Código do erro")
    validation_errors: Optional[List[ValidationError]] = Field(None, description="Erros de validação específicos")
    traceback: Optional[str] = Field(None, description="Stack trace (apenas em debug)")

class TaskCreatedResponse(APIResponse):
    """Modelo para resposta de tarefa criada"""
    success: bool = Field(default=True)
    task_id: str = Field(..., description="ID da tarefa criada")
    status: TaskStatus = Field(default=TaskStatus.PENDING, description="Status inicial da tarefa")
    message: str = Field(..., description="Mensagem descritiva")
    documents_count: int = Field(..., description="Número de documentos a processar")
    document_types: List[DocumentType] = Field(..., description="Tipos de documentos")
    estimated_time: str = Field(..., description="Tempo estimado de processamento")

class TaskStatusResponse(APIResponse):
    """Modelo para resposta de status de tarefa"""
    success: bool = Field(default=True)
    task_id: str = Field(..., description="ID da tarefa")
    status: TaskStatus = Field(..., description="Status atual da tarefa")
    message: str = Field(..., description="Mensagem descritiva do status")
    progress: int = Field(default=0, ge=0, le=100, description="Progresso em porcentagem")
    current_document: Optional[str] = Field(None, description="Documento sendo processado atualmente")
    phase: Optional[str] = Field(None, description="Fase atual do processamento")
    result: Optional[Dict[str, Any]] = Field(None, description="Resultado final (quando concluído)")
    error: Optional[str] = Field(None, description="Mensagem de erro (se houver)")

class HealthCheckResponse(APIResponse):
    """Modelo para resposta de health check"""
    success: bool = Field(default=True)
    status: str = Field(..., description="Status geral do sistema")
    services: Dict[str, Dict[str, Any]] = Field(..., description="Status dos serviços")
    version: Optional[str] = Field(None, description="Versão da aplicação")
    uptime: Optional[str] = Field(None, description="Tempo de atividade")

class ValidationResponse(APIResponse):
    """Modelo para resposta de validação de dados"""
    success: bool = Field(default=True)
    valid: bool = Field(..., description="Indica se todos os dados são válidos")
    validations: Dict[str, Dict[str, Any]] = Field(..., description="Resultado das validações")
    summary: Optional[Dict[str, Any]] = Field(None, description="Resumo das validações")

# ============================================================================
# MODELOS DE DADOS OCR
# ============================================================================

class RGData(BaseModel):
    """Dados extraídos do RG"""
    nome_completo: Optional[str] = None
    rg: Optional[str] = None
    cpf: Optional[str] = None
    data_nascimento: Optional[str] = None
    filiacao_pai: Optional[str] = None
    filiacao_mae: Optional[str] = None
    naturalidade: Optional[str] = None
    data_expedicao: Optional[str] = None
    orgao_expedidor: Optional[str] = None

class CNPJData(BaseModel):
    """Dados extraídos do CNPJ"""
    razao_social: Optional[str] = None
    nome_fantasia: Optional[str] = None
    cnpj: Optional[str] = None
    inscricao_estadual: Optional[str] = None
    endereco: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    cidade: Optional[str] = None
    uf: Optional[str] = None
    cep: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    atividade_principal: Optional[str] = None
    situacao_cadastral: Optional[str] = None
    data_abertura: Optional[str] = None

class AddressData(BaseModel):
    """Dados extraídos do comprovante de endereço"""
    tipo_documento: Optional[str] = None
    nome_titular: Optional[str] = None
    cpf_cnpj_titular: Optional[str] = None
    endereco: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    cidade: Optional[str] = None
    uf: Optional[str] = None
    cep: Optional[str] = None
    data_vencimento: Optional[str] = None
    valor: Optional[str] = None

class StoredFacadeData(BaseModel):
    """Dados da fachada armazenada (não processada por OCR)"""
    stored_for_webhook: bool = Field(default=True, description="Indica que foi armazenada para webhook")
    image_validated: bool = Field(default=True, description="Indica que a imagem foi validada")
    file_size: Optional[int] = Field(None, description="Tamanho do arquivo em bytes")
    note: str = Field(default="Fachada armazenada para webhook - não processada por OCR")

class FacadeData(BaseModel):
    """Dados extraídos da foto da fachada"""
    nome_estabelecimento: Optional[str] = None
    tipo_estabelecimento: Optional[str] = None
    endereco_visivel: Optional[str] = None
    telefone_visivel: Optional[str] = None
    horario_funcionamento: Optional[str] = None
    caracteristicas: Optional[str] = None
    qualidade_imagem: Optional[str] = None

class OCRResult(BaseModel):
    """Resultado do processamento OCR"""
    success: bool = Field(..., description="Indica se o OCR foi bem-sucedido")
    document_type: DocumentType = Field(..., description="Tipo do documento processado")
    raw_text: Optional[str] = Field(None, description="Texto bruto extraído")
    parsed_data: Optional[Union[RGData, CNPJData, AddressData]] = Field(None, description="Dados estruturados")
    confidence_score: Optional[float] = Field(None, ge=0, le=1, description="Pontuação de confiança")
    processing_time: Optional[float] = Field(None, description="Tempo de processamento em segundos")
    error: Optional[str] = Field(None, description="Mensagem de erro se houver")
    processed_at: datetime = Field(default_factory=datetime.now, description="Timestamp do processamento")

class ConsolidatedCustomerData(BaseModel):
    """Dados consolidados do cliente"""
    # Empresa
    empresa: Optional[str] = None
    cnpj: Optional[str] = None
    inscricao_estadual: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    celular: Optional[str] = None

    # Endereço
    cep: Optional[str] = None
    endereco: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    cidade: Optional[str] = None
    uf: Optional[str] = None

    # Proprietário
    nome_completo: Optional[str] = None
    cpf: Optional[str] = None
    data_nascimento: Optional[str] = None
    endereco_proprietario: Optional[str] = None

    # Adicionar campo para fachada
    facade_stored: bool = Field(default=False, description="Indica se fachada foi armazenada")
    facade_info: Optional[Dict[str, Any]] = Field(None, description="Informações da fachada armazenada")

    # Metadados
    confidence_score: float = Field(default=0, ge=0, le=100, description="Pontuação de confiança geral")
    fields_extracted: int = Field(default=0, ge=0, description="Número de campos extraídos")
    fields_total: int = Field(default=0, ge=0, description="Número total de campos")
    needs_review: List[str] = Field(default_factory=list, description="Campos que precisam revisão")
    processed_documents: List[DocumentType] = Field(default_factory=list, description="Documentos processados")
    processing_metadata: Optional[Dict[str, Any]] = Field(None, description="Metadados do processamento")

# ============================================================================
# UTILITÁRIOS DE VALIDAÇÃO
# ============================================================================

def validate_request_model(model_class: BaseModel, data: dict) -> tuple[bool, Union[BaseModel, List[ValidationError]]]:
    """
    Valida dados usando um modelo Pydantic

    Args:
        model_class: Classe do modelo Pydantic
        data: Dados para validar

    Returns:
        Tuple com (sucesso, modelo_validado_ou_erros)
    """
    try:
        validated_model = model_class(**data)
        return True, validated_model
    except Exception as e:
        # Converter erros Pydantic para nosso formato
        validation_errors = []

        if hasattr(e, 'errors'):
            for error in e.errors():
                field = '.'.join(str(loc) for loc in error['loc'])
                validation_errors.append(ValidationError(
                    field=field,
                    message=error['msg'],
                    value=str(error.get('input', ''))
                ))
        else:
            validation_errors.append(ValidationError(
                field='unknown',
                message=str(e),
                value=''
            ))

        return False, validation_errors

# Exemplo de uso e testes
if __name__ == "__main__":
    print("=== TESTE DOS MODELOS PYDANTIC ===")

    # Teste 1: Validação de documento válido
    print("\n1. Teste de documento válido:")
    valid_doc_data = {
        "documents": {
            "rg": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
            "cnpj": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
        }
    }

    success, result = validate_request_model(DocumentUploadRequest, valid_doc_data)
    print(f"Sucesso: {success}")
    if success:
        print(f"Documentos validados: {list(result.documents.keys())}")
    else:
        for error in result:
            print(f"Erro: {error.field} - {error.message}")

    # Teste 2: Validação de CNPJ
    print("\n2. Teste de validação de CNPJ:")
    customer_data = {
        "empresa": "Teste Ltda",
        "cnpj": "11.222.333/0001-81",  # CNPJ inválido para teste
        "email": "teste@empresa.com"
    }

    success, result = validate_request_model(CustomerDataValidationRequest, customer_data)
    print(f"Sucesso: {success}")
    if not success:
        for error in result:
            print(f"Erro: {error.field} - {error.message}")

    print("\n✅ Testes dos modelos concluídos")
