from typing import List, Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from app.db.session import get_db
from app.models.user import User
from app.models.chat import Chat, Message
from app.models.knowledge import KnowledgeBase
from app.schemas.chat import (
    ChatCreate,
    ChatResponse,
    ChatUpdate,
    MessageCreate,
    MessageResponse
)
from app.core.security import get_current_user
from app.services.chat_service import generate_response
from app.services.llm.llm_config import resolve_chat_config

router = APIRouter()

# 与 chats.title 的列宽保持一致
MAX_TITLE_LENGTH = 255


def _normalize_title(raw: Optional[str]) -> Optional[str]:
    """标题入库前的统一处理：折叠空白；纯空白视为「未命名」（None）。"""
    if raw is None:
        return None
    cleaned = " ".join(raw.split())
    return cleaned or None


@router.post("/", response_model=ChatResponse)
def create_chat(
    *,
    db: Session = Depends(get_db),
    chat_in: ChatCreate,
    current_user: User = Depends(get_current_user)
) -> Any:
    # Verify knowledge bases exist and belong to user
    knowledge_bases = (
        db.query(KnowledgeBase)
        .filter(
            KnowledgeBase.id.in_(chat_in.knowledge_base_ids),
            KnowledgeBase.user_id == current_user.id
        )
        .all()
    )
    if len(knowledge_bases) != len(chat_in.knowledge_base_ids):
        raise HTTPException(
            status_code=400,
            detail="存在无效的知识库"
        )
    
    chat = Chat(
        title=_normalize_title(chat_in.title),
        user_id=current_user.id,
    )
    chat.knowledge_bases = knowledge_bases
    
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return chat

@router.patch("/{chat_id}", response_model=ChatResponse)
def update_chat(
    *,
    db: Session = Depends(get_db),
    chat_id: int,
    chat_in: ChatUpdate,
    current_user: User = Depends(get_current_user)
) -> Any:
    """重命名对话（也可用它调整关联的知识库）。

    只更新请求里出现的字段；标题不接受空值，避免把已命名对话变回未命名。
    """
    chat = (
        db.query(Chat)
        .filter(
            Chat.id == chat_id,
            Chat.user_id == current_user.id
        )
        .first()
    )
    if not chat:
        raise HTTPException(status_code=404, detail="对话不存在")

    if chat_in.title is not None:
        title = _normalize_title(chat_in.title)
        if title is None:
            raise HTTPException(status_code=400, detail="对话标题不能为空")
        if len(title) > MAX_TITLE_LENGTH:
            raise HTTPException(
                status_code=400,
                detail=f"对话标题不能超过 {MAX_TITLE_LENGTH} 个字符"
            )
        chat.title = title

    if chat_in.knowledge_base_ids is not None:
        knowledge_bases = (
            db.query(KnowledgeBase)
            .filter(
                KnowledgeBase.id.in_(chat_in.knowledge_base_ids),
                KnowledgeBase.user_id == current_user.id
            )
            .all()
        )
        if len(knowledge_bases) != len(chat_in.knowledge_base_ids):
            raise HTTPException(status_code=400, detail="存在无效的知识库")
        chat.knowledge_bases = knowledge_bases

    db.commit()
    db.refresh(chat)
    return chat

@router.get("/", response_model=List[ChatResponse])
def get_chats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100
) -> Any:
    chats = (
        db.query(Chat)
        .filter(Chat.user_id == current_user.id)
        .offset(skip)
        .limit(limit)
        .all()
    )
    return chats

@router.get("/{chat_id}", response_model=ChatResponse)
def get_chat(
    *,
    db: Session = Depends(get_db),
    chat_id: int,
    current_user: User = Depends(get_current_user)
) -> Any:
    chat = (
        db.query(Chat)
        .filter(
            Chat.id == chat_id,
            Chat.user_id == current_user.id
        )
        .first()
    )
    if not chat:
        raise HTTPException(status_code=404, detail="对话不存在")
    return chat

@router.post("/{chat_id}/messages")
async def create_message(
    *,
    db: Session = Depends(get_db),
    chat_id: int,
    messages: dict,
    current_user: User = Depends(get_current_user)
) -> StreamingResponse:
    chat = (
        db.query(Chat)
        .options(joinedload(Chat.knowledge_bases))
        .filter(
            Chat.id == chat_id,
            Chat.user_id == current_user.id
        )
        .first()
    )
    if not chat:
        raise HTTPException(status_code=404, detail="对话不存在")
    
    # Get the last user message
    last_message = messages["messages"][-1]
    if last_message["role"] != "user":
        raise HTTPException(status_code=400, detail="最后一条消息必须由用户发出")
    
    # Get knowledge base IDs
    knowledge_base_ids = [kb.id for kb in chat.knowledge_bases]

    # 对话模型配置：优先用户在「模型设置」页面保存的配置，其次 .env 默认值
    llm_config = resolve_chat_config(db, current_user.id)

    async def response_stream():
        async for chunk in generate_response(
            query=last_message["content"],
            messages=messages,
            knowledge_base_ids=knowledge_base_ids,
            chat_id=chat_id,
            db=db,
            llm_config=llm_config
        ):
            yield chunk

    return StreamingResponse(
        response_stream(),
        media_type="text/event-stream",
        headers={
            "x-vercel-ai-data-stream": "v1"
        }
    )

@router.delete("/{chat_id}")
def delete_chat(
    *,
    db: Session = Depends(get_db),
    chat_id: int,
    current_user: User = Depends(get_current_user)
) -> Any:
    chat = (
        db.query(Chat)
        .filter(
            Chat.id == chat_id,
            Chat.user_id == current_user.id
        )
        .first()
    )
    if not chat:
        raise HTTPException(status_code=404, detail="对话不存在")
    
    db.delete(chat)
    db.commit()
    return {"status": "success"}