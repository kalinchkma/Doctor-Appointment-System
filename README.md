# Mini Doctor Appointment + RAG Chatbot

Initial monorepo setup for the technical assessment. It contains an Ionic React authentication screen, Payload CMS as the public REST/API and admin application, a dedicated MongoDB database for application data, and a separate MongoDB Atlas Local vector database used only by the internal Go RAG service.

## Prerequisites

- Node.js 24+ and Corepack (`corepack enable`) for pnpm.
- Go 1.26+ for running the RAG service outside Docker.
- Docker Desktop / Docker Engine with Docker Compose for the complete local stack.
- Android Studio plus a compatible JDK for Android builds.
- macOS and Xcode for iOS builds (Xcode is not available on Linux or Windows).

Install JavaScript dependencies once from the repository root:

```bash
corepack enable
pnpm install
```

## Included now

- Payload CMS with its own MongoDB instance, role-based access, and first-user admin bootstrap.
- CMS collections for users, doctors, appointment slots, appointments, knowledge documents, and unresolved queries.
- Ionic React patient login/register, home, doctor list, doctor details, available-slot list, appointment placeholder, and chat placeholder.
- Capacitor Android and iOS projects under `apps/mobile/android` and `apps/mobile/ios`.
- Docker Compose for `cms`, `mongodb`, `vector-mongodb`, and `rag`. The RAG service and vector database are not published to the host network.
- Go RAG service health endpoint and secret-protected internal endpoints. It connects only to the `knowledge_chunks` collection in the separate `rag_vectors` vector database.

## Run the complete stack with Docker (recommended)

This starts two databases, Payload CMS, and the internal Go RAG service together. The normal MongoDB instance stores only Payload data and exposes `27017`. The Atlas Local vector database stores only RAG chunks/embeddings and has no host port. Payload exposes `3000`; RAG is reachable only as `http://rag:8080` from the CMS container.

```bash
cp .env.example .env
# replace both placeholder secrets in .env
pnpm docker:up
```

Useful Docker commands:

```bash
# Watch startup logs
docker compose --env-file .env -f infrastructure/docker/docker-compose.yml logs -f

# Stop containers without deleting the MongoDB volume
pnpm docker:down

# Rebuild after CMS or Go-service changes
pnpm docker:up
```

When the containers are ready:

- Payload Admin/API: `http://localhost:3000/admin`
- Payload MongoDB: `mongodb://localhost:27017` (application/CMS data only)
- RAG vector MongoDB: internal-only Compose service `vector-mongodb:27017`
- RAG: internal only; health route is `GET /healthz` from inside the Compose network.

Open `http://localhost:3000/admin` and create the first user. That account is made an administrator automatically. Start the Ionic web app separately:

```bash
pnpm dev:mobile
```

It runs at `http://localhost:5173` and uses `http://localhost:3000` as its Payload base URL. Payload reads `PAYLOAD_DATABASE_URI`; RAG reads `RAG_DATABASE_URI` and `RAG_DATABASE_NAME`. These intentionally point to different database services.

## Run services locally instead of Docker

Use Docker for both databases, then run the CMS and Go RAG service directly in separate terminals. First create `.env` from `.env.example`, then start both databases:

```bash
docker compose --env-file .env -f infrastructure/docker/docker-compose.yml up -d mongodb vector-mongodb
```

In terminal 1, run Payload CMS:

```bash
PAYLOAD_DATABASE_URI='mongodb://payload_root:replace-with-a-payload-db-password@localhost:27017/doctor_app?authSource=admin' \
PAYLOAD_SECRET='replace-with-a-long-random-secret' \
RAG_SERVICE_URL='http://localhost:8080' \
RAG_INTERNAL_SECRET='replace-with-another-long-random-secret' \
pnpm dev:cms
```

In terminal 2, run the Go RAG service:

```bash
RAG_DATABASE_URI='mongodb://rag_root:replace-with-a-rag-vector-db-password@localhost:27018/rag_vectors?authSource=admin&replicaSet=rs0' \
RAG_DATABASE_NAME='rag_vectors' \
RAG_INTERNAL_SECRET='replace-with-another-long-random-secret' \
pnpm dev:rag
```

