<div align="center">
  <h1>KnowBase (知库问答)</h1>
  <p>
    <strong>Turn your documents into a question-answering knowledge base — every answer comes with citations</strong>
  </p>
  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License"></a>
    <a href="#"><img src="https://img.shields.io/badge/python-3.11-blue.svg" alt="Python"></a>
    <a href="#"><img src="https://img.shields.io/badge/node-%3E%3D18-green.svg" alt="Node"></a>
  </p>
  <h4>
    <span>English</span> |
    <a href="README.zh-CN.md">简体中文</a>
  </h4>
</div>

> **Naming**: the product name shown in the UI is 知库问答; `knowbase` is the suggested repository name (they may differ).
> This project is a derivative work of the open-source [rag-web-ui](https://github.com/rag-web-ui/rag-web-ui) under Apache-2.0 — see [section 14](#14-license).
>
> **Accuracy**: this README documents **what this repository actually does**, verified by running it locally with Docker.
> Anything not present in the code is explicitly marked as *not implemented* — the upstream README used to draw
> re-ranking and distributed processing into its architecture diagram although neither exists in the code.

## Contents

- [1. Introduction](#1-introduction)
- [2. Features](#2-features)
- [3. Tech Stack](#3-tech-stack)
- [4. Architecture & RAG Pipeline](#4-architecture--rag-pipeline)
- [5. Quick Start](#5-quick-start)
- [6. Configuration](#6-configuration)
- [7. Model Settings: Multiple Profiles](#7-model-settings-multiple-profiles)
- [8. Database & Migrations](#8-database--migrations)
- [9. API Reference](#9-api-reference)
- [10. Development & Verification](#10-development--verification)
- [11. Known Limitations](#11-known-limitations)
- [12. Roadmap](#12-roadmap)
- [13. Troubleshooting](#13-troubleshooting)
- [14. License](#14-license)

---

## 1. Introduction

A decoupled frontend/backend knowledge base Q&A system: **your documents → chunking → embeddings → vector store;
at query time relevant chunks are retrieved, and an LLM answers based on them with citations.**

Good for:

- Understanding the full RAG pipeline with real code you can follow file by file (every stage maps to a file under `backend/app/`)
- Turning your own material (resumes, manuals, specs) into a searchable Q&A knowledge base
- Comparing LLMs / embedding models / vector stores

**Not** for production: this is a learning project and the current version has confirmed defects (see [section 11](#11-known-limitations)).

### What this repository adds on top of upstream

| Change | Description |
|---|---|
| 🌏 Chinese UI | ~250 strings across 20 frontend files translated; backend error messages rewritten in Chinese with recovery hints |
| 🎛️ Model settings (multiple profiles) | Per-account sets of `provider / model / api_base / API key`, switchable in one click, with a connection test; keys stored encrypted |
| 🏷️ Auto-named conversations | No title on creation: the first message names the chat (truncated fallback + background LLM refinement); renameable later |
| 🔧 Readable streaming errors | Provider errors (invalid key, insufficient balance…) surface as Chinese toasts instead of a silent stall |
| 🚀 Local environment fixes | Mirrors and port-conflict handling, persisted embedding-model cache, CPU-only torch for machines without GPU |

---

## 2. Features

### Implemented

| Area | Capability |
|---|---|
| Users | Register, login (JWT), strict per-account isolation of knowledge bases, chats and settings |
| Knowledge bases | Create, rename, delete; multiple bases per account |
| Documents | Upload PDF / DOCX / MD / TXT → **chunk preview** (adjustable chunk size) → async ingestion; processing status and error details |
| Retrieval debugging | A "test retrieval" page showing the matched chunks and their similarity scores |
| Chat | Multi-turn conversations, streaming, **citation badges** pointing back to chunks, auto-naming, rename, delete |
| Model settings | DeepSeek / OpenAI / MiniMax / Ollama, multiple profiles with one-click switching, connection test, encrypted keys |
| Open API | Retrieve from a knowledge base with `X-API-Key` via `/openapi/knowledge/{id}/query` (⚠️ see section 11) |

### Not implemented (upstream README claimed otherwise)

| Capability | Status |
|---|---|
| **Re-ranking (cross-encoder)** | ❌ None. Retrieval is a single vector-similarity top-k step |
| **Hybrid retrieval (BM25 + dense)** | ❌ None |
| Multi-knowledge-base retrieval | ❌ None. **When a chat has several bases, only the first one is searched** |
| Distributed task queue (Celery/Redis) | ❌ None. Uses FastAPI `BackgroundTasks` + `asyncio.create_task` in-process |
| Incremental updates | ❌ Code exists but is **never called** (dead code); ingestion only appends |
| Qdrant vector store | ⚠️ Adapter exists but is **untested** |
| Observability (LangSmith etc.) | ❌ None |
| Retrieval evaluation (Recall@k / RAGAS) | ❌ None |

---

## 3. Tech Stack

### Backend

| Component | Version | Role |
|---|---|---|
| Python | 3.11 | Runtime |
| FastAPI | 0.141 | Web framework |
| Uvicorn | 0.53 | ASGI server (`--reload` in dev) |
| SQLAlchemy | 2.0 | ORM |
| Alembic | 1.20 | Migrations |
| MySQL | 8.0 | Application data |
| LangChain | 0.3.30 | RAG orchestration |
| langchain-community / -openai / -deepseek / -chroma / -huggingface | — | Integrations |
| ChromaDB | 1.5 | Vector store |
| sentence-transformers | 6.0 | Local embedding model |
| torch | 2.14.0+cpu | CPU build (no GPU required) |
| MinIO SDK | 7.2 | Object storage client |
| pydantic | 2.13 | Settings & validation |
| cryptography | 50.0 | Fernet encryption for API keys |

### Frontend

| Component | Version | Role |
|---|---|---|
| Next.js | 14.2.32 | App Router |
| React | 18.3.1 | — |
| TypeScript | 5.8 | Type safety |
| Tailwind CSS | 3.4 | Styling |
| shadcn/ui + Radix UI | — | Components |
| Vercel AI SDK (`ai`) | 4.3.9 | Streaming chat (`useChat` from `ai/react`) |
| react-markdown | 9.1 | Answer rendering |

### Infrastructure

| Component | Image | Notes |
|---|---|---|
| MySQL | `mysql:8.0` | Volume `mysql_data` |
| ChromaDB | `chromadb/chroma:latest` | Volume `chroma_data` |
| MinIO | `quay.io/minio/minio:latest` | Upstream `minio/minio` fails to pull in some environments |
| Nginx | `nginx:alpine` | Single entry point and reverse proxy |

---

## 4. Architecture & RAG Pipeline

### Container topology

```
                ┌──────────────────────────────┐
   browser ────▶│  nginx  :80                  │
                │  /        → frontend:3000    │
                │  /api     → backend:8000     │
                │  /redoc, /openapi.json       │
                │  /minio/  → minio:9000       │
                └───┬───────────┬──────────────┘
                    │           │
        ┌───────────▼──┐   ┌────▼──────────┐   ┌───────────┐   ┌──────────┐
        │ frontend     │   │ backend       │──▶│ MySQL 8.0 │   │ ChromaDB │
        │ Next.js 14   │   │ FastAPI       │──▶│ app data  │   │ vectors  │
        └──────────────┘   │ LangChain     │   └───────────┘   └────▲─────┘
                           │ local embed.  │──▶ MinIO (originals)   │
                           └───────────────┘────────────────────────┘
                                   │
                                   └──▶ LLM API (DeepSeek / OpenAI / MiniMax / Ollama)
```

### Stage 1 — Offline indexing (upload → searchable)

| # | Step | Where |
|---|---|---|
| 1 | Upload to the MinIO staging prefix `kb_{id}/`, compute SHA-256 | `services/document_processor.py: upload_document` |
| 2 | **Chunk preview** (frontend-adjustable `chunk_size` / `chunk_overlap`, default 1000 / 200) | `document_processor.py: preview_document` |
| 3 | Create a `processing_tasks` row (`pending`), hand off to a background task | `api/api_v1/knowledge_base.py: /documents/process` |
| 4 | Loader by extension: PDF → `PyPDFLoader`, DOCX → `Docx2txtLoader`, MD → `UnstructuredMarkdownLoader`, else `TextLoader` | `document_processor.py: process_document_background` |
| 5 | Split: `RecursiveCharacterTextSplitter(1000, 200)` | same |
| 6 | Embed: `EmbeddingsFactory` → local `all-MiniLM-L6-v2` (384 dims) | `services/embedding/embedding_factory.py` |
| 7 | **Double write**: Chroma collection `kb_{kb_id}` + MySQL `document_chunks`; task → `completed` | `document_processor.py` |

> Two caveats: the preview parameters are **not** forwarded to step 5 (real ingestion always uses 1000/200), and
> re-uploading a file with the same name violates a unique constraint (see section 11).

### Stage 2 — Online Q&A (question → cited answer)

| # | Step | Where |
|---|---|---|
| 1 | `POST /api/chat/{id}/messages` returns an AI SDK data stream | `api/api_v1/chat.py` |
| 2 | Resolve the effective model config (active profile → else `.env`) | `services/llm/llm_config.py: resolve_chat_config` |
| 3 | Build one Chroma retriever per knowledge base, **only the first is used** | `services/chat_service.py` |
| 4 | **Query rewriting**: an LLM turns a context-dependent question into a standalone one (`create_history_aware_retriever`) | same |
| 5 | Vector recall: `as_retriever()` defaults to **k=4**, pure similarity, **no threshold, no re-ranking** | same |
| 6 | Context assembly (`create_stuff_documents_chain`) → LLM; the prompt asks for `[citation:x]` markers | same |
| 7 | Retrieved chunks travel back base64-encoded alongside the answer; the frontend renders citation badges | same + `frontend/src/app/dashboard/chat/[id]/page.tsx` |

### What this RAG version does *not* have

```
question → [query rewrite ✅] → vector recall (k=4) → [rerank ❌] → [hybrid search ❌] → assemble → LLM → cited answer
                                                     ↑ these two gaps are the main quality bottleneck
```

---

## 5. Quick Start

### Requirements

- Docker Desktop with Compose v2, 8 GB+ RAM
- Host port 80 free (gateway entry point)

### Steps

```bash
# 1) Enter the project directory (the local checkout is still named rag-web-ui)
cd rag-web-ui

# 1) Environment variables (.env is gitignored)
cp .env.example .env
#    Fill in at least the API key of your provider, e.g. DEEPSEEK_API_KEY

# 2) Start the development stack (source mounted, hot reload)
docker compose -f docker-compose.dev.yml up -d --build
```

The first build downloads 1–3 GB of dependencies; behind a slow network configure mirrors first (section 13).

### URLs

| Entry | URL |
|---|---|
| Web UI | http://127.0.0.1.nip.io |
| API docs (ReDoc) | http://127.0.0.1.nip.io/redoc |
| Backend directly (bypassing the gateway) | http://127.0.0.1:8010 |
| MinIO console | http://127.0.0.1:9001 (minioadmin / minioadmin) |

> `127.0.0.1.nip.io` is used instead of `localhost`: nip.io resolves the domain back to `127.0.0.1`, which avoids
> browser cookie/CORS quirks with `localhost`.

### Port mapping (development compose)

| Service | In container | On host | Note |
|---|---|---|---|
| nginx | 80 | **80** | Entry point |
| frontend | 3000 | **3000** | Direct Next.js access for debugging |
| backend | 8000 | **8010** | Host port 8000 is often taken by other projects |
| MySQL | 3306 | **3308** | A native MySQL may already own 3306 |
| ChromaDB | 8000 | **8001** | |
| MinIO | 9000 / 9001 | 9000 / 9001 | API / console |

### First run

1. Open http://127.0.0.1.nip.io and register an account
2. **模型设置 (Model settings)** → create a profile (provider + API key) → "Test connection" → save
3. **知识库 (Knowledge base)** → create one → upload a document → preview chunks → confirm ingestion
4. **对话 (Chat)** → create a chat, pick a knowledge base, ask a question (the title is auto-generated from your first message)
5. To inspect retrieval quality, use the built-in "test retrieval" page

### Stopping

```bash
docker compose -f docker-compose.dev.yml down          # stop, keep volumes
docker compose -f docker-compose.dev.yml down -v       # stop and drop data volumes
docker compose -f docker-compose.dev.yml logs -f backend
```

---

## 6. Configuration

Everything lives in `.env` (see `.env.example`). Defaults below are **read from the code** (`backend/app/core/config.py`).

### Chat models

| Variable | Default | Notes |
|---|---|---|
| `CHAT_PROVIDER` | `openai` | `openai` / `deepseek` / `minimax` / `ollama` |
| `OPENAI_API_KEY` / `_API_BASE` / `_MODEL` | - / `https://api.openai.com/v1` / `gpt-4` | OpenAI |
| `DEEPSEEK_API_KEY` / `_API_BASE` / `_MODEL` | - / `https://api.deepseek.com/v1` / `deepseek-chat` | DeepSeek |
| `MINIMAX_API_KEY` / `_API_BASE` / `_MODEL` | - / `https://api.minimax.io/v1` / `MiniMax-M2.7` | MiniMax |
| `OLLAMA_API_BASE` / `OLLAMA_MODEL` | `http://localhost:11434` / `deepseek-r1:7b` | Local models (use `host.docker.internal` from inside containers) |

> Profiles saved in the UI take precedence over `.env` (section 7).

### Embedding models (drives retrieval quality; `.env` only, then re-index)

| Variable | Default | Notes |
|---|---|---|
| `EMBEDDINGS_PROVIDER` | `openai` | `openai` / `dashscope` / `ollama` / `huggingface` |
| `HUGGINGFACE_EMBEDDINGS_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | Local, 384 dims; **switching models requires re-indexing** |
| `HUGGINGFACE_API_KEY` | empty | Only for private models |
| `OPENAI_EMBEDDINGS_MODEL` | `text-embedding-ada-002` | With OpenAI embeddings |
| `DASH_SCOPE_API_KEY` / `DASH_SCOPE_EMBEDDINGS_MODEL` | empty | Alibaba DashScope |
| `OLLAMA_EMBEDDINGS_MODEL` | `nomic-embed-text` | Local Ollama embeddings |

### Vector store & object storage

| Variable | Default | Notes |
|---|---|---|
| `VECTOR_STORE_TYPE` | `chroma` | Only `chroma` is verified |
| `CHROMA_DB_HOST` / `CHROMA_DB_PORT` | `chromadb` / `8000` | In-container addresses |
| `QDRANT_URL` / `QDRANT_PREFER_GRPC` | `http://localhost:6333` / `true` | Untested |
| `MINIO_ENDPOINT` | `localhost:9000` | Use `minio:9000` inside the compose network |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` / `MINIO_BUCKET_NAME` | `minioadmin` / `minioadmin` / `documents` | |

### Database & auth

| Variable | Default | Notes |
|---|---|---|
| `MYSQL_SERVER` / `_PORT` | `localhost` / `3306` | Use `db` / `3306` inside compose |
| `MYSQL_USER` / `_PASSWORD` / `_DATABASE` | `ragwebui` / `ragwebui` / `ragwebui` | |
| `SECRET_KEY` | `your-secret-key-here` | ⚠️ Also derives the key-encryption key; **changing it makes stored API keys undecryptable** |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` (7 days) | |
| `TZ` | `Asia/Shanghai` | |

### Chat title auto-naming (added in this repository)

| Variable | Default | Notes |
|---|---|---|
| `CHAT_TITLE_LLM` | `true` | Name from the truncated first message, then refine in the background; `false` skips the extra model call |
| `CHAT_TITLE_MAX_LENGTH` | `30` | Max characters of the truncated title |
| `CHAT_TITLE_LLM_TIMEOUT` | `15` | Background refinement timeout (seconds) |

### A working local setup

```ini
CHAT_PROVIDER=deepseek
EMBEDDINGS_PROVIDER=huggingface      # runs locally, no cost, no API key (model downloads on first use)
HF_ENDPOINT=https://hf-mirror.com    # mirror for faster model downloads
VECTOR_STORE_TYPE=chroma
```

---

## 7. Model Settings: Multiple Profiles

An account can keep **several** model profiles and switch between them in one click; the change applies to all
subsequent conversations.

**Precedence**: the active profile → (otherwise) `.env` defaults.

| Concept | Behavior |
|---|---|
| Profile | `name + provider + model + api_base + API key` |
| Active | At most one is active; the first profile created is activated automatically |
| Deletion | Deleting the active profile promotes another one; deleting all falls back to `.env` |
| Key storage | Fernet-encrypted with a key derived from `SECRET_KEY`; the API only returns masked values (`sk-818…27d1`) |

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/settings/models` | List + currently effective config + provider options |
| POST | `/api/settings/models` | Create (`activate` controls immediate switching) |
| PATCH | `/api/settings/models/{id}` | Update; empty `api_key` = keep the stored one; empty `api_base`/`model` = fall back to defaults |
| DELETE | `/api/settings/models/{id}` | Delete |
| POST | `/api/settings/models/{id}/activate` | **Switch to this profile** |
| DELETE | `/api/settings/models` | Clear all profiles (back to `.env`) |
| POST | `/api/settings/models/test` | Connection test (by `id`, or with unsaved draft fields) |

> The legacy single-profile endpoints (`/api/settings/model`) still work and write to the *active* profile.

---

## 8. Database & Migrations

| Table | Purpose |
|---|---|
| `users` | Accounts |
| `knowledge_bases` / `documents` / `document_uploads` | Knowledge bases, documents, upload records |
| `document_chunks` | Chunk records (text duplicated here alongside Chroma) |
| `processing_tasks` | Document ingestion task status |
| `chats` / `messages` / `chat_knowledge_bases` | Conversations, messages, chat↔KB links |
| `model_profiles` | Model profiles (encrypted keys, active flag) |
| `api_keys` | Open-API keys (⚠️ stored in plaintext) |
| `alembic_version` | Current revision (`d4f8b2c605ae`) |

```bash
docker compose -f docker-compose.dev.yml exec backend alembic current
docker compose -f docker-compose.dev.yml exec backend alembic upgrade head
docker compose -f docker-compose.dev.yml exec backend alembic downgrade -1

docker compose -f docker-compose.dev.yml exec db mysql -uragwebui -pragwebui ragwebui \
  --default-character-set=utf8mb4 -e "SHOW TABLES;"
```

---

## 9. API Reference

Business endpoints require `Authorization: Bearer <token>`; the open endpoint uses `X-API-Key: <key>`.

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/token`, `POST /api/auth/test-token` |
| Knowledge bases | `GET/POST /api/knowledge-base`, `GET/PUT/DELETE /api/knowledge-base/{id}` |
| Documents | `POST /api/knowledge-base/{id}/documents/upload`, `…/preview`, `…/process`, `GET …/tasks`, `GET …/documents/{doc_id}` |
| Retrieval debug | `POST /api/knowledge-base/test-retrieval` |
| Chat | `GET/POST /api/chat`, `GET/PATCH/DELETE /api/chat/{id}`, `POST /api/chat/{id}/messages` (streaming) |
| Model settings | see [section 7](#7-model-settings-multiple-profiles) |
| Open-API keys | `GET/POST /api/api-keys`, `PUT/DELETE /api/api-keys/{id}` |
| Open retrieval | `GET /openapi/knowledge/{kb_id}/query?query=…&top_k=3` (⚠️ section 11) |
| Health | `GET /api/health` |

Interactive docs: http://127.0.0.1.nip.io/redoc

---

## 10. Development & Verification

The dev compose file mounts the sources: **backend Uvicorn runs with `--reload` and the frontend hot-reloads**.
`.env` changes require recreating the container.

```bash
docker compose -f docker-compose.dev.yml exec frontend npx tsc --noEmit
docker compose -f docker-compose.dev.yml exec frontend npx jest --ci

docker compose -f docker-compose.dev.yml exec backend python -c "import app.main"
docker compose -f docker-compose.dev.yml logs -f --tail=100 backend

docker compose -f docker-compose.dev.yml up -d --build backend   # after dependency/env changes
```

**Layout**

```
backend/app/
├── api/api_v1/          # auth / knowledge_base / chat / api_keys / settings
├── api/openapi/         # X-API-Key retrieval endpoint
├── core/                # settings, security, crypto, MinIO client
├── models/  schemas/    # SQLAlchemy models, Pydantic schemas
└── services/
    ├── document_processor.py   # upload / preview / async ingestion
    ├── chat_service.py         # RAG pipeline (retrieve + generate + stream)
    ├── embedding/  llm/  vector_store/

frontend/src/
├── app/dashboard/       # overview / knowledge / chat / test-retrieval / settings / api-keys
├── components/          # chat, knowledge-base, layout, ui
└── lib/api.ts
```

---

## 11. Known Limitations

All of the following were reproduced locally — they are measurements, not guesses.

### Quality & experience

| # | Issue | Evidence | Impact |
|---|---|---|---|
| 1 | **~20 s wait before every answer** | Simplest possible question (no KB, retrieval skipped): TTFB = **19.53 s**. Cause: the embedding model is rebuilt and re-validated against the Hub on every request; with `HF_HUB_OFFLINE=1` the same load takes **1.75 s** | Users think the app hung |
| 2 | **PDF text extraction produces mojibake** | 4/4 chunks of a PDF contained 18–23% invalid characters (`'–෬ + BM25đ RRFೆ Rerankஆđ…'`); PyMuPDF extracts the same page perfectly | Chinese semantic retrieval is effectively broken |
| 3 | **Only the first knowledge base is searched** | `vector_stores[0]` in `chat_service.py` | Extra bases are silently ignored |
| 4 | **Weak embedding model + silent truncation** | `all-MiniLM-L6-v2` (English corpus, 384 dims, 256-token cap); measured chunks are 368–376 tokens, so **~30% of each chunk never reaches the embedding** | Hard ceiling on recall |
| 5 | Chunk-size setting has no effect on ingestion | The preview endpoint accepts it, ingestion never receives it (always 1000/200) | The control is decorative |
| 6 | No re-ranking, no hybrid search, no score threshold, fixed k=4, fixed-size chunking | Absent from the code | A better chunk ranked 4th can never be promoted |

### Functional defects

| # | Issue | Detail |
|---|---|---|
| 7 | **Deleting a knowledge base leaves its vectors behind** | Measured: the API returns `HTTP 200` with `warnings: ["Failed to clean up vector store: Chroma.delete_collection() takes 1 positional argument but 2 were given"]`; the collection survives. **Orphan collections have accumulated** (Chroma holds kb_1–kb_4, MySQL only kb_2) |
| 8 | Re-uploading a same-named file | Violates `uq_kb_file_name` → rollback error → the task is **stuck in `processing` forever** |
| 9 | Incremental update is dead code | `process_document()` / `ChunkRecord` are never called; ingestion only appends |
| 10 | No per-document delete endpoint | Only whole knowledge bases can be removed |
| 11 | MySQL and Chroma writes are not atomic | A failed Chroma write does not roll back the database |
| 12 | Orphan task rows | Deleting a KB leaves `processing_tasks` rows (1 measured) |
| 13 | Open API unusable through the gateway | No `/openapi/` location in nginx → the documented call necessarily 404s; plus the key-delete button always errors (frontend misreads `response.ok`) and keys are stored in plaintext |
| 14 | No task queue | A restart drops in-flight ingestion; tasks stay stuck |

---

## 12. Roadmap

Ordered by return on effort; the first three are small and immediately visible.

### Batch 1 — fix defects

1. **Remove the ~20 s per-question overhead**: set `HF_HUB_OFFLINE=1` (the model is already cached) and make the embeddings instance a module-level singleton
2. **Fix PDF extraction**: `PyPDFLoader` → `PyMuPDFLoader`, then **re-index the affected knowledge base**
3. **Fix KB deletion cleanup**: call the project's own `vector_store.delete_collection()`, and clean up existing orphans

### Batch 2 — retrieval quality

4. Switch to a Chinese-capable embedding model (`BAAI/bge-small-zh-v1.5` or `bge-m3`) sized to its token limit; re-index
5. Add hybrid retrieval (BM25 + dense + RRF) and a re-ranker (`bge-reranker-v2-m3`); fix multi-KB retrieval
6. Build a 20–50 question golden set and measure Recall@k / RAGAS

### Batch 3 — engineering hygiene

7. Turn off `set_verbose(True)` / `set_debug(True)` in `chat_service.py` (huge log noise, slows streaming)
8. Fix same-name re-upload and dead code, add per-document deletion, add tests and CI
9. Either wire up `/openapi/` in nginx or retire the open-API page (removing three defects at once)

---

## 13. Troubleshooting

| Symptom | Cause & fix |
|---|---|
| Builds/pulls are extremely slow or time out | Configure mirrors. The backend Dockerfile accepts `APT_MIRROR`, `PIP_INDEX_URL`, `TORCH_CPU_INDEX_URL`; on GPU-less machines use CPU-only torch or several GB of CUDA wheels will be pulled |
| `ports are not available: 0.0.0.0:8000/3306` | Host ports taken. This repo maps backend to **8010** and MySQL to **3308**; edit `docker-compose.dev.yml` to change |
| `minio/minio` → `repository does not exist` | Use `quay.io/minio/minio:latest` (already applied here) |
| Chat returns 401 / `Authentication Fails` | Check the API key in **Model settings**. The provider key belongs there — not on the "API keys" page, which issues keys for the open API |
| No output for ~20 s after asking | See limitation 1: the embedding model reloads and re-validates online; set `HF_HUB_OFFLINE=1` |
| Chinese answers are wrong although the document contains the facts | Check whether ingested text is mojibake (limitation 2), then whether the embedding model suits Chinese (limitation 4) |
| Document stuck in "processing" | Usually a same-named re-upload (limitation 8); inspect `/api/knowledge-base/{id}/documents/tasks` and backend logs |
| Deleting a KB does not free vectors | Known (limitation 7); the Chroma collection is orphaned |
| Calling the backend directly returns 307 | FastAPI redirects `/api/chat` to `/api/chat/`; use `curl -L` (browsers follow automatically) |
| Frontend `Maximum update depth exceeded` | Historical streaming re-render loop; fixed by stabilising the citation data dependency |

See also [docs/troubleshooting.md](docs/troubleshooting.md).

---

## 14. License

This project (**KnowBase / 知库问答**) is a derivative work of the open-source project
**[rag-web-ui](https://github.com/rag-web-ui/rag-web-ui)**, licensed under
[Apache-2.0](LICENSE). Copyright of the original project belongs to its authors. The changes made here
(Chinese UI, multiple model profiles, auto-named conversations, …) are listed in
[section 1](#1-introduction).

As required by Apache-2.0:

- the original [`LICENSE`](LICENSE) and copyright notices are retained;
- this project is **not** an official upstream release and carries no endorsement from the upstream authors;
- for the original project see [github.com/rag-web-ui/rag-web-ui](https://github.com/rag-web-ui/rag-web-ui).

The upstream project is intended for **learning and sharing RAG knowledge**; do not use it commercially. It is under
active development, has the issues listed above, and is **not production-ready**.

### Acknowledgements

[FastAPI](https://fastapi.tiangolo.com/) · [LangChain](https://python.langchain.com/) · [Next.js](https://nextjs.org/) · [ChromaDB](https://www.trychroma.com/) · [MinIO](https://min.io/) · [shadcn/ui](https://ui.shadcn.com/) · [Vercel AI SDK](https://sdk.vercel.ai/)
