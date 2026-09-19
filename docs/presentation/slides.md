---
marp: true
paginate: true
title: Mini Doctor Appointment + RAG Chatbot
description: Technical walkthrough for the Senior Full-Stack assessment
---

# Mini Doctor Appointment + RAG Chatbot

**Technical walkthrough** — assignment §25

Ionic React (Android) · Payload CMS 3 · Go RAG · MongoDB Atlas Local · Ollama

What I will cover: requirement → plan → execution → RAG reliability → CSRF → **EC2** deploy

---

# What the brief asked for (§1–2)

Two products in one system:

1. **Doctor appointment app** — register, browse doctors, book a slot, see my booking
2. **Grounded healthcare chatbot** — answer only from 3 PDFs, never invent medical facts
3. **Admin workflow** — unanswered questions land in Payload as New → human response → Resolved

**Stack (required):** Ionic React + Android, Node/TypeScript, Payload CMS, MongoDB, REST, LLM, vector store

UI polish is not the grade. Architecture, correctness, and explanation are.

---

# How I planned (not a big-bang)

Nine phases in `docs/plan-docs/01-implementation-plan.md`, mandatory first:

| Phase | Focus | Why that order |
| --- | --- | --- |
| 0 | Pins, one Mongo, lint | Later work compounds on this |
| 1 | Payload model | Doctors, media, slots |
| 2 | Booking + concurrency | 15% of the grade |
| 3 | Mobile screens | All required flows |
| 4–5 | RAG ingest + gates | 20% of the grade |
| 6 | Chat + unresolved | Admin workflow |
| 7–8 | Tests, Docker, README | Proof + deliverables |

Optional extras only after the §26 checkboxes were green.

---

# Architecture I shipped

```
  Ionic / Capacitor APK
           │  REST + JWT
           ▼
     nginx :80  (public edge)
           │
           ▼
     Payload CMS  ──  admin, auth, booking, POST /api/chat
        │                    │  X-RAG-Internal-Secret
        │                    ▼
        │              Go RAG (no host port)
        │                    │
        ▼                    ▼
   Atlas Local 8         Ollama (packed)
    doctor_app            llama3.2 + nomic-embed-text
    rag_vectors           $vectorSearch
```

**Boundary (ADR-006):** phones never talk to Go or Ollama. `/api/internal/*` is denied at nginx.

---

# Data model (Payload)

**`doctor_app` (CMS)**

- `users` — `admin` | `patient` (first admin-UI user is promoted)
- `doctors` + `media` photos
- `appointment-slots` (`startsAt`, `durationMinutes`, `endsAt`)
- `appointments` (`booked` | `cancelled`)
- `knowledge-files` / `knowledge-documents`
- `unresolved-queries` (`new` | `resolved`)

**`rag_vectors` (Go only)**

- `knowledge_chunks` + Atlas Vector Search index

One Atlas Local instance, two logical databases — transactions *and* `$vectorSearch` on the same server.

---

# Booking: why the UI check is not enough (§6)

Two patients tap the same 10:00 slot.

I used **three layers**, all on the server:

1. **CAS** — book only if `slot.status` is still `available`
2. **Partial unique index** `uniq_active_slot` on `{ slot }` where `status: booked`
3. **Transaction** when `replicaSet=mongodb` is in the URI; otherwise a compensating delete if the slot CAS loses the race

Client-side “is this slot free?” is a hint. The 409 `SLOT_UNAVAILABLE` is the contract.

Proof: `tests/booking-concurrency.ts` — 25 parallel books → **1×201 + 24×409**.

---

# AuthZ that matches the brief (§4, §15)

- Patients: `POST /api/auth/patient/register` and `/login`
- Mobile stores JWT in `@capacitor/preferences`, sends `Authorization: JWT <token>` (cookies fail in the WebView)
- `ownAppointments` — User A cannot read User B
- Booking **derives `patient` from `req.user`**; collection `create` on appointments is closed
- Unresolved-query `create` is closed; Payload writes the row with `overrideAccess` after RAG says insufficient

