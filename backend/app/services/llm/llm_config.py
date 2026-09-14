"""对话模型配置：多配置（profile）管理 + 生效配置解析。

优先级：用户当前**激活**的配置（数据库） > .env 默认配置。
数据库中的 API Key 以密文存储，读取时解密。

一个用户可以保存多套配置（如「DeepSeek 主力」「公司 OpenAI」「本地 Ollama」），
至多一条 is_active=True，即为该账号对话时实际使用的配置。
"""
from dataclasses import dataclass
from typing import Dict, List, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.crypto import decrypt_secret, encrypt_secret, mask_secret
from app.models.model_profile import ModelProfile

DEFAULT_PROFILE_NAME = "默认配置"
MAX_PROFILE_NAME_LENGTH = 100


class ProfileError(ValueError):
    """用户可见的配置错误，接口层统一转成 HTTP 400。"""


class ProfileNotFound(LookupError):
    """配置不存在或不属于当前用户，接口层统一转成 HTTP 404。"""


@dataclass
class ChatModelConfig:
    provider: str
    model: str
    api_base: Optional[str]
    api_key: str
    source: str  # "user"（模型设置） | "env"（.env 默认） | "test"（仅测试连接）
    profile_id: Optional[int] = None
    profile_name: Optional[str] = None

    @property
    def requires_key(self) -> bool:
        return self.provider.lower() != "ollama"


PROVIDERS: List[Dict] = [
    {
        "value": "deepseek",
        "label": "DeepSeek",
        "default_model": settings.DEEPSEEK_MODEL,
        "default_api_base": settings.DEEPSEEK_API_BASE,
        "requires_key": True,
    },
    {
        "value": "openai",
        "label": "OpenAI",
        "default_model": settings.OPENAI_MODEL,
        "default_api_base": settings.OPENAI_API_BASE,
        "requires_key": True,
    },
    {
        "value": "minimax",
        "label": "MiniMax",
        "default_model": settings.MINIMAX_MODEL,
        "default_api_base": settings.MINIMAX_API_BASE,
        "requires_key": True,
    },
    {
        "value": "ollama",
        "label": "Ollama（本地）",
        "default_model": settings.OLLAMA_MODEL,
        "default_api_base": settings.OLLAMA_API_BASE,
        "requires_key": False,
    },
]

SUPPORTED_PROVIDERS = {p["value"] for p in PROVIDERS}


def env_config(provider: Optional[str] = None) -> ChatModelConfig:
    """取 .env 中某个服务商的配置（provider 为空时取 CHAT_PROVIDER）。"""
    name = (provider or settings.CHAT_PROVIDER or "deepseek").lower()
    if name == "openai":
        return ChatModelConfig(name, settings.OPENAI_MODEL, settings.OPENAI_API_BASE, settings.OPENAI_API_KEY, "env")
    if name == "minimax":
        return ChatModelConfig(name, settings.MINIMAX_MODEL, settings.MINIMAX_API_BASE, settings.MINIMAX_API_KEY, "env")
    if name == "ollama":
        return ChatModelConfig(name, settings.OLLAMA_MODEL, settings.OLLAMA_API_BASE, "", "env")
    return ChatModelConfig("deepseek", settings.DEEPSEEK_MODEL, settings.DEEPSEEK_API_BASE, settings.DEEPSEEK_API_KEY, "env")


def is_real_key(value: Optional[str]) -> bool:
    """判断是否为真正配置过的 Key（.env 里的 your-xxx-here 占位符不算）。"""
    if not value:
        return False
    return not value.strip().lower().startswith("your-")


# --------------------------------------------------------------------------
# 查询
# --------------------------------------------------------------------------

def list_profiles(db: Session, user_id: int) -> List[ModelProfile]:
    """该用户的全部配置：激活的排最前，其余按创建顺序。"""
    return (
        db.query(ModelProfile)
        .filter(ModelProfile.user_id == user_id)
        .order_by(ModelProfile.is_active.desc(), ModelProfile.id.asc())
        .all()
    )


