# Implementation Plan

Companion to `00-implementation-audit.md`. Nine phases, ordered so that every
mandatory acceptance-criteria checkbox is closed before any optional work
starts. Estimates assume AI-assisted development, which the assignment expects.

**Status 2026-09-15: Phases 0–8 are implemented in the tree.** Booking, mobile,
RAG ingest/query, chat + unresolved workflow, unit tests, README, and the slim
CMS image are present. Do not re-do completed phases. Remaining work is
operational: Ollama, a live `docker compose` demo, and the Android APK (JDK 21).

**Total: ~23 hours.** The assignment targets 16–20. Section 10 below defines the
cut line if you need to land inside that budget.

| Phase | Title                               | Est. | Closes                            |
| ----- | ----------------------------------- | ---- | --------------------------------- |
| 0     | Foundation hardening                | 2.0h | Reproducibility, style, single DB |
| 1     | Payload data model completion       | 2.0h | Payload/data-modeling criteria    |
| 2     | Booking + concurrency               | 3.0h | The 15% concurrency block         |
| 3     | Mobile app completion               | 3.0h | All required screens              |
| 4     | RAG ingestion                       | 3.0h | Indexing checkboxes               |
| 5     | RAG query + grounding               | 3.0h | Retrieval/grounding/fallback      |
| 6     | Chat endpoint + unresolved workflow | 1.5h | Admin resolution workflow         |
| 7     | Automated tests                     | 3.0h | Proof for the walkthrough         |
| 8     | Docker, README, APK                 | 2.5h | Deliverables                      |

---

## Phase 0 — Foundation hardening (2.0h)

Do this first. Every later phase compounds on it.

### 0.1 Pin every dependency

Replace all `"latest"` specifiers in the three `package.json` files with the
versions already resolved in `pnpm-lock.yaml` (`payload@3.89.0`, `next@16.3.5`,
`react@19.3.0`, `@ionic/react@9.0.3`, `@capacitor/*@8.5.2`, `typescript@7.0.2`,
`vite@8.3.0`, `sharp@0.35.4`, …). Use caret ranges (`^3.89.0`), not exact pins,
so patch fixes still flow.

Then change `Dockerfile.cms` to `RUN pnpm install --frozen-lockfile` so a cold
clone builds the same tree you tested.

### 0.2 Remove unused routing dependencies, then re-add one

Drop `react-router` and `react-router-dom` from `apps/mobile`. Keep
`@ionic/react-router@^9.0.3` and let it own its `react-router` peer. Phase 3
will actually use it.

### 0.3 Collapse to a single MongoDB

Replace both database services in `infrastructure/docker/docker-compose.yml`
with one:

```yaml
mongodb:
  image: mongodb/mongodb-atlas-local:8.0
  environment:
    MONGODB_INITDB_ROOT_USERNAME: ${MONGODB_USERNAME}
    MONGODB_INITDB_ROOT_PASSWORD: ${MONGODB_PASSWORD}
  ports:
    - '27017:27017'
  volumes:
    - mongodb_data:/data/db
  healthcheck:
    test:
      [
        'CMD-SHELL',
        "mongosh --quiet --username $$MONGODB_INITDB_ROOT_USERNAME --password $$MONGODB_INITDB_ROOT_PASSWORD --authenticationDatabase admin --eval 'db.runCommand({ping:1}).ok'",
      ]
    interval: 10s
    timeout: 5s
    retries: 20
    start_period: 40s
```

Keep two logical databases on that instance — `doctor_app` for Payload,
`rag_vectors` for the Go service — so the isolation argument in the ADRs still
holds. Connection strings must use `directConnection=true`, **not**
`replicaSet=rs0`:

```
PAYLOAD_DATABASE_URI=mongodb://root:pass@mongodb:27017/doctor_app?authSource=admin&directConnection=true
RAG_DATABASE_URI=mongodb://root:pass@mongodb:27017/rag_vectors?authSource=admin&directConnection=true
```

**Verification gate — passed on 2026-09-15.** All four booking- and
RAG-critical properties were confirmed against a throwaway
`mongodb/mongodb-atlas-local:8.0` container before committing to this design:

