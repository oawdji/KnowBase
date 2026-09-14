from sqlalchemy import (
    Boolean,
    Column,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin


class ModelProfile(Base, TimestampMixin):
    """一套「对话模型配置」（在「模型设置」页面维护）。

    一个用户可以保存多套配置（如「DeepSeek 主力」「公司 OpenAI」「本地 Ollama」），
    其中至多一条 is_active=True，作为该账号对话时实际使用的配置；
    没有激活配置时，对话链路回退到 .env 中的默认值。

    API Key 使用 app/core/crypto.py 加密后存在 api_key 字段。
    """

    __tablename__ = "model_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(100), nullable=False)
    provider = Column(String(50), nullable=False, server_default="deepseek")
    model = Column(String(100))
    api_base = Column(String(255))
    api_key = Column(Text)  # 密文
    is_active = Column(Boolean, nullable=False, default=False, server_default="0")

    user = relationship("User", backref="model_profiles")

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_model_profiles_user_name"),
        Index("ix_model_profiles_user_active", "user_id", "is_active"),
    )
