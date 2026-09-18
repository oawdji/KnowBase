import threading

from app.core.config import settings
from langchain_openai import OpenAIEmbeddings
from langchain_ollama import OllamaEmbeddings
from langchain_community.embeddings import DashScopeEmbeddings
from langchain_huggingface import HuggingFaceEmbeddings

# 进程内缓存：向量模型（尤其是本地 HuggingFace 模型）加载一次要十几秒、占几十 MB 内存，
# 而 .env 里的向量配置是全局唯一的（所有用户共用一套），因此整个进程共享一份实例是安全的。
_CACHE: dict = {}

# 并发保护：同步端点跑在线程池里，多个请求可能同时发现缓存为空。
# 没有锁时它们会各自加载一遍，重复付出十几秒与几十 MB 的代价。
_LOCK = threading.Lock()


def _cache_key() -> tuple:
    """缓存键：服务商 + 具体模型（+ 接口地址）。

    带上模型名是为了改了 .env 的模型后不会误用旧实例。
    注意：这里只包含全局配置，不含任何用户信息——向量配置不区分用户。
    """
    provider = settings.EMBEDDINGS_PROVIDER.lower()
    if provider == "openai":
        return (provider, settings.OPENAI_EMBEDDINGS_MODEL, settings.OPENAI_API_BASE)
    if provider == "dashscope":
        return (provider, settings.DASH_SCOPE_EMBEDDINGS_MODEL)
    if provider == "ollama":
        return (provider, settings.OLLAMA_EMBEDDINGS_MODEL, settings.OLLAMA_API_BASE)
    if provider == "huggingface":
        return (provider, settings.HUGGINGFACE_EMBEDDINGS_MODEL)
    return (provider,)


def _build(provider: str):
    """真正创建实例（原 create() 的分支逻辑，行为保持不变）。"""
    if provider == "openai":
        return OpenAIEmbeddings(
            openai_api_key=settings.OPENAI_API_KEY,
            openai_api_base=settings.OPENAI_API_BASE,
            model=settings.OPENAI_EMBEDDINGS_MODEL
        )
    elif provider == "dashscope":
        return DashScopeEmbeddings(
            model=settings.DASH_SCOPE_EMBEDDINGS_MODEL,
            dashscope_api_key=settings.DASH_SCOPE_API_KEY
        )
    elif provider == "ollama":
        return OllamaEmbeddings(
            model=settings.OLLAMA_EMBEDDINGS_MODEL,
            base_url=settings.OLLAMA_API_BASE
        )
    elif provider == "huggingface":
        model_kwargs = {}
        if settings.HUGGINGFACE_API_KEY:
            model_kwargs["token"] = settings.HUGGINGFACE_API_KEY
        return HuggingFaceEmbeddings(
            model_name=settings.HUGGINGFACE_EMBEDDINGS_MODEL,
            model_kwargs=model_kwargs
        )
    else:
        raise ValueError(f"不支持的向量模型服务商：{provider}")


class EmbeddingsFactory:
    @staticmethod
    def create():
        """返回进程内共享的向量模型实例：第一次真正加载，之后直接复用。

        缓存的生命周期 = 进程的生命周期（进程重启后第一次仍会重新加载）。
        """
        key = _cache_key()

        cached = _CACHE.get(key)
        if cached is not None:
            # 快路径：绝大多数请求走这里，无锁、零开销
            return cached

        with _LOCK:
            # 双检：等锁期间可能已有别的线程加载好了
            cached = _CACHE.get(key)
            if cached is None:
                cached = _build(key[0])
                _CACHE[key] = cached
            return cached
