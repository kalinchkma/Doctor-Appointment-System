# Mini Doctor Appointment + RAG Healthcare Chatbot

A monorepo containing an Ionic React mobile application, Payload CMS acting as
both the admin panel and the public REST API, and an internal Go service that
owns the RAG pipeline. MongoDB stores application data and the knowledge
vectors.

> **Status: appointment booking and the RAG chatbot are implemented.** See
> [`docs/plan-docs/00-implementation-audit.md`](docs/plan-docs/00-implementation-audit.md)
> for the current scorecard and
> [`docs/plan-docs/03-running-plan.md`](docs/plan-docs/03-running-plan.md)
> for how to run the stack.

## Architecture

```
        Ionic React (Android / iOS / web)
                    │  HTTPS / REST
                    ▼
        Payload CMS  ──  admin, REST API, auth, business logic
           │                        │
           │ MongoDB                │ internal HTTP + shared secret
           │                        ▼
           │                Go RAG service  ──  PDF, chunking, embeddings,
           │                        │           retrieval, relevance, LLM
           ▼                        ▼
        MongoDB (Atlas Local)
          doctor_app    — users, doctors, slots, appointments, CMS metadata
          rag_vectors   — knowledge chunks + embeddings ($vectorSearch)
```

The Go service has no published host port. Only Payload can reach it, and only
over the Compose network (ADR-006). LLM and embedding credentials live on the
backend and never reach the mobile bundle (ADR-017).

## Documentation

| Document                                                          | Contents                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------ |
| [Implementation audit](docs/plan-docs/00-implementation-audit.md) | What works, what is missing, known defects             |
| [Implementation plan](docs/plan-docs/01-implementation-plan.md)   | Nine phases with estimates and a scope cut line        |
| [Testing plan](docs/plan-docs/02-testing-plan.md)                 | Test strategy, concurrency test, threshold calibration |
| [Running plan](docs/plan-docs/03-running-plan.md)                 | Three run modes, first-run sequence, troubleshooting   |
| `docs/plan-docs/*.docx`                                           | Original system design and ADRs                        |
| `docs/assignment-docs/`                                           | The assessment brief                                   |

## Prerequisites

| Tool                 | Version                | Needed for                                     |
| -------------------- | ---------------------- | ---------------------------------------------- |
| Node.js              | 22.17.1 (see `.nvmrc`) | Payload CMS and the Ionic build                |
| pnpm                 | 12.4.1                 | Workspace management                           |
| Go                   | 1.26+                  | Running the RAG service outside Docker         |
| Docker + Compose     | 28+                    | MongoDB and the full stack                     |
| Ollama               | latest                 | Local embeddings and LLM (no API key required) |
| JDK                  | Temurin 21             | Building the Android APK                       |
| Android Studio + SDK | API 35+                | Running on an emulator or device               |

The Corepack bundled with Node 22 cannot launch pnpm 12, because pnpm now ships
as a native binary via `@pnpm/exe` while older Corepack looks for
`bin/pnpm.cjs`. Either run `npm i -g corepack@latest`, or skip Corepack:

```bash
npx pnpm@12.4.1 install
```

## Run the full stack with Docker

```bash
cp .env.example .env
# replace the three placeholder values; generate each with: openssl rand -hex 32
pnpm docker:up
```

This starts `mongodb`, `cms`, and `rag`. First boot takes a few minutes while
Atlas Local initialises its replica set and the CMS image builds.

If MongoDB exits immediately on Docker Desktop for Mac (`container docker-mongodb-1
exited (2)`, logs show `Unable to acquire security key` / missing
`/data/configdb/keyfile`), the data volume and the replica-set keyfile volume
are out of sync — typical after copying the repo from Linux or recreating only
one volume. Recreate them together, then start again:

```bash
docker compose --env-file .env -f infrastructure/docker/docker-compose.yml down
docker volume rm docker_mongodb_data docker_mongodb_configdb docker_mongodb_mongot
pnpm docker:up
```

| Service          | Address                                                  |
| ---------------- | -------------------------------------------------------- |
| Payload admin    | http://localhost:3000/admin                              |
| Payload REST API | http://localhost:3000/api                                |
| MongoDB          | mongodb://localhost:27017                                |
| Go RAG service   | `http://rag:8080` — internal to the Compose network only |

