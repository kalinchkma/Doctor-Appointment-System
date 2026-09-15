# Running Plan

How the stack is started, in three modes, plus the first-run sequence and a
troubleshooting table. This is the source material for README sections 1–8 and
for the live demo in the technical walkthrough.

**Status 2026-09-15.** Mode A/B commands work for Mongo + CMS + the RAG
_scaffold_. RAG chat/ingest still need Phases 4–6. Seed is
`pnpm seed` → `apps/payload/src/seed/` (doctors + slots), not the empty
root-level `scripts/` files mentioned in earlier drafts.

Target state after Phases 4–8 land — Ollama, knowledge PDFs, a seed Compose
profile, and a slim CMS image.

---

## 1. Prerequisites

| Tool             | Version                      | Purpose                    | Status on this machine           |
| ---------------- | ---------------------------- | -------------------------- | -------------------------------- |
| Node.js          | 22.17.1 (pinned in `.nvmrc`) | Payload CMS, Ionic build   | Installed                        |
| pnpm             | 12.4.1                       | Workspace manager          | See the note below               |
| Go               | 1.26+                        | RAG service                | 1.26.4 installed                 |
| Docker + Compose | 28+                          | MongoDB and the full stack | 29.6.1 installed                 |
| **Ollama**       | latest                       | Local embeddings + LLM     | **Missing — needed by Phase 4**  |
| **JDK**          | **Temurin 21**               | Android APK build          | **Missing — needed for the APK** |
| Android SDK      | API 35+, an emulator image   | Android run/build          | Installed                        |
| Xcode            | Optional                     | iOS only, macOS only       | —                                |

### pnpm

The Corepack bundled with Node 22 cannot launch pnpm 12. pnpm now ships as a
native binary through `@pnpm/exe` platform packages, while older Corepack still
looks for `bin/pnpm.cjs` and fails with `MODULE_NOT_FOUND`. Either update
Corepack (`npm i -g corepack@latest`) or skip it entirely:

```bash
npx pnpm@12.4.1 install      # no global install required
```

### Ollama

Required before Phase 4. It serves both embeddings and generation locally, so no
paid API key is needed anywhere in this project.

```bash
brew install ollama
ollama pull nomic-embed-text     # embeddings, 768 dimensions
ollama pull llama3.2             # generation

# Bind to all interfaces so the Compose containers can reach it.
OLLAMA_HOST=0.0.0.0 ollama serve

curl -s http://localhost:11434/api/version
```

Leaving Ollama on its default loopback bind is the most common failure mode
here: the CMS starts fine, the RAG container gets connection refused, and the
chatbot returns 503 with no obvious cause.

### JDK

Required for the Android debug APK, which is a mandatory deliverable:

```bash
brew install --cask temurin@21
export JAVA_HOME=$(/usr/libexec/java_home -v 21)   # add to ~/.zshrc
java -version                                       # expect 21.x
```

---

## 2. Environment

```bash
cp .env.example .env
```

`.env.example` was rewritten in Phase 0 for the single-MongoDB, Ollama-backed
layout, so copying it and replacing the three placeholders is enough. Generate
each secret with `openssl rand -hex 32`:

| Placeholder                               | Appears in                                  |
| ----------------------------------------- | ------------------------------------------- |
| `replace-with-a-database-password`        | `MONGODB_PASSWORD` and both connection URIs |
| `replace-with-a-long-random-secret`       | `PAYLOAD_SECRET`                            |
| `replace-with-another-long-random-secret` | `RAG_INTERNAL_SECRET`                       |

Three rules worth stating in the README:

- `.env` is gitignored and never committed. Only `.env.example` is tracked.
- `VITE_*` values are compiled into the client bundle and are public by
  definition, so no credential may ever carry that prefix.
- `EMBEDDING_DIMENSIONS` must match both the embedding model's output size
  (768 for `nomic-embed-text`) and the vector index. Changing the model means
  dropping the index and re-ingesting every document.

Connection URIs use `directConnection=true`. Do **not** add `replicaSet=rs0`:
Atlas Local names its replica set after the container hostname, so set-name
discovery resolves to an address no other container can reach.

---

## 3. Mode A — full Docker (what the reviewer will run)

```bash
pnpm docker:up          # docker compose --env-file .env -f infrastructure/docker/docker-compose.yml up --build
```

Brings up `mongodb`, `cms`, and `rag`. First boot takes 2–4 minutes: Atlas Local
initialises a replica set and starts the search process, and the CMS image
builds Next.

| Service          | Reachable at                                  | Notes                             |
| ---------------- | --------------------------------------------- | --------------------------------- |
| Payload admin    | http://localhost:3000/admin                   |                                   |
| Payload REST API | http://localhost:3000/api                     |                                   |
| MongoDB          | mongodb://localhost:27017                     | exposed for inspection/seeding    |
| Go RAG           | `http://rag:8080` **inside the network only** | no host port, by design (ADR-006) |

