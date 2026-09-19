# Technical review — presentation pack

Use this folder for the 30–45 minute walkthrough in assignment §25.

| File | Use |
| --- | --- |
| [slides.md](./slides.md) | Spoken deck (requirement → plan → build → RAG → CSRF → EC2) |
| [walkthrough.md](./walkthrough.md) | Live demo script (booking + RAG tests 1–4) |

**Deployed environment (what we actually shipped):** AWS **EC2** Ubuntu, Docker Compose, nginx on port 80. Payload is public; the Go RAG service and Ollama stay on the Compose network. This is not ECS — a single instance Compose stack matches the 16–20 hour assessment. ECS/Fargate is the natural next step if we needed replica tasks.

## How to present

1. Open `slides.md` in the editor (or [Marp](https://marp.app/) for slides).
2. Keep `walkthrough.md` on a second screen.
3. Live URL: `http://<elastic-ip>/admin` and the Android APK pointed at `VITE_PAYLOAD_URL=http://<elastic-ip>` (no `:3000`).
4. Time box: ~15 min architecture/booking, ~15 min RAG + hallucination, ~10 min deploy/CSRF/Q&A.

## Demo accounts

- **Admin:** first user created at `/admin/create-first-user` (role `admin`).
- **Patient (mobile):** `ayesha.karim@careconnect.demo` / `Patient123!` after `docker:seed:ec2`.
