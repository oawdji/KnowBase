<div align="center">
  <h1>知库问答</h1>
  <p>
    <strong>KnowBase — 把你的文档变成能问答的知识库，回答附引用、出处可查</strong>
  </p>
  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License"></a>
    <a href="#"><img src="https://img.shields.io/badge/python-3.11-blue.svg" alt="Python"></a>
    <a href="#"><img src="https://img.shields.io/badge/node-%3E%3D18-green.svg" alt="Node"></a>
  </p>
  <h4>
    <a href="README.en.md">English</a> |
    <span>简体中文</span>
  </h4>
</div>

> **关于名称**：界面与文档中的产品名为「知库问答」，仓库名建议使用 `knowbase`（两者可以不一致）。
> 本项目基于开源项目 [rag-web-ui](https://github.com/rag-web-ui/rag-web-ui) 二次开发，遵循 Apache-2.0 许可，详见[第 14 节](#14-许可与声明)。
>
> **关于文档准确性**：本文档描述的是**本仓库当前的实际状态**（已在本机 Docker 环境跑通并逐项实测验证）。
> 凡是代码里没有的能力，一律明确标注「未实现」，不做夸大——上游 README 曾把重排、分布式任务等画进架构图，实际代码中并不存在。

## 目录

- [1. 这是什么](#1-这是什么)
- [2. 功能一览](#2-功能一览)
- [3. 技术栈](#3-技术栈)
- [4. 架构与 RAG 流程](#4-架构与-rag-流程)
- [5. 快速开始](#5-快速开始)
- [6. 配置说明](#6-配置说明)
- [7. 模型设置：多套配置与一键切换](#7-模型设置多套配置与一键切换)
- [8. 数据库与迁移](#8-数据库与迁移)
- [9. API 一览](#9-api-一览)
- [10. 开发与验证](#10-开发与验证)
- [11. 已知问题与限制](#11-已知问题与限制)
- [12. 优化路线](#12-优化路线)
- [13. 排错手册](#13-排错手册)
- [14. 许可与声明](#14-许可与声明)

---

## 1. 这是什么

一个前后端分离的知识库问答系统：**你的文档 → 切块 → 向量化 → 存入向量库；提问时先检索相关片段，再让大模型基于这些片段作答，并标出引用出处。**

适合的场景：

- 想理解 RAG 的完整链路，并且能用真实代码逐段对照（每个环节都能在 `backend/app/` 找到对应文件）
- 把自己的资料（简历、手册、规范）变成可问答的知识库
- 对比不同大模型 / 向量模型 / 向量库的效果

**不适合**：生产环境。项目定位是学习与演示，当前版本存在若干已确认的功能缺陷（见 [第 11 节](#11-已知问题与限制)）。

想先了解 RAG 原理，可看 [RAG 教程](./docs/tutorial/README.md)。

### 本仓库相对原始版本做的额外改动

| 改动 | 说明 |
|---|---|
| 🌏 界面中文化 | 前端 20 个文件、约 250 条文案改为中文；后端错误提示也改为中文并附带修复指引 |
| 🎛️ 模型设置（多配置） | 一个账号可保存多套模型配置（服务商 / 模型 / 接口地址 / Key），**一键切换**，支持「测试连接」；Key 加密存储 |
| 🏷️ 对话标题自动命名 | 新建对话不再要求输入标题：发出第一条消息后自动命名（截断兜底 + 后台模型优化），之后可点击改名 |
| 🔧 流式错误可读化 | 模型报错（Key 无效、余额不足等）以中文提示直接弹给用户，而不是静默卡住 |
| 🚀 本机环境适配 | 镜像源与端口冲突处理、向量模型缓存持久化、CPU 版 torch（无 GPU 机器可用） |

---

## 2. 功能一览

### 已实现

| 模块 | 能力 |
|---|---|
| 用户 | 注册、登录（JWT）、账号隔离（知识库 / 对话 / 配置均只属于本人） |
| 知识库 | 建库、改名、删除；多知识库管理 |
| 文档 | 上传 PDF / DOCX / MD / TXT → **切片预览**（可调分块大小）→ 异步入库；查看处理进度与失败原因 |
| 检索调试 | 「检索测试」页面：输入问题直接查看命中的文本块与相似度得分 |
| 对话 | 多轮对话、流式输出、**引用角标**（可回溯到具体文本块）、自动命名、改名、删除 |
| 模型设置 | 多家服务商（DeepSeek / OpenAI / MiniMax / Ollama）、多套配置切换、连接测试、Key 加密存储 |
| 开放接口 | 用 `X-API-Key` 调用 `/openapi/knowledge/{id}/query` 做纯检索（⚠️ 见第 11 节） |

### 未实现（上游 README 曾误标为已实现）

| 能力 | 现状 |
|---|---|
| **重排（Rerank / Cross-Encoder）** | ❌ 没有。检索只有向量相似度 top-k 一步 |
| **混合检索（BM25 + 向量）** | ❌ 没有 |
| 多知识库联合检索 | ❌ 没有。**一个对话挂多个知识库时只检索第一个** |
| 分布式任务队列（Celery / Redis） | ❌ 没有。使用 FastAPI `BackgroundTasks` + `asyncio.create_task` 在进程内执行 |
| 增量更新（仅更新变化的块） | ❌ 代码存在但**从未被调用**（死代码），实际入库只追加 |
| Qdrant 向量库 | ⚠️ 适配代码在，但**未经测试** |
| 可观测性（LangSmith 等） | ❌ 没有 |
| 检索效果评估（Recall@k / RAGAS） | ❌ 没有 |

---

## 3. 技术栈

### 后端

| 组件 | 版本 | 用途 |
|---|---|---|
| Python | 3.11 | 运行时 |
| FastAPI | 0.141 | Web 框架 |
| Uvicorn | 0.53 | ASGI 服务器（开发模式带 `--reload`） |
| SQLAlchemy | 2.0 | ORM |
| Alembic | 1.20 | 数据库迁移 |
| MySQL | 8.0 | 业务数据（用户 / 知识库 / 文档 / 消息 / 配置） |
| LangChain | 0.3.30 | RAG 链路编排 |
| langchain-community / -openai / -deepseek / -chroma / -huggingface | — | 各组件适配 |
| ChromaDB | 1.5 | 向量库 |
| sentence-transformers | 6.0 | 本地向量模型 |
| torch | 2.14.0+cpu | 无 GPU 环境使用 CPU 版 |
| MinIO SDK | 7.2 | 对象存储（原始文件） |
| pydantic | 2.13 | 配置与校验 |
| cryptography | 50.0 | API Key 的 Fernet 加密 |

### 前端

| 组件 | 版本 | 用途 |
|---|---|---|
| Next.js | 14.2.32 | App Router |
| React | 18.3.1 | — |
| TypeScript | 5.8 | 类型安全 |
| Tailwind CSS | 3.4 | 样式 |
| shadcn/ui + Radix UI | — | 组件库 |
| Vercel AI SDK（`ai`） | 4.3.9 | 流式对话（`ai/react` 的 `useChat`） |
| react-markdown | 9.1 | 回答渲染 |

### 基础设施

| 组件 | 镜像 | 说明 |
|---|---|---|
| MySQL | `mysql:8.0` | 数据卷 `mysql_data` |
| ChromaDB | `chromadb/chroma:latest` | 数据卷 `chroma_data` |
| MinIO | `quay.io/minio/minio:latest` | 上游写的 `minio/minio` 在部分环境拉不到，故改用 quay 镜像 |
| Nginx | `nginx:alpine` | 统一入口与反向代理 |

---

## 4. 架构与 RAG 流程

### 容器拓扑

```
                ┌──────────────────────────────┐
   浏览器 ──────▶│  nginx  :80                  │
                │  /        → frontend:3000    │
                │  /api     → backend:8000     │
                │  /redoc, /openapi.json       │
                │  /minio/  → minio:9000       │
                └───┬───────────┬──────────────┘
                    │           │
        ┌───────────▼──┐   ┌────▼──────────┐   ┌───────────┐   ┌──────────┐
        │ frontend     │   │ backend       │──▶│ MySQL 8.0 │   │ ChromaDB │
        │ Next.js 14   │   │ FastAPI       │──▶│ 业务数据   │   │ 向量库    │
        └──────────────┘   │ LangChain     │   └───────────┘   └────▲─────┘
                           │ 向量模型(本地) │──▶ MinIO（原始文件）    │
                           └───────────────┘────────────────────────┘
                                   │
                                   └──▶ 大模型 API（DeepSeek / OpenAI / MiniMax / Ollama）
```

### 阶段一：离线索引（上传文档 → 可被检索）

| # | 步骤 | 实现位置 |
|---|---|---|
| 1 | 文件上传到 MinIO 临时区 `kb_{id}/`，计算 SHA-256 | `api/api_v1/knowledge_base.py` → `services/document_processor.py: upload_document` |
| 2 | **预览分块**（前端可调 `chunk_size` / `chunk_overlap`，默认 1000 / 200） | `document_processor.py: preview_document` |
| 3 | 建 `processing_tasks` 记录（`pending`），交由后台任务执行 | `api/api_v1/knowledge_base.py: /documents/process` |
| 4 | 按扩展名选解析器：PDF → `PyPDFLoader`，DOCX → `Docx2txtLoader`，MD → `UnstructuredMarkdownLoader`，其他 → `TextLoader` | `document_processor.py: process_document_background` |
| 5 | 切分：`RecursiveCharacterTextSplitter(1000, 200)` | 同上 |
| 6 | 向量化：`EmbeddingsFactory` → 本地 `all-MiniLM-L6-v2`（384 维） | `services/embedding/embedding_factory.py` |
| 7 | **双写**：Chroma 集合 `kb_{知识库id}` + MySQL `document_chunks`；任务置 `completed` | `document_processor.py` |

> ⚠️ 两个坑：**第 2 步的分块参数不会传给第 5 步**（真实入库永远是 1000/200）；**同名文件重复上传会撞唯一约束**（见第 11 节）。

### 阶段二：在线问答（提问 → 带引用的回答）

| # | 步骤 | 实现位置 |
|---|---|---|
| 1 | `POST /api/chat/{id}/messages`，返回 AI SDK 数据流 | `api/api_v1/chat.py` |
| 2 | 解析该账号生效的模型配置（当前激活的 profile → 否则 `.env`） | `services/llm/llm_config.py: resolve_chat_config` |
| 3 | 按 `chat.knowledge_bases` 逐个建 Chroma 检索器，**实际只用第一个** | `services/chat_service.py` |
| 4 | **查询改写**：用 LLM 把多轮对话中的指代 / 省略补成独立问题（`create_history_aware_retriever`） | 同上 |
| 5 | 向量召回：`as_retriever()` 默认 **k=4**，纯相似度，**无阈值、无重排** | 同上 |
| 6 | 拼接上下文（`create_stuff_documents_chain`）交给大模型生成，prompt 要求以 `[citation:x]` 标注 | 同上 |
| 7 | 命中片段以 base64 与回答一起回传，前端渲染为引用角标 | 同上 + `frontend/src/app/dashboard/chat/[id]/page.tsx` |

### 这一版 RAG「没有」的东西

```
提问 → [查询改写 ✅] → 向量召回(k=4) → [重排 ❌] → [混合检索 ❌] → 拼接 → 大模型 → 带引用回答
                                       ↑ 缺的这两环，正是检索质量的主要瓶颈
```

---

## 5. 快速开始

### 前置要求

- Docker Desktop（含 Compose v2），可用内存 ≥ 8 GB
- 宿主机 80 端口可用（网关入口）

### 步骤

```bash
# 1) 进入项目目录（本机目录名沿用 rag-web-ui，仓库名可按需自定）
cd rag-web-ui

# 2) 准备环境变量（.env 已在 .gitignore 中，不会提交）
cp .env.example .env
#    然后至少填写你所用服务商的 API Key，例如 DEEPSEEK_API_KEY

# 3) 启动（开发版：源码挂载 + 热重载）
docker compose -f docker-compose.dev.yml up -d --build
```

首次构建需下载依赖（约 1–3 GB）。国内网络建议先按 [第 13 节](#13-排错手册) 配置镜像源。

### 启动后访问

| 入口 | 地址 |
|---|---|
| 前端界面 | http://127.0.0.1.nip.io |
| API 文档（ReDoc） | http://127.0.0.1.nip.io/redoc |
| 后端直连（绕过网关） | http://127.0.0.1:8010 |
| MinIO 控制台 | http://127.0.0.1:9001（minioadmin / minioadmin） |

> 使用 `127.0.0.1.nip.io` 而非 `localhost`：`nip.io` 会把该域名解析回 `127.0.0.1`，可避开部分浏览器对 `localhost` 的 Cookie / 跨域限制。

### 端口映射

| 服务 | 容器内 | 宿主机（开发版） | 说明 |
|---|---|---|---|
| nginx | 80 | **80** | 统一入口 |
| frontend | 3000 | **3000** | 直连 Next.js 调试用 |
| backend | 8000 | **8010** | 宿主机 8000 常被其它项目占用，故重映射 |
| MySQL | 3306 | **3308** | 宿主机可能已有原生 MySQL，故重映射 |
| ChromaDB | 8000 | **8001** | |
| MinIO | 9000 / 9001 | 9000 / 9001 | API / 控制台 |

### 首次使用流程

1. 打开 http://127.0.0.1.nip.io → 注册账号并登录
2. **模型设置** → 新建配置（选服务商、填 API Key）→「测试连接」确认可用 → 保存
3. **知识库** → 新建知识库 → 上传文档 → 预览分块 → 确认入库 → 等待「处理完成」
4. **对话** → 新建对话（选知识库）→ 提问（标题会在你发出第一个问题后自动生成）
5. 想验证检索效果：知识库里点「检索测试」，直接查看命中的片段与相似度分数

### 停止与清理

```bash
docker compose -f docker-compose.dev.yml down          # 停止（保留数据卷）
docker compose -f docker-compose.dev.yml down -v       # 停止并删除数据卷（含数据库、向量、模型缓存）
docker compose -f docker-compose.dev.yml logs -f backend   # 查看日志
```

---

## 6. 配置说明

所有配置集中在 `.env`（参考 `.env.example`）。下表默认值**取自代码**（`backend/app/core/config.py`）。

### 对话模型

| 变量 | 默认值 | 说明 |
|---|---|---|
| `CHAT_PROVIDER` | `openai` | 默认服务商：`openai` / `deepseek` / `minimax` / `ollama` |
| `OPENAI_API_KEY` / `_API_BASE` / `_MODEL` | - / `https://api.openai.com/v1` / `gpt-4` | OpenAI |
| `DEEPSEEK_API_KEY` / `_API_BASE` / `_MODEL` | - / `https://api.deepseek.com/v1` / `deepseek-chat` | DeepSeek |
| `MINIMAX_API_KEY` / `_API_BASE` / `_MODEL` | - / `https://api.minimax.io/v1` / `MiniMax-M2.7` | MiniMax |
| `OLLAMA_API_BASE` / `OLLAMA_MODEL` | `http://localhost:11434` / `deepseek-r1:7b` | 本地模型（容器内访问宿主机需用 `host.docker.internal`） |

> 页面上保存的「模型设置」优先于 `.env`（见第 7 节）。

### 向量模型（决定检索质量；页面不可改，需改 `.env` 并重建索引）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `EMBEDDINGS_PROVIDER` | `openai` | `openai` / `dashscope` / `ollama` / `huggingface` |
| `HUGGINGFACE_EMBEDDINGS_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | 本地模型（384 维；**换模型必须重建向量**） |
| `HUGGINGFACE_API_KEY` | 空 | 仅私有模型需要 |
| `OPENAI_EMBEDDINGS_MODEL` | `text-embedding-ada-002` | 使用 OpenAI 向量时 |
| `DASH_SCOPE_API_KEY` / `DASH_SCOPE_EMBEDDINGS_MODEL` | 空 | 阿里云通义 |
| `OLLAMA_EMBEDDINGS_MODEL` | `nomic-embed-text` | 本地 Ollama 向量 |

### 向量库与对象存储

| 变量 | 默认值 | 说明 |
|---|---|---|
| `VECTOR_STORE_TYPE` | `chroma` | 目前仅 `chroma` 经过验证 |
| `CHROMA_DB_HOST` / `CHROMA_DB_PORT` | `chromadb` / `8000` | 容器内地址 |
| `QDRANT_URL` / `QDRANT_PREFER_GRPC` | `http://localhost:6333` / `true` | 未验证 |
| `MINIO_ENDPOINT` | `localhost:9000` | 容器内应填 `minio:9000` |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` / `MINIO_BUCKET_NAME` | `minioadmin` / `minioadmin` / `documents` | |

### 数据库与认证

| 变量 | 默认值 | 说明 |
|---|---|---|
| `MYSQL_SERVER` / `_PORT` | `localhost` / `3306` | 容器内填 `db` / `3306` |
| `MYSQL_USER` / `_PASSWORD` / `_DATABASE` | `ragwebui` / `ragwebui` / `ragwebui` | |
| `SECRET_KEY` | `your-secret-key-here` | ⚠️ 同时用于派生密钥加密 API Key，**更换会导致已存 Key 全部无法解密** |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080`（7 天） | |
| `TZ` | `Asia/Shanghai` | |

### 对话标题自动命名（本仓库新增）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `CHAT_TITLE_LLM` | `true` | 首条消息先用截断文本命名，再后台调模型优化；设为 `false` 则只截断、不额外调用模型 |
| `CHAT_TITLE_MAX_LENGTH` | `30` | 截断标题最大字数 |
| `CHAT_TITLE_LLM_TIMEOUT` | `15` | 后台生成标题的超时秒数 |

### 本机实际使用的一组配置（参考）

```ini
CHAT_PROVIDER=deepseek
EMBEDDINGS_PROVIDER=huggingface      # 本地运行，不花钱、不联网（模型首次会自动下载）
HF_ENDPOINT=https://hf-mirror.com    # 国内镜像，加速模型下载
VECTOR_STORE_TYPE=chroma
```

---

## 7. 模型设置：多套配置与一键切换

一个账号可保存**多套**模型配置，在页面上可一键切换，切换后立即对后续对话生效。

**优先级**：当前激活的配置 →（没有则）`.env` 默认值。

| 概念 | 说明 |
|---|---|
| 配置（profile） | 一组「配置名 + 服务商 + 模型 + 接口地址 + API Key」 |
| 激活 | 至多一套处于激活状态；新建的第一套自动激活 |
| 删除 | 删除激活中的那套时自动切换到另一套；全部删完则回退 `.env` |
| Key 存储 | 以 `SECRET_KEY` 派生的密钥做 Fernet 加密，接口只回显打码值（如 `sk-818…27d1`） |

### 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/settings/models` | 列表 + 当前生效配置 + 服务商选项 |
| POST | `/api/settings/models` | 新建（`activate` 控制是否立即切换） |
| PATCH | `/api/settings/models/{id}` | 编辑；`api_key` 留空 = 不改动；`api_base` / `model` 传空串 = 回退默认 |
| DELETE | `/api/settings/models/{id}` | 删除 |
| POST | `/api/settings/models/{id}/activate` | **切换到该配置** |
| DELETE | `/api/settings/models` | 清空全部配置（回退 `.env`） |
| POST | `/api/settings/models/test` | 测试连接（传 `id` 测已保存的，或传草稿字段测未保存的） |

> 旧的单配置接口（`/api/settings/model`）仍然保留可用，写入的是「当前激活」的那套配置。

---

## 8. 数据库与迁移

| 表 | 用途 |
|---|---|
| `users` | 账号 |
| `knowledge_bases` / `documents` / `document_uploads` | 知识库、文档、上传记录 |
| `document_chunks` | 分块记录（正文也存于此，与 Chroma 双写） |
| `processing_tasks` | 文档处理任务状态 |
| `chats` / `messages` / `chat_knowledge_bases` | 对话、消息、对话↔知识库关联 |
| `model_profiles` | 模型多配置（加密 Key、激活标记） |
| `api_keys` | 开放接口密钥（⚠️ 明文存储） |
| `alembic_version` | 迁移版本（当前 head：`d4f8b2c605ae`） |

```bash
# 迁移（容器启动时会自动执行 upgrade head，手动操作如下）
docker compose -f docker-compose.dev.yml exec backend alembic current
docker compose -f docker-compose.dev.yml exec backend alembic upgrade head
docker compose -f docker-compose.dev.yml exec backend alembic downgrade -1

# 直接连库查看
docker compose -f docker-compose.dev.yml exec db mysql -uragwebui -pragwebui ragwebui \
  --default-character-set=utf8mb4 -e "SHOW TABLES;"
```

---

## 9. API 一览

鉴权：除注册 / 登录外，业务接口需 `Authorization: Bearer <token>`；开放接口使用 `X-API-Key: <key>`。

| 分类 | 端点 |
|---|---|
| 认证 | `POST /api/auth/register`、`POST /api/auth/token`、`POST /api/auth/test-token` |
| 知识库 | `GET/POST /api/knowledge-base`、`GET/PUT/DELETE /api/knowledge-base/{id}` |
| 文档 | `POST /api/knowledge-base/{id}/documents/upload`、`…/preview`、`…/process`、`GET …/tasks`、`GET …/documents/{doc_id}` |
| 检索调试 | `POST /api/knowledge-base/test-retrieval` |
| 对话 | `GET/POST /api/chat`、`GET/PATCH/DELETE /api/chat/{id}`、`POST /api/chat/{id}/messages`（流式） |
| 模型设置 | 见 [第 7 节](#7-模型设置多套配置与一键切换) |
| 开放接口密钥 | `GET/POST /api/api-keys`、`PUT/DELETE /api/api-keys/{id}` |
| 开放检索接口 | `GET /openapi/knowledge/{kb_id}/query?query=…&top_k=3`（⚠️ 见第 11 节） |
| 健康检查 | `GET /api/health` |

完整交互式文档：http://127.0.0.1.nip.io/redoc

---

## 10. 开发与验证

开发版 compose 挂载了源码：**后端 Uvicorn 带 `--reload`、前端 Next.js 热更新**，改代码即时生效（改 `.env` 需重启容器）。

```bash
# 前端：类型检查与测试
docker compose -f docker-compose.dev.yml exec frontend npx tsc --noEmit
docker compose -f docker-compose.dev.yml exec frontend npx jest --ci

# 后端：导入自检与依赖查看
docker compose -f docker-compose.dev.yml exec backend python -c "import app.main"
docker compose -f docker-compose.dev.yml exec backend pip list | grep langchain

# 日志
docker compose -f docker-compose.dev.yml logs -f --tail=100 backend

# 改了 .env 或依赖后重建单个服务
docker compose -f docker-compose.dev.yml up -d --build backend
```

**代码结构**

```
backend/app/
├── api/
│   ├── api_v1/          # 业务接口：auth / knowledge_base / chat / api_keys / settings
│   └── openapi/         # X-API-Key 开放检索接口
├── core/                # 配置、安全、加密、MinIO 客户端
├── models/              # SQLAlchemy 模型
├── schemas/             # Pydantic 出入参
└── services/
    ├── document_processor.py   # 上传 / 预览分块 / 异步入库
    ├── chat_service.py         # RAG 问答链路（检索 + 生成 + 流式）
    ├── embedding/              # 向量模型工厂
    ├── llm/                    # 大模型工厂 + 多配置解析
    └── vector_store/           # 向量库工厂（Chroma / Qdrant）

frontend/src/
├── app/dashboard/       # 页面：概览 / 知识库 / 对话 / 检索测试 / 模型设置 / API 密钥
├── components/          # UI 组件（chat、knowledge-base、layout、ui）
└── lib/api.ts           # 统一请求封装
```

---

## 11. 已知问题与限制

以下问题均在本机**实测复现**，非推测。

### 影响效果与体验

| # | 问题 | 实测证据 | 影响 |
|---|---|---|---|
| 1 | **每次提问要先等约 20 秒** | 最简单的一问（无知识库、跳过检索）TTFB = **19.53 s**；根因是每个请求都重建向量模型并联网校验，设 `HF_HUB_OFFLINE=1` 后同样加载仅 **1.75 s** | 用户以为程序卡死 |
| 2 | **PDF 解析出乱码** | 某 PDF 入库的 4/4 个文本块异常字符占 18–23%（`'–෬ + BM25đ RRFೆ Rerankஆđ…'`）；同一页换 PyMuPDF 解析完全正常 | 中文语义检索基本失效 |
| 3 | **多知识库只检索第一个** | `chat_service.py` 中的 `vector_stores[0]` | 挂多个库只有 1 个生效 |
| 4 | **向量模型偏弱 + 静默截断** | `all-MiniLM-L6-v2`（英文语料、384 维、上限 256 token）；实测文本块 368–376 token，**约 30% 内容不进向量** | 召回天花板被锁死 |
| 5 | **界面上调分块大小对入库无效** | 预览接口接收参数，真正入库时未传，永远用 1000/200 | 参数形同虚设 |
| 6 | 无重排、无混合检索、无相似度阈值、k 固定为 4；固定长度切块 | 代码中不存在相关逻辑 | 更相关的块排在第 4 名也无法纠正 |

### 功能性缺陷

| # | 问题 | 说明 |
|---|---|---|
| 7 | **删除知识库不清向量** | 实测：删库返回 `HTTP 200` 但携带 `warnings: ["Failed to clean up vector store: Chroma.delete_collection() takes 1 positional argument but 2 were given"]`，Chroma 集合仍在 → **已积累孤儿集合**（Chroma 有 kb_1~kb_4，MySQL 只有 kb_2） |
| 8 | 同名文件重复上传 | 触发唯一约束 `uq_kb_file_name` → 事务回滚异常 → 任务**永久停在 processing** |
| 9 | 增量更新是死代码 | `process_document()` / `ChunkRecord` 从未被调用；实际只追加，改过的文档会叠加旧块 |
| 10 | 没有按文档删除的接口 | 只能整库删除 |
| 11 | MySQL 与 Chroma 双写不保证一致 | Chroma 写入失败不回滚数据库 |
| 12 | 孤儿任务行 | 删库后 `processing_tasks` 残留记录（实测 1 行） |
| 13 | 开放接口无法通过网关访问 | nginx 缺少 `/openapi/` 路由 → 页面里写的调用方式必然 404；另有两个问题：删除密钥按钮必然报错（前端误判 `response.ok`）、密钥明文存储 |
| 14 | 无任务队列 | 进程重启会丢失进行中的入库任务，任务状态卡住 |

---

## 12. 优化路线

按「投入产出比」排序，前三条做完即可看到明显变化。

### 第一批：修缺陷（改动小、立刻见效）

1. **消掉每次提问的约 20 秒**：`.env` 增加 `HF_HUB_OFFLINE=1`（模型已本地缓存）+ 将向量模型实例做成全局单例
2. **修 PDF 解析**：`PyPDFLoader` → `PyMuPDFLoader`，然后**重建该知识库的向量**
3. **修删库清理**：改用项目自身的 `vector_store.delete_collection()`，并清掉已有的孤儿集合

### 第二批：提升检索质量

4. 换中文向量模型（`BAAI/bge-small-zh-v1.5` 或 `bge-m3`），块大小贴合模型上限；**必须重建索引**
5. 引入混合检索（BM25 + 向量 + RRF 融合）与重排模型（`bge-reranker-v2-m3`）；修多知识库联合检索
6. 建 20–50 条黄金问答集，用 Recall@k / RAGAS 量化效果

### 第三批：工程卫生

7. 关闭 `chat_service.py` 中的 `set_verbose(True)` / `set_debug(True)`（日志噪音极大且拖慢流式输出）
8. 修同名重传与死代码、增加按文档删除、补测试与 CI
9. 开放接口页面：或补齐 nginx 路由，或下架（可一并消除明文存储等三个问题）

---

## 13. 排错手册

| 现象 | 原因与解决 |
|---|---|
| 拉镜像 / 构建极慢或超时 | 配置国内镜像源。后端 Dockerfile 支持构建参数 `APT_MIRROR`、`PIP_INDEX_URL`、`TORCH_CPU_INDEX_URL`；无 GPU 机器务必用 CPU 版 torch，否则会拉取数 GB 的 CUDA 依赖 |
| `ports are not available: 0.0.0.0:8000/3306` | 宿主机端口被占用。本项目已将 backend 映射到 **8010**、MySQL 映射到 **3308**；如需再改，编辑 `docker-compose.dev.yml` |
| `minio/minio` 拉取报 `repository does not exist` | 改用 `quay.io/minio/minio:latest`（本项目已改） |
| 对话报 401 / `Authentication Fails` | 检查「模型设置」里的 API Key 是否填对。注意：**模型 Key 要填在「模型设置」页**，而不是「API 密钥」页（后者是给开放接口用的门禁卡） |
| 提问后长时间无任何输出（约 20 秒） | 见第 11 节问题 1：向量模型每次重建并联网校验，配置 `HF_HUB_OFFLINE=1` 可解决 |
| 中文检索效果差 / 文档里明明有却答不出 | 先检查入库文本是否为乱码（问题 2），再看向量模型是否适合中文（问题 4） |
| 文档一直停在「处理中」 | 多为同名文件重复上传触发唯一约束（问题 8）。查看 `/api/knowledge-base/{id}/documents/tasks` 与后端日志 |
| 知识库删了但向量没少 | 已知问题（问题 7），Chroma 集合会成为孤儿 |
| 直接连后端测接口返回 307 | FastAPI 会把 `/api/chat` 跳到带斜杠的 `/api/chat/`，用 `curl -L` 跟随即可（浏览器不受影响） |
| 前端报 `Maximum update depth exceeded` | 历史问题（流式期间引用数据导致的重渲染循环），已通过稳定引用数据修复 |

更多内容见 [docs/troubleshooting.md](docs/troubleshooting.md)。

---

## 14. 许可与声明

本项目（**知库问答 / KnowBase**）基于开源项目 **[rag-web-ui](https://github.com/rag-web-ui/rag-web-ui)** 二次开发，遵循 [Apache-2.0 License](LICENSE)；原项目版权归其作者所有。本仓库所做的改动（界面中文化、模型多配置、对话自动命名等）见[第 1 节](#1-这是什么)。

按照 Apache-2.0 的要求：

- 本仓库保留原始 [`LICENSE`](LICENSE) 文件与版权声明；
- 本项目**不是**上游官方版本，也未获得上游作者的任何背书；
- 想了解原始项目，请访问 [github.com/rag-web-ui/rag-web-ui](https://github.com/rag-web-ui/rag-web-ui)。

原始项目定位为 **学习与分享 RAG 知识**，请勿用于商业用途；当前版本仍在开发中，存在上文列出的已知问题，**不建议直接用于生产环境**。

### 致谢

[FastAPI](https://fastapi.tiangolo.com/) · [LangChain](https://python.langchain.com/) · [Next.js](https://nextjs.org/) · [ChromaDB](https://www.trychroma.com/) · [MinIO](https://min.io/) · [shadcn/ui](https://ui.shadcn.com/) · [Vercel AI SDK](https://sdk.vercel.ai/)