---

# RAG ingest (assignment §8)

```
PDF → extract text + page map
    → chunk (~overlap, page metadata)
    → embed (nomic-embed-text, 768d, document prefix)
    → upsert into rag_vectors
```

- Admin upload **or** seed copies `docs/knowledge/*.pdf`
- `afterChange` marks `processing`, then POST to Go (async 202)
- Re-index **deletes then inserts** by `documentId` so a replaced PDF cannot leave stale vectors
- Go never holds API keys — it asks Payload `/api/internal/embeddings`

---

# RAG query (assignment §9)

```
Question
  → embed with search_query: prefix (nomic is asymmetric)
  → $vectorSearch (cosine; Atlas score = (1+cos)/2)
  → three sufficiency gates
  → only then LLM, with retrieved chunks as the only context
  → answer + source title + page chips
```

The LLM is instructed to use retrieved context only. That prompt is **not** the whole reliability story.

---

# Hallucination is a product requirement (§10, §13)

> Vector search returning something ≠ we can answer.

Three gates, every medical question:

1. **Score floor** `RAG_MIN_SCORE = 0.50` — ~0.50 is orthogonal on Atlas, not “pretty good”
2. **Evidence** — at least one chunk, and either a **strong** hit (`0.58`) **or** lexical coverage (`0.25` of content words). This is Test 3: related topic, wrong question
3. **LLM JSON self-check** `{ sufficient, answer, source_chunk_ids, confidence }` — malformed JSON = insufficient

Failed gate → fixed fallback copy, **no** invented dosage, unresolved row with `topScore` + `reason`.

---

# What I enhanced beyond the brief

| Brief (enough) | What I added | Why |
| --- | --- | --- |
| One LLM | Admin **RAG Settings**: Ollama / OpenAI / Anthropic / Gemini / OpenRouter / DeepSeek | Swap models without a rebuild |
| Host Ollama | **Packed** `llama3.2` + `nomic-embed-text` in Compose | EC2 has no host daemon |
| Source title | **Page chips** on mobile | Traceable answers |
| Fallback | Distinct UI + `retrievalReason` in admin | Tune gates from real misses |
| Optional Docker | Full stack + **nginx edge** | Demo on a public IP |
| — | Redis multi-turn chat; greetings skip RAG | Less “I don’t know” on “hi” |
| — | Suggested question chips | Faster evaluator path |

Mandatory checkboxes were closed **before** these.

---

# AI features I tightened after first RAG failures

Problems I actually hit:

- **nomic** needs `search_query:` / `search_document:` prefixes or retrieval is noise
- Embeddings **L2-normalised** so cosine is meaningful
- Ollama embed path when Atlas `$vectorSearch` is cold
- **Lexical fallback** when vectors are weak but words match
- Hardcoded “hi/hello” was wrong — greetings now go through the **chat** model, medical questions still through RAG
- `topScore` / `confidence` returned to the phone so we can see why a gate fired

---

# CSRF: login 200 then bounce to `/admin/login`

**Symptom on EC2:** `POST /api/users/login` → 200, then `GET /admin?_rsc=…` → redirect to login.

**Cause:** Next.js client navigation is a **fetch**, so the browser sends `Origin: http://<elastic-ip>`. Payload `extractJWT` **drops the cookie** unless Origin is an exact CSRF allowlist match. `:3000` vs no port is a different Origin. nginx sits on **80**; Payload was advertising **:3000**.

**Not CORS.** Same-origin admin. `MOBILE_ORIGIN` is for the phone.

---

# How I fixed CSRF / admin session

