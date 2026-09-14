from typing import Optional

from pydantic import BaseModel, Field


class ModelSettingsUpdate(BaseModel):
    """旧版单配置接口（PUT /api/settings/model）。
    api_key 省略或传空串表示"保持已有 Key 不变"。"""

    provider: str = Field(..., description="服务商：deepseek / openai / minimax / ollama")
    api_key: Optional[str] = Field(None, description="留空表示不修改已保存的 Key")
    api_base: Optional[str] = None
    model: Optional[str] = None


class ModelProfileCreate(BaseModel):
    """新建一套模型配置。"""

    name: str = Field(..., description="配置名称，如「DeepSeek 主力」")
    provider: str = Field(..., description="服务商：deepseek / openai / minimax / ollama")
    api_key: Optional[str] = Field(None, description="服务商的 API Key")
    api_base: Optional[str] = Field(None, description="接口地址，留空则用该服务商默认值")
    model: Optional[str] = Field(None, description="模型名称，留空则用该服务商默认值")
    activate: Optional[bool] = Field(
        None,
        description="是否新建后立即切换为当前配置；不传表示「没有其它配置时自动激活」",
    )


class ModelProfileUpdate(BaseModel):
    """编辑一套模型配置：未出现的字段不改动。

    - api_key 省略或传空串 → 保持已保存的 Key 不变
    - api_base / model 传空串 → 清空该字段，回退到 .env 默认值
    """

    name: Optional[str] = None
    provider: Optional[str] = None
    api_key: Optional[str] = None
    api_base: Optional[str] = None
    model: Optional[str] = None


class ModelSettingsTest(BaseModel):
    """测试连通性。字段全部可选，省略的字段使用已保存配置（或 .env 默认值），
    便于"先测试再保存"；传 id 则直接测试已保存的那套配置。"""

    id: Optional[int] = Field(None, description="测试已保存的配置时传入其 id")
    provider: Optional[str] = None
    api_key: Optional[str] = None
    api_base: Optional[str] = None
    model: Optional[str] = None
