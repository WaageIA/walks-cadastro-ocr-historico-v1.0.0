import requests
import base64
import json
import os
from typing import Dict, List, Optional, Tuple
import logging
from datetime import datetime
import re
from pydantic import BaseModel, ValidationError
import time
from functools import wraps
from enum import Enum
import asyncio

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Modelos Pydantic para validação
class RGData(BaseModel):
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

class FacadeData(BaseModel):
    nome_estabelecimento: Optional[str] = None
    tipo_estabelecimento: Optional[str] = None
    endereco_visivel: Optional[str] = None
    telefone_visivel: Optional[str] = None
    horario_funcionamento: Optional[str] = None
    caracteristicas: Optional[str] = None
    qualidade_imagem: Optional[str] = None

class RetryStrategy(Enum):
    EXPONENTIAL_BACKOFF = "exponential_backoff"
    FIXED_DELAY = "fixed_delay"
    IMMEDIATE = "immediate"

class OCRRetryConfig:
    """Configuração de retry para OCR"""
    def __init__(self):
        self.max_retries = int(os.getenv('OCR_MAX_RETRIES', '3'))
        self.base_delay = float(os.getenv('OCR_RETRY_BASE_DELAY', '2.0'))  # segundos
        self.max_delay = float(os.getenv('OCR_RETRY_MAX_DELAY', '30.0'))  # segundos
        self.strategy = RetryStrategy(os.getenv('OCR_RETRY_STRATEGY', 'exponential_backoff'))
        self.retryable_errors = [
            'timeout',
            'connection',
            'rate_limit',
            'server_error',
            'api_error',
            'network_error'
        ]
        
    def should_retry(self, error: Exception, attempt: int) -> bool:
        """Determina se deve tentar novamente baseado no erro e tentativa"""
        if attempt >= self.max_retries:
            return False
            
        error_str = str(error).lower()
        
        # Erros que sempre devem ser retentados
        retryable_keywords = [
            'timeout', 'connection', 'network', 'temporary',
            'rate limit', 'server error', '5', 'unavailable'
        ]
        
        return any(keyword in error_str for keyword in retryable_keywords)
    
    def get_delay(self, attempt: int) -> float:
        """Calcula delay baseado na estratégia"""
        if self.strategy == RetryStrategy.IMMEDIATE:
            return 0
        elif self.strategy == RetryStrategy.FIXED_DELAY:
            return self.base_delay
        else:  # EXPONENTIAL_BACKOFF
            delay = self.base_delay * (2 ** attempt)
            return min(delay, self.max_delay)

def retry_ocr(retry_config: OCRRetryConfig = None):
    """Decorator para retry automático em operações OCR"""
    if retry_config is None:
        retry_config = OCRRetryConfig()
    
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            last_exception = None
            
            for attempt in range(retry_config.max_retries + 1):
                try:
                    # Log da tentativa
                    if attempt > 0:
                        logger.warning(f"Tentativa {attempt + 1}/{retry_config.max_retries + 1} para {func.__name__}")
                    
                    result = await func(*args, **kwargs)
                    
                    # Verificar se o resultado indica falha que deve ser retentada
                    if isinstance(result, dict) and not result.get('success', True):
                        error_msg = result.get('error', '')
                        if retry_config.should_retry(Exception(error_msg), attempt):
                            last_exception = Exception(error_msg)
                            if attempt < retry_config.max_retries:
                                delay = retry_config.get_delay(attempt)
                                logger.info(f"Resultado indica falha retentável. Aguardando {delay}s antes da próxima tentativa...")
                                await asyncio.sleep(delay)
                                continue
                    
                    # Sucesso ou falha não retentável
                    if attempt > 0:
                        logger.info(f"Sucesso na tentativa {attempt + 1}")
                    
                    return result
                    
                except Exception as e:
                    last_exception = e
                    
                    if not retry_config.should_retry(e, attempt):
                        logger.error(f"Erro não retentável em {func.__name__}: {e}")
                        break
                    
                    if attempt < retry_config.max_retries:
                        delay = retry_config.get_delay(attempt)
                        logger.warning(f"Erro retentável em {func.__name__}: {e}. Tentando novamente em {delay}s...")
                        await asyncio.sleep(delay)
                    else:
                        logger.error(f"Máximo de tentativas excedido para {func.__name__}: {e}")
            
            # Se chegou aqui, todas as tentativas falharam
            return {
                'success': False,
                'error': f'Falha após {retry_config.max_retries + 1} tentativas: {str(last_exception)}',
                'retry_attempts': retry_config.max_retries + 1,
                'last_error': str(last_exception),
                'processed_at': datetime.now().isoformat()
            }
        
        return wrapper
    return decorator