In terminal 3, run the Ionic browser app:

```bash
pnpm dev:mobile
```

The local RAG health check is `curl http://localhost:8080/healthz`. Its protected chat and document-sync routes require the `X-RAG-Internal-Secret` header and should be called by Payload, not the mobile app.

## Roles and authentication

- Only users with `role: admin` can enter Payload Admin at `/admin` and manage doctors and slots.
- Mobile register/login uses `POST /api/auth/patient/register` and `POST /api/auth/patient/login`. These routes create and accept only `patient` users; an admin account receives a `403` response from the mobile login endpoint.
- Create the very first account through `/admin`. The first-user hook assigns it the `admin` role. Create patients from the mobile registration screen thereafter.

## Test the Ionic app in a browser

1. Start the backend with `pnpm docker:up`.
2. In another terminal, run `pnpm dev:mobile`.
3. Open `http://localhost:5173`, register a patient, and sign in.
4. In Payload Admin, create active Doctors and Appointment Slots. Return to the app and select **Find a doctor** to test the public doctor and available-slot API reads.

## Test on Android

Requirements: Android Studio, Android SDK, a JDK supported by Android Studio, and either an emulator or a connected device.

```bash
# Set the endpoint first. Android Emulator uses 10.0.2.2 to reach the host.
cp apps/mobile/.env.example apps/mobile/.env
# edit apps/mobile/.env: VITE_PAYLOAD_URL=http://10.0.2.2:3000

# build the web application and copy it to the native Android project
pnpm --filter @doctor-app/mobile build
pnpm --filter @doctor-app/mobile cap:sync
pnpm --filter @doctor-app/mobile run:android
```

`run:android` opens/runs the selected emulator or connected device. To inspect the native project in Android Studio instead, use `pnpm --filter @doctor-app/mobile android`. For a real Android phone, use your computer’s LAN address instead of `localhost`, make sure the phone and computer share the same network, then rebuild and sync. Start the backend with Docker so its port `3000` is reachable.

## Test on iOS

Requirements: macOS, Xcode, and an iOS Simulator or signed physical device. The iOS native project has been generated here, but it can only be opened/built on macOS.

```bash
# For an iOS Simulator, apps/mobile/.env can use VITE_PAYLOAD_URL=http://localhost:3000
pnpm --filter @doctor-app/mobile build
pnpm --filter @doctor-app/mobile cap:sync
pnpm --filter @doctor-app/mobile run:ios
```

`run:ios` starts the chosen simulator/device. To open Xcode and choose a signing team or simulator manually, use `pnpm --filter @doctor-app/mobile ios`. A physical iPhone must use your computer’s LAN IP, just like Android. Set the URL before `build`, then run `cap:sync` so the bundled application receives it.

The generated native projects permit HTTP only for local development (`cleartext: true` on Android and an ATS exception in iOS). Before shipping a build, serve Payload over HTTPS and remove those development exceptions.

## Validation performed

```bash
pnpm --filter @doctor-app/mobile typecheck
pnpm --filter @doctor-app/payload build
(cd services/rag && go test ./...)
```

## Intentional next steps

The setup does not claim to complete the assessment. The doctor and available-slot views are live; appointment and chat screens are deliberate placeholders. Implement the booking endpoint with a MongoDB transaction/conditional slot update before enabling its button, then connect the appointments view. Add the knowledge-document hook that calls `POST /internal/v1/documents/sync`; its Go ingestion pipeline should extract PDFs, chunk text, create embeddings, upsert `knowledge_chunks`, and query the `knowledge_vector_index` Atlas Vector Search index. The chat path must use a relevance threshold and create an `unresolved-queries` document for unsupported questions.

`mongodb/mongodb-atlas-local` is used rather than standard MongoDB Community because vector search requires Atlas-compatible infrastructure. Configure the embedding dimension and Atlas Vector Search index to match the model selected during RAG implementation.
