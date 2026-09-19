# Live walkthrough script (assignment §21–22, §25)

Run this after the stack is healthy: `http://<elastic-ip>/admin` and the APK (or Ionic web) pointed at the same origin **without** `:3000`.

## 0. Health (30 seconds)

```bash
curl -I http://127.0.0.1/healthz
docker compose --env-file .env \
  -f infrastructure/docker/docker-compose.yml \
  -f infrastructure/docker/docker-compose.ec2.yml ps
docker compose exec -T ollama ollama list   # llama3.2 + nomic-embed-text
```

From your laptop: `http://<elastic-ip>/admin` (HTTP, port 80).

## 1. Admin + Payload collections

1. Log in as the first admin (`/admin/create-first-user` if none exists).
2. Show **Doctors** (photos, specialisation), **Appointment slots**, **Appointments**.
3. Show **RAG Settings** — chat `llama3.2`, embed `nomic-embed-text`, base URL blank (Compose Ollama).
4. Show **Knowledge documents** status `indexed`.

Talking point: doctors and slots are managed here, not in the app.

## 2. Appointment Test 1 — happy path

On the phone / emulator:

1. Register a new patient (or `ayesha.karim@careconnect.demo` / `Patient123!`).
2. Home → Doctors → details → available slot → Book.
3. Confirmation screen, then **My Appointment**.

Talking point: JWT is in Capacitor Preferences, header `Authorization: JWT …`.

## 3. Appointment Test 2 — double book

Two sessions (two browsers, or curl + app) book the **same** slot.

Expected: one success, one `This appointment slot is no longer available` (HTTP 409).

Talking point: CAS + `uniq_active_slot` + transaction. The UI disabling the chip is not the protection.

## 4. Appointment Test 3 — isolation

Log in as a second patient. My Appointment must not list the first patient’s row.

Talking point: `ownAppointments`; booking sets `patient` from `req.user`, not the body.

## 5. RAG Test 1 — answerable

Ask something clearly in a PDF, for example prenatal vitamin / iron / breastfeeding calories (use a sentence you can see in the PDF).

Expected: prose answer, **source chip** with document title (and page when present). Not a generic LLM essay.

Talking point: query embedding uses `search_query:`; documents were stored with `search_document:`.

## 6. RAG Test 2 — unanswerable (hallucination check)

Ask: **“What medication dosage should I take for X?”** (not in the three PDFs).

Expected:

- Fallback: not enough information in the uploaded documents; submitted for review
- **No** invented milligrams
- Payload **Unresolved Queries** → new row, status **New**, `topScore` filled

Talking point: gate 1 or 2 failed; the LLM was never asked to guess a dose.

## 7. RAG Test 3 — weakly related

Ask something in the same domain (pregnancy) but not actually in the PDFs (a specific hospital protocol, a drug name).

Expected: still fallback, not a confident wrong answer. Coverage gate exists for “similar vectors, missing words”.

## 8. RAG Test 4 — human resolution

In admin: open the unresolved row and chat in the thread. The patient replies on the **Clinic replies** tab. The RAG assistant chat stays separate.

Expected: `resolvedAt` / `reviewedBy` stamped by hook. No notification system (out of scope).

## 9. CSRF / edge (if they ask why admin login was hard)

Show:

- Login `POST /api/users/login` 200
- Next request is `GET /admin?_rsc=…` (RSC fetch with `Origin`)
- `PAYLOAD_PUBLIC_URL` has **no** `:3000`
- `curl http://<ip>:8080/healthz` **fails** from the laptop (Go unpublished)
- `curl http://<ip>/api/internal/rag-settings` → 404 from nginx

## 10. Close

Point at README sections: double booking, three gates, AI usage, architecture diagram. Offer tradeoffs (Compose vs ECS, Ollama vs hosted LLM).