| Property                                                  | Result                                               | Unblocks             |
| --------------------------------------------------------- | ---------------------------------------------------- | -------------------- |
| Single-node replica set                                   | Yes                                                  | Phase 2 transactions |
| Multi-document transactions                               | Commit succeeds                                      | Phase 2 layer 3      |
| Partial unique index on `{slot}` where `status: 'booked'` | Duplicate rejected with `E11000`                     | Phase 2 layer 2      |
| A `cancelled` row does not block rebooking the same slot  | Confirmed                                            | Cancellation (2.4)   |
| `createSearchIndex` + `$vectorSearch`                     | Index reached `READY`; query returned ranked results | Phases 4 and 5       |

Container start to `healthy` took about 20 seconds, and the index reached
`READY` in under 5 seconds — fast enough that the Compose `start_period: 40s`
above is comfortable.

Two findings worth carrying forward:

- The replica set name is **auto-generated from the container hostname** (the
  probe produced `b27f03b73eec`), not `rs0`. This is the concrete reason
  `replicaSet=rs0` in the current `.env.example` cannot work. `directConnection=true`
  is the correct answer, and it sidesteps set-name discovery entirely.
- Vector scores come back **normalised to `(1 + cos) / 2`**. A query vector of
  `[0.9, 0.1, 0, 0]` against a stored `[0, 1, 0, 0]` scored `0.5552`, matching
  that formula exactly. So ~0.5 means orthogonal, not 0. Calibrate
  `RAG_MIN_SCORE` and `RAG_STRONG_SCORE` on that scale in Phase 7, and do not
  copy thresholds from material that assumes raw cosine in `[-1, 1]`.

### 0.4 Tooling and hygiene

- Add Prettier + ESLint flat config (`eslint.config.js`) at the repo root, with
  `typescript-eslint` and `eslint-plugin-react-hooks`.
- Add `.golangci.yml` for `services/rag`.
- Reformat the existing dense one-liners. Add `lint` and `format` scripts to the
  root `package.json` (the root currently has no `lint` script even though the
  plan doc specifies one).
- Add `.nvmrc` with the chosen Node major and `engines.node` in the root
  `package.json`; make `Dockerfile.cms` use the same major.
- Extend `.gitignore` with `*.tsbuildinfo`, `apps/mobile/vite.config.js`,
  `apps/mobile/vite.config.d.ts`, and `apps/mobile/dist/`. Then
  `git rm --cached` the four tracked build artifacts.

### 0.5 Convert the plan docs to markdown

A reviewer reads the repo on GitHub, where `.docx` is a download prompt.
Convert the three plan documents to `docs/system-design.md`,
`docs/technical-decisions.md`, and `docs/monorepo-setup.md`. Keep the `.docx`
originals in `docs/plan-docs/`. While converting, amend ADR-003/004 to describe
the single-instance / two-database arrangement from 0.3.

---

## Phase 1 — Payload data model completion (2.0h)

### 1.1 Add a `Media` upload collection

```ts
export const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    staticDir: 'media',
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    imageSizes: [{ name: 'thumbnail', width: 320, height: 320, position: 'centre' }],
  },
  access: { read: anyone, create: admins, update: admins, delete: admins },
  fields: [{ name: 'alt', type: 'text', required: true }],
}
```

Change `Doctors.photoUrl` (text) to `photo` — an `upload` field with
`relationTo: 'media'`. `sharp` is already a dependency, so image sizes work out
of the box. This closes the assignment's "Profile photo" requirement properly
rather than by convention.

### 1.2 Add a `KnowledgeFiles` upload collection

Same pattern, `mimeTypes: ['application/pdf']`, admin-only read. Change
`KnowledgeDocuments.sourceUrl` (text) to `file` — an `upload` field pointing at
it. This is what ADR-008 and ADR-009 describe, and it is what makes the
"administrator uploads a PDF through Payload Admin" flow in System Design §8
real instead of aspirational.

### 1.3 Fix the slot time model

`AppointmentSlots` currently has `date: date` plus `time: text`. Free-text time
cannot be sorted, compared, or validated, and it makes the unique index in
Phase 2 fragile. Replace both with:

- `startsAt: date` (`pickerAppearance: 'dayAndTime'`), required
- `durationMinutes: number`, default 30
- keep `status: select` (`available` | `booked`)

Add a virtual `endsAt` if the UI wants it. Store UTC; format in the client.

### 1.4 Lock down Appointments and add indexes

- Collection access: `create: () => false` (booking goes through the custom
  endpoint only), `read`/`update`: `ownAppointments`, `delete`: `admins`.
- Remove the broken field-level `access` on `patient`; the field is now only
  ever written server-side with `overrideAccess: true`.
