import json
import base64
import asyncio
import logging
from typing import List, AsyncGenerator, Optional, Tuple
from sqlalchemy.orm import Session
from langchain_openai import ChatOpenAI
from langchain.chains import create_history_aware_retriever, create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder, PromptTemplate
from langchain_core.messages import HumanMessage, AIMessage
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.chat import Chat, Message
from app.models.knowledge import KnowledgeBase, Document
from app.services.vector_store import VectorStoreFactory
from app.services.embedding.embedding_factory import EmbeddingsFactory
from app.services.llm.llm_factory import LLMFactory

logger = logging.getLogger(__name__)

# 注意：这里不要开启 LangChain 的全局 verbose/debug。
# set_debug(True) 会往每个回调管理器挂一个 ConsoleCallbackHandler，
# 而它内部是 BaseTracer(function=print) —— 直接 print 到 stdout，绕过 logging 配置
# （logging.basicConfig(level=INFO) 拦不住）。实测一次 625 字回答、2010 字上下文
# 会产生 21KB 同步 stdout 写入；真实模型逐 token 触发，且在事件循环线程里阻塞 I/O，
# 会明显拖慢流式输出。

# 对话标题相关
PLACEHOLDER_TITLE = "新对话"  # 前端在 title 为 NULL 时显示的占位名
MAX_TITLE_LENGTH = 255  # 与 chats.title 列宽一致
TITLE_PROMPT = (
    "请为下面这段用户提问起一个简洁的对话标题，作为会话列表中的名称。\n"
    "要求：不超过 15 个字，与提问使用同一种语言，"
    "只输出标题本身，不要引号、书名号、句号，也不要任何解释。\n\n"
    "用户提问：{question}"
)


def _truncate_title(text: str, limit: int) -> str:
    """把文本压成单行并截断，作为标题使用。"""
    cleaned = " ".join((text or "").split())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[:limit].rstrip() + "…"


def _derive_title(query: str) -> str:
    """兜底标题：直接截断用户的第一条提问。永远能成功，不依赖模型。"""
    return _truncate_title(query, settings.CHAT_TITLE_MAX_LENGTH) or PLACEHOLDER_TITLE


async def _generate_title_with_llm(query: str, llm_config) -> Optional[str]:
    """调用对话模型生成更贴切的标题；任何失败都返回 None（保留兜底标题）。"""
    try:
        llm = LLMFactory.create(config=llm_config, temperature=0, streaming=False)
        response = await asyncio.wait_for(
            llm.ainvoke(TITLE_PROMPT.format(question=_truncate_title(query, 500))),
            timeout=settings.CHAT_TITLE_LLM_TIMEOUT,
        )
        raw = getattr(response, "content", "") or ""
        # 模型偶尔会带上引号或结尾标点，清掉
        title = _truncate_title(str(raw), 20).strip("《》\"'“”‘’。，,、:：")
        return title or None
    except Exception as exc:  # 标题是锦上添花，失败不能影响对话
        logger.warning(f"生成对话标题失败，保留截断标题：{exc}")
        return None


def _claim_auto_title(db: Session, chat_id: int, title: str) -> bool:
    """把自动标题写入仍处于「未命名」状态的对话。

    返回 False 表示对话已有标题（用户改过名或已自动命名），此时不覆盖。
    """
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if chat is None or (chat.title or "").strip():
        return False
    chat.title = title[:MAX_TITLE_LENGTH]
    db.commit()
    return True


async def _refine_title_in_background(
    chat_id: int,
    query: str,
    llm_config,
    fallback_title: str,
) -> None:
    """后台把兜底标题换成模型生成的标题。

    使用独立数据库会话：请求会话在流结束后就被关闭了。
    只有标题仍等于本次写入的兜底标题时才覆盖，避免盖掉用户手动改的名字。
    """
    db = SessionLocal()
    try:
        title = await _generate_title_with_llm(query, llm_config)
        if not title or title == fallback_title:
            return
        chat = db.query(Chat).filter(Chat.id == chat_id).first()
        if chat is None or (chat.title or "") != fallback_title:
            return
        chat.title = title[:MAX_TITLE_LENGTH]
        db.commit()
    except Exception as exc:
        logger.warning(f"优化对话标题失败：{exc}")
    finally:
        db.close()


