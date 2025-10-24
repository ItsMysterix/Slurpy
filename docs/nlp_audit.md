## NLP and Emotion Stack Audit

This report documents what runs in production for sentiment/emotion/toxicity, the data paths, runtime characteristics, and risks, with a concrete TODO list.

### Inventory: models and logic

- Tokenization/NER/keyphrases: spaCy `en_core_web_sm` via `slurpy.domain.nlp.service._nlp()`
- Sentiment (3-class): Hugging Face `cardiffnlp/twitter-roberta-base-sentiment-latest` via transformers `pipeline('text-classification')`
- Emotion (fine-grained → buckets): Hugging Face `SamLowe/roberta-base-go_emotions` via transformers `pipeline('text-classification')`
  - Mapped to buckets {anxious, angry, sad, neutral} using `_map_goemotion_to_bucket`, with lexical fallback for ambiguous/neutral
- Toxicity: Hugging Face `unitary/unbiased-toxic-roberta` via transformers `pipeline('text-classification')`
- Local/optional emotion model: `emotion/model` (DistilBERT), used as a background best-effort in MCP worker only
- Caching: lazy singletons via `functools.lru_cache(maxsize=1)` for all pipelines and spaCy model

Primary inference path in production
- `classify_emotion_bucket(text)` → top GoEmotions label → bucket mapping → smoothing → lexical fallback
- `analyze_text(text)` bundles tokens, entities, keyphrases, sentiment triple, emotion scores, and toxicity score

Additional heuristics
- CEL layer (`slurpy.domain.cel.service`) uses regex hints (ANX/ANG/SAD patterns) and can trigger LLM routing when confidence is low; RAG layer uses the bucket and intensity to build prompts

### Runtime verification (local probe)

Collected with `backend/scripts/nlp_probe.py` on macOS (Apple Silicon); results may vary per host.

- Versions: transformers 4.53.2; torch 2.9.0; spaCy 3.7.4; Python 3.11.9
- Device: mps:0 (Apple Metal accel) for all three HF pipelines
- Models/params:
  - sentiment: 124,647,939 params; model_id `cardiffnlp/twitter-roberta-base-sentiment-latest`; tokenizer max_length ~1e15 (HF special value)
  - emotion: 124,667,164 params; model_id `SamLowe/roberta-base-go_emotions`; tokenizer max_length 512
  - toxicity: 124,657,936 params; model_id `unitary/unbiased-toxic-roberta`; tokenizer max_length 512
- spaCy pipeline: `['tok2vec','tagger','parser','attribute_ruler','lemmatizer','ner']`
- Latency samples:
  - analyze_text ~64 tokens (cold): ~2.0s first call (model load)
  - analyze_text ~64 tokens (warm): ~37 ms avg
  - analyze_text ~256 tokens (warm): ~392 ms avg
  - classify_emotion_bucket ~64 tokens (warm): ~28 ms avg
- Local DistilBERT emotion: not required; probe reports unavailable if model assets missing

How to run the probe
- From repo root: `python backend/scripts/nlp_probe.py` (ensure backend venv + requirements installed)

### Data paths and PII

Where text is persisted (no redaction by default):
- Analytics write path `slurpy.domain.analytics.collectors.add_msg(...)` stores raw `content/text` in `chat_messages` (or legacy tables), plus session-level summaries
- Memory write path `slurpy.domain.memory.service.add_message(...)` stores text in Qdrant payload and embeds it

What’s available but not used in writes:
- `slurpy.domain.nlp.service.redact(text)` provides regex + spaCy-entity masking (`▇▇`) for PERSON/GPE/LOC/ORG, emails, phones, URLs; it is exposed via MCP HTTP `/api/nlp/redact` and not applied automatically on analytics/memory writes

Retention and scrubbing:
- No retention policy is enforced in code for chat_messages or Qdrant payloads; no automated scrubbing of PII at rest

### Interfaces and contracts

Backend FastAPI (RAG server):
- Non-streaming: `POST /rag/rag/chat?msg=...&mode=...&session_id=...` → `{ reply, emotion, fruit }`
- Streaming NDJSON: `POST /rag/rag/chat/stream?msg=...` → kickoff `{type:'start', emotion, fruit}`, then `{type:'delta', text}`, then `{type:'done'}`
- Modes list: `GET /rag/rag/modes`

