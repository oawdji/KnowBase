from typing import Optional
from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI
from langchain_deepseek import ChatDeepSeek
from langchain_ollama import OllamaLLM
from app.services.llm.llm_config import ChatModelConfig, env_config

class LLMFactory:
    @staticmethod
    def create(
        provider: Optional[str] = None,
        temperature: float = 0,
        streaming: bool = True,
        config: Optional[ChatModelConfig] = None,
    ) -> BaseChatModel:
        """
        Create a LLM instance based on the provider.

        config 优先：由「模型设置」页面（数据库）解析而来；
        未传 config 时按原行为从 .env 读取（CHAT_PROVIDER 决定服务商）。
        """
        cfg = config if config is not None else env_config(provider)
        name = (provider or cfg.provider).lower()

        if name == "openai":
            return ChatOpenAI(
                temperature=temperature,
                streaming=streaming,
                model=cfg.model,
                openai_api_key=cfg.api_key,
                openai_api_base=cfg.api_base
            )
        elif name == "deepseek":
            return ChatDeepSeek(
                temperature=temperature,
                streaming=streaming,
                model=cfg.model,
                api_key=cfg.api_key,
                api_base=cfg.api_base
            )
        elif name == "ollama":
            # Initialize Ollama model
            return OllamaLLM(
                model=cfg.model,
                base_url=cfg.api_base,
                temperature=temperature,
                streaming=streaming
            )
        elif name == "minimax":
            # MiniMax API requires temperature in (0.0, 1.0]; clamp to [0.01, 1.0]
            clamped_temperature = max(0.01, min(temperature, 1.0))
            return ChatOpenAI(
                temperature=clamped_temperature,
                streaming=streaming,
                model=cfg.model,
                openai_api_key=cfg.api_key,
                openai_api_base=cfg.api_base
            )
        # Add more providers here as needed
        # elif provider.lower() == "anthropic":
        #     return ChatAnthropic(...)
        else:
            raise ValueError(f"不支持的对话模型服务商：{name}")