Verify:

```bash
docker compose -f infrastructure/docker/docker-compose.yml ps      # all healthy
curl -fsS http://localhost:3000/api/access                          # CMS responds
docker compose -f infrastructure/docker/docker-compose.yml exec cms \
  wget -qO- http://rag:8080/healthz                                 # {"status":"ok"}
```

That third command is also the proof that RAG is genuinely internal: the same
request from your host must fail.

Other commands:

```bash
pnpm docker:down                                   # stop, keep the volume
docker compose ... down -v                         # stop and delete all data
docker compose ... logs -f cms rag                 # follow logs
docker compose ... up --build cms                  # rebuild one service
```

---

## 4. Mode B — hybrid (the development loop)

Databases in Docker, applications on the host. Fastest iteration; use this for
all real work.

```bash
# Terminal 0 — database only
docker compose --env-file .env -f infrastructure/docker/docker-compose.yml up -d mongodb
```

Host processes connect via `localhost` instead of the Compose service name, so
override the two URIs. Keep a gitignored `.env.local` with the localhost
variants rather than retyping them:

```bash
# Terminal 1 — Payload CMS       → http://localhost:3000
PAYLOAD_DATABASE_URI='mongodb://root:<pw>@localhost:27017/doctor_app?authSource=admin&directConnection=true' \
RAG_SERVICE_URL='http://localhost:8080' \
pnpm dev:cms

# Terminal 2 — Go RAG service    → http://127.0.0.1:8080
RAG_DATABASE_URI='mongodb://root:<pw>@localhost:27017/rag_vectors?authSource=admin&directConnection=true' \
pnpm dev:rag

# Terminal 3 — Ionic web         → http://localhost:5173
pnpm dev:mobile
```

In this mode bind the Go service to `127.0.0.1` rather than `0.0.0.0`, so it
stays unreachable from the LAN and the ADR-006 boundary holds during
development too.

---

## 5. First-run sequence

Order matters. Run once against a fresh volume.

**1. Create the first administrator.** Open http://localhost:3000/admin. The
`makeFirstUserAdmin` hook promotes the first account to `role: admin`. Every
later account created through the mobile app is a `patient`.

**2. Seed doctors and slots.**

```bash
pnpm seed          # apps/payload/src/seed/ — 3 doctors + weekday slots, idempotent
```

Three doctors with photos, bios, and qualifications, plus 30-minute slots
across the next seven weekdays. Confirm in the admin panel under **Doctors** and
**Appointment Slots**.

**2b. Pick the AI provider.** Open Payload Admin → **RAG Settings**. Defaults
are local Ollama. To use OpenAI, Claude, or Gemini, choose the provider, set
the model, and paste the API key there. The Go service only calls Payload.

**3. Create the vector search index.** The RAG service calls
`EnsureSearchIndex` on startup and polls until `knowledge_vector_index` reports
`READY`. Confirm before ingesting:

```bash
docker compose ... exec mongodb mongosh -u root -p <pw> --authenticationDatabase admin \
  --eval 'db.getSiblingDB("rag_vectors").knowledge_chunks.getSearchIndexes()'
```

Ingesting before the index is ready stores chunks that are never retrievable —
a confusing failure, because writes succeed and search silently returns nothing.

**4. Ingest the healthcare PDFs.** Either path works; demonstrate the admin one.
Fixture files are in `docs/knowledge/`. The RAG container mounts them at
`/knowledge`.

```bash
# Admin path (the flow described in System Design §8)
#   Payload Admin → Knowledge Documents → Create → upload the PDF → Save
#   The afterChange hook posts to the RAG service; watch indexStatus go
#   pending → processing → indexed

# CLI path
docker compose ... exec rag /rag -ingest /knowledge
```

Verify:

```bash
docker compose ... exec mongodb mongosh -u root -p <pw> --authenticationDatabase admin \
  --eval 'db.getSiblingDB("rag_vectors").knowledge_chunks.countDocuments()'
```

**5. Smoke-test the flows.** Register a patient at http://localhost:5173, book a
slot, and ask the chatbot one question you know is covered and one you know is
not.

---

## 6. Mode C — Android

The emulator cannot reach `localhost`; `10.0.2.2` is its alias for the host.
`VITE_*` values are baked in at build time, so this must be set **before**
`build`, not before `cap:sync`.

```bash
echo "VITE_PAYLOAD_URL=http://10.0.2.2:3000" > apps/mobile/.env

pnpm --filter @doctor-app/mobile build
pnpm --filter @doctor-app/mobile cap:sync
pnpm --filter @doctor-app/mobile run:android
```

For a physical device on the same Wi-Fi, use the machine's LAN address
(`ipconfig getifaddr en0`) instead of `10.0.2.2`, and make sure the backend is
bound to `0.0.0.0` rather than loopback.

Build the debug APK for submission:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
(cd apps/mobile/android && ./gradlew assembleDebug)
# → apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