Verify the internal boundary is intact — the first command should succeed and
the second should fail:

```bash
docker compose -f infrastructure/docker/docker-compose.yml exec cms wget -qO- http://rag:8080/healthz
curl http://localhost:8080/healthz
```

Open http://localhost:3000/admin and create the first user; it is promoted to
`admin` automatically. Every account created through the mobile app is a
`patient`.

## Run services individually

Databases in Docker, applications on the host — the faster development loop.

```bash
docker compose --env-file .env -f infrastructure/docker/docker-compose.yml up -d mongodb
```

Host processes connect over `localhost` rather than the Compose service name, so
override the two MongoDB URIs:

```bash
# Terminal 1 — Payload CMS, http://localhost:3000
PAYLOAD_DATABASE_URI='mongodb://root:<pw>@localhost:27017/doctor_app?authSource=admin&directConnection=true' \
RAG_SERVICE_URL='http://localhost:8080' pnpm dev:cms

# Terminal 2 — Go RAG service, http://127.0.0.1:8080
RAG_DATABASE_URI='mongodb://root:<pw>@localhost:27017/rag_vectors?authSource=admin&directConnection=true' \
pnpm dev:rag

# Terminal 3 — Ionic web app, http://localhost:5173
pnpm dev:mobile
```

## Local AI provider and CMS configuration

Chat and embeddings are configured in **Payload Admin → RAG Settings**, not in
`.env`. The Go service never talks to Ollama, OpenAI, Anthropic, Google, or OpenRouter. It
calls Payload (`/api/internal/embeddings` and `/api/internal/chat/completions`);
Payload holds the keys and talks to the chosen vendor.

Defaults are local Ollama (no paid key):

```bash
brew install ollama
ollama pull nomic-embed-text        # embeddings, 768 dimensions
ollama pull llama3.2                # generation (fast default)
# optional: ollama pull deepseek-r1:1.5b
OLLAMA_HOST=0.0.0.0 ollama serve    # 0.0.0.0 so Compose containers can reach it
```

To switch providers, open RAG Settings and pick:

| Chat | Embeddings |
| ---- | ---------- |
| Ollama (`llama3.2`) | Ollama (`nomic-embed-text`, 768) |
| Ollama (`deepseek-r1:1.5b`) | Ollama (`nomic-embed-text`, 768) |
| OpenAI (`gpt-4o-mini`) | OpenAI (`text-embedding-3-small`, 1536) — re-ingest after changing dimensions |
| Anthropic Claude (`claude-sonnet-4-5`) | Ollama, OpenAI, Google, or OpenRouter (Claude has no embeddings API) |
| Google Gemini (`gemini-2.0-flash`) | Google (`gemini-embedding-001`, set dimensions to 768) or keep Ollama embeddings |
| OpenRouter (`openai/gpt-4o-mini`) | OpenRouter (`openai/text-embedding-3-small`, 1536) — use model ids from openrouter.ai/models |

Paste the API key in the CMS only. Changing embedding dimensions requires
dropping `knowledge_vector_index` and re-ingesting every document, then
restarting the RAG service.

## Android

The emulator reaches the host at `10.0.2.2`. `VITE_*` values are compiled into
the bundle, so set the URL **before** building.

```bash
echo "VITE_PAYLOAD_URL=http://10.0.2.2:3000" > apps/mobile/.env
pnpm --filter @doctor-app/mobile build
pnpm --filter @doctor-app/mobile cap:sync
pnpm --filter @doctor-app/mobile run:android
```

Build the debug APK:

Install java 
```bash
sudo apt update
sudo apt install openjdk-21-jdk
```

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
(cd apps/mobile/android && ./gradlew assembleDebug)
# → apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

For a physical device, substitute your machine's LAN address
(`ipconfig getifaddr en0`) for `10.0.2.2`.

The generated projects permit cleartext HTTP so a local backend works during
development. Serve Payload over HTTPS and remove those exceptions before any
real release.

## How double booking is prevented

Two users who request the same slot at the same instant must not both succeed.
The guarantee is enforced entirely on the server, in three independent layers.

### Where validation happens

Booking goes through one endpoint, `POST /api/appointments/book`, registered as a
collection endpoint on `appointments`. The generic `POST /api/appointments` route
is closed (`create: () => false`), so there is no second way in.