def get_profile(db: Session, user_id: int, profile_id: int) -> Optional[ModelProfile]:
    return (
        db.query(ModelProfile)
        .filter(ModelProfile.id == profile_id, ModelProfile.user_id == user_id)
        .first()
    )


def get_active_profile(db: Session, user_id: int) -> Optional[ModelProfile]:
    return (
        db.query(ModelProfile)
        .filter(
            ModelProfile.user_id == user_id,
            ModelProfile.is_active.is_(True),
        )
        .order_by(ModelProfile.id.asc())
        .first()
    )


def profile_to_config(row: ModelProfile) -> ChatModelConfig:
    """把一条配置转成对话链路使用的配置；缺项回退到该服务商在 .env 中的值。"""
    provider = (row.provider or settings.CHAT_PROVIDER or "deepseek").lower()
    fallback = env_config(provider)
    return ChatModelConfig(
        provider=provider,
        model=(row.model or "").strip() or fallback.model,
        api_base=(row.api_base or "").strip() or fallback.api_base,
        api_key=decrypt_secret(row.api_key) or fallback.api_key,
        source="user",
        profile_id=row.id,
        profile_name=row.name,
    )


def resolve_chat_config(db: Session, user_id: Optional[int] = None) -> ChatModelConfig:
    """对话链路实际使用的配置：当前激活的配置优先，没有则回退 .env。"""
    if not user_id:
        return env_config()
    row = get_active_profile(db, user_id)
    if not row:
        return env_config()
    return profile_to_config(row)


# --------------------------------------------------------------------------
# 校验与规范化
# --------------------------------------------------------------------------

def _normalize_name(raw: Optional[str]) -> str:
    name = " ".join((raw or "").split())
    if not name:
        raise ProfileError("配置名称不能为空")
    if len(name) > MAX_PROFILE_NAME_LENGTH:
        raise ProfileError(f"配置名称不能超过 {MAX_PROFILE_NAME_LENGTH} 个字符")
    return name


def _normalize_provider(raw: Optional[str]) -> str:
    name = (raw or "").strip().lower()
    if name not in SUPPORTED_PROVIDERS:
        raise ProfileError(f"不支持的服务商：{raw}")
    return name


def _normalize_api_base(raw: Optional[str]) -> Optional[str]:
    value = (raw or "").strip()
    if not value:
        return None
    if not value.lower().startswith(("http://", "https://")):
        raise ProfileError("接口地址需以 http:// 或 https:// 开头")
    return value


def _unique_name(db: Session, user_id: int, base: str) -> str:
    """避免重名：占用时依次尝试「默认配置 2」「默认配置 3」…"""
    name = base
    suffix = 2
    while (
        db.query(ModelProfile)
        .filter(ModelProfile.user_id == user_id, ModelProfile.name == name)
        .first()
    ):
        name = f"{base} {suffix}"
        suffix += 1
    return name


def _deactivate_others(db: Session, user_id: int, keep_id: Optional[int] = None) -> None:
    query = db.query(ModelProfile).filter(
        ModelProfile.user_id == user_id,
        ModelProfile.is_active.is_(True),
    )
    if keep_id is not None:
        query = query.filter(ModelProfile.id != keep_id)
    query.update({"is_active": False}, synchronize_session="fetch")


# --------------------------------------------------------------------------
# 增删改
# --------------------------------------------------------------------------

def create_profile(
    db: Session,
    user_id: int,
    name: Optional[str],
    provider: Optional[str],
    api_key: Optional[str] = None,
    api_base: Optional[str] = None,
    model: Optional[str] = None,
    activate: Optional[bool] = None,
) -> ModelProfile:
    """新建一套配置。

    activate：True 新建即切换过去；False 保持当前配置不变；
    None（默认）表示"没有其它配置时自动激活"。
    """
    clean_name = _normalize_name(name)
    clean_provider = _normalize_provider(provider)
    key = (api_key or "").strip()

    row = ModelProfile(
        user_id=user_id,
        name=clean_name,
        provider=clean_provider,
        api_key=encrypt_secret(key) if key else None,
        api_base=_normalize_api_base(api_base),
        model=(model or "").strip() or None,
    )

    has_other = (
        db.query(ModelProfile).filter(ModelProfile.user_id == user_id).count() > 0
    )
    row.is_active = bool(activate) if has_other else True
    if row.is_active and has_other:
        _deactivate_others(db, user_id)

    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ProfileError(f"配置名称已存在：{clean_name}")
    db.refresh(row)
    return row