- Add `index: true` to `patient`, `doctor`, and `slot`.
- Add `bookedAt: date` and `cancelledAt: date`.

Then declare the database constraints. Payload's mongoose adapter does not
express partial unique indexes, so create them in an idempotent
`onInit`/bootstrap step or a migration script:

```ts
// exactly one active booking per slot
await db
  .collection('appointments')
  .createIndex(
    { slot: 1 },
    { unique: true, partialFilterExpression: { status: 'booked' }, name: 'uniq_active_slot' },
  )
// no duplicate slots for a doctor
await db
  .collection('appointment-slots')
  .createIndex({ doctor: 1, startsAt: 1 }, { unique: true, name: 'uniq_doctor_startsAt' })
```

### 1.5 Wire type generation and write the seed scripts

- Add `generate:types` to the CMS `build` script so `payload-types.ts` is always
  current (ADR-019 depends on generated types being the source of truth).
- Fill in `scripts/seed-doctor.ts`: 3 doctors with specialization,
  qualifications, bio, an uploaded photo, `active: true`.
- Fill in `scripts/seed-slots.ts`: generate slots for the next 7 days,
  09:00–17:00, 30-minute granularity, skipping weekends. Make both scripts
  idempotent (upsert on a natural key) and expose them as `pnpm seed`.

---

## Phase 2 — Booking and concurrency (3.0h)

This is 15% of the grade and the assignment says the reviewer _will_ run two
concurrent bookings against the same slot.

### 2.1 Endpoint

`POST /api/appointments/book`, body `{ slotId: string }`. Validate with Zod at
the boundary (the assignment requires input validation). Derive the patient from
`req.user` — never from the body.

### 2.2 Defence in depth

Three independent layers, each of which alone would be sufficient. Be able to
explain why you used all three.

**Layer 1 — atomic compare-and-swap on the slot.** The only load-bearing check:

```ts
const claimed = await slots.findOneAndUpdate(
  { _id: slotId, status: 'available' },
  { $set: { status: 'booked' } },
  { returnDocument: 'after' },
)
if (!claimed) throw new SlotUnavailableError()
```

A single-document update in MongoDB is atomic. Two concurrent requests both
match the filter optimistically, but only one write observes
`status: 'available'`; the second gets `null`. There is no read-then-write race
because the read and the write are one operation.

**Layer 2 — unique partial index.** `uniq_active_slot` from 1.4. If anything
ever creates a second `booked` appointment for a slot — a bug, a migration, a
direct admin write — MongoDB rejects it with `E11000`. Catch that code
specifically and map it to the same 409.

**Layer 3 — transaction.** Because Phase 0 gave us a replica set, wrap the slot
CAS and the appointment insert in one transaction via Payload's
`req.transactionID`. This removes the need for manual compensation if the insert
fails after the slot was claimed.

### 2.3 Error taxonomy

Map every failure to a stable shape `{ code, message }` where `message` is safe
to show a user and no stack trace ever escapes:

| Condition                                | HTTP    | `code`             |
| ---------------------------------------- | ------- | ------------------ |
| No/invalid token                         | 401     | `UNAUTHENTICATED`  |
| Malformed body                           | 400     | `INVALID_INPUT`    |
| Slot does not exist                      | 404     | `SLOT_NOT_FOUND`   |
| Slot already booked (CAS miss or E11000) | **409** | `SLOT_UNAVAILABLE` |
| Slot in the past                         | 400     | `SLOT_EXPIRED`     |
| Patient already booked this slot         | 409     | `ALREADY_BOOKED`   |
| Anything else                            | 500     | `INTERNAL_ERROR`   |

The user-facing 409 message should be the assignment's wording: _"This
appointment slot is no longer available."_

### 2.4 Reads and cancellation

- `GET /api/appointments?depth=2` already isolates by user through the
  `ownAppointments` access control. Verify with a two-user test rather than
  trusting it.
- Optional (assignment §3.3 says cancellation is optional): `POST
/api/appointments/:id/cancel` sets `status: 'cancelled'`, `cancelledAt`, and
  releases the slot back to `available` in the same transaction. Note that
  releasing the slot is exactly why the unique index is _partial_ on
  `status: 'booked'` — a cancelled appointment must not block a rebooking.

### 2.5 Write the README section now

While it is fresh, draft the four paragraphs the assignment demands: how double
booking is prevented, where validation happens, how concurrent requests are
handled, and which database constructs are used.

---

