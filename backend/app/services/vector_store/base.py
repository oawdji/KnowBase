from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings

class BaseVectorStore(ABC):
    """Abstract base class for vector store implementations"""
    
    @abstractmethod
    def __init__(self, collection_name: str, embedding_function: Embeddings, **kwargs):
        """Initialize the vector store"""
        pass
    
    @abstractmethod
    def add_documents(self, documents: List[Document]) -> None:
        """Add documents to the vector store"""
        pass
    
    @abstractmethod
    def delete(self, ids: List[str]) -> None:
        """Delete documents from the vector store"""
        pass
    
    @abstractmethod
    def as_retriever(self, **kwargs: Any):
        """Return a retriever interface for the vector store"""
        pass
    
    @abstractmethod
    def similarity_search(self, query: str, k: int = 4, **kwargs: Any) -> List[Document]:
        """Search for similar documents"""
        pass
    
    @abstractmethod
    def similarity_search_with_score(self, query: str, k: int = 4, **kwargs: Any) -> List[Document]:
        """Search for similar documents with score"""
        pass

    def similarity_search_with_relevance(
        self, query: str, k: int = 4, **kwargs: Any
    ) -> List[Dict[str, Any]]:
        """检索并额外给出「相关度」，供界面展示。

        每一项的格式为::

            {"document": Document, "score": <向量库原始得分>, "similarity": <余弦相似度或 None>}

        ``similarity`` 是余弦相似度，取值 [-1, 1]，**越大越相关**，可以直接当百分比展示；
        ``score`` 是向量库自己的原始得分，语义随实现而变（Chroma 是平方 L2 距离，越小越相关），
        所以两者都返回，调用方不会被某一种距离度量绑死。

        基类这里只做兜底：不动原始得分，把 similarity 置为 None，表示「本向量库尚未实现相关度
        换算」。调用方看到 None 就只展示原始得分，绝不去猜它的方向——例如 Qdrant 的得分本身
        就是相似度（越大越相关），与 Chroma 恰好相反，猜错就会把结论显示反。
        """
        return [
            {"document": doc, "score": float(score), "similarity": None}
            for doc, score in self.similarity_search_with_score(query, k=k, **kwargs)
        ]

    @abstractmethod
    def delete_collection(self) -> None:
        """Delete the entire collection"""
        pass 