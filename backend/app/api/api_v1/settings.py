import asyncio
import time
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.model_profile import ModelProfile
from app.models.user import User
from app.schemas.model_settings import (
    ModelProfileCreate,
    ModelProfileUpdate,
    ModelSettingsTest,
    ModelSettingsUpdate,
)
from app.services.llm.llm_config import (
    SUPPORTED_PROVIDERS,
    ChatModelConfig,
    ProfileError,
    activate_profile,
    create_profile,
    delete_all_profiles,
    delete_profile,
    delete_user_config,
    env_config,
    get_active_profile,
    get_profile,
    profile_payload,
    profile_to_config,
    profiles_payload,
    public_payload,
    resolve_chat_config,
    save_user_config,
    update_profile,
)
from app.services.llm.llm_factory import LLMFactory

router = APIRouter()

TEST_TIMEOUT_SECONDS = 25


def _require_profile(db: Session, user_id: int, profile_id: int) -> ModelProfile:
    row = get_profile(db, user_id, profile_id)
    if row is None:
        raise HTTPException(status_code=404, detail="模型配置不存在")
    return row


# --------------------------------------------------------------------------
# 多配置（推荐使用的接口）
# --------------------------------------------------------------------------

@router.get("/models")
def list_model_profiles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """列出本账号的全部模型配置、当前生效的那套，以及服务商可选项。

    API Key 只返回打码值。
    """
    return profiles_payload(db, current_user.id)