## Phases 1 and 2 — completed 2026-09-15

Both phases are implemented and verified. Five things were learned in the
process that were not in the original plan and that change how later phases
should be written.

**1. Custom endpoints must be registered on the collection, not the config
root.** Payload mounts collection routes at `/api/appointments/*` and they shadow
root endpoints sharing that prefix, so a root-level `/appointments/book` returns
404 and is never reached. Phase 6's `POST /api/chat` has no colliding collection
prefix, so it can stay a root endpoint — but check before assuming.

**2. Payload disables transactions unless the client has an explicit
`replicaSet`.** The adapter's `connect.js` does this:

```js
if (!this.connection.getClient().options.replicaSet) {
  this.transactionOptions = false
  this.beginTransaction = defaultBeginTransaction() // returns null
}
```

`directConnection=true` therefore yields `beginTransaction() === null`, silently.
Verified empirically that Atlas Local derives both the replica set name and the
advertised member address from the container hostname:

| Container hostname    | Replica set name | Advertised member |
| --------------------- | ---------------- | ----------------- |
| `mongodb`             | `mongodb`        | `mongodb:27017`   |
| `mongo`               | `mongo`          | `mongo:27017`     |
| `db`                  | `db`             | `db:27017`        |
| (unset, container id) | container id     | `<id>:27017`      |
| `localhost`           | `rs-localdev`    | `localhost:27017` |

So Compose pins `hostname: mongodb` and the container URIs use
`?replicaSet=mongodb`. Host-side development still needs `directConnection=true`,
because the host cannot resolve `mongodb`, so the booking endpoint supports both
modes: `lib/transaction.ts` reports whether a transaction is active and the
handler compensates manually when it is not.

**3. Losing the race looks different with and without a transaction.** Without
one, `findOneAndUpdate` simply matches nothing and returns null. With one,
MongoDB aborts the second writer with a **write conflict (code 112)**, because
snapshot isolation will not let two transactions update the same document. The
first implementation only handled the null case, so the transactional path
returned twenty-four 500s while still keeping the data correct. Both are now
mapped to 409 `SLOT_UNAVAILABLE`, along with `E11000` from the unique index.

**4. Payload needs the `sharp` instance passed into `buildConfig`, not merely
installed.** Otherwise upload collections silently skip their configured
`imageSizes` — the only signal is a startup warning. Phase 4's knowledge-file
uploads depend on the same config being right.

**5. Use the mongoose model, not the raw driver collection.** The raw collection
does not cast a string id to an `ObjectId`, so `{ _id: slotId }` silently matches
nothing and every booking returns `SLOT_NOT_FOUND`. `payload.db.collections[slug]`
is the mongoose model and casts using the schema.

One deliberate deviation from the monorepo plan: the seed scripts live in
`apps/payload/src/seed/` rather than a top-level `scripts/`. Under pnpm's strict
`node_modules` layout a root-level script cannot resolve `payload`, and adding
Payload as a second root dependency to work around that would be worse.

### Verified results

| Check                                     | Result                                      |
| ----------------------------------------- | ------------------------------------------- |
| 25 concurrent bookings, transaction mode  | 8/8 rounds: 1 booked, 24 × 409              |
| 25 concurrent bookings, compensating mode | 5/5 rounds: 1 booked, 24 × 409              |
| Duplicate active appointments per slot    | 0                                           |
| Slots left `booked` with no appointment   | 0                                           |
| Booking rules and isolation suite         | 12/12 pass                                  |
| Seed                                      | 3 doctors with 320×320 thumbnails, 90 slots |

---

## Phase 3 — Mobile app completion (3.0h)

### 3.1 Restructure

Adopt the layout the monorepo plan doc already specifies:

```
src/
  pages/{Login,Register,Home,Doctors,DoctorDetails,BookAppointment,BookingConfirmation,MyAppointments,Chatbot}/
  components/
  services/api/{client.ts,auth.ts,doctors.ts,appointments.ts,chat.ts}
  hooks/{useAuth.ts,useApi.ts}
  store/AuthContext.tsx
  router/AppRouter.tsx
  types/
  main.tsx
```

Replace the hand-rolled `Screen` string union with `IonReactRouter` +
`IonRouterOutlet`, which gives real back-stack behaviour and native page
transitions — visible evidence for the Ionic/Android 10%. Add a `PrivateRoute`
that redirects to `/login` when there is no session.

### 3.2 Fix authentication (defect 3.2 in the audit)

