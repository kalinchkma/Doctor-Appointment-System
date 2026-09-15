# Follow-up features (2026-09-15)

## Prebuilt chat questions
- Collection `chat-suggested-questions` (admin CRUD; public read of active).
- Seeded via `apps/payload/src/seed/chatQuestions.ts`.
- Mobile chat shows tappable chips before the first custom message.

## Storage drivers
- `STORAGE_DRIVER=local|s3|azure` (default local). See `.env.example`.
- Uses `@payloadcms/storage-s3` / `@payloadcms/storage-azure` for `media` and `knowledge-files`.
- Internal RAG PDF fetch supports local disk and absolute/relative upload URLs.

## Async knowledge ingest
- Payload `afterChange` marks `processing`, then defers the RAG sync POST until after commit.
- RAG returns 202 and indexes in a goroutine; seed polls until `indexed`/`failed`.

## Booking + slot conflicts (app + DB)
- Patient book: CAS + `uniq_active_slot` + txn/compensation; conflicts → `SLOT_UNAVAILABLE` 409 with a clear message.
- Admin slots: `beforeValidate` rejects exact duplicates and time overlaps with clear messages.
- DB backstop: `uniq_doctor_startsAt`; `endsAt` is computed for overlap queries.