Note in the README that `cleartext: true` in `capacitor.config.ts` and the
manifest's cleartext permission exist only so a local HTTP backend works, and
must be removed for any real release.

---

## 7. Health and observability

| Check                                 | Command                                    | Healthy result                 |
| ------------------------------------- | ------------------------------------------ | ------------------------------ |
| MongoDB                               | `mongosh --eval 'db.runCommand({ping:1})'` | `ok: 1`                        |
| Replica set (needed for transactions) | `mongosh --eval 'rs.status().ok'`          | `1`                            |
| Vector index                          | `db.knowledge_chunks.getSearchIndexes()`   | `status: "READY"`              |
| Payload                               | `curl -fsS localhost:3000/api/access`      | 200                            |
| RAG (from the CMS container)          | `wget -qO- http://rag:8080/healthz`        | `{"status":"ok"}`              |
| RAG (from the host)                   | `curl localhost:8080/healthz`              | **must fail** — it is internal |

Both services log structured JSON (`slog` in Go, a request-scoped logger in
Payload) with a correlation ID propagated on `X-Request-Id` from Payload into
the RAG service, so a single chat request can be traced end to end.

---

## 8. Troubleshooting

| Symptom                                                   | Cause                                                                                        | Fix                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `MongoServerSelectionError` from CMS or RAG               | `replicaSet=rs0` in the URI makes the driver follow an advertised hostname it cannot resolve | Use `directConnection=true`                           |
| `Transaction numbers are only allowed on a replica set`   | Connected to a standalone `mongo:8`                                                          | Use the Atlas Local image (Phase 0.3)                 |
| `$vectorSearch is not allowed`                            | Community MongoDB without search                                                             | Same fix                                              |
| Vector search returns nothing, ingestion reported success | Index was not `READY` at ingest time, or `numDimensions` ≠ the model's output                | Recreate the index, re-ingest                         |
| Answers are grounded in the wrong documents               | Query and ingestion used different embedding models                                          | Re-ingest everything with one model                   |
| Mobile calls all 403                                      | Token stored but never sent (audit §3.2)                                                     | Send `Authorization: JWT <token>`                     |
| Login works in the browser, fails on Android              | Cross-origin cookie in the WebView                                                           | Use the JWT header, not the cookie                    |
| Android shows a blank white screen                        | `webDir: dist` empty — `cap:sync` ran without `build`                                        | `build` then `cap:sync`                               |
| Android cannot reach the API                              | `localhost` inside the emulator                                                              | `10.0.2.2` (emulator) or the LAN IP (device)          |
| `Unable to locate a Java Runtime`                         | No JDK                                                                                       | `brew install --cask temurin@21` and set `JAVA_HOME`  |
| Docker build pulls different versions than local          | `--frozen-lockfile=false` plus `"latest"` specifiers                                         | Phase 0.1                                             |
| `pnpm: command not found`                                 | Corepack not enabled                                                                         | `corepack enable`                                     |
| Booking 409s every time                                   | The slot CAS ran but a later step failed without releasing the slot                          | Confirm the transaction wraps both writes (Phase 2.2) |
| Chat returns 503 under light load                         | `RAG_MAX_CONCURRENCY` too low, or the provider is rate-limiting                              | Raise the limit; check RAG logs for 429s              |

---

## 9. Demo script for the technical walkthrough

A fifteen-minute path through everything §25 asks you to demonstrate. Rehearse
it once with a fresh volume so nothing surprises you.

1. `pnpm docker:up`, then `docker compose ps` — three healthy services, no host
   port on `rag`. State the public/internal boundary (ADR-006).
2. Payload Admin — walk the six collections and the relationships between
   Users, Doctors, Slots, Appointments, and Unresolved Queries.
3. Mobile — register, browse doctors, open details, book a slot, show the
   confirmation and My Appointments.
4. **Concurrency** — run the 25-parallel-request test live. One 201,
   twenty-four 409s. Then open the code: the atomic CAS, the partial unique
   index, the transaction, and why each exists.
5. **Isolation** — `curl` user B's appointment ID with user A's token; show the
   403 and the `ownAppointments` access function behind it.
6. **RAG ingestion** — upload a PDF in the admin panel, watch `indexStatus`
   move to `indexed`, then show the chunk count in MongoDB.
7. **Grounded answer** — ask an answerable question; show the answer and its
   cited source document.
8. **Unanswerable** — ask the medication-dosage question; show the fallback,
   then the new row in Unresolved Queries with `status: new`.
9. **Weakly related** — ask the third-trimester question. Explain that
   embedding similarity was high and the score gate alone would have passed it;
   show the coverage gate and the LLM's `sufficient: false` in the logs. This is
   the moment the assignment is really testing.
10. **Admin resolution** — type a human response, flip the status to Resolved.
11. Close on the README: the architecture diagram, the calibration matrix behind
    the thresholds, and the AI-usage section including the bugs you caught in
    AI-generated code.