In `services/api/client.ts`:

```ts
const token = await getToken()
const headers = {
  'Content-Type': 'application/json',
  ...(token && { Authorization: `JWT ${token}` }),
}
```

Store the token with `@capacitor/preferences` (add the dependency) rather than
`localStorage`, so it persists correctly in the Android WebView. On 401,
clear the token and bounce to `/login`.

### 3.3 Screens

| Screen              | Content                                                    | Notes                                  |
| ------------------- | ---------------------------------------------------------- | -------------------------------------- |
| Login               | email, password, link to register                          | wire the existing form to the router   |
| Register            | name, email, password                                      | already works                          |
| Home                | dashboard nav                                              | already works                          |
| Doctors             | photo, name, specialization                                | switch to the `media` URL from Phase 1 |
| DoctorDetails       | name, specialization, qualifications, bio, available slots | slots from `startsAt`                  |
| BookAppointment     | slot selection + confirm                                   | calls `POST /api/appointments/book`    |
| BookingConfirmation | success state with doctor/date/time                        | required by the assignment             |
| MyAppointments      | doctor, date, time, status                                 | replaces the placeholder               |
| Chatbot             | message list, input, sources, fallback rendering           | Phase 6 wires the backend              |

### 3.4 Error and loading states

Assignment §16: the UI must show understandable messages, not fail silently.
Every screen needs loading, empty, and error branches. Use `IonToast` for
transient errors and inline `IonNote` for form errors. Handle the specific
`SLOT_UNAVAILABLE` 409 with a dedicated message plus an automatic slot-list
refresh, since that is a test case the reviewer will run. Detect offline with
`@capacitor/network` and show a banner.

---

## Phase 4 — RAG ingestion (3.0h)

Build out `services/rag/internal/` per the monorepo plan doc.

### 4.1 Provider abstraction (do this before anything else)

Define narrow interfaces and program against them:

```go
type Embedder interface {
    Embed(ctx context.Context, texts []string) ([][]float32, error)
    Dimensions() int
}

type Generator interface {
    Generate(ctx context.Context, system, user string) (string, error)
}
```

Implement one adapter that speaks the **OpenAI-compatible HTTP API**
(`POST /v1/embeddings`, `POST /v1/chat/completions`), configured entirely by
environment variables. **Decision: default to a local Ollama daemon**, so the
project needs no paid API key and a reviewer can run it offline:

```
LLM_BASE_URL=http://host.docker.internal:11434/v1
LLM_API_KEY=ollama                 # Ollama ignores it; the header must still be present
LLM_MODEL=llama3.2
EMBEDDING_BASE_URL=http://host.docker.internal:11434/v1
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768           # nomic-embed-text output size
```

The same adapter works unchanged against OpenAI, Groq, Together, and Azure, so
switching later is an `.env` edit rather than a code change — which is itself
the point to make in the walkthrough. The interface also lets Phase 7 inject a
deterministic fake provider, keeping RAG tests fast and repeatable.

Four Ollama-specific consequences to design around:

1. **Ollama is not installed on this machine yet.** Add it to the prerequisites
   and do it before Phase 4: `brew install ollama`, then
   `ollama pull nomic-embed-text` and `ollama pull llama3.2`.
2. **It runs on the host, not in Compose.** Containers reach it through
   `host.docker.internal` (already wired up via `extra_hosts` in the Compose
   file). Ollama must be started with `OLLAMA_HOST=0.0.0.0` or it binds to
   loopback and the container gets connection refused.
3. **768 dimensions, not 1536.** `EMBEDDING_DIMENSIONS` must match the vector
   index exactly, and changing the embedding model later means dropping the
   index and re-ingesting every document. Make `EnsureSearchIndex` read the
   dimension from config and fail loudly if an existing index disagrees.
4. **Structured output is weaker than with a frontier model.** Ollama's
   OpenAI-compatible layer supports `response_format: {"type": "json_object"}`
   but schema adherence from an 8B-class model is not guaranteed. Phase 5's
   parser must therefore treat malformed JSON as `sufficient: false` rather than
   as an error — which is the safe direction anyway. Also expect a small local
   model to be _more_ willing to hallucinate than GPT-class models, so gates 1
   and 2 (score and coverage, both computed in Go without the LLM) carry more of
   the weight here. That is a genuine strength of the three-gate design and
   worth saying out loud during the review.

Add retry with exponential backoff and jitter on 429/5xx, and a per-call
`context` deadline.

