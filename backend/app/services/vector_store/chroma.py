from typing import List, Any, Dict
import numpy as np
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_chroma import Chroma
import chromadb 
from app.core.config import settings

from .base import BaseVectorStore

class ChromaVectorStore(BaseVectorStore):
    """Chroma vector store implementation"""
    
    def __init__(self, collection_name: str, embedding_function: Embeddings, **kwargs):
        """Initialize Chroma vector store"""
        chroma_client = chromadb.HttpClient(
            host=settings.CHROMA_DB_HOST,
            port=settings.CHROMA_DB_PORT,
        )
        
        self._store = Chroma(
            client=chroma_client,
            collection_name=collection_name,
            embedding_function=embedding_function,
        )
        # 换算相关度时要用它把查询语句向量化，留一份引用省得再从 _store 内部掏
        self._embeddings = embedding_function

    def add_documents(self, documents: List[Document]) -> None:
        """Add documents to Chroma"""
        self._store.add_documents(documents)
    
    def delete(self, ids: List[str]) -> None:
        """Delete documents from Chroma"""
        self._store.delete(ids)
    
    def as_retriever(self, **kwargs: Any):
        """Return a retriever interface"""
        return self._store.as_retriever(**kwargs)
    
    def similarity_search(self, query: str, k: int = 4, **kwargs: Any) -> List[Document]:
        """Search for similar documents in Chroma"""
        return self._store.similarity_search(query, k=k, **kwargs)
    
    def similarity_search_with_score(self, query: str, k: int = 4, **kwargs: Any) -> List[Document]:
        """Search for similar documents in Chroma with score"""
        return self._store.similarity_search_with_score(query, k=k, **kwargs)

    def similarity_search_with_relevance(
        self, query: str, k: int = 4, **kwargs: Any
    ) -> List[Dict[str, Any]]:
        """检索并算出**精确**的余弦相似度，供界面展示「相关度」。

        为什么要自己算，而不是拿距离换算：
        Chroma 的 score 是「平方 L2 距离」。只有当向量是单位长度时，它才满足
        ``距离 = 2 - 2 * 余弦``；一旦换成不归一化的向量模型（例如某些 Ollama 模型），
        这个关系就失效，换算出来的「相关度」会变成负数或超过 100%。所以这里直接按余弦的
        定义算：取回命中文档的原始向量，和查询向量做点积再各自除以模长，对任何向量模型都成立。

        顺带一次查询就把文本、元数据、原始距离、原始向量都拿了回来，不需要把文档重新向量化。
        """
        query_vector = np.asarray(self._embeddings.embed_query(query), dtype=np.float64)
        query_norm = float(np.linalg.norm(query_vector))
        if query_norm == 0.0:
            # 零向量没有方向，余弦无定义；正常模型不会出现，这里只是兜底
            return []

        raw = self._store._collection.query(
            query_embeddings=[query_vector.tolist()],
            n_results=k,
            include=["documents", "metadatas", "distances", "embeddings"],
        )

        # Chroma 返回的是「每个查询一组结果」的嵌套结构，这里只查了一个查询，取第 0 组
        documents = (raw.get("documents") or [[]])[0]
        metadatas = (raw.get("metadatas") or [[]])[0]
        distances = (raw.get("distances") or [[]])[0]
        vectors = (raw.get("embeddings") or [[]])[0]

        results: List[Dict[str, Any]] = []
        for index, content in enumerate(documents):
            metadata = metadatas[index] if index < len(metadatas) else None
            distance = float(distances[index]) if index < len(distances) else 0.0

            similarity = None
            vector = vectors[index] if index < len(vectors) else None
            if vector is not None:
                vector_array = np.asarray(vector, dtype=np.float64)
                denominator = float(np.linalg.norm(vector_array)) * query_norm
                if denominator > 0.0:
                    similarity = float(np.dot(query_vector, vector_array) / denominator)

            results.append({
                "document": Document(page_content=content, metadata=metadata or {}),
                "score": distance,
                "similarity": similarity,
            })

        return results

    def delete_collection(self) -> None:
        """Delete the entire collection"""
        self._store._client.delete_collection(self._store._collection.name) 