def update_profile(
    db: Session,
    row: ModelProfile,
    name: Optional[str] = None,
    provider: Optional[str] = None,
    api_key: Optional[str] = None,
    api_base: Optional[str] = None,
    model: Optional[str] = None,
) -> ModelProfile:
    """更新一套配置。字段为 None 表示不改动；api_key 传空串也表示保持原 Key 不变。"""
    if name is not None:
        clean_name = _normalize_name(name)
        if clean_name != row.name:
            duplicated = (
                db.query(ModelProfile)
                .filter(
                    ModelProfile.user_id == row.user_id,
                    ModelProfile.name == clean_name,
                    ModelProfile.id != row.id,
                )
                .first()
            )
            if duplicated:
                raise ProfileError(f"配置名称已存在：{clean_name}")
            row.name = clean_name

    if provider is not None:
        clean_provider = _normalize_provider(provider)
        if clean_provider != (row.provider or "").lower() and not (api_key or "").strip():
            # 切换服务商但没填新 Key：旧的 Key 属于另一家服务商，必须清掉，
            # 否则会拿旧 Key 去请求新服务商（与 /model/test 的行为保持一致）
            row.api_key = None
        row.provider = clean_provider

    if (api_key or "").strip():
        row.api_key = encrypt_secret(api_key.strip())

    if api_base is not None:
        row.api_base = _normalize_api_base(api_base)

    if model is not None:
        row.model = (model or "").strip() or None

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ProfileError("配置名称已存在")
    db.refresh(row)
    return row


def activate_profile(db: Session, user_id: int, row: ModelProfile) -> ModelProfile:
    """把某套配置设为当前使用的配置（幂等）。"""
    _deactivate_others(db, user_id, keep_id=row.id)
    row.is_active = True
    db.commit()
    db.refresh(row)
    return row


def delete_profile(db: Session, user_id: int, row: ModelProfile) -> Optional[ModelProfile]:
    """删除一套配置。

    删掉的是当前激活配置时，自动把最近更新的一套设为激活（不静默回退 .env），
    返回新的激活配置；没有其它配置时返回 None（此时回退 .env 默认值）。
    """
    was_active = bool(row.is_active)
    db.delete(row)
    db.commit()

    if not was_active:
        return None

    nxt = (
        db.query(ModelProfile)
        .filter(ModelProfile.user_id == user_id)
        .order_by(ModelProfile.updated_at.desc(), ModelProfile.id.desc())
        .first()
    )
    if nxt is None:
        return None
    return activate_profile(db, user_id, nxt)


def delete_all_profiles(db: Session, user_id: int) -> int:
    """清空该用户的全部配置（「恢复默认」），回退 .env。"""
    count = (
        db.query(ModelProfile)
        .filter(ModelProfile.user_id == user_id)
        .delete(synchronize_session="fetch")
    )
    db.commit()
    return count


# --------------------------------------------------------------------------
# 给前端的视图
# --------------------------------------------------------------------------