1. `PAYLOAD_PUBLIC_URL=http://<elastic-ip>` — **no `:3000`**
2. nginx forwards `Host`, `X-Forwarded-Host`, `Origin`
3. Auth cookie: `SameSite=Lax`, `Secure=false` (HTTP)
4. `useSessions: false` — hidden `sessions` field + JWT `sid` made RSC look logged out
5. Custom **cookie JWT strategy** that authenticates from `payload-token` without the Origin allowlist; SameSite=Lax still blocks cross-site cookie use
6. Next 16 `force-dynamic` on `/admin` so the RSC payload is not a cached anonymous redirect

Security groups: **22 + 80 only**. Go `:8080`, Ollama `:11434`, Mongo `:27017` stay unpublished.

---

# Deploy: AWS EC2, not ECS

I ran **one Ubuntu EC2** with Docker Compose. That matches a 16–20 hour assessment (one box, one public URL).

```
./infrastructure/nginx/deploy.sh --bootstrap --ec2
```

| Piece | Where |
| --- | --- |
| nginx | Host port **80** only |
| Payload | Compose DNS `cms:3000` |
| Go RAG | `rag:8080` — internal |
| Ollama | `ollama:11434` — models pulled on first boot |
| Overlay | `docker-compose.ec2.yml` strips DB/CMS host ports |

**Why not ECS today:** needs ALB, task roles, image registry, and split services. Next step if we scale: ECS Fargate for `cms` + `rag`, Atlas cloud instead of Atlas Local, Ollama on a GPU instance or a hosted LLM.

---

# What EC2 taught us (ops, not code)

| Issue | Fix |
| --- | --- |
| Default AMI **8 GiB disk** | Resize EBS to **40 GiB** (Ollama image + models + Atlas Local JDK) |
| **7.6 GiB RAM** is tight | Prefer **16 GiB**; else 8 GiB swap (slow) |
| Security group missing **80** | Localhost worked; public IP timed out |
| `pnpm docker:seed` without overlay | Would republish `:27017` / `:3000` → use `docker:seed:ec2` |
| APK still on `10.0.2.2:3000` | `VITE_*` is baked at **web build**, not Gradle |

---

# Demo map (assignment tests)

**Appointment**

1. Register → login → doctor → slot → book → My Appointment
2. Two books, same slot → one 201, one 409
3. User A cannot see User B

**RAG**

1. Answerable (nutrition from a PDF) → grounded answer + source
2. Medication dosage **not** in PDFs → fallback + Unresolved **New**
3. Weakly related → gate 2 (coverage) should refuse
4. Admin types `humanResponse`, marks **Resolved**

---

# Tradeoffs I would name in Q&A

- **Go unpublished vs public RAG API** — extra hop, but keys and PDFs stay off the phone
- **Atlas Local vs Atlas cloud** — `$vectorSearch` + transactions on a laptop/EC2; not HA
- **Ollama 3B on CPU** — free and private; slower than Gemini/OpenAI
- **Empty CSRF allowlist + cookie strategy** — required for nginx HTTP admin; SameSite=Lax remains
- **Compose on EC2 vs ECS** — shipped the demo; ECS when we need independent deploys

---

# AI-assisted development (§18)

**Tool:** Cursor (this repo).

**AI drafted, I reviewed:** collection configs, booking endpoint first pass, Go packages, mobile screens, README.

**I designed / rewrote:** three-layer booking, replica-set vs `directConnection` compensation, three-gate sufficiency, nomic prefixes, EC2 overlay, CSRF/session diagnosis.

**AI mistakes that did not ship:** `create: false` on required `patient` (bookings always 400); JWT stored but never sent; `replicaSet=rs0` (Atlas Local names the set after hostname).

The grade is whether I can explain and correct that — not whether I typed every line.

---

# What I want the reviewer to remember

1. **Boundaries** — mobile → Payload → Go → LLM. Secrets never leave the backend.
2. **Concurrency** — unique index + CAS + transaction, proven with 25 parallel requests.
3. **Grounding** — retrieval is not permission to speak; three gates + unresolved inbox.
4. **Ops** — nginx + packed Ollama on EC2; Go stays dark; CSRF was a reverse-proxy Origin bug, not “broken login”.

Questions.