The endpoint validates the body with Zod and takes the patient from the
authenticated session. A `patient` field in the request body is ignored, so a
client cannot book on someone else's behalf. The mobile app's own availability
check is treated as a display hint and nothing more.

### Layer 1 — atomic compare-and-swap

The load-bearing check. Claiming a slot is a single conditional update:

```ts
const result = await slots.findOneAndUpdate(
  { _id: slotId, status: 'available' }, // the guard
  { $set: { status: 'booked' } },
  { session, new: true },
)
if (!result) throw errors.slotUnavailable()
```

A single-document update in MongoDB is atomic, so concurrent callers cannot
interleave a read and a write. Exactly one of them observes `status: 'available'`
and performs the write; the rest match nothing and get `null` back. There is no
read-then-write race because the read and the write are one operation.

### Layer 2 — partial unique index

Created on boot by `ensureIndexes` and enforced by the database itself:

```js
db.appointments.createIndex(
  { slot: 1 },
  { unique: true, partialFilterExpression: { status: 'booked' }, name: 'uniq_active_slot' },
)
```

If anything ever produces a second active appointment for one slot — a bug, a
migration, a direct write from the admin panel — MongoDB rejects it with
`E11000`. The filter is **partial** on purpose: cancelled appointments are
excluded, so releasing a slot and rebooking it stays possible while duplicates
remain impossible.

`appointment-slots` additionally carries `uniq_doctor_startsAt`, so a doctor
cannot end up with two slots at the same instant.

### Layer 3 — transaction

Where the deployment supports transactions, the slot claim and the appointment
insert are committed together, so a failure after the claim rolls the slot back
instead of stranding it as `booked`.

Payload's mongoose adapter only enables transactions when the client was built
with an explicit `replicaSet`, which is why the Compose service pins
`hostname: mongodb` (Atlas Local derives both the replica set name and the
advertised member address from the hostname) and the connection strings use
`?replicaSet=mongodb`. Running the CMS on the host cannot resolve that name, so
it connects with `directConnection=true` and gets no transactions. The endpoint
detects this and compensates explicitly by releasing the slot. Correctness does
not depend on which mode is active; layers 1 and 2 hold in both.

### How concurrent requests are handled

Losing the race reaches the caller as a single outcome — HTTP **409** with code
`SLOT_UNAVAILABLE` and the message _"This appointment slot is no longer
available."_ — but it is detected three different ways:

| Mode           | How the loser is detected                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No transaction | `findOneAndUpdate` matches nothing and returns `null`                                                                                                    |
| Transaction    | MongoDB aborts the second writer with a **write conflict** (code 112), because snapshot isolation will not let two transactions update the same document |
| Either         | The `uniq_active_slot` index rejects the insert with `E11000`                                                                                            |

The write-conflict case is worth calling out: MongoDB labels it retryable, but
retrying here would only re-read the slot as already booked and conflict again,
so it is mapped straight to 409 rather than retried.

### Verification

`tests/booking-concurrency.ts` fires 25 simultaneous booking requests at one slot
and asserts exactly one 201 and twenty-four 409s, then checks the database
directly for duplicate or orphaned rows. All promises are created before any is
awaited — awaiting inside the loop would serialise the requests and the test
would pass without proving anything. It runs several rounds, because a single
green run of a race-condition test proves very little.

Measured results, 25 concurrent requests per round:

| Mode                              | Rounds   | Result             | Duplicates | Orphaned slots |
| --------------------------------- | -------- | ------------------ | ---------- | -------------- |
| Transaction (`replicaSet`)        | 8/8 pass | 1 booked, 24 × 409 | 0          | 0              |
| Compensating (`directConnection`) | 5/5 pass | 1 booked, 24 × 409 | 0          | 0              |

`tests/booking-rules.ts` covers the surrounding rules: authentication, input
validation, user data isolation, body tampering, cancel-then-rebook, and the
absence of stack traces in error responses. 12/12 pass.

```bash
# with the CMS running
BASE_URL=http://localhost:3000 pnpm --filter @doctor-app/payload exec tsx tests/booking-concurrency.ts
BASE_URL=http://localhost:3000 pnpm --filter @doctor-app/payload exec tsx tests/booking-rules.ts
BASE_URL=http://localhost:3000 pnpm --filter @doctor-app/payload exec tsx tests/chat-rules.ts
pnpm test:e2e
```

