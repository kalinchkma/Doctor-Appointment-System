# Testing Plan

The assignment lists automated tests as an _optional_ enhancement (§23) but
specifies seven test cases the evaluator will run by hand (§21, §22) and asks
you to defend double-booking prevention and RAG relevance in a live walkthrough
(§25). The strategy below spends test effort only where it either closes a
stated evaluation case or produces evidence you can show on screen.

**Status 2026-09-15.** The double-booking and booking-rules suites already exist
as standalone `tsx` HTTP scripts, not Vitest:

- `apps/payload/tests/booking-concurrency.ts` — 25 parallel bookings, 1×201 + 24×409
- `apps/payload/tests/booking-rules.ts` — auth, isolation, cancel-then-rebook

Keep them. Do not rewrite them as Vitest. Remaining work is Go unit/integration
tests, Payload chat tests (RAG mocked), `scripts/e2e.sh`, and threshold
calibration.

**Budget: ~3 hours.** Priorities, highest first:

1. The double-booking concurrency test — the single most valuable test in the repo
2. RAG sufficiency tests with a deterministic fake provider
3. User data isolation
4. Everything else

---

## 1. Tooling

| Layer          | Framework                                           | Rationale                                               |
| -------------- | --------------------------------------------------- | ------------------------------------------------------- |
| Go unit        | stdlib `testing`, table-driven                      | No dependency; idiomatic                                |
| Go HTTP        | `net/http/httptest`                                 | Tests handlers and fake providers without a network     |
| Go integration | `testcontainers-go` + `mongodb/mongodb-atlas-local` | Real `$vectorSearch`, disposable                        |
| Payload / Node | `vitest` + Payload Local API                        | Local API bypasses HTTP for setup, so tests stay fast   |
| Payload HTTP   | `vitest` + `fetch` against a booted Next server     | The concurrency test must go through the real HTTP path |
| Mobile         | `vitest` + `@testing-library/react` + `msw`         | Standard for Vite/React                                 |
| E2E            | a shell script over the running Compose stack       | Mirrors exactly what the evaluator does                 |
| Secrets        | `gitleaks` in CI                                    | Assignment §15: no secrets in git                       |

Add `test`, `test:unit`, `test:integration`, and `test:e2e` scripts to the root
`package.json`.

---

## 2. The double-booking test (write this one first)

This is the centrepiece. It must exercise the real HTTP endpoint against a real
MongoDB — mocking defeats the purpose, because the thing under test is a
database concurrency guarantee.