@router.post("/models", status_code=201)
def create_model_profile(
    payload: ModelProfileCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """新建一套模型配置；这是该账号的第一套时自动设为当前配置。"""
    try:
        row = create_profile(
            db=db,
            user_id=current_user.id,
            name=payload.name,
            provider=payload.provider,
            api_key=payload.api_key,
            api_base=payload.api_base,
            model=payload.model,
            activate=payload.activate,
        )
    except ProfileError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return profile_payload(row)


@router.patch("/models/{profile_id}")
def update_model_profile(
    profile_id: int,
    payload: ModelProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """编辑一套模型配置：只更新请求里出现的字段。

    - api_key 省略或留空 → 保持已保存的 Key 不变
    - api_base / model 传空串 → 清空，回退该服务商在 .env 中的默认值
    """
    row = _require_profile(db, current_user.id, profile_id)
    provided = payload.model_fields_set
    try:
        row = update_profile(
            db=db,
            row=row,
            name=payload.name if "name" in provided else None,
            provider=payload.provider if "provider" in provided else None,
            api_key=payload.api_key,
            api_base=payload.api_base if "api_base" in provided else None,
            model=payload.model if "model" in provided else None,
        )
    except ProfileError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return profile_payload(row)


@router.delete("/models/{profile_id}")
def delete_model_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """删除一套模型配置。

    删除的是当前配置时会自动切换到最近更新的另一套；全部删完则回退 .env。
    返回值里的 active_id 表示删除后当前生效的配置。
    """
    row = _require_profile(db, current_user.id, profile_id)
    delete_profile(db, current_user.id, row)
    # 删除后当前生效的配置：删掉的是激活配置时会自动转移，否则保持原样
    active = get_active_profile(db, current_user.id)
    return {
        "status": "success",
        "active_id": active.id if active else None,
        "message": "配置已删除",
    }


@router.delete("/models")
def delete_all_model_profiles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """清空本账号的全部模型配置，回退到 .env 默认值。"""
    deleted = delete_all_profiles(db, current_user.id)
    payload = profiles_payload(db, current_user.id)
    payload["status"] = "success"
    payload["deleted"] = deleted
    payload["message"] = "已清除全部模型配置，回退到 .env 默认值"
    return payload


@router.post("/models/{profile_id}/activate")
def activate_model_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """把某套配置切换为当前使用的配置（幂等）。"""
    row = _require_profile(db, current_user.id, profile_id)
    row = activate_profile(db, current_user.id, row)
    payload = profile_payload(row)
    payload["status"] = "success"
    payload["message"] = f"已切换到「{row.name}」"
    return payload


# --------------------------------------------------------------------------
# 旧版单配置接口：保持原样，现有界面继续可用
# --------------------------------------------------------------------------

@router.get("/model")
def get_model_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """读取当前用户生效的对话模型配置（API Key 只返回打码值）。"""
    return public_payload(db, current_user.id)


@router.put("/model")
def update_model_settings(
    payload: ModelSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """保存对话模型配置；api_key 留空表示保持已保存的 Key 不变。

    多配置模式下，这个接口写入的是**当前激活**的那套配置。
    """
    try:
        save_user_config(
            db=db,
            user_id=current_user.id,
            provider=payload.provider,
            api_key=payload.api_key,
            api_base=payload.api_base,
            model=payload.model,
        )
    except ProfileError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return public_payload(db, current_user.id)


@router.delete("/model")
def reset_model_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """清除本用户的全部模型配置，回退到 .env 默认值。"""
    delete_user_config(db, current_user.id)
    return public_payload(db, current_user.id)


# --------------------------------------------------------------------------
# 测试连接（新旧界面共用）
# --------------------------------------------------------------------------

def _resolve_test_target(
    db: Session,
    user_id: int,
    payload: ModelSettingsTest,
) -> ChatModelConfig:
    """决定这次测试用哪套参数：优先传进来的草稿值，其次已保存的配置。

    传了 id → 以那套已保存配置为基准；否则以当前激活配置为基准。
    """
    if payload.id is not None:
        row = _require_profile(db, user_id, payload.id)
        saved = profile_to_config(row)
    else:
        saved = resolve_chat_config(db, user_id)

    provider = (payload.provider or saved.provider or "").strip().lower()
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"不支持的服务商：{provider}")

    # 换服务商时，已保存的 Key / 地址 / 模型都属于另一家，不能复用
    fallback = env_config(provider)
    same_provider = provider == saved.provider.lower()
    api_key = (
        (payload.api_key or "").strip()
        or (saved.api_key if same_provider else "")
        or fallback.api_key
    )
    api_base = (
        (payload.api_base or "").strip()
        or (saved.api_base if same_provider else "")
        or fallback.api_base
    )
    model = (
        (payload.model or "").strip()
        or (saved.model if same_provider else "")
        or fallback.model
    )

    return ChatModelConfig(
        provider=provider,
        model=model,
        api_base=api_base,
        api_key=api_key,
        source="test",
    )


@router.post("/model/test")
async def test_model_settings(
    payload: ModelSettingsTest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """测试连通性：用传入的值（未传则用已保存配置 / .env 默认值）发一次最小请求。

    无论成功失败都返回 200，由 ok 字段区分，方便前端直接把 message 展示给用户。
    """
    config = _resolve_test_target(db, current_user.id, payload)
    provider, model, api_key = config.provider, config.model, config.api_key
    base_result = {"provider": provider, "model": model}

    if config.requires_key and not api_key:
        return {
            **base_result,
            "ok": False,
            "latency_ms": 0,
            "message": "该服务商需要 API Key，请先填写后再测试。",
        }

    started = time.time()
    try:
        llm = LLMFactory.create(config=config, temperature=0, streaming=False)
        await asyncio.wait_for(llm.ainvoke("ping"), timeout=TEST_TIMEOUT_SECONDS)
        latency_ms = int((time.time() - started) * 1000)
        return {
            **base_result,
            "ok": True,
            "latency_ms": latency_ms,
            "message": f"连接成功，模型响应正常（耗时 {latency_ms} ms）。",
        }
    except asyncio.TimeoutError:
        latency_ms = int((time.time() - started) * 1000)
        return {
            **base_result,
            "ok": False,
            "latency_ms": latency_ms,
            "message": f"连接超时（超过 {TEST_TIMEOUT_SECONDS} 秒），请检查接口地址与网络是否可达。",
        }
    except Exception as e:
        latency_ms = int((time.time() - started) * 1000)
        raw = " ".join(str(e).split())
        if len(raw) > 400:
            raw = raw[:400] + "…"
        return {
            **base_result,
            "ok": False,
            "latency_ms": latency_ms,
            "message": f"{provider} 返回：{raw}",
        }


@router.post("/models/test")
async def test_model_profile(
    payload: ModelSettingsTest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """与 /model/test 相同，供新版界面使用（语义上属于多配置）。"""
    return await test_model_settings(payload, db, current_user)
