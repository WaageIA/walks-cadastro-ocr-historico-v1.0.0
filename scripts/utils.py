import re
import base64
import hashlib
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class DataProcessor:
    """Utilitários para processamento de dados"""
    
    @staticmethod
    def clean_cnpj(cnpj: str) -> str:
        """Remove formatação do CNPJ"""
        if not cnpj:
            return ""
        return re.sub(r'[^\d]', '', cnpj)
    
    @staticmethod
    def format_cnpj(cnpj: str) -> str:
        """Formata CNPJ com máscara"""
        clean = DataProcessor.clean_cnpj(cnpj)
        if len(clean) == 14:
            return f"{clean[:2]}.{clean[2:5]}.{clean[5:8]}/{clean[8:12]}-{clean[12:]}"
        return cnpj
    
    @staticmethod
    def clean_cpf(cpf: str) -> str:
        """Remove formatação do CPF"""
        if not cpf:
            return ""
        return re.sub(r'[^\d]', '', cpf)
    
    @staticmethod
    def format_cpf(cpf: str) -> str:
        """Formata CPF com máscara"""
        clean = DataProcessor.clean_cpf(cpf)
        if len(clean) == 11:
            return f"{clean[:3]}.{clean[3:6]}.{clean[6:9]}-{clean[9:]}"
        return cpf
    
    @staticmethod
    def clean_phone(phone: str) -> str:
        """Remove formatação do telefone"""
        if not phone:
            return ""
        return re.sub(r'[^\d]', '', phone)
    
    @staticmethod
    def format_phone(phone: str) -> str:
        """Formata telefone com máscara"""
        clean = DataProcessor.clean_phone(phone)
        if len(clean) == 11:  # Celular
            return f"({clean[:2]}) {clean[2:7]}-{clean[7:]}"
        elif len(clean) == 10:  # Fixo
            return f"({clean[:2]}) {clean[2:6]}-{clean[6:]}"
        return phone
    
    @staticmethod
    def clean_cep(cep: str) -> str:
        """Remove formatação do CEP"""
        if not cep:
            return ""
        return re.sub(r'[^\d]', '', cep)
    
    @staticmethod
    def format_cep(cep: str) -> str:
        """Formata CEP com máscara"""
        clean = DataProcessor.clean_cep(cep)
        if len(clean) == 8:
            return f"{clean[:5]}-{clean[5:]}"
        return cep
    
    @staticmethod
    def normalize_text(text: str) -> str:
        """Normaliza texto removendo acentos e caracteres especiais"""
        if not text:
            return ""
        
        # Remover acentos
        import unicodedata
        text = unicodedata.normalize('NFD', text)
        text = ''.join(char for char in text if unicodedata.category(char) != 'Mn')
        
        # Converter para maiúsculo e remover espaços extras
        return ' '.join(text.upper().split())

class Validator:
    """Validadores de dados"""
    
    @staticmethod
    def validate_cnpj(cnpj: str) -> Tuple[bool, str]:
        """
        Valida CNPJ usando algoritmo oficial
        
        Returns:
            Tuple[bool, str]: (é_válido, mensagem)
        """
        if not cnpj:
            return False, "CNPJ não informado"
        
        clean = DataProcessor.clean_cnpj(cnpj)
        
        if len(clean) != 14:
            return False, "CNPJ deve ter 14 dígitos"
        
        # Verificar se todos os dígitos são iguais
        if len(set(clean)) == 1:
            return False, "CNPJ inválido"
        
        # Calcular primeiro dígito verificador
        weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        sum1 = sum(int(clean[i]) * weights1[i] for i in range(12))
        digit1 = 11 - (sum1 % 11)
        if digit1 >= 10:
            digit1 = 0
        
        # Calcular segundo dígito verificador
        weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        sum2 = sum(int(clean[i]) * weights2[i] for i in range(13))
        digit2 = 11 - (sum2 % 11)
        if digit2 >= 10:
            digit2 = 0
        
        if int(clean[12]) == digit1 and int(clean[13]) == digit2:
            return True, "CNPJ válido"
        else:
            return False, "CNPJ inválido"
    
    @staticmethod
    def validate_cpf(cpf: str) -> Tuple[bool, str]:
        """
        Valida CPF usando algoritmo oficial
        
        Returns:
            Tuple[bool, str]: (é_válido, mensagem)
        """
        if not cpf:
            return False, "CPF não informado"
        
        clean = DataProcessor.clean_cpf(cpf)
        
        if len(clean) != 11:
            return False, "CPF deve ter 11 dígitos"
        
        # Verificar se todos os dígitos são iguais
        if len(set(clean)) == 1:
            return False, "CPF inválido"
        
        # Calcular primeiro dígito verificador
        sum1 = sum(int(clean[i]) * (10 - i) for i in range(9))
        digit1 = 11 - (sum1 % 11)
        if digit1 >= 10:
            digit1 = 0
        
        # Calcular segundo dígito verificador
        sum2 = sum(int(clean[i]) * (11 - i) for i in range(10))
        digit2 = 11 - (sum2 % 11)
        if digit2 >= 10:
            digit2 = 0
        
        if int(clean[9]) == digit1 and int(clean[10]) == digit2:
            return True, "CPF válido"
        else:
            return False, "CPF inválido"
    
    @staticmethod
    def validate_email(email: str) -> Tuple[bool, str]:
        """Valida formato de email"""
        if not email:
            return False, "Email não informado"
        
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if re.match(pattern, email):
            return True, "Email válido"
        else:
            return False, "Formato de email inválido"
    
    @staticmethod
    def validate_phone(phone: str) -> Tuple[bool, str]:
        """Valida formato de telefone"""
        if not phone:
            return False, "Telefone não informado"
        
        clean = DataProcessor.clean_phone(phone)
        
        if len(clean) in [10, 11]:
            return True, "Telefone válido"
        else:
            return False, "Telefone deve ter 10 ou 11 dígitos"

