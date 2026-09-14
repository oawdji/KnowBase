from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from langchain_chroma import Chroma
from app.services.vector_store import VectorStoreFactory

from app import models
from app.db.session import get_db
from app.core.security import get_api_key_user
from app.core.config import settings
from app.services.embedding.embedding_factory import EmbeddingsFactory

router = APIRouter()

@router.get("/{knowledge_base_id}/query")
def query_knowledge_base(
    *,
    db: Session = Depends(get_db),
    knowledge_base_id: int,
    query: str,
    top_k: int = 3,
    current_user: models.User = Depends(get_api_key_user),
) -> Any:
    """
    Query a specific knowledge base using API key authentication
    """
    try:
        kb = db.query(models.KnowledgeBase).filter(
            models.KnowledgeBase.id == knowledge_base_id,
            models.KnowledgeBase.user_id == current_user.id
        ).first()
        
        if not kb:
            raise HTTPException(
                status_code=404,
                detail=f"知识库 {knowledge_base_id} 不存在",
            )
        
        embeddings = EmbeddingsFactory.create()
        
        vector_store = VectorStoreFactory.create(
            store_type=settings.VECTOR_STORE_TYPE,
            collection_name=f"kb_{knowledge_base_id}",
            embedding_function=embeddings,
        )
        
        results = vector_store.similarity_search_with_score(query, k=top_k)
        
        response = []
        for doc, score in results:
            response.append({
                "content": doc.page_content,
                "metadata": doc.metadata,
                "score": float(score)
            })
            
        return {"results": response}
        
    except HTTPException:
        # 保留上面抛出的 404 等业务异常，避免被下面的兜底吞成 500
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"检索失败：{str(e)}")