### 4.2 PDF extraction

Constraint: `Dockerfile.rag` builds with `CGO_ENABLED=0` into distroless, so the
extractor must be **pure Go** — MuPDF bindings like `go-fitz` are out unless you
abandon the distroless image.

Spike both `github.com/pdfcpu/pdfcpu` and `github.com/ledongthuc/pdf` against the
three supplied healthcare PDFs and pick whichever extracts cleaner text. Time-box
this to 20 minutes. Then clean the output: normalise whitespace, de-hyphenate
line-wrapped words, strip repeated headers/footers, and drop pages with almost no
text. Record per-chunk `page` numbers during extraction — the assignment lists
page references as an optional enhancement and they cost almost nothing here.

### 4.3 Chunking

Recursive character splitting on a separator hierarchy
(`\n\n` → `\n` → `. ` → ` `), target ~1,000 characters with ~150 characters of
overlap. Never split mid-sentence when a sentence boundary is within 20% of the
target. Drop chunks under ~100 characters.

Document the choice in the README: overlap preserves context across boundaries;
~1,000 characters is roughly 250 tokens, which keeps 6 retrieved chunks well
inside the context window while staying specific enough that similarity scores
mean something.

### 4.4 Vector store

Extend `internal/vectorstore`:

- `EnsureSearchIndex(ctx)` — idempotently create the `knowledge_vector_index`
  Atlas Vector Search index via `createSearchIndexes`, with
  `numDimensions` from `EMBEDDING_DIMENSIONS`, `similarity: "cosine"`, and
  `documentId` declared as a filter field. Poll until the index reports `READY`.
- `UpsertMany(ctx, []Chunk)` — bulk write.
- `DeleteByDocument(ctx, documentID)` — for re-indexing and deletes.
- `Search(ctx, embedding, k, filter)` — Phase 5.

Extend the `Chunk` struct with `Page int`, `ChunkIndex int`, `Version int`, and
`Title string` so answers can cite a source document and page.

### 4.5 The sync endpoint and the Payload hook

Implement `POST /internal/v1/documents/sync` for real. It should:

1. Accept `{ documentId, version, title, fileUrl }`.
2. Return `202 Accepted` immediately and run the pipeline in a background
   goroutine with its own timeout — indexing takes longer than an HTTP request
   should.
3. Download the PDF from the Payload-served URL, authenticating with the
   internal secret.
4. Extract → clean → chunk → embed (batched) → `DeleteByDocument` →
   `UpsertMany`. Delete-then-insert is what makes ADR-010's versioning work:
   replacing a document cannot leave stale vectors behind.
5. Call back to Payload with `indexStatus: indexed | failed`, `indexedAt`, and
   `indexError`, so the admin sees progress in the CMS.

On the Payload side add `hooks/documents/afterChange.ts` (fires when the file or
version changes) and `afterDelete.ts` (calls a new
`DELETE /internal/v1/documents/:id`). Both call `services/rag.ts`, which owns
the internal-secret header and a short timeout. A RAG outage must never make an
admin's save fail — log and set `indexStatus: failed` instead of throwing.

Also expose a CLI path — `go run ./cmd/ingest --dir ./docs/knowledge` — so the
pipeline can be demonstrated without the admin UI. The assignment explicitly
allows a script, and it makes Phase 7's integration tests easy.

---

## Phase 5 — RAG query and grounding (3.0h)

### 5.1 Retrieval

Embed the question with the same model as ingestion (a different model produces
an incompatible vector space — a classic and fatal RAG bug). Then:

```go
{"$vectorSearch": bson.M{
    "index": "knowledge_vector_index",
    "path": "embedding",
    "queryVector": vec,
    "numCandidates": 100,
    "limit": 6,
}}
```

Project `{"score": bson.M{"$meta": "vectorSearchScore"}}`. As confirmed in the
Phase 0.3 verification, cosine scores come back normalised to `(1 + cos)/2`, so
they land in `[0,1]` and roughly 0.5 means orthogonal. Do not reuse thresholds
from a tutorial that assumed raw cosine.

### 5.2 The sufficiency decision — three gates

This is the part the assignment singles out: _"Vector search returning something
≠ the system necessarily has enough information to answer."_ A bare similarity
threshold fails the reviewer's Test 3 (a question that is semantically close to
the corpus but whose answer is not actually in it). Use a cascade, and be able
to explain why each gate exists:

**Gate 1 — score floor.** Drop chunks below `RAG_MIN_SCORE`. Catches questions
from a completely different domain. Cheap, runs on every request, no LLM call.

**Gate 2 — evidence strength.** Require at least one chunk above
`RAG_STRONG_SCORE` _and_ at least `RAG_MIN_CHUNKS` chunks above the floor. One
weak match is an accident; several converging matches is evidence. Also compute
a cheap lexical-coverage signal: what fraction of the question's content words
(after stop-word removal) appear in the retrieved text? Low coverage with high
embedding similarity is the exact signature of "related topic, wrong question" —
"what is the correct paracetamol dosage in pregnancy?" retrieves the pregnancy
nutrition chunks with a high score while containing none of the answer.

**Gate 3 — LLM self-assessment.** Only reached if gates 1 and 2 pass. Ask the
model for structured JSON rather than prose:

```json
{
  "sufficient": true,
  "answer": "...",
  "source_chunk_ids": ["doc1:3", "doc1:4"],
  "confidence": 0.0
}
```

Use the provider's JSON-schema response format where available; parse
defensively and treat any parse failure as insufficient. The system prompt must
state that the model may use _only_ the numbered context, that it must set
`sufficient: false` if the context does not contain the answer, and that it must
never rely on its own medical knowledge. This catches the case where retrieval
looked statistically fine but the text genuinely does not answer the question.

Put every threshold in configuration (`RAG_MIN_SCORE`, `RAG_STRONG_SCORE`,
`RAG_MIN_CHUNKS`, `RAG_MIN_COVERAGE`), calibrate them against the real PDFs in
Phase 7, and record the calibrated values and the reasoning in the README. "I
tuned these against a labelled question set" is a much stronger walkthrough
answer than "I picked 0.7."

### 5.3 Answer assembly

On success, return the answer plus deduplicated sources (document title + page)
resolved from `source_chunk_ids`. On any gate failing, return the fallback with
a machine-readable marker so Payload knows to open an unresolved query:

```json
{
  "sufficient": false,
  "answer": "I don't have enough information in the available healthcare documents to answer that question. The question has been submitted for review.",
  "sources": [],
  "reason": "low_coverage"
}
```

Carrying the `reason` (`no_results`, `below_threshold`, `low_coverage`,
`llm_declined`) costs nothing and is excellent walkthrough material.

### 5.4 Bounded concurrency (ADR-016)

Guard the chat handler with a buffered-channel semaphore sized by
`RAG_MAX_CONCURRENCY`. When it is full, wait up to a deadline and then return
`503` with a "busy, try again" message rather than queueing unboundedly. Do the
same for the ingestion worker pool. The point to articulate: the bottleneck is
the external embedding/LLM provider and its rate limits, so unbounded goroutines
convert a queue into a wall of 429s.

### 5.5 Safety

The chat handler must never return a provider error body, a URL containing a
key, or a stack trace. Log the detail server-side with `slog` and a request ID;
return a generic message. Add a repo-wide check in CI that no `sk-` style
literal appears in the tree.

---

## Phase 6 — Chat endpoint and unresolved workflow (1.5h)

### 6.1 `POST /api/chat` in Payload

`endpoints/chat.ts`: require auth, Zod-validate `{ question: string }`
(1–1,000 chars), apply a simple in-memory per-user rate limit, then call
`services/rag.ts`, which adds `X-RAG-Internal-Secret` and a 30-second timeout.

Error mapping, per assignment §14:

| Condition                              | Response                                                           |
| -------------------------------------- | ------------------------------------------------------------------ |
| RAG returns `sufficient: false`        | 200 with the fallback text, plus create an unresolved query        |
| RAG unreachable / timeout              | 503, "The assistant is temporarily unavailable. Please try again." |
| LLM provider failure (RAG returns 502) | 502, same user-facing wording                                      |
| Bad input                              | 400                                                                |

### 6.2 Unresolved queries

When `sufficient: false`, create the record with `overrideAccess: true` (the
collection's `create: () => false` stays as-is, which is correct — only the
server may write these):

```ts
await payload.create({
  collection: 'unresolved-queries',
  overrideAccess: true,
  data: { question, user: req.user.id, status: 'new', retrievalReason: reason, topScore },
})
```

Add `retrievalReason` and `topScore` fields — they turn the admin screen into a
genuine tuning tool and show the reviewer you thought past the minimum.

### 6.3 Admin resolution workflow

