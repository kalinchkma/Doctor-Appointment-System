# Implementation Audit — Current State vs. Assignment + Plan Docs

Last updated: 2026-09-15 (post Phases 0–3)

This document records what exists today, what is missing, and what is still
wrong, measured against `docs/assignment-docs/Senior Full-Stack Developer
Technical Assessment.pdf` and the three `.docx` plan documents in this folder.

The original audit of commit `734e8ae` is superseded. Phases 0–3 of
`01-implementation-plan.md` are implemented and verified. Remaining graded work
is the RAG pipeline, the chat/unresolved workflow, RAG tests, and
Docker/README/APK polish.

---

## 1. Scorecard against the assignment's Final Acceptance Criteria

The assignment's section 26 lists 30 checkboxes. Current status:

| Group               | Done | Partial | Missing |
| ------------------- | ---- | ------- | ------- |
| Appointment (10)    | 10   | 0       | 0       |
| RAG (12)            | 12   | 0       | 0       |
| Technical (8+)      | 8    | 0       | 0       |

Phases 4–8 are implemented: Go ingest/query, Payload `POST /api/chat`,
unresolved-query writer, unit tests, README RAG sections, slim CMS image, and
a Compose seed profile. Runtime proof still depends on Ollama + a live stack.

### Appointment — complete

- [x] User can register — `POST /api/auth/patient/register`
- [x] User can log in — `POST /api/auth/patient/login`
- [x] User can view doctors — `GET /api/doctors`
- [x] User can view doctor details — Payload depth + mobile `DoctorDetails`
- [x] User can view available slots — `GET /api/appointment-slots` (`startsAt`)
- [x] User can book a slot — `POST /api/appointments/book`
- [x] Same slot cannot be booked twice — CAS + partial unique index + txn
- [x] User can view their appointment — `MyAppointments` + confirmation
- [x] Doctors managed through Payload — `photo` is a `media` upload
- [x] Slots managed through Payload — `startsAt` + `durationMinutes`

Verified: 25 concurrent bookings → 1×201 + 24×409 in both transaction and
compensating modes (`tests/booking-concurrency.ts`). Isolation and cancel-then-
rebook: 12/12 in `tests/booking-rules.ts`.

### RAG — implemented

- [x] Provided PDFs can be indexed — admin upload or `go run ./cmd/ingest`
- [x] Text extracted and chunked — `internal/ingestion`
- [x] Embeddings generated — OpenAI-compatible client, Ollama default
- [x] Embeddings/chunks stored — `rag_vectors.knowledge_chunks`
- [x] User questions perform vector retrieval — `$vectorSearch`
- [x] LLM answers using retrieved context — three-gate pipeline
- [x] Answerable questions get grounded answers
- [x] Source document shown — title + page chips on mobile
- [x] Unsupported questions not fabricated — fallback copy
- [x] Unsupported questions stored in Payload — `unresolved-queries`
- [x] Unresolved questions have New status
- [x] Admin can view / answer / mark Resolved — `beforeChange` stamps

`POST /api/chat` is a root Payload endpoint. The Go service is unpublished and
authenticated with `X-RAG-Internal-Secret`.

### Technical

- [x] Ionic React app + Capacitor Android/iOS projects
- [x] Payload CMS 3.89 on Next 16
- [x] MongoDB (Atlas Local 8, single instance, two databases)
- [x] Node.js / TypeScript backend
- [x] LLM integration — Ollama-compatible client, keys stay on the backend
- [x] Vector store — Atlas Vector Search on `rag_vectors`
- [x] API keys kept on backend
- [x] Authentication/authorization — JWT attached from `@capacitor/preferences`
- [x] User data isolation — `ownAppointments`
- [x] README — setup, booking, RAG, AI usage

---

## 2. Technology currency

Nothing here is outdated. Do not bump majors.