async def _auto_name_chat(
    db: Session,
    chat_id: int,
    query: str,
    llm_config,
) -> Optional[Tuple[str, bool]]:
    """首条用户消息时自动给对话命名。

    返回 (写入的标题, 是否已安排后台优化)；无需命名时返回 None。
    """
    current_title = db.query(Chat.title).filter(Chat.id == chat_id).scalar()
    if (current_title or "").strip():
        # 已经命名过（含用户手动改名）→ 不再自动命名
        return None

    user_message_count = (
        db.query(Message)
        .filter(Message.chat_id == chat_id, Message.role == "user")
        .count()
    )
    if user_message_count != 1:
        # 只有第一条用户消息触发自动命名（也兼容历史遗留的未命名对话）
        return None

    fallback_title = _derive_title(query)
    if not _claim_auto_title(db, chat_id, fallback_title):
        return None

    refining = False
    if settings.CHAT_TITLE_LLM and llm_config is not None:
        asyncio.create_task(
            _refine_title_in_background(chat_id, query, llm_config, fallback_title)
        )
        refining = True

    return fallback_title, refining

def _friendly_error_message(error: Exception) -> str:
    """把模型/网络异常转成用户能看懂、且知道下一步做什么的中文提示。"""
    raw = " ".join(str(error).split())
    if len(raw) > 500:
        raw = raw[:500] + "…"
    lowered = raw.lower()
    hint = "请到「模型设置」检查 API Key、接口地址与模型名称是否正确。"

    if any(k in lowered for k in ("401", "authentication", "invalid_api_key", "incorrect api key", "unauthorized")):
        return f"对话模型鉴权失败：{raw} {hint}"
    if any(k in lowered for k in ("insufficient", "balance", "quota", "402")):
        return f"对话模型额度不足：{raw} 请检查服务商账户余额。"
    if "timeout" in lowered or "timed out" in lowered:
        return f"对话模型请求超时：{raw} {hint}"
    if "connect" in lowered or "connection" in lowered:
        return f"无法连接对话模型服务：{raw} {hint}"
    return f"对话模型调用失败：{raw} {hint}"