MCP worker FastAPI:
- `POST /v1/mcp/chat` → `{ reply, emotions: [label?] }` (may emit empty emotions list)
- `POST /v1/mcp/stream` → NDJSON kickoff `{type:'start', emotion, fruit}`; then `{type:'delta', text}`; then `{type:'done'}`
- `POST /api/nlp/analyze` and `/api/nlp/redact` for utility

Frontend proxies:
- Non-stream proxy uses `lib/rag.askRag(text, sessionId, jwt)` with default `NEXT_PUBLIC_RAG_API` → currently defaults to `http://127.0.0.1:8000/chat` (note: mismatch with RAG router paths)
- Streaming proxy `app/api/proxy-chat-stream` hits `${BACKEND_URL}/chat_stream` and transforms upstream NDJSON `{text|delta|token}` into `{type:'delta', delta, id}` with a mid-stream rate limit

Contract notes:
- The streaming transform accepts `{text}` and `{delta}` fields; RAG/MCP emit `{text}` in delta frames; kickoff carries `{emotion,fruit}`
- Frontend caps stream events to 5000 and supports a per-minute limiter (E2E tests validate rate-limited mid-stream behavior)

### Risks and observations

- PII at rest: raw message text is stored in analytics (Postgres via Supabase) and Qdrant payloads without redaction. Risk: PII exposure during breach or internal access
- Endpoint mismatch: defaults in `lib/rag.ts` and stream proxy paths (`/chat` and `/chat_stream`) don’t match current RAG/MCP routes. This can cause 404s unless an external proxy remaps paths
- Token length bounds: MCP NLP endpoints enforce `text <= 5000` chars; internal calls to `analyze_text` don’t enforce bounds; long inputs could degrade latency/memory
- First-call latency: ~2s cold for analyze; mitigated by `warmup_nlp()` on MCP startup, but not necessarily on all workers if multiple processes fork
- Device variability: On Apple Silicon the transformers stack uses `mps`; on Linux it’ll likely be CPU unless CUDA is configured; consider explicit device selection to avoid surprises
- GoEmotions top_k=None returns all scores; we select the top items but should cap downstream payload sizes
- Memory write availability: Memory service connects to Qdrant on import-time construction; if misconfigured, it raises early

### TODOs (prioritized)

1) Redaction/PII controls
- Add a feature flag (e.g., `ANALYTICS_REDACT=true`) to apply `nlp.redact` to message text before writes in `analytics.collectors.add_msg` and `memory.service.add_message`
- Optionally store raw text only in a sealed bucket (S3) with server-side encryption and store references in DB/vector store

2) Endpoint alignment
- Update `lib/rag.ts` default to MCP or RAG routes actually deployed; e.g., `/v1/mcp/chat` or `/rag/rag/chat` and ensure parameter shapes match (query vs JSON)
- Update `proxy-chat-stream` to target MCP `/v1/mcp/stream` or RAG `/rag/rag/chat/stream` consistently; add config guardrails and health checks

3) Input bounds and timeouts
- Enforce a length cap in `analyze_text` callers (or inside the function) to ~2000–5000 chars; return a 413/validation error at API edges
- Consider `classify_emotion_bucket_async` with a short timeout on hot paths; propagate graceful fallback without blocking

4) Observability & drift
- Log model IDs and device once at startup (we printed them in the probe; replicate in MCP startup)
- Add a tiny health endpoint (already present) that also reports NLP warmup status

5) Memory & analytics resiliency
- Defer `MemoryService` connection until first use to avoid import-time failures
- Wrap Qdrant writes with clearer best-effort logging and backpressure; consider a queue with retry/dead-letter

6) Testing
- Add unit tests for endpoint contracts for MCP and RAG (kickoff frame shape, delta mapping)
- Add tests for redaction correctness on typical PII (emails, phones, URLs, PERSON/GPE)

### How to validate locally

- Install backend requirements into a venv and run the probe:
  - `python backend/scripts/nlp_probe.py`
- Run classifiers smoke tests (no external services required):
  - `QDRANT_URL=http://localhost:6333 pytest -q backend/tests/test_nlp_classifiers.py`

### Success criteria to consider

- No raw PII stored at rest by default (or a clear toggle to enable redaction)
- Frontend proxies hit consistent, documented backend paths
- Emotion bucket output is stable and bounded; latency is consistently < 150ms for 64-token texts on warm runs
- Startup warmup logs surface model/device details for auditability