def profile_payload(row: ModelProfile) -> Dict:
    """单套配置的视图：Key 只返回打码值。"""
    provider = (row.provider or "").lower()
    key = decrypt_secret(row.api_key)
    key_is_real = is_real_key(key)
    env_key_is_real = is_real_key(env_config(provider).api_key)
    return {
        "id": row.id,
        "name": row.name,
        "provider": provider,
        "model": row.model or "",
        "api_base": row.api_base or "",
        "api_key_set": key_is_real,
        "api_key_masked": mask_secret(key) if key_is_real else None,
        "api_key_source": "profile" if key_is_real else ("env" if env_key_is_real else None),
        "is_active": bool(row.is_active),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def profiles_payload(db: Session, user_id: int) -> Dict:
    """「模型设置」页面需要的全部数据。"""
    rows = list_profiles(db, user_id)
    active = next((row for row in rows if row.is_active), None)
    current = profile_to_config(active) if active else env_config()
    env_default = env_config()
    current_key_is_real = is_real_key(current.api_key)

    return {
        "items": [profile_payload(row) for row in rows],
        "active_id": active.id if active else None,
        "current": {
            "provider": current.provider,
            "model": current.model,
            "api_base": current.api_base,
            "api_key_set": current_key_is_real,
            "api_key_masked": mask_secret(current.api_key) if current_key_is_real else None,
            "source": current.source,
            "profile_id": current.profile_id,
            "profile_name": current.profile_name,
        },
        "providers": PROVIDERS,
        "embeddings": {
            "provider": settings.EMBEDDINGS_PROVIDER,
            "model": settings.HUGGINGFACE_EMBEDDINGS_MODEL
            if settings.EMBEDDINGS_PROVIDER.lower() == "huggingface"
            else settings.OPENAI_EMBEDDINGS_MODEL,
            "managed_by": ".env",
        },
        "vector_store": settings.VECTOR_STORE_TYPE,
        "env_defaults": {
            "provider": env_default.provider,
            "model": env_default.model,
            "api_key_set": is_real_key(env_default.api_key),
        },
    }


def public_payload(db: Session, user_id: int) -> Dict:
    """旧版单配置视图（GET /api/settings/model），保持字段不变以兼容现有界面。"""
    current = resolve_chat_config(db, user_id)
    env_default = env_config()
    active = get_active_profile(db, user_id)
    current_key_is_real = is_real_key(current.api_key)

    return {
        "provider": current.provider,
        "model": current.model,
        "api_base": current.api_base,
        "api_key_set": current_key_is_real,
        "api_key_masked": mask_secret(current.api_key) if current_key_is_real else None,
        "source": "user" if active else "env",
        "providers": PROVIDERS,
        "embeddings": {
            "provider": settings.EMBEDDINGS_PROVIDER,
            "model": settings.HUGGINGFACE_EMBEDDINGS_MODEL
            if settings.EMBEDDINGS_PROVIDER.lower() == "huggingface"
            else settings.OPENAI_EMBEDDINGS_MODEL,
            "managed_by": ".env",
        },
        "vector_store": settings.VECTOR_STORE_TYPE,
        "env_defaults": {
            "provider": env_default.provider,
            "model": env_default.model,
            "api_key_set": is_real_key(env_default.api_key),
        },
    }


# --------------------------------------------------------------------------
# 旧版单配置接口的写入语义（写入「当前激活」的那条）
# --------------------------------------------------------------------------

def save_user_config(
    db: Session,
    user_id: int,
    provider: str,
    api_key: Optional[str] = None,
    api_base: Optional[str] = None,
    model: Optional[str] = None,
) -> ChatModelConfig:
    """兼容 PUT /api/settings/model：写入当前激活的配置，没有就新建一条并激活。"""
    clean_provider = _normalize_provider(provider)
    row = get_active_profile(db, user_id)

    if row is None:
        row = create_profile(
            db=db,
            user_id=user_id,
            name=_unique_name(db, user_id, DEFAULT_PROFILE_NAME),
            provider=clean_provider,
            api_key=api_key,
            api_base=api_base,
            model=model,
            activate=True,
        )
        return profile_to_config(row)

    update_profile(
        db=db,
        row=row,
        provider=clean_provider,
        api_key=api_key,
        api_base=api_base,
        model=model,
    )
    return profile_to_config(row)


def delete_user_config(db: Session, user_id: int) -> None:
    """兼容 DELETE /api/settings/model：清空全部配置，回退 .env。"""
    delete_all_profiles(db, user_id)
