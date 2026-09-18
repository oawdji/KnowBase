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
> 已经修掉的问题统一挪到[第 11 节](#11-已知问题与限制)顶部的「已修复」表格，并附上修复前后的实测数据；仍存在的缺陷照实列在后面。

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
| ⚡ 启动与响应提速 | 向量模型改为**进程级单例**（原来每个请求都重新加载一遍），并支持从本地目录离线加载。实测：单次加载 21.7 s → 0 s（仅首次加载）；冷启动整链 142.6 s → **1.7 s** |
| 🧵 并发与稳定性（本轮） | 关掉 LangChain 全局 debug（单次回答 stdout **21 KB → 0**）；入库移出事件循环（入库期间其它请求最大响应 **16,165 ms → 103 ms**）；入库失败不再卡死（**永久 processing → 13.7 s 报 failed**）；MinIO / Chroma 客户端改进程级单例（**17–19 ms → 4.3 ms**）；数据库连接池加探活（死连接**自动恢复**）；并给入库加并发上限（4 文档并发**从被 OOM 杀死 → 7/7 通过**）。逐项数据见[第 12 节](#12-优化路线)「第二批」与[第 11 节](#11-已知问题与限制)「已修复」第 8–14 条 |
| 🎯 中文检索质量 | 向量模型换成 `BAAI/bge-small-zh-v1.5`（512 维，中文语料）；PDF 解析换 PyMuPDF；分块默认 600 / 120 贴合模型上限。实测见[第 11 节](#11-已知问题与限制)「已修复」 |
| 🐛 缺陷修复 | 修掉 4 个确认缺陷：删库不清向量、界面分块设置对入库无效、删除 API 密钥恒报失败、检索测试把「距离」当成「相关度」显示 |

---

## 2. 功能一览

### 已实现

| 模块 | 能力 |
|---|---|
| 用户 | 注册、登录（JWT）、账号隔离（知识库 / 对话 / 配置均只属于本人） |
| 知识库 | 建库、改名、删除；多知识库管理 |
| 文档 | 上传 PDF / DOCX / MD / TXT → **切片预览**（可调分块大小）→ 异步入库；查看处理进度与失败原因 |
| 检索调试 | 「检索测试」页面：输入问题直接查看命中的文本块、**相关度**（余弦相似度，越大越相关）与向量库原始距离 |
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
| pymupdf | 1.28 | PDF 解析（`PyMuPDFLoader` 底层，替代 pypdf 以修中文乱码） |
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
| 2 | **预览分块**（前端可调 `chunk_size` / `chunk_overlap`，默认 **600 / 120**） | `document_processor.py: preview_document` |
| 3 | 建 `processing_tasks` 记录（`pending`），交由后台任务执行；分块参数随请求一起传入 | `api/api_v1/knowledge_base.py: /documents/process` |
| 4 | 按扩展名选解析器：PDF → **`PyMuPDFLoader`**，DOCX → `Docx2txtLoader`，MD → `UnstructuredMarkdownLoader`，其他 → `TextLoader` | `document_processor.py: process_document_background` |
| 5 | 切分：`RecursiveCharacterTextSplitter(chunk_size, chunk_overlap)`，默认 **600 / 120**（与第 2 步预览完全一致） | 同上 |
| 6 | 向量化：`EmbeddingsFactory` → 本地 `BAAI/bge-small-zh-v1.5`（512 维，中文语料）；实例为**进程级单例**，只在首次请求时加载 | `services/embedding/embedding_factory.py` |
| 7 | **双写**：Chroma 集合 `kb_{知识库id}` + MySQL `document_chunks`；任务置 `completed` | `document_processor.py` |

> ⚠️ 两个坑：**换了向量模型必须重建索引**（旧向量的维度/语义都对不上，检索会直接报维度错误，见[第 6 节](#6-配置说明)）；**同名文件重复上传会撞唯一约束**（见第 11 节）。

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
5. 想验证检索效果：知识库里点「检索测试」，直接查看命中的片段、相关度（余弦相似度）与原始距离

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

### 向量模型（决定检索质量；页面不可改，需改 `.env` 并**重建索引**）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `EMBEDDINGS_PROVIDER` | `openai` | `openai` / `dashscope` / `ollama` / `huggingface` |
| `HUGGINGFACE_EMBEDDINGS_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | 本地模型。**本仓库实际填的是本地目录** `/app/models/bge-small-zh-v1.5`（512 维，见下一小节） |
| `HUGGINGFACE_API_KEY` | 空 | 仅私有模型需要 |
| `OPENAI_EMBEDDINGS_MODEL` | `text-embedding-ada-002` | 使用 OpenAI 向量时 |
| `DASH_SCOPE_API_KEY` / `DASH_SCOPE_EMBEDDINGS_MODEL` | 空 | 阿里云通义 |
| `OLLAMA_EMBEDDINGS_MODEL` | `nomic-embed-text` | 本地 Ollama 向量 |

### 本地向量模型与离线加载（本仓库新增）

上游默认的 `all-MiniLM-L6-v2` 是英文语料、384 维、上限 256 token，拿来检索中文资料效果很差（实测「相关」与「不相关」的余弦差距只有 **+0.056**，几乎分不开）。本仓库改用中文模型 `BAAI/bge-small-zh-v1.5`（512 维），同一组测试的差距是 **+0.330**。

| 变量 / 挂载 | 值 | 说明 |
|---|---|---|
| `HUGGINGFACE_EMBEDDINGS_MODEL` | `/app/models/bge-small-zh-v1.5` | 直接指向**本地目录**（容器内路径），不走网络 |
| `./models` → `/app/models` | `docker-compose.dev.yml` 已挂载 | 模型文件放在仓库的 `models/` 下（约 97 MB，**已 gitignore，不会提交**） |
| `HF_HUB_OFFLINE` | `1` | 由 `docker-compose.dev.yml` 的 `environment` 注入（**不是写在 `.env` 里**）。开启后 huggingface 客户端不再联网校验版本 |
| `HF_ENDPOINT` | `https://hf-mirror.com` | 仅在需要联网下载模型时生效。本机到 `hf-mirror.com` / `huggingface.co` 的连接会被重置（TLS `UNEXPECTED_EOF_WHILE_READING`），所以本仓库的模型是从 **ModelScope** 下载后放到 `models/` 的 |

为什么必须加 `HF_HUB_OFFLINE=1`：模型虽然已缓存在本地，但 huggingface 客户端仍会**对每个文件联网校验版本**并重试 5 次（1+2+4+8+8 秒）。本机实测：不加这一行，冷启动整链要 **142.6 s**；加上之后 **1.7 s**。

> ⚠️ **生产环境注意**：`docker-compose.yml`（生产版）**既没有 `./models` 挂载，也没有 `hf_cache` 卷，也没有 `HF_HUB_OFFLINE`**。所以上面这套「本地目录 + 离线」的配置**只在开发版成立**；要在生产用本地模型，需要自己补挂载并放置模型文件，否则会退回联网下载默认的英文模型（那样默认的 600/120 分块就不匹配了）。

### 换向量模型后必须重建索引（操作步骤）

向量库里的向量是**用某个模型算出来的**，换了模型，新旧向量维度不同、语义空间也不同，检索会直接报错（例如 `InvalidArgumentError: Collection expecting embedding with dimension of 384, got 512`）。

```text
1. 删除旧知识库       界面「知识库」→ 删除。此操作现在也会正确清掉 Chroma 里的向量集合
2. 新建知识库         重新建一个（会得到新的 id 与新的空集合）
3. 重新上传并入库     上传原文档 → 预览确认分块 → 确认入库
```

> 旧版本「删库不清向量」的缺陷已修复；如果你之前删过库，可能残留过孤儿集合 `kb_*`（MySQL 里已无对应记录），可用下面的命令核对：
>
> ```bash
> # 列出 Chroma 里现存的所有集合
> curl -s http://127.0.0.1:8001/api/v2/tenants/default_tenant/databases/default_database/collections
> ```

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
EMBEDDINGS_PROVIDER=huggingface
# 指向本地目录（容器内路径），不用联网、不用花钱；模型文件放在仓库的 models/ 下
HUGGINGFACE_EMBEDDINGS_MODEL=/app/models/bge-small-zh-v1.5
# 仅在需要联网下载模型时生效；本机到 hf-mirror 不通，模型是从 ModelScope 下载的
HF_ENDPOINT=https://hf-mirror.com
VECTOR_STORE_TYPE=chroma
# 注意：HF_HUB_OFFLINE=1 不在 .env 里，由 docker-compose.dev.yml 注入（原因见上一小节）
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
| `document_chunks` | 分块记录：**正文存在 `chunk_metadata.page_content` 里**（没有独立正文列），与 Chroma 双写 |
| `processing_tasks` | 文档处理任务状态 |
| `chats` / `messages` / `chat_knowledge_bases` | 对话、消息、对话↔知识库关联 |
| `model_profiles` | 模型多配置（加密 Key、激活标记） |
| `api_keys` | 开放接口密钥（⚠️ 明文存储，且创建 / 修改 / 删除时会**把完整密钥写进日志**，见第 11 节） |
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
| 检索调试 | `POST /api/knowledge-base/test-retrieval`（返回 `similarity` 余弦相似度与原始 `score`，已按相关度降序） |
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

以下问题均在本机**实测复现**，非推测。分两部分：**已修复的**（附修复前后实测数据）与**仍存在的**。

### 已修复（本仓库已修，附实测数据）

| # | 原问题 | 实测：修复前 → 修复后 | 涉及提交 |
|---|---|---|---|
| 1 | **每次提问要先等约 20 秒**：每个请求都重新加载向量模型并联网校验版本 | 单次加载 **21.7 s → 0 s**（首次加载后进程内复用）；冷启动整链 **142.6 s → 1.7 s**（本地目录 + `HF_HUB_OFFLINE=1`） | `fc9a74f` |
| 2 | **PDF 解析出乱码**：`PyPDFLoader` 对中文 PDF 产生大量乱码 | 同一份测试用中文 PDF 的异常字符占比 **22.4%（514/2293 字）→ 0%（1/3265 字）**，且提取到的正文多出 **42%** | `e64c6e0` |
| 3 | **中文向量模型偏弱 + 静默截断**：`all-MiniLM-L6-v2` 是英文语料、384 维、上限 256 token | 换成 `bge-small-zh-v1.5`（512 维）：同一组「相关 vs 不相关」文本的余弦差距 **+0.056 → +0.330**（越大越能区分） | `fc9a74f` |
| 4 | **界面上调分块大小对入库无效**：参数只发给预览，入库永远用固定的 1000/200 | 超出模型 512 token 上限的文本块 **4/4 → 0/4**；内容保留率 **88.1% → 100%**（600/120） | `7b48d1b` |
| 5 | **删除知识库不清向量**：调错了方法，异常被吞，界面显示成功但集合仍在 | 删库后 Chroma 集合**确实被删除**（已用原始客户端复核）；历史遗留的孤儿集合 `kb_1`/`kb_3`/`kb_4` 已清理 | `f2fef3a` |
| 6 | **检索测试把「距离」当「相关度」显示**：直接 `score * 100`，而 `score` 是平方 L2 距离（越小越相关） | 真实索引上实测：三次查询的「相关度」会显示成 `86.3%~102.5%`、`94.4%~104.2%`、`111.9%~121.1%`——**全都超过或接近 100%，且最相关的一条显示得最低**。现在改为精确余弦相似度（与独立计算的余弦误差 < 1e-6），并同时保留原始距离 | `ea4c7df` |
| 7 | **删除 API 密钥必定报错**：前端误判 `response.ok`（`api.delete` 返回的是 JSON，不是 `Response`） | 服务端明明返回 `HTTP 200`，界面一律提示「删除 API 密钥失败」；已修正 | `17798cf` |
| 8 | **LangChain 全局调试开关常年打开**：`chat_service.py` 顶部 `set_verbose(True)` / `set_debug(True)` | 单次回答（625 字答案 + 2010 字上下文）产生的 stdout 写入 **21,328 字节 → 0**。根因是它给每个回调管理器挂了 `ConsoleCallbackHandler`，而后者内部是 `BaseTracer(function=print)`——**直接 print，绕过 logging**，`logging.basicConfig(level=INFO)` 拦不住；真模型逐 token 触发，且在事件循环线程里做同步 I/O | `chat_service.py` |
| 9 | **文档入库阻塞整个后端**：`process_document_background` 声明为 `async`，函数体内却**没有任何 `await`**（下载 / 解析 / 向量化 / 写库全是同步阻塞），被 `asyncio.create_task` 丢进事件循环同步跑完 | 入库期间其它请求的最大响应时间 **16,165 ms → 103~156 ms**（同一测试在改前 / 改后各跑一遍）。改法：函数改回同步 `def`，用 `asyncio.to_thread` 交给工作线程；同时把 `create_task` 的返回值存入强引用集合，避免任务被 GC 提前回收 | `document_processor.py`、`knowledge_base.py` |
| 10 | **入库失败时状态写不进库**：异常处理器缺 `db.rollback()`，flush 失败后 Session 进入失效态，处理器里的 `commit()` 再抛 `PendingRollbackError` 并逃出函数 | 失败任务**永久停在 processing**（轮询 180 s 超时、无错误信息）→ **13.7 s 收敛为 `failed` 并写入可读错误原因**。经日志确认，这也是原「同名文件重传卡死」症状的真正机制；同时给 `error_message` 加 2000 字符截断（flush 失败会把全部绑定参数带进异常，实测近 50 KB，超长会再次写库失败） | `document_processor.py` |
| 11 | **每次请求都重建 MinIO / Chroma 客户端** | `VectorStoreFactory.create()` **17–19 ms → 4.3 ms**；Chroma 的 3 次元数据往返（身份 / 租户 / 库）从「每次创建各 3 次」变为**30 次创建只多 1 次**（日志中三个端点各只 +1）。两个客户端改为进程级单例（双检锁），8 线程并发读、6 线程并发写均验证通过 | `core/minio.py`、`vector_store/chroma.py` |
| 12 | **数据库连接池没有探活**：`create_engine` 未设 `pool_pre_ping` | 把池中连接从服务端 `KILL` 掉再复用：原本必报 `MySQL Connection not available` → 现在**自动恢复**（探活发现死连接并透明换新）。即服务空闲超过 MySQL `wait_timeout`（默认 8 小时）后，第一个请求不再必然失败 | `db/session.py` |
| 13 | **`print` 直接写 stdout**：`chat_service.py` 5 处 `print`，整个文件连 `logging` 都没导入 | 全部改为 logger（warning / error / debug）。其中**每次对话都会执行**的 `count()` 调试打印额外带一次向量库往返，已加 `isEnabledFor(DEBUG)` 守卫——不这样做的话，「改成 logger」会把这个开销原样保留；实测该守卫为 `False`，往返已被跳过 | `chat_service.py` |
| 14 | **并发入库把整个后端 OOM 杀死**（第 9 条改动带出的新问题） | 4 个文档同时入库时进程被 OOM killer 杀死：`oom_kill 1`、内存峰值 **2.37 GB**、`/api/health` 超时 60 s 无响应（uvicorn `--reload` 父进程仍持有监听套接字，所以表现为「卡住」而非「拒绝连接」）。加并发上限（`MAX_CONCURRENT_INGEST = 2`）后同一测试 **7/7 通过**、峰值 **1.65 GB**、`oom_kill 0` | `knowledge_base.py` |

> ⚠️ **关于第 4 条的适用范围（后续实测修正）**：那次实测用的是一份含较多 ASCII（英文术语、邮箱、数字）的简历 PDF，
> token / 字符比约 **0.63**，600 字符 ≈ 390 token，确实没超 512 上限。
> 但**纯中文**散文的比值接近 1.0（用该模型自带 tokenizer 实测 **1.004**）：600 字符 ≈ **602 token**，**仍会被静默截断**。
> 也就是说第 4 条只对 ASCII 占比高的文档成立，详见「仍存在的问题」第 17 条。

### 仍存在的问题

#### 影响检索效果

| # | 问题 | 说明 |
|---|---|---|
| 15 | **多知识库只检索第一个** | `chat_service.py` 中的 `vector_stores[0]`：一个对话挂多个知识库时只有第 1 个生效 |
| 16 | 无重排、无混合检索、无相似度阈值、k 固定为 4；按固定长度切块 | 代码中不存在相关逻辑；更相关的块排在第 5 名也无法纠正 |
| 17 | **分块 600 字符对纯中文仍会静默截断** | 模型 `max_seq_length = 512`。纯中文实测 token/字符比 **1.004**（600 字符 → 602 token，超限），被截掉的部分不参与向量化，检索永远找不到；ASCII 占比越高越安全。建议降到 **≤450 字符**，或改用 `RecursiveCharacterTextSplitter.from_huggingface_tokenizer` 按 token 切 |
| 18 | **文档内重复文本会导致入库失败** | `chunk_id = sha256(kb_id:file_name:page_content)`，同一文档里出现完全相同的文本块就会产生相同主键 → `IntegrityError 1062 Duplicate entry ... for key 'document_chunks.PRIMARY'`。真实文档里的页眉页脚、模板化条款、重复表格行都可能触发（实测用重复段落构造的文档必现）。**第 10 条修好后，这类失败会正确报错，但冲突本身仍在** |
| 19 | **切块用默认分隔符，中文会被从句子中间切断** | `RecursiveCharacterTextSplitter` 默认分隔符是 `["\n\n", "\n", " ", ""]`（英文导向），中文会落到 `""` 逐字硬切。加入 `。！？；，` 即可按句子边界切 |
| 20 | **向量化内存开销大，限制了入库并发** | 实测单次 `embed_documents(174 块 × 544 字符)` 峰值多占约 **590 MB**、耗时约 **28 s**。主因是每块都被截到 512 token，注意力矩阵按序列长度平方增长。这也是第 14 条必须限制并发的原因；调小 `batch_size`（如 8）或缩短分块可显著降低内存 |

#### 功能性缺陷

| # | 问题 | 说明 |
|---|---|---|
| 21 | 同名文件重复上传 | 触发唯一约束 `uq_kb_file_name` → 事务回滚异常。**第 10 条已修好「卡死」**（现在会正确报 `failed`），但「同名文件无法重传」这个限制本身仍在 |
| 22 | 增量更新是死代码 | `process_document()` / `ChunkRecord` 从未被调用；实际只追加，改过的文档会叠加旧块 |
| 23 | 没有按文档删除的接口 | 只能整库删除 |
| 24 | MySQL 与 Chroma 双写不保证一致 | Chroma 写入发生在数据库提交**之前**（`add_documents` 早于最后一次 `commit`），失败时向量已经写进 Chroma。第 10 条让失败可见之后，这个不一致反而更容易被发现：界面显示「任务失败」，但检索仍能命中该文档内容 |
| 25 | 孤儿任务行 | 删库后 `processing_tasks` 残留记录（`knowledge_base_id` 为 NULL，实测 2 行） |
| 26 | 无任务队列 | 进程重启会丢失进行中的入库任务，任务状态卡住（进程被杀时尤其明显，见第 14 条） |
| 27 | 开放接口无法通过网关访问 | nginx 缺少 `/openapi/` 路由 → 页面里写的调用方式必然 404 |

#### 安全与健壮性

| # | 问题 | 说明 |
|---|---|---|
| 28 | **API 密钥明文存储，且明文写进日志** | `api_keys.key` 是明文列；`api_keys.py` 的创建 / 修改 / 删除三处都用 `logger.info` 打印**完整密钥**，`docker compose logs` 即可拿到可用凭据。对比：「模型设置」里的 Key 是用 Fernet 加密存的 |
| 29 | **`SECRET_KEY` 有可用的默认值** | 默认 `your-secret-key-here`，直接用于签发 JWT。若部署时忘记设置，任何人都能伪造登录令牌（本机 `.env` 已设为 64 位随机值，且 `.env` 未被 git 跟踪） |
| 30 | **`/cleanup` 接口没有用户隔离** | 任何登录用户调用都会清理**全体用户**超过 24 小时的临时上传记录与 MinIO 对象 |
| 31 | 上传没有类型与大小校验 | `await file.read()` 把整个文件读进内存，扩展名、体积均不校验（不在白名单内的扩展名会在入库阶段才失败）；nginx `client_max_body_size` 是 100M，后端却没有对应上限 |
| 32 | nginx 的 `/api` 没有设置流式超时 | `proxy_buffering off` 设了（✅ 对 SSE 正确），但没设 `proxy_read_timeout` → 走默认 60 s，慢模型的长回答可能被掐断 |

#### 工程卫生

| # | 问题 | 说明 |
|---|---|---|
| 33 | 后端测试跑不起来 | 仓库有 `backend/tests/test_minimax_*.py`，但 `requirements.txt` 里没有 `pytest`，CI 里也没跑它们 |
| 34 | CI 判定偏弱 | `.github/workflows/test.yml` 用 `curl -v` 且没有 `--fail`，只 `sleep 30` 硬等 → 服务返回 500 也可能判为通过 |
| 35 | Markdown 排版实际未生效 | 前端用了 `prose` 类，但 `@tailwindcss/typography` **没有安装**，`tailwind.config` 的 plugins 里也没有 → AI 回答的标题、列表、表格没有层级与间距 |
| 36 | `uploads/` 不在 `.gitignore` | 目前是空目录所以侥幸未被提交，一旦有文件写入就会被 git 跟踪 |
| 37 | 生产环境不支持「本地模型 + 离线」这套配置 | 见[第 6 节](#6-配置说明)的 ⚠️ 提示：生产 compose 没有 `./models` 挂载、没有 `hf_cache` 卷、也没有 `HF_HUB_OFFLINE` |
| 38 | 前端有 7 个未使用依赖，且存在双 lockfile | `rehype-raw`、`unified`、`unist-util-visit`、`mdast-util-from-markdown`、`react-syntax-highlighter`、`highlight.js`、`shadcn-ui`（后者是 CLI 包，被误放进 `dependencies`）在 `src` 中零引用，其中前面几个体积很大。同时 `package-lock.json` 与 `pnpm-lock.yaml` 并存，而 CI 用 `npm ci` → 依赖树可能不一致 |

---

## 12. 优化路线

按「投入产出比」排序。

### ✅ 第一批：修缺陷（已完成）

| 项 | 结果 |
|---|---|
| 消掉每次提问的加载等待 | 向量模型改进程级单例 + `HF_HUB_OFFLINE=1`（`fc9a74f`） |
| 修 PDF 乱码 | `PyPDFLoader` → `PyMuPDFLoader`（`e64c6e0`） |
| 修删库清理 | 改用 `vector_store.delete_collection()`，并清掉孤儿集合（`f2fef3a`） |
| 界面分块设置对入库无效 | 参数一路贯通到入库，默认改为 600/120（`7b48d1b`） |
| 检索测试页显示错误 | 改为精确余弦相似度，并保留原始距离（`ea4c7df`） |
| 删除 API 密钥恒报失败 | 去掉错误的 `response.ok` 判断（`17798cf`） |

### ✅ 第二批：性能与并发（已完成）

只动后端，前端与接口契约未变。每一项都有「改前 / 改后」实测数据，详见[第 11 节](#11-已知问题与限制)「已修复」表第 8–14 条。

| 项 | 结果 |
|---|---|
| 关掉 LangChain 全局 verbose / debug | 单次回答 stdout 写入 **21 KB → 0**（原 `set_debug` 绕过 logging 直接 print） |
| 入库移出事件循环 | 入库期间其它请求最大响应 **16,165 ms → 103~156 ms** |
| 入库失败状态能落库 | 永久 `processing` → **13.7 s 变 `failed` 且带错误原因** |
| MinIO / Chroma 客户端改进程级单例 | `VectorStoreFactory.create()` **17–19 ms → 4.3 ms** |
| 数据库连接池加 `pool_pre_ping` / `pool_recycle` | 死连接复用从**必然失败** → **自动恢复** |
| `print` 改 logger | 统一日志；顺带去掉每请求一次的 `count()` 向量库往返 |
| 给入库加并发上限 | 4 文档并发从**进程被 OOM 杀死** → **7/7 通过**，峰值内存 **2.37 GB → 1.65 GB** |

### 第三批：安全与健壮性（建议优先）

1. **密钥不再明文**：`api_keys.py` 三处日志改为打码（几行改动，收益最大）；密钥本身改为存哈希或加密
2. **`SECRET_KEY` 拒绝默认值**：启动时检测到默认值或长度过短就直接报错退出
3. **`/cleanup` 加权限**：限制为管理员，或改为内部定时任务
4. **上传加校验**：扩展名白名单 + 体积上限（与 nginx 的 `client_max_body_size` 对齐）
5. **nginx 补流式超时**：`/api` 加 `proxy_read_timeout`（并补 `/openapi/` 路由，见第 27 条）

### 第四批：提升检索质量（效果提升的主战场）

6. **修正分块**：降到 ≤450 字符或按 token 切；分隔符补 `。！？；，` —— 直接修掉「纯中文内容不进向量」和「句子被切断」两个问题（第 17、19 条）
7. 引入混合检索（BM25 + 向量 + RRF 融合）与重排模型（`bge-reranker-v2-m3`）；修多知识库联合检索（目前只用第一个）
8. 建 20–50 条黄金问答集，用 Recall@k / RAGAS 量化效果 —— 没有度量，上面两项都是盲调
9. **考虑调小 embedding 的 `batch_size`**：注意力内存大致随 batch 线性下降，可把单次向量化的 590 MB 峰值显著压低，同时也放宽入库并发上限（第 20 条）

### 第五批：工程卫生

10. 修同名重传（第 21 条）与死代码（增量更新）、增加按文档删除、清理孤儿任务行
11. 补测试与 CI：`requirements.txt` 加 `pytest` 并让 CI 真跑后端测试、`curl` 加 `--fail`、安装 `@tailwindcss/typography` 让 `prose` 生效
12. 前端清理未使用依赖、统一 lockfile（第 38 条）

---

## 13. 排错手册

| 现象 | 原因与解决 |
|---|---|
| 拉镜像 / 构建极慢或超时 | 配置国内镜像源。后端 Dockerfile 支持构建参数 `APT_MIRROR`、`PIP_INDEX_URL`、`TORCH_CPU_INDEX_URL`；无 GPU 机器务必用 CPU 版 torch，否则会拉取数 GB 的 CUDA 依赖 |
| `ports are not available: 0.0.0.0:8000/3306` | 宿主机端口被占用。本项目已将 backend 映射到 **8010**、MySQL 映射到 **3308**；如需再改，编辑 `docker-compose.dev.yml` |
| `minio/minio` 拉取报 `repository does not exist` | 改用 `quay.io/minio/minio:latest`（本项目已改） |
| 对话报 401 / `Authentication Fails` | 检查「模型设置」里的 API Key 是否填对。注意：**模型 Key 要填在「模型设置」页**，而不是「API 密钥」页（后者是给开放接口用的门禁卡） |
| 提问后长时间无任何输出 | 已修复（问题 1）：若仍出现，先确认 `docker-compose.dev.yml` 里的 `HF_HUB_OFFLINE=1` 与本地模型目录挂载是否还在，详见[第 6 节](#6-配置说明) |
| 报 `InvalidArgumentError: Collection expecting embedding with dimension of 384, got 512` | **换了向量模型但没有重建索引**。新旧向量维度不一致，必须删掉知识库重新上传，见[第 6 节](#6-配置说明)的操作步骤 |
| 启动时报找不到向量模型 / 一直卡在联网下载 | 本地模型目录没挂上或路径写错。确认 `.env` 里的 `HUGGINGFACE_EMBEDDINGS_MODEL` 是**容器内路径**（如 `/app/models/bge-small-zh-v1.5`），且 `models/` 里确实有 `model.safetensors` 等文件 |
| 中文检索效果差 / 文档里明明有却答不出 | 先确认索引是用当前向量模型建的（上上条）；再确认入库文本不是乱码——PDF 乱码问题已修复，但**旧索引仍是乱码解析出来的**，需要重新入库 |
| 检索测试页里两个数字是什么意思 | 彩色标签是「相关度」= 余弦相似度，**越大越相关**（0%–100%）；旁边灰色小字是向量库原始距离，**越小越相关**，方向相反是正常的 |
| 文档一直停在「处理中」 | 多为同名文件重复上传触发唯一约束（问题 10）。查看 `/api/knowledge-base/{id}/documents/tasks` 与后端日志 |
| 知识库删了但向量还在 | 该缺陷已修复（问题 5）。若此前删过库，可能残留历史孤儿集合，用[第 6 节](#6-配置说明)的 `curl` 命令列出集合名即可核对 |
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