class SecurityUtils:
    """Utilitários de segurança"""
    
    @staticmethod
    def hash_sensitive_data(data: str) -> str:
        """Gera hash de dados sensíveis"""
        if not data:
            return ""
        
        return hashlib.sha256(data.encode()).hexdigest()
    
    @staticmethod
    def mask_cpf(cpf: str) -> str:
        """Mascara CPF para exibição"""
        if not cpf:
            return ""
        
        clean = DataProcessor.clean_cpf(cpf)
        if len(clean) == 11:
            return f"***.***.{clean[6:9]}-**"
        return cpf
    
    @staticmethod
    def mask_cnpj(cnpj: str) -> str:
        """Mascara CNPJ para exibição"""
        if not cnpj:
            return ""
        
        clean = DataProcessor.clean_cnpj(cnpj)
        if len(clean) == 14:
            return f"**.***.***/****-{clean[12:]}"
        return cnpj
    
    @staticmethod
    def validate_file_type(filename: str, allowed_types: List[str]) -> bool:
        """Valida tipo de arquivo"""
        if not filename:
            return False
        
        ext = '.' + filename.split('.')[-1].lower()
        return ext in allowed_types

class LogUtils:
    """Utilitários de logging"""
    
    @staticmethod
    def log_ocr_request(document_type: str, file_size: int, user_id: str = None):
        """Log de requisição OCR"""
        logger.info(f"OCR Request - Type: {document_type}, Size: {file_size}bytes, User: {user_id or 'anonymous'}")
    
    @staticmethod
    def log_ocr_result(document_type: str, success: bool, confidence: float = None, processing_time: float = None):
        """Log de resultado OCR"""
        status = "SUCCESS" if success else "FAILED"
        logger.info(f"OCR Result - Type: {document_type}, Status: {status}, Confidence: {confidence}, Time: {processing_time}s")
    
    @staticmethod
    def log_validation_error(field: str, value: str, error: str):
        """Log de erro de validação"""
        masked_value = value[:3] + "*" * (len(value) - 3) if len(value) > 3 else "***"
        logger.warning(f"Validation Error - Field: {field}, Value: {masked_value}, Error: {error}")

# Exemplo de uso
if __name__ == "__main__":
    print("=== TESTE DE UTILITÁRIOS ===")
    
    # Teste formatação
    print("\n--- Formatação ---")
    print(f"CNPJ: {DataProcessor.format_cnpj('12345678000190')}")
    print(f"CPF: {DataProcessor.format_cpf('12345678901')}")
    print(f"Telefone: {DataProcessor.format_phone('11999887766')}")
    print(f"CEP: {DataProcessor.format_cep('01234567')}")
    
    # Teste validação
    print("\n--- Validação ---")
    cnpj_valid, cnpj_msg = Validator.validate_cnpj("11.222.333/0001-81")
    print(f"CNPJ: {cnpj_valid} - {cnpj_msg}")
    
    cpf_valid, cpf_msg = Validator.validate_cpf("123.456.789-09")
    print(f"CPF: {cpf_valid} - {cpf_msg}")
    
    email_valid, email_msg = Validator.validate_email("teste@walks.bank")
    print(f"Email: {email_valid} - {email_msg}")
    
    # Teste mascaramento
    print("\n--- Segurança ---")
    print(f"CPF mascarado: {SecurityUtils.mask_cpf('12345678901')}")
    print(f"CNPJ mascarado: {SecurityUtils.mask_cnpj('12345678000190')}")