```ts
// apps/payload/tests/integration/booking-concurrency.test.ts
it('allows exactly one of N concurrent bookings for the same slot', async () => {
  const slot = await createSlot({ doctor, startsAt: tomorrowAt(10) })
  const patients = await Promise.all(range(25).map(createPatientAndLogin))

  const results = await Promise.all(
    patients.map((p) =>
      fetch(`${BASE}/api/appointments/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `JWT ${p.token}` },
        body: JSON.stringify({ slotId: slot.id }),
      }),
    ),
  )

  const created = results.filter((r) => r.status === 201)
  const conflicts = results.filter((r) => r.status === 409)

  expect(created).toHaveLength(1)
  expect(conflicts).toHaveLength(24)

  // and the database agrees
  const booked = await payload.count({
    collection: 'appointments',
    where: { and: [{ slot: { equals: slot.id } }, { status: { equals: 'booked' } }] },
  })
  expect(booked.totalDocs).toBe(1)
  expect((await getSlot(slot.id)).status).toBe('booked')
})
```

Three details that matter:

- **Fire all requests before awaiting any.** Build the array of promises first,
  then `Promise.all`. Awaiting inside a loop serialises the requests and the
  test passes vacuously.
- **Assert both the HTTP outcome and the database state.** A buggy
  implementation can return one 201 while writing two rows.
- **Run it 10 times in a row** (`--repeat 10` or a loop) before trusting it.
  Race conditions are probabilistic; a single green run proves little.

Add a second variant that asserts the _unique index_ independently, by calling
`payload.create` twice directly with `overrideAccess: true` and expecting the
second to throw `E11000`. That proves Layer 2 works even if Layer 1 were
removed.

Record the output of these tests — it is the strongest possible answer to
"explain how you prevent double booking."

---

## 3. Go unit tests (`services/rag`)

Fast, no network, no database. Target ≥70% statement coverage on `internal/`.

**`internal/ingestion/chunker_test.go`** — table-driven:

- empty input → zero chunks
- input shorter than the minimum → dropped
- input at exactly the target size → one chunk
- long input → correct count, and consecutive chunks share the overlap window
- paragraph boundaries preferred over mid-sentence splits
- unicode and CJK input do not split a multi-byte rune (use `[]rune`, not
  `[]byte`, and assert it)

**`internal/ingestion/extractor_test.go`** — feed a small committed fixture PDF;
assert known strings are present, headers/footers are stripped, and hyphenated
line-wraps are rejoined.

**`internal/relevance/evaluator_test.go`** — the most important Go tests. One
table covering each decision path:

| Case                          | Top score         | Chunks above floor | Coverage | Expected             |
| ----------------------------- | ----------------- | ------------------ | -------- | -------------------- |
| Clearly answerable            | 0.88              | 5                  | 0.7      | `sufficient`         |
| Off-domain question           | 0.31              | 0                  | 0.0      | `no_results`         |
| Single weak match             | 0.64              | 1                  | 0.5      | `below_threshold`    |
| Related topic, wrong question | 0.81              | 4                  | 0.15     | `low_coverage`       |
| Boundary, exactly at floor    | = `RAG_MIN_SCORE` | 3                  | 0.4      | documented behaviour |

The fourth row is the assignment's Test 3 and the reason the coverage gate
exists. Make it explicit in the test name.

**`internal/llm/prompt_test.go`** — the rendered system prompt contains the
grounding instruction; context chunks are numbered and attributed; a chunk
containing `"ignore previous instructions"` is fenced rather than interpolated
raw (basic prompt-injection hygiene).

**`internal/llm/client_test.go`** — with `httptest`: a valid JSON response parses;
malformed JSON yields `sufficient: false` rather than a panic; a 429 triggers
backoff and retry; retries stop at the limit; a cancelled context returns
promptly.

**`internal/httpapi/server_test.go`** — a missing or wrong
`X-RAG-Internal-Secret` returns 401; a correct one passes through; the
comparison is constant-time (assert via `subtle.ConstantTimeCompare` usage, not
timing); a request over the concurrency limit returns 503, not a hang.

---

## 4. Go integration tests

Tagged `//go:build integration` so `go test ./...` stays fast by default.

Spin up `mongodb/mongodb-atlas-local` with `testcontainers-go`, then:

1. **Index lifecycle** — `EnsureSearchIndex` creates `knowledge_vector_index`,
   is idempotent on a second call, and the index reaches `READY`.
2. **Round trip** — ingest a fixture PDF with a _fake_ embedder that maps text
   to deterministic vectors; assert chunks land in `knowledge_chunks` with the
   right `documentId`, `page`, and `version`.
3. **Vector search returns the right chunk** — query with the fake embedding of
   a known sentence; assert the containing chunk ranks first.
4. **Re-index replaces, never duplicates** — ingest v1, ingest v2, assert no v1
   chunks remain. This is the ADR-010 guarantee.
5. **Delete removes vectors** — `DeleteByDocument` leaves zero chunks.

Use the fake embedder throughout. Hitting a real provider in tests makes them
slow, flaky, non-deterministic, and dependent on a key the reviewer does not
have.

---

## 5. Payload integration tests

Beyond the concurrency test in §2:

**Authentication**

- Register with a valid payload → 201 and a token
- Register with a duplicate email → 400, and the message does not reveal whether
  the account exists beyond what the current copy already says
- Register with a weak/short password → 400
- Login with wrong credentials → 401
- Login as an admin through the patient endpoint → 403
- The first user created is assigned `role: admin`; the second is not

**Authorization and data isolation** (assignment §21 Test 3)

- Patient A cannot read patient B's appointment by ID → 403/404
- `GET /api/appointments` as A never returns B's rows
- A patient cannot `POST /api/appointments` directly (collection create is
  disabled) → 403
- A patient cannot set `role: 'admin'` on themselves via `PATCH /api/users/:id`
- A patient cannot read `unresolved-queries` or `knowledge-documents`
- An unauthenticated request to any protected route → 401

**Booking**

- Happy path → 201, appointment `status: booked`, slot `status: booked`,
  `patient` equals the token's user regardless of what the body claimed
- Booking an already-booked slot → 409 `SLOT_UNAVAILABLE`
- Booking a nonexistent slot → 404
- Booking a past slot → 400 `SLOT_EXPIRED`
- A body carrying someone else's `patient` id → that field is ignored
- Cancellation releases the slot and the slot can then be rebooked (this is what
  proves the unique index is correctly _partial_)

**Chat endpoint** (with the RAG service faked at the fetch boundary)