class WalksBankOCR:
    def __init__(self, api_key: str = None, retry_config: OCRRetryConfig = None):
        """
        Inicializa o cliente OCR para Walks Bank
        
        Args:
            api_key: Token de autenticação da API OpenRouter
            retry_config: Configuração de retry (opcional)
        """
        self.api_key = api_key or os.getenv('OPENROUTER_API_KEY')
        self.api_url = 'https://openrouter.ai/api/v1/chat/completions'
        self.model = "qwen/qwen2.5-vl-32b-instruct:free"
        self.retry_config = retry_config or OCRRetryConfig()
        
        if not self.api_key:
            raise ValueError("API Key é obrigatória. Configure OPENROUTER_API_KEY ou passe como parâmetro.")
    
    def encode_image_to_base64(self, image_path: str) -> str:
        """
        Converte imagem para base64
        
        Args:
            image_path: Caminho para o arquivo de imagem
            
        Returns:
            String base64 da imagem
        """
        try:
            with open(image_path, "rb") as image_file:
                return base64.b64encode(image_file.read()).decode('utf-8')
        except Exception as e:
            logger.error(f"Erro ao codificar imagem {image_path}: {str(e)}")
            raise
    
    
    def get_document_prompt(self, document_type: str) -> str:
        """
        Retorna o prompt específico para cada tipo de documento focado apenas nos campos essenciais
        
        Args:
            document_type: Tipo do documento (rg, cnpj, address, facade)
            
        Returns:
            Prompt otimizado para extrair apenas campos essenciais
        """
        base_instructions = """
        INSTRUÇÕES IMPORTANTES:
        1. Extraia APENAS os campos solicitados abaixo
        2. Para campos não encontrados, use null
        3. Se texto ilegível, use "[ILEGÍVEL]"
        4. RETORNE APENAS UM JSON VÁLIDO, sem texto adicional
        5. Seja preciso e direto na extração
        """
        
        prompts = {
            'rg': f"""
            {base_instructions}
            
            Extraia APENAS estes 3 campos essenciais do RG/Identidade:
            
            {{
                "nome_completo": "nome completo da pessoa ou null",
                "data_nascimento": "data no formato DD/MM/AAAA ou null", 
                "cpf": "CPF com ou sem máscara ou null"
            }}
            """,
            
            'cnpj': f"""
            {base_instructions}
            
            Extraia APENAS estes 3 campos essenciais do Comprovante CNPJ:
            
            {{
                "empresa": "razão social ou nome fantasia da empresa ou null",
                "cnpj": "CNPJ com ou sem máscara ou null",
                "nome_comprovante": "nome da empresa conforme aparece no comprovante ou null"
            }}
            """,
            
            'address': f"""
            {base_instructions}
            
            Extraia APENAS estes 2 campos essenciais do Comprovante de Endereço:
            
            {{
                "cep": "CEP com ou sem máscara ou null",
                "complemento": "informações como Quadra, Lote, Casa, Apartamento, Bloco, etc. ou null"
            }}
            """
        }
        
        return prompts.get(document_type, prompts['cnpj'])
    
    @retry_ocr()
    async def process_document(self, image_path: str, document_type: str) -> Dict:
        """
        Processa um documento específico usando OCR
        
        Args:
            image_path: Caminho para a imagem do documento
            document_type: Tipo do documento (rg, cnpj, address, facade)
            
        Returns:
            Dicionário com os dados extraídos
        """
        try:
            logger.info(f"Processando documento {document_type}: {image_path}")

            # Se for fachada, apenas validar e retornar sem OCR
            if document_type == 'facade':
                return {
                    'success': True,
                    'document_type': document_type,
                    'raw_text': None,
                    'parsed_data': {'stored_for_webhook': True, 'image_validated': True},
                    'processed_at': datetime.now().isoformat(),
                    'note': 'Fachada armazenada para webhook - não processada por OCR'
                }
            
            # Codificar imagem
            base64_image = self.encode_image_to_base64(image_path)
            
            # Preparar payload
            payload = {
                "model": self.model,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": self.get_document_prompt(document_type)
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{base64_image}"
                                }
                            }
                        ]
                    }
                ],
                "max_tokens": 1000,
                "temperature": 0.1  # Baixa temperatura para maior precisão
            }
            
            # Fazer chamada para API
            headers = {
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {self.api_key}'
            }
            
            response = requests.post(
                self.api_url,
                headers=headers,
                json=payload,
                timeout=30
            )
            
            if response.status_code != 200:
                logger.error(f"Erro na API: {response.status_code} - {response.text}")
                raise Exception(f"Erro na API OCR: {response.status_code}")
            
            result = response.json()
            extracted_text = result['choices'][0]['message']['content']
            
            logger.debug(f"=== RESPOSTA BRUTA DA API PARA {document_type.upper()} ===")
            logger.debug(f"Texto completo recebido: {extracted_text}")
            logger.debug(f"Tamanho da resposta: {len(extracted_text)} caracteres")
            logger.debug("=" * 60)
            
            logger.info(f"Documento {document_type} processado com sucesso")
            
            # Validar resultado antes de retornar
            raw_result = {
                'success': True,
                'document_type': document_type,
                'raw_text': extracted_text,
                'parsed_data': self.parse_extracted_data(extracted_text, document_type),
                'processed_at': datetime.now().isoformat()
            }

            validated_result = self.validate_ocr_result(raw_result, document_type)
            logger.info(f"Documento {document_type} processado - Qualidade: {validated_result.get('quality_metrics', {}).get('score', 0):.1f}%")

            return validated_result
            
        except Exception as e:
            logger.error(f"Erro ao processar documento {document_type}: {str(e)}")
            return {
                'success': False,
                'document_type': document_type,
                'error': str(e),
                'processed_at': datetime.now().isoformat()
            }
    
    
    def parse_extracted_data(self, raw_text: str, document_type: str) -> Dict:
        """
        Parser focado que extrai apenas os campos essenciais usando múltiplas estratégias
        """
        try:
            logger.debug(f"Iniciando parse focado para {document_type}")
            
            # Estratégia 1: Tentar extrair JSON limpo
            json_result = self._extract_json_from_text(raw_text)
            if json_result:
                logger.debug(f"JSON extraído com sucesso para {document_type}")
                return self._validate_essential_fields(json_result, document_type)
            
            # Estratégia 2: Parser por regex focado nos campos essenciais
            logger.debug(f"JSON não encontrado, usando parser regex para {document_type}")
            regex_result = self._extract_with_focused_regex(raw_text, document_type)
            
            return self._validate_essential_fields(regex_result, document_type)
            
        except Exception as e:
            logger.error(f"Erro no parse de dados para {document_type}: {e}")
            return {'error': f'Erro no parse: {str(e)}'}

    def _extract_json_from_text(self, text: str) -> Optional[Dict]:
        """Extrai JSON do texto usando múltiplas tentativas"""
        try:
            # Tentativa 1: JSON direto
            if text.strip().startswith('{') and text.strip().endswith('}'):
                return json.loads(text.strip())
            
            # Tentativa 2: JSON dentro de blocos de código
            json_patterns = [
                r'\`\`\`json\s*(\{.*?\})\s*\`\`\`',
                r'\`\`\`\s*(\{.*?\})\s*\`\`\`',
                r'(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})'
            ]
            
            for pattern in json_patterns:
                matches = re.findall(pattern, text, re.DOTALL | re.IGNORECASE)
                for match in matches:
                    try:
                        return json.loads(match.strip())
                    except:
                        continue
            
            return None
            
        except Exception as e:
            logger.debug(f"Erro na extração JSON: {e}")
            return None

    def _extract_with_focused_regex(self, text: str, document_type: str) -> Dict:
        """Extração focada usando regex para campos essenciais"""
        
        if document_type == 'rg':
            return self._extract_rg_fields(text)
        elif document_type == 'cnpj':
            return self._extract_cnpj_fields(text)
        elif document_type == 'address':
            return self._extract_address_fields(text)
        
        return {}

    def _extract_rg_fields(self, text: str) -> Dict:
        """Extrai campos essenciais do RG usando regex"""
        result = {
            "nome_completo": None,
            "data_nascimento": None,
            "cpf": None
        }
        
        # Nome completo - buscar padrões comuns
        nome_patterns = [
            r'nome[:\s]+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s]{10,})',
            r'nome completo[:\s]+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s]{10,})',
            r'^([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s]{15,})$'  # Linha com nome longo
        ]
        
        for pattern in nome_patterns:
            match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
            if match:
                nome = match.group(1).strip()
                if len(nome.split()) >= 2:  # Pelo menos nome e sobrenome
                    result["nome_completo"] = nome
                    break
        
        # Data de nascimento
        data_patterns = [
            r'(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{4})',
            r'nascimento[:\s]+(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{4})',
            r'data[:\s]+(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{4})'
        ]
        
        for pattern in data_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                result["data_nascimento"] = match.group(1)
                break
        
        # CPF
        cpf_patterns = [
            r'(\d{3}\.?\d{3}\.?\d{3}[\-\.]?\d{2})',
            r'cpf[:\s]+(\d{3}\.?\d{3}\.?\d{3}[\-\.]?\d{2})'
        ]
        
        for pattern in cpf_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                cpf = match.group(1)
                # Validar se tem 11 dígitos
                cpf_digits = re.sub(r'[^\d]', '', cpf)
                if len(cpf_digits) == 11:
                    result["cpf"] = cpf
                    break
        
        return result

    def _extract_cnpj_fields(self, text: str) -> Dict:
        """Extrai campos essenciais do CNPJ usando regex"""
        result = {
            "empresa": None,
            "cnpj": None,
            "nome_comprovante": None
        }
        
        # CNPJ
        cnpj_patterns = [
            r'(\d{2}\.?\d{3}\.?\d{3}[/\-]?\d{4}[\-\.]?\d{2})',
            r'cnpj[:\s]+(\d{2}\.?\d{3}\.?\d{3}[/\-]?\d{4}[\-\.]?\d{2})'
        ]
        
        for pattern in cnpj_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                cnpj = match.group(1)
                # Validar se tem 14 dígitos
                cnpj_digits = re.sub(r'[^\d]', '', cnpj)
                if len(cnpj_digits) == 14:
                    result["cnpj"] = cnpj
                    break
        
        # Empresa/Razão Social/Nome Fantasia
        empresa_patterns = [
            r'razão social[:\s]+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s\-\.]{5,})',
            r'nome fantasia[:\s]+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s\-\.]{5,})',
            r'empresa[:\s]+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s\-\.]{5,})',
            r'^([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s\-\.]{10,})\s*LTDA',
            r'^([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s\-\.]{10,})\s*S\.?A\.?'
        ]
        
        for pattern in empresa_patterns:
            match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
            if match:
                empresa = match.group(1).strip()
                if len(empresa) >= 5:
                    result["empresa"] = empresa
                    # Se não temos nome_comprovante ainda, usar o mesmo
                    if not result["nome_comprovante"]:
                        result["nome_comprovante"] = empresa
                    break
        
        # Nome do comprovante (pode ser diferente da razão social)
        if not result["nome_comprovante"]:
            # Buscar por linhas que parecem ser nomes de empresa
            lines = text.split('\n')
            for line in lines:
                line = line.strip()
                if (len(line) >= 10 and 
                    re.match(r'^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s\-\.]+$', line) and
                    any(word in line.upper() for word in ['LTDA', 'S.A', 'EIRELI', 'ME', 'EPP'])):
                    result["nome_comprovante"] = line
                    break
        
        return result

    def _extract_address_fields(self, text: str) -> Dict:
        """Extrai campos essenciais do comprovante de endereço usando regex"""
        result = {
            "cep": None,
            "complemento": None
        }
        
        # CEP
        cep_patterns = [
            r'(\d{5}[\-\.]?\d{3})',
            r'cep[:\s]+(\d{5}[\-\.]?\d{3})'
        ]
        
        for pattern in cep_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                cep = match.group(1)
                # Validar se tem 8 dígitos
                cep_digits = re.sub(r'[^\d]', '', cep)
                if len(cep_digits) == 8:
                    result["cep"] = cep
                    break
        
        # Complemento - buscar informações adicionais
        complemento_patterns = [
            r'quadra[:\s]+([A-Z0-9\s\-]+)',
            r'qd[:\s]+([A-Z0-9\s\-]+)',
            r'lote[:\s]+([A-Z0-9\s\-]+)',
            r'lt[:\s]+([A-Z0-9\s\-]+)',
            r'casa[:\s]+([A-Z0-9\s\-]+)',
            r'apartamento[:\s]+([A-Z0-9\s\-]+)',
            r'apto?[:\s]+([A-Z0-9\s\-]+)',
            r'bloco[:\s]+([A-Z0-9\s\-]+)',
            r'complemento[:\s]+([A-Z0-9\s\-]+)'
        ]
        
        complementos = []
        for pattern in complemento_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                comp = match.strip()
                if comp and len(comp) <= 20:  # Evitar textos muito longos
                    complementos.append(comp)
        
        if complementos:
            result["complemento"] = ", ".join(set(complementos))  # Remove duplicatas
        
        return result

    def _validate_essential_fields(self, data: Dict, document_type: str) -> Dict:
        """Valida se os campos essenciais foram extraídos"""
        
        # Limpar valores vazios ou inválidos
        cleaned_data = {}
        for key, value in data.items():
            if value and str(value).strip() and str(value).strip().lower() not in ['null', 'none', '']:
                cleaned_data[key] = str(value).strip()
            else:
                cleaned_data[key] = None
        
        logger.debug(f"Dados limpos para {document_type}: {cleaned_data}")
        return cleaned_data
    
    async def process_all_documents(self, documents: Dict[str, str]) -> Dict:
        """
        Processa todos os documentos do cliente
        
        Args:
            documents: Dicionário com paths dos documentos
                      {'rg': 'path/to/rg.jpg', 'cnpj': 'path/to/cnpj.jpg', ...}
                      
        Returns:
            Dicionário com todos os dados processados
        """
        results = {}
        
        for doc_type, image_path in documents.items():
            if image_path and os.path.exists(image_path):
                result = await self.process_document(image_path, doc_type)
                results[doc_type] = result
            else:
                logger.warning(f"Documento {doc_type} não encontrado: {image_path}")
                results[doc_type] = {
                    'success': False,
                    'error': 'Arquivo não encontrado',
                    'document_type': doc_type
                }
        
        return results
    
    def consolidate_customer_data(self, ocr_results: Dict) -> Dict:
        """
        Consolida dados de todos os documentos em um formato unificado
        
        Args:
            ocr_results: Resultados do OCR de todos os documentos
            
        Returns:
            Dados consolidados do cliente
        """
        consolidated = {
            # Dados da empresa
            'empresa': None,
            'cnpj': None,
            'inscricaoEstadual': None,
            'email': None,
            'telefone': None,
            'celular': None,
            
            # Endereço
            'cep': None,
            'endereco': None,
            'numero': None,
            'complemento': None,
            'bairro': None,
            'cidade': None,
            'uf': None,
            
            # Proprietário
            'nomeCompleto': None,
            'cpf': None,
            'dataNascimento': None,
            'enderecoProprietario': None,
            
            # Metadados
            'confidenceScore': 0,
            'fieldsExtracted': 0,
            'fieldsTotal': 0,
            'needsReview': []
        }
        
        # Processar dados do CNPJ
        if 'cnpj' in ocr_results and ocr_results['cnpj']['success']:
            cnpj_data = ocr_results['cnpj']['parsed_data']
            consolidated.update({
                'empresa': cnpj_data.get('razao_social') or cnpj_data.get('nome_fantasia'),
                'cnpj': cnpj_data.get('cnpj'),
                'inscricaoEstadual': cnpj_data.get('inscricao_estadual'),
                'email': cnpj_data.get('email'),
                'telefone': cnpj_data.get('telefone'),
                'endereco': cnpj_data.get('endereco'),
                'numero': cnpj_data.get('numero'),
                'complemento': cnpj_data.get('complemento'),
                'bairro': cnpj_data.get('bairro'),
                'cidade': cnpj_data.get('cidade'),
                'uf': cnpj_data.get('uf'),
                'cep': cnpj_data.get('cep')
            })
        
        # Processar dados do RG
        if 'rg' in ocr_results and ocr_results['rg']['success']:
            rg_data = ocr_results['rg']['parsed_data']
            consolidated.update({
                'nomeCompleto': rg_data.get('nome_completo'),
                'cpf': rg_data.get('cpf'),
                'dataNascimento': rg_data.get('data_nascimento')
            })
        
        # Processar comprovante de endereço (complementar/validar endereço)
        if 'address' in ocr_results and ocr_results['address']['success']:
            addr_data = ocr_results['address']['parsed_data']
            # Usar dados do comprovante se não tiver do CNPJ
            if not consolidated['endereco']:
                consolidated.update({
                    'endereco': addr_data.get('endereco'),
                    'numero': addr_data.get('numero'),
                    'complemento': addr_data.get('complemento'),
                    'bairro': addr_data.get('bairro'),
                    'cidade': addr_data.get('cidade'),
                    'uf': addr_data.get('uf'),
                    'cep': addr_data.get('cep')
                })
        
        # Calcular métricas de confiança
        total_fields = len([k for k in consolidated.keys() if not k.startswith('confidence') and not k.startswith('fields') and k != 'needsReview'])
        filled_fields = len([v for v in consolidated.values() if v is not None and v != '' and not str(v).startswith('[') ])
        
        consolidated['fieldsTotal'] = total_fields
        consolidated['fieldsExtracted'] = filled_fields
        consolidated['confidenceScore'] = (filled_fields / total_fields) * 100 if total_fields > 0 else 0
        
        # Identificar campos que precisam revisão
        for key, value in consolidated.items():
            if value and '[REVISAR]' in str(value):
                consolidated['needsReview'].append(key)
        
        return consolidated

    
    def validate_ocr_result(self, result: Dict, document_type: str) -> Dict:
        """
        Valida resultado do OCR focando apenas nos campos essenciais
        """
        if not result.get('success', False):
            return result
        
        parsed_data = result.get('parsed_data', {})
        
        # Critérios de qualidade focados nos campos essenciais
        quality_checks = {
            'rg': {
                'required_fields': ['nome_completo', 'data_nascimento', 'cpf'],
                'min_fields': 2  # Pelo menos 2 dos 3 campos
            },
            'cnpj': {
                'required_fields': ['empresa', 'cnpj', 'nome_comprovante'],
                'min_fields': 2  # Pelo menos 2 dos 3 campos
            },
            'address': {
                'required_fields': ['cep', 'complemento'],
                'min_fields': 1  # Pelo menos CEP
            }
        }
        
        if document_type not in quality_checks:
            return result
        
        checks = quality_checks[document_type]
        
        # Contar campos válidos
        valid_fields = 0
        missing_required = []
        found_fields = []
        
        for field in checks['required_fields']:
            value = parsed_data.get(field)
            if value and str(value).strip() and str(value) not in ['[ILEGÍVEL]', '[REVISAR]', 'null']:
                valid_fields += 1
                found_fields.append(field)
            else:
                missing_required.append(field)
        
        # Calcular score de qualidade
        quality_score = (valid_fields / len(checks['required_fields'])) * 100
        
        # Determinar se resultado é aceitável
        is_acceptable = valid_fields >= checks['min_fields']
        
        # Log detalhado dos resultados
        logger.info(f"Validação {document_type}: {valid_fields}/{len(checks['required_fields'])} campos encontrados")
        logger.info(f"Campos encontrados: {found_fields}")
        logger.info(f"Campos faltando: {missing_required}")
        
        # Adicionar metadados de qualidade
        result['quality_metrics'] = {
            'score': quality_score,
            'valid_fields': valid_fields,
            'total_required': len(checks['required_fields']),
            'found_fields': found_fields,
            'missing_required': missing_required,
            'is_acceptable': is_acceptable,
            'needs_retry': not is_acceptable
        }
        
        # Se qualidade insuficiente, marcar como falha
        if not is_acceptable:
            result['success'] = False
            result['error'] = f'Apenas {valid_fields}/{len(checks["required_fields"])} campos essenciais extraídos. Mínimo: {checks["min_fields"]}'
            result['retry_reason'] = 'insufficient_essential_fields'
            logger.warning(f"Documento {document_type} rejeitado: qualidade insuficiente")
        else:
            logger.info(f"Documento {document_type} aprovado: qualidade suficiente ({quality_score:.1f}%)")
        
        return result