## How to load and index RAG documents

Three fixture PDFs live in [`docs/knowledge/`](docs/knowledge/) (pregnancy
nutrition, prenatal care, child nutrition). Swap them for the evaluator-supplied
files if those differ.

**Admin path (the flow the assignment describes):**

1. Sign in to http://localhost:3000/admin as the first user (promoted to admin).
2. **Knowledge Documents → Create**, upload a PDF, save.
3. The `afterChange` hook posts to the internal Go service. Watch `indexStatus`
   move `pending → processing → indexed`.

**CLI path** (same pipeline, no admin UI):

```bash
# host
cd services/rag && go run ./cmd/ingest --dir ../../docs/knowledge

# or the server binary, which is what the container has
docker compose -f infrastructure/docker/docker-compose.yml exec rag /rag -ingest /knowledge
```

`pnpm seed` also uploads the fixture PDFs as Knowledge Documents when the
collection is empty. Re-indexing a document is done by replacing the file and
bumping `version`; the Go service deletes that document's old vectors first
(ADR-010).

Confirm chunks landed:

```bash
docker compose -f infrastructure/docker/docker-compose.yml exec mongodb \
  mongosh -u root -p "$MONGODB_PASSWORD" --authenticationDatabase admin \
  --eval 'db.getSiblingDB("rag_vectors").knowledge_chunks.countDocuments()'
```

## Embedding approach

Ingestion and query share the embedder selected in **RAG Settings**. The Go
service posts text to Payload; Payload calls the vendor. Defaults are Ollama
`nomic-embed-text` at 768 dimensions. Query embeddings are prefixed
`search_query:` and document embeddings `search_document:` so Atlas cosine
scores separate real hits from noise. All vectors are L2-normalised. If vector
scores are weak, the Go service also runs a lexical `$regex` fallback over chunk
text so seeded document questions still retrieve.

PDFs are extracted with a pure-Go library (no CGO, so the distroless image
stays static), cleaned (de-hyphenated line wraps, dropped near-empty pages),
and split with a recursive character splitter: target **1,000** characters,
**150** characters of overlap, never mid-rune, sentence boundary preferred
within 20% of the target. Overlap keeps a claim that straddles a cut in both
chunks; ~1,000 characters is roughly 250 tokens, so six retrieved chunks stay
inside a small local model's context window.

Changing the embedding model means dropping `knowledge_vector_index` and
re-ingesting every document. Re-ingest is also required after this nomic
prefix change so stored vectors and queries share the same space.

## Vector store

MongoDB Atlas Vector Search on the `rag_vectors.knowledge_chunks` collection,
index name `knowledge_vector_index`, cosine similarity, `documentId` as a
filter field. The Go service creates the index on startup and waits until it
reports `READY`. Application data stays in the `doctor_app` database on the
same Atlas Local instance (ADR-003, ADR-004).

Atlas returns scores as `(1 + cos) / 2`, so ~0.5 is orthogonal, not 0.

## LLM configuration

Configured in Payload Admin → **RAG Settings**. Switching a provider fills one
example chat model and one example embedding model (you can still type any id).
Keys never enter the mobile bundle or the Go process. Provider errors are logged
in Payload; the user sees a generic unavailable message.

| Provider | Example chat model | Example embedding model |
| --- | --- | --- |
| Ollama (local) | `llama3.2` | `nomic-embed-text` (768) |
| OpenAI | `gpt-4o-mini` | `text-embedding-3-small` (1536) |
| Anthropic Claude | `claude-sonnet-4-5` | *(none — use Ollama, OpenAI, Google, or OpenRouter for embeddings)* |
| Google Gemini | `gemini-2.0-flash` | `gemini-embedding-001` (768) |
| OpenRouter | `openai/gpt-4o-mini` | `openai/text-embedding-3-small` (1536) |

Ollama talks to `http://host.docker.internal:11434` from Docker (or
`http://127.0.0.1:11434` on the host). Pull both models once:

```bash
ollama pull llama3.2
ollama pull nomic-embed-text
```

Greetings and setup questions (`hi`, `who are you`) go through the chat model
as plain-text conversational turns. Medical questions still go through RAG.

## How the system decides it does not have enough information