- `sufficient: true` → 200, the answer and sources reach the client
- `sufficient: false` → 200 with the fallback **and** exactly one
  `unresolved-queries` row with `status: 'new'` and the right `user`
- RAG unreachable → 503 and no unresolved query is written
- Question over 1,000 characters → 400
- Unauthenticated → 401
- **No response body from any error path contains a stack trace, a file path, or
  the string `RAG_INTERNAL_SECRET`**

---

## 6. Mobile tests

Lowest priority; first to cut. With `msw` mocking the API:

- `client.ts` attaches `Authorization: JWT <token>` when a token is stored, and
  omits the header when it is not
- A 401 clears the stored token and redirects to `/login`
- `PrivateRoute` redirects an unauthenticated user
- The booking screen renders the correct message on a 409 and refreshes the slot
  list
- The chatbot renders the fallback distinctly from a grounded answer
- The doctors list renders loading, empty, and error states

---

## 7. End-to-end: the evaluator's seven cases

A single script (`scripts/e2e.sh`) that runs against `docker compose up` and
prints a pass/fail line per case. This doubles as your demo script for the
walkthrough.

| #   | Source     | Case                                                         | Assertion                                                             |
| --- | ---------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| A1  | §21 Test 1 | Register → login → doctors → slot → book                     | 201; appointment visible in "my appointments"                         |
| A2  | §21 Test 2 | Two users book the same slot simultaneously                  | exactly one 201, one 409                                              |
| A3  | §21 Test 3 | User A requests user B's appointment                         | 403/404                                                               |
| R1  | §22 Test 1 | Question clearly answered by the PDFs                        | grounded answer + source document named                               |
| R2  | §22 Test 2 | Question with no basis in the PDFs                           | fallback, no fabrication, `unresolved-queries` row with `status: new` |
| R3  | §22 Test 3 | Question semantically near the corpus but not answered by it | fallback, not a confident guess                                       |
| R4  | §22 Test 4 | Admin opens the unresolved query, answers, marks resolved    | visible in admin; `status` → `resolved`; `humanResponse` persisted    |

R3 is the one most submissions fail. Prepare a specific question against the
actual supplied PDFs — for a corpus of pregnancy nutrition, prenatal care, and
child nutrition guides, something like _"What paracetamol dosage is safe in the
third trimester?"_ is ideal: high embedding similarity to the pregnancy
material, zero actual coverage of the answer.

---

## 8. Threshold calibration

Not a test suite, but it is what makes the thresholds in Phase 5 defensible.

Build `services/rag/testdata/questions.yaml` with ~20 labelled questions against
the real PDFs: 10 answerable, 5 unanswerable, 5 weakly related. Add a
`go test -tags calibration` harness that runs the real pipeline over them and
prints a confusion matrix.

Optimise for the right error. A false "I don't know" on an answerable question
is a minor annoyance; a fabricated medical answer is the failure mode the
assignment is explicitly testing for. Prefer recall of the unanswerable class —
target zero fabrications, and accept a few over-cautious fallbacks.

Paste the final matrix and the chosen thresholds into the README. That
transforms "how did you pick 0.7?" from an awkward moment into your best answer
of the walkthrough.

---

## 9. CI

`.github/workflows/ci.yml`, on push and PR:

```
lint       → eslint + prettier --check + golangci-lint + gofmt -l
typecheck  → pnpm -r typecheck
unit       → go test ./... && pnpm -r test:unit
integration→ docker compose up -d mongodb && pnpm test:integration && go test -tags integration ./...
build      → pnpm -r build && docker compose build
secrets    → gitleaks detect --no-banner
bundle     → assert no LLM/embedding key string appears in apps/mobile/dist
```

The last two directly evidence assignment §15. The `bundle` check is a
three-line grep and is worth having: it proves the claim "LLM API keys must
remain on the backend" rather than asserting it.

---

## 10. What is deliberately not tested

Say this out loud in the README; scoping is itself a senior signal.

- **Payload's own framework behaviour.** Access-control _configuration_ is
  tested through its effects; Payload's internals are not.
- **Real LLM/embedding provider responses.** Non-deterministic, costly, and
  dependent on a key the reviewer lacks. The provider interface is tested;
  the provider is not.
- **Android UI automation.** Espresso/Appium setup exceeds the value here.
  Android is verified manually on an emulator and documented with screenshots.
- **Load and performance.** Out of scope per §15 and §23. The concurrency test
  covers correctness under contention, which is the property that was actually
  asked for.