async def generate_response(
    query: str,
    messages: dict,
    knowledge_base_ids: List[int],
    chat_id: int,
    db: Session,
    llm_config=None
) -> AsyncGenerator[str, None]:
    try:
        # Create user message
        user_message = Message(
            content=query,
            role="user",
            chat_id=chat_id
        )
        db.add(user_message)
        db.commit()

        # 首条消息 → 自动命名对话（用户已命名则跳过）。
        # 标题帧在回答之前推给前端，标题栏可以立刻更新。
        try:
            auto_title = await _auto_name_chat(db, chat_id, query, llm_config)
        except Exception as naming_error:
            # 命名失败绝不能影响正常对话，回滚以免会话处于不可用状态
            logger.warning(f"自动命名对话失败，跳过：{naming_error}")
            db.rollback()
            auto_title = None

        if auto_title:
            title, refining = auto_title
            yield "2:{payload}\n".format(
                payload=json.dumps(
                    [{"type": "chat_title", "title": title, "refining": refining}],
                    ensure_ascii=False,
                )
            )
        
        # Create bot message placeholder
        bot_message = Message(
            content="",
            role="assistant",
            chat_id=chat_id
        )
        db.add(bot_message)
        db.commit()
        
        # Get knowledge bases and their documents
        knowledge_bases = (
            db.query(KnowledgeBase)
            .filter(KnowledgeBase.id.in_(knowledge_base_ids))
            .all()
        )
        
        # Initialize embeddings
        embeddings = EmbeddingsFactory.create()
        
        # Create a vector store for each knowledge base
        vector_stores = []
        for kb in knowledge_bases:
            documents = db.query(Document).filter(Document.knowledge_base_id == kb.id).all()
            if documents:
                # Use the factory to create the appropriate vector store
                vector_store = VectorStoreFactory.create(
                    store_type=settings.VECTOR_STORE_TYPE,  # 'chroma' or other supported types
                    collection_name=f"kb_{kb.id}",
                    embedding_function=embeddings,
                )
                # count() 是一次额外的向量库往返，只在真的开 DEBUG 日志时才查
                if logger.isEnabledFor(logging.DEBUG):
                    logger.debug(f"Collection kb_{kb.id} count: {vector_store._store._collection.count()}")
                vector_stores.append(vector_store)
        
        if not vector_stores:
            error_msg = "I don't have any knowledge base to help answer your question."
            yield f'0:"{error_msg}"\n'
            yield 'd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n'
            bot_message.content = error_msg
            db.commit()
            return
        
        # Use first vector store for now
        retriever = vector_stores[0].as_retriever()
        
        # Initialize the language model（优先使用「模型设置」里保存的配置）
        llm = LLMFactory.create(config=llm_config)
        
        # Create contextualize question prompt
        contextualize_q_system_prompt = (
            "Given a chat history and the latest user question "
            "which might reference context in the chat history, "
            "formulate a standalone question which can be understood "
            "without the chat history. Do NOT answer the question, just "
            "reformulate it if needed and otherwise return it as is."
        )
        contextualize_q_prompt = ChatPromptTemplate.from_messages([
            ("system", contextualize_q_system_prompt),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}")
        ])
        
        # Create history aware retriever
        history_aware_retriever = create_history_aware_retriever(
            llm, 
            retriever,
            contextualize_q_prompt
        )

        # Create QA prompt
        qa_system_prompt = (
            "You are given a user question, and please write clean, concise and accurate answer to the question. "
            "You will be given a set of related contexts to the question, which are numbered sequentially starting from 1. "
            "Each context has an implicit reference number based on its position in the array (first context is 1, second is 2, etc.). "
            "Please use these contexts and cite them using the format [citation:x] at the end of each sentence where applicable. "
            "Your answer must be correct, accurate and written by an expert using an unbiased and professional tone. "
            "Please limit to 1024 tokens. Do not give any information that is not related to the question, and do not repeat. "
            "Say 'information is missing on' followed by the related topic, if the given context do not provide sufficient information. "
            "If a sentence draws from multiple contexts, please list all applicable citations, like [citation:1][citation:2]. "
            "Other than code and specific names and citations, your answer must be written in the same language as the question. "
            "Be concise.\n\nContext: {context}\n\n"
            "Remember: Cite contexts by their position number (1 for first context, 2 for second, etc.) and don't blindly "
            "repeat the contexts verbatim."
        )
        qa_prompt = ChatPromptTemplate.from_messages([
            ("system", qa_system_prompt),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}")
        ])

        # 修改 create_stuff_documents_chain 来自定义 context 格式
        document_prompt = PromptTemplate.from_template("\n\n- {page_content}\n\n")

        # Create QA chain
        question_answer_chain = create_stuff_documents_chain(
            llm,
            qa_prompt,
            document_variable_name="context",
            document_prompt=document_prompt
        )

        # Create retrieval chain
        rag_chain = create_retrieval_chain(
            history_aware_retriever,
            question_answer_chain,
        )

        # Generate response
        chat_history = []
        for message in messages["messages"]:
            if message["role"] == "user":
                chat_history.append(HumanMessage(content=message["content"]))
            elif message["role"] == "assistant":
                # if include __LLM_RESPONSE__, only use the last part
                if "__LLM_RESPONSE__" in message["content"]:
                    message["content"] = message["content"].split("__LLM_RESPONSE__")[-1]
                chat_history.append(AIMessage(content=message["content"]))

        full_response = ""
        async for chunk in rag_chain.astream({
            "input": query,
            "chat_history": chat_history
        }):
            if "context" in chunk:
                serializable_context = []
                for context in chunk["context"]:
                    serializable_doc = {
                        "page_content": context.page_content.replace('"', '\\"'),
                        "metadata": context.metadata,
                    }
                    serializable_context.append(serializable_doc)
                
                # 先替换引号，再序列化
                escaped_context = json.dumps({
                    "context": serializable_context
                })

                # 转成 base64
                base64_context = base64.b64encode(escaped_context.encode()).decode()

                # 连接符号
                separator = "__LLM_RESPONSE__"
                
                yield f'0:"{base64_context}{separator}"\n'
                full_response += base64_context + separator

            if "answer" in chunk:
                answer_chunk = chunk["answer"]
                full_response += answer_chunk
                # Escape quotes and use json.dumps to properly handle special characters
                escaped_chunk = (answer_chunk
                    .replace('"', '\\"')
                    .replace('\n', '\\n'))
                yield f'0:"{escaped_chunk}"\n'
            
        # Update bot message content
        bot_message.content = full_response
        db.commit()
            
    except Exception as e:
        error_message = _friendly_error_message(e)
        logger.error(error_message)
        # AI SDK 的 3: 帧内容必须是合法 JSON（字符串），否则前端解析整条流会抛
        # SyntaxError，用户只能看到"流中断"而看不到这里的提示。必须用 json.dumps。
        yield "3:{payload}\n".format(
            payload=json.dumps(error_message, ensure_ascii=False)
        )
        
        # Update bot message with error
        if 'bot_message' in locals():
            bot_message.content = error_message
            db.commit()
    finally:
        db.close()