On `UnresolvedQueries`, add `resolvedAt: date` and `reviewedBy: relationship`,
set `admin.defaultColumns` to `[question, user, status, createdAt]`, add
`admin.listSearchableFields`, and add a `beforeChange` hook that stamps
`resolvedAt` and `reviewedBy` when status flips to `resolved`. That covers
assignment §12 end to end and the optional "filtering/searching unresolved
queries" enhancement almost for free.

### 6.4 Mobile chatbot screen

Render the message list, sources as chips under each answer, and the fallback
in a visually distinct style so a demo makes the "I don't know" behaviour
obvious. Keep chat history in component state — persistence is optional per §23.

---

## Phase 7 — Automated tests (3.0h)

Detailed in `02-testing-plan.md`. Tests are optional per assignment §23, but the
double-booking concurrency test is the only way to _demonstrate_ the guarantee
during the walkthrough instead of asserting it, and the RAG relevance tests are
the only way to justify your thresholds. Budget the time.

---

## Phase 8 — Docker, README, APK (2.5h)

### 8.1 Docker

- Single MongoDB (done in Phase 0), `--frozen-lockfile` (done in Phase 0).
- Add `output: 'standalone'` to `next.config.mjs` and make `Dockerfile.cms`
  multi-stage: deps → build → a slim runtime that copies only
  `.next/standalone`, `.next/static`, and `public`. Run as a non-root user.
- Give the RAG service a working healthcheck without a shell by adding a
  `-healthcheck` flag to `cmd/server` that pings `/healthz` and exits 0/1, then
  `HEALTHCHECK CMD ["/rag", "-healthcheck"]`. Switch the CMS's `depends_on` for
  `rag` to `condition: service_healthy`.
- Add a `seed` profile service so `docker compose --profile seed up seed` loads
  doctors, slots, and the knowledge PDFs in one command.

### 8.2 README

The assignment lists 13 required sections plus 9 required explanations plus the
AI-usage disclosure. Write it as a checklist and tick every line:

1. Setup instructions · 2. Environment variables · 3. MongoDB setup ·
2. Payload setup · 5. Ionic setup · 6. Run the backend · 7. Run the mobile app ·
3. Load/index the RAG documents · 9. Embedding approach · 10. Vector store ·
4. LLM configuration · 12. Architecture diagram · 13. Technical decisions

Then, explicitly: RAG architecture, chunking strategy, retrieval strategy, how
the system decides it has insufficient information, how hallucinations are
reduced, how double booking is prevented, the auth/authz approach, and how
unanswered questions are handled.

Use a Mermaid diagram for the architecture so it renders on GitHub.

Write the **AI Usage** section honestly: tools used, what was generated vs.
hand-written, how you reviewed it, and — this one carries weight — at least one
concrete mistake AI produced that you caught. You have real material here: the
`patient` field access bug from §3.1 of the audit, the unattached auth token in
§3.2, and the `replicaSet=rs0` connection string in §3.5 are all exactly the
kind of plausible-looking AI output that does not survive review.

### 8.3 Android APK

Blocked until a JDK is installed. `brew install --cask temurin@21`, then:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
echo "VITE_PAYLOAD_URL=http://10.0.2.2:3000" > apps/mobile/.env
pnpm --filter @doctor-app/mobile build
pnpm --filter @doctor-app/mobile cap:sync
(cd apps/mobile/android && ./gradlew assembleDebug)
```

The artifact lands at
`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Attach it to
the submission and document the build steps regardless, since the assignment
accepts either.

Android also needs `android:usesCleartextTraffic="true"` (or a network security
config) for the HTTP dev backend. `capacitor.config.ts` already sets
`cleartext: true`; verify the generated manifest actually reflects it, and note
in the README that this is a development-only exception.

---

## Cut line for a 16–20 hour budget

If time runs short, drop in this order — everything below the line is optional
per assignment §23 and loses no mandatory checkbox:

1. Appointment cancellation (§3.3 says explicitly optional) — **−0.5h**
2. Mobile unit tests; keep the backend and RAG tests — **−1.0h**
3. Next standalone image optimisation; the working image is enough — **−0.5h**
4. Page-level source references; document-level citation satisfies the spec — **−0.5h**
5. `retrievalReason` / `topScore` telemetry on unresolved queries — **−0.3h**

That lands at ~20 hours with every mandatory requirement intact.

**Never cut:** the concurrency test, the three-gate sufficiency logic, or the
README. Those three are where the assignment says it is looking hardest.
