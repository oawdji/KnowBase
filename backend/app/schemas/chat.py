from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class MessageBase(BaseModel):
    content: str
    role: str

class MessageCreate(MessageBase):
    chat_id: int

class MessageResponse(MessageBase):
    id: int
    chat_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ChatBase(BaseModel):
    # 标题可空：NULL 表示尚未命名（新建对话时不再要求填写，
    # 首条用户消息落库后由后端自动命名）
    title: Optional[str] = None

class ChatCreate(ChatBase):
    knowledge_base_ids: List[int]

class ChatUpdate(BaseModel):
    """PATCH /api/chat/{id}：两个字段都可选，只更新传入的字段。"""
    title: Optional[str] = None
    knowledge_base_ids: Optional[List[int]] = None

class ChatResponse(ChatBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
    messages: List[MessageResponse] = []
    knowledge_base_ids: List[int] = []

    class Config:
        from_attributes = True 