Vector search returning something is not treated as "we can answer." Three
gates run on every question (assignment §13):

1. **Score floor** (`RAG_MIN_SCORE`, default 0.50). Atlas cosine is
   `(1+cos)/2`, so ~0.50 is unrelated. Drops off-domain questions.
2. **Evidence strength or lexical coverage.** Need at least `RAG_MIN_CHUNKS`
   (1) chunks above the floor, and either one hit above `RAG_STRONG_SCORE`
   (0.58) or at least `RAG_MIN_COVERAGE` (0.25) of the question's content words
   in the retrieved text. High similarity with low coverage is the signature of
   "related topic, wrong question" — the assignment's Test 3.
3. **LLM self-assessment.** Only if gates 1 and 2 pass. The model must return
   JSON `{ sufficient, answer, source_chunk_ids, confidence }`. Malformed JSON
   is treated as insufficient. `topScore` and `confidence` are returned on
   `POST /api/chat` and shown in the mobile chat.

Starting thresholds are recorded in
[`services/rag/testdata/questions.yaml`](services/rag/testdata/questions.yaml)
against the fixture PDFs. They favour **zero fabrications** over extra
cautious fallbacks.

On any failed gate the user sees:

> I don't have enough information in the available healthcare documents to
> answer that question. The question has been submitted for review.

The mobile chat paints that fallback in a distinct style (no source chips).

## How unanswered questions are handled

Payload `POST /api/chat` is the only public chat route. On `sufficient: false`
it creates an `unresolved-queries` row with `overrideAccess` (`create` stays
closed to clients) and stores `retrievalReason` plus `topScore` so the admin
list is a tuning tool, not just a inbox.

Admins open **Unresolved Queries**, type a `humanResponse`, and flip status to
`resolved`. A `beforeChange` hook stamps `resolvedAt` and `reviewedBy`.

If the Go service is down or the LLM provider fails, the user gets HTTP 503/502
with a safe message and **no** unresolved row is written — that path is an
outage, not a knowledge gap.

## Authentication and authorisation

- Patients register and log in through `POST /api/auth/patient/*`. The first
  account created in Payload Admin is promoted to `admin`.
- The mobile app stores the JWT in `@capacitor/preferences` and sends
  `Authorization: JWT <token>` on every request.
- Appointments are isolated by `ownAppointments`. Booking derives `patient`
  from the session. Collection `create` on appointments and unresolved queries
  is closed.
- The RAG service is unpublished. Payload calls it with `X-RAG-Internal-Secret`.

## AI usage

AI-assisted development was used throughout, as the assignment expects.

**Generated or drafted by AI, then reviewed:** collection configs, the booking
endpoint, the Go RAG packages, the mobile screens, and these README sections.

**Hand-written or substantially rewritten after review:** the three-layer
booking concurrency design, the replica-set vs `directConnection` transaction
fallback, the three-gate sufficiency logic, and the concurrency test harness.

**Mistakes the model produced that did not survive review:**

1. Field-level `create: false` on the required `patient` field made every
   booking fail validation. Booking now goes through a custom endpoint.
2. The mobile client stored a token and never sent it. Android WebView cookies
   would not have saved that either.
3. `replicaSet=rs0` in the connection string. Atlas Local names the set after
   the container hostname, so discovery pointed at an unreachable address.

## Quality checks

```bash
pnpm lint         # eslint + prettier --check
pnpm lint:go      # gofmt + go vet
pnpm typecheck    # tsc --noEmit across the workspace
pnpm test:unit    # Go RAG unit tests
pnpm build        # production build of both applications
pnpm seed         # doctors, photos, slots, reviews, chat chips, knowledge PDFs
pnpm docker:seed  # same, against the Compose MongoDB / CMS
(cd services/rag && go test ./...)
```

## Repository layout

```
apps/mobile/         Ionic React + Capacitor (Android, iOS)
apps/payload/        Payload CMS on Next.js — admin, REST API, auth, business logic
services/rag/        Go RAG service, independent Go module, internal only
infrastructure/      Docker Compose and Dockerfiles
scripts/             Seed scripts
docs/                Assignment brief, system design, ADRs, and planning documents
```

`services/rag` sits outside the pnpm workspace on purpose: it is a separate Go
module and shares only the git repository (ADR-001).