| Package                          | Resolved                              | Assessment                          |
| -------------------------------- | ------------------------------------- | ----------------------------------- |
| `payload`                        | 3.89.0                                | Current                             |
| `next`                           | 16.3.5                                | Current                             |
| `react` / `react-dom`            | 19.3.0                                | Current                             |
| `@ionic/react`                   | 9.0.3                                 | Current                             |
| `@capacitor/*`                   | 8.5.2                                 | Current                             |
| `react-router` / `react-router-dom` | 6.30.6                             | Required by `@ionic/react-router`   |
| `typescript`                     | 7.0.2                                 | Current                             |
| `vite`                           | 8.3.0                                 | Current                             |
| `zod`                            | 4.6.4                                 | Current                             |
| Go toolchain                     | 1.26.4 local, `go 1.26.0` in `go.mod` | Current                             |
| `go.mongodb.org/mongo-driver/v2` | 2.5.0                                 | Current                             |
| `mongo` image                    | `mongodb/mongodb-atlas-local:8.0`     | Current                             |

Dependencies are caret-pinned. `Dockerfile.cms` uses `--frozen-lockfile`.
Node is 22.17.1 via `.nvmrc` and `engines`.

Do **not** move to React Router 7/8, Next 17, Payload 4, or Node 24.

---

## 3. Defects that were fixed in Phases 0–3

Kept here because they are walkthrough / AI-usage material.

1. **Appointments were unbookable.** `patient` was `required` with field-level
   `create: false`, so REST create always failed. Fixed: collection `create` is
   closed; booking goes through a custom endpoint that derives `patient` from
   `req.user`.
2. **Mobile never sent the JWT.** Token was stored and never attached. Fixed:
   `Authorization: JWT <token>` from `@capacitor/preferences`.
3. **Two MongoDB containers** contradicted ADR-003/004 and blocked
   transactions. Fixed: one Atlas Local instance, two logical databases.
   Compose pins `hostname: mongodb` so `?replicaSet=mongodb` enables Payload
   transactions. Host-side dev uses `directConnection=true` and compensates.
4. **`"latest"` specifiers + `--frozen-lockfile=false`.** Pinned. React Router
   majors were conflicting; they are now both `^6.30.6`.
5. **Empty seed scripts.** Replaced by `apps/payload/src/seed/` (idempotent,
   3 doctors with thumbnails, 90 slots).
6. **Build artifacts committed.** Ignored.

---

## 4. Remaining operational gaps

These are environment/demo items, not missing product code.

### 4.1 Live RAG still needs Ollama

Unit tests use a fake embedder. A reviewer demo needs:

```
brew install ollama
ollama pull nomic-embed-text
ollama pull deepseek-r1:latest
OLLAMA_HOST=0.0.0.0 ollama serve
```

### 4.2 Android APK still needs JDK 21

```
brew install --cask temurin@21
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
```

Then `pnpm --filter @doctor-app/mobile build && cap:sync && ./gradlew assembleDebug`.

### 4.3 Mobile polish (non-blocking)

`@capacitor/network` is unused; no global offline banner. Fallback chat styling
is in place.

---

## 5. Deviations from the original plan documents that we are keeping

| Plan said                                      | Code does                                         | Why keep                                      |
| ---------------------------------------------- | ------------------------------------------------- | --------------------------------------------- |
| Seed scripts at repo `scripts/`                | `apps/payload/src/seed/`                          | pnpm strict layout cannot resolve `payload`   |
| `directConnection=true` everywhere             | Compose uses `?replicaSet=mongodb`                | Payload disables transactions otherwise       |
| Booking tests in Vitest                        | Standalone `tsx` HTTP scripts                     | They already prove the real HTTP + DB path    |
| `IonReactRouter` + `pages/`                    | Implemented as specified                          | —                                             |

Either implement the remaining plan (Phases 4–8) or amend the doc. Do not leave
both.

---

## 6. What is left for a live demo

1. Install and start Ollama (`nomic-embed-text`, `deepseek-r1:latest`, `OLLAMA_HOST=0.0.0.0`)
2. `pnpm docker:up`, then `pnpm seed` or `pnpm docker:seed`
3. Ingest PDFs (admin upload or `/rag -ingest /knowledge`)
4. Rehearse the walkthrough in `03-running-plan.md` §9
5. Install Temurin 21 and build the debug APK

The phased plan is in `01-implementation-plan.md`. Testing is in
`02-testing-plan.md`. How to run is in `03-running-plan.md`.
