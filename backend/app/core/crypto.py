"""对称加密工具：用于加密存储用户在界面上配置的第三方 API Key。

加密密钥由 SECRET_KEY 派生（SHA-256 → Fernet），因此：
- 修改 SECRET_KEY 会导致已保存的密文无法解密，此时 decrypt_secret 返回空串（等同未配置）；
- 兼容历史明文数据：解密失败时若不像密文则原样返回。
"""
import base64
import hashlib
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


def _fernet() -> Fernet:
    digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plain: Optional[str]) -> str:
    """加密明文；空值原样返回空串，表示"未配置"。"""
    if not plain:
        return ""
    return _fernet().encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: Optional[str]) -> str:
    """解密密文；空值返回空串，无法解密时返回空串（避免把密文当明文使用）。"""
    if not token:
        return ""
    try:
        return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        # Fernet 密文固定以 gAAAAA 开头；否则视为历史明文数据
        return "" if token.startswith("gAAAAA") else token
    except Exception:
        return ""


def mask_secret(secret: Optional[str], head: int = 6, tail: int = 4) -> Optional[str]:
    """把密钥打码成 sk-8181…27d1，用于回显给前端（永不返回完整密钥）。"""
    if not secret:
        return None
    if len(secret) <= head + tail:
        return f"{secret[:2]}…{secret[-2:]}" if len(secret) > 4 else "…"
    return f"{secret[:head]}…{secret[-tail:]}"
