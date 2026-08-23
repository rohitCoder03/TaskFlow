# TaskFlow — Backend

A multi-tenant project management backend built with **Node.js, TypeScript, Express, PostgreSQL, Redis, BullMQ, Prisma, and Docker**.

Users belong to organizations. Organizations own projects, projects contain tasks, tasks can be assigned to members and commented on. Assigning a task queues an async email notification handled by a separate worker process.

> ⚠️ **Fill-in note:** Sections marked `TODO:` need real values from your actual implementation (coverage %, demo link, repo URL, screenshots). Everything else describes the system as specified and should match what's actually running — don't leave any of it aspirational.

---

## Table of Contents

* [Overview](#overview)
* [Tech Stack](#tech-stack)
* [Architecture](#architecture)
* [Project Structure](#project-structure)
* [Data Model](#data-model)
* [Multi-Tenant Security](#multi-tenant-security)
* [Authentication & Authorization](#authentication--authorization)
* [Background Jobs](#background-jobs)
* [Consistency Strategy](#consistency-strategy)
* [API Reference](#api-reference)
* [Error Format](#error-format)
* [Getting Started](#getting-started)
* [Environment Variables](#environment-variables)
* [Database & Seed Data](#database--seed-data)
* [Testing](#testing)
* [API Documentation](#api-documentation)
* [Docker](#docker)
* [Design Decisions](#design-decisions)
* [Bonus Features](#bonus-features)
* [Known Limitations](#known-limitations)
* [Submission](#submission)

---

## Overview

```text
Organization
    ├── Members (users, via org_members)
    └── Projects
          └── Tasks
                ├── Assignments
                └── Comments
```

Assigning a task does two things in the same database transaction:
1. Persists the assignment in Postgres.
2. Persists an outbox event that the worker later publishes as a BullMQ job.

The API never waits on the email provider — job status is queryable separately via `GET /jobs/:id`.

---

## Tech Stack

| Area              | Technology                |
| ----------------- | -------------------------- |
| Runtime           | Node.js                    |
| Language          | TypeScript                 |
| HTTP Framework    | Express                    |
| Database          | PostgreSQL                 |
| ORM               | Prisma                     |
| Auth              | JWT (access + refresh)     |
| Password Hashing  | bcrypt (cost factor 12)    |
| Validation        | Zod                        |
| Queue             | BullMQ                     |
| Queue Storage     | Redis                      |
| Containers        | Docker / Docker Compose    |
| API Docs          | OpenAPI 3 / Swagger UI     |
| Testing           | Jest + Supertest           |

---

## Architecture

Modular monolith for the API, plus a standalone worker process. Both share the Prisma schema and connect to the same Postgres/Redis instances but run as separate containers/processes so a slow email provider never affects request latency.

```text
Client
   │
   ▼
Express API ──────────► PostgreSQL
  │                         ▲
  └──► Outbox events ───────┘
         │
         ▼
     Redis / BullMQ ──► Worker ──► Email Service (mocked)
```

### Request flow

```text
HTTP Request → Middleware (auth, rate limit, validation) → Controller → Service → Prisma → PostgreSQL
```

* **Routes** — method, path, middleware, controller wiring. No business logic.
* **Controllers** — translate HTTP ↔ service calls. Thin.
* **Services** — authorization, org-scoping, assignment/validation rules, transaction boundaries.
* **Data access** — Prisma queries, always scoped by `organizationId` pulled from the authenticated request context, never from the client body/params.
* **Composition roots** — `src/server.ts` starts the API and owns its HTTP lifecycle; `worker/worker.ts` starts the worker and owns outbox polling. `src/app.ts` only builds the Express application, so HTTP tests can import it without starting a listener.
* **Infrastructure lifecycle** — `src/infrastructure/shutdown.ts` is the single shutdown contract for Prisma, Redis, and BullMQ queues. SIGTERM/SIGINT first stop accepting or polling work, then close infrastructure connections.
* **Consistency boundary** — transactional writes create outbox events in PostgreSQL. The worker publishes those events to BullMQ and marks them published only after enqueueing, keeping database state durable when Redis or email delivery is unavailable.

### Dependency rules

```text
composition roots (server, worker)
        │
        ▼
      modules / application services
        │
        ▼
 infrastructure adapters (Prisma, Redis, BullMQ)
```

Routes and controllers translate transport concerns only. Services own business rules, tenant scoping, and transaction boundaries. Infrastructure clients are process singletons, but their lifecycle is controlled centrally rather than at import sites. New external providers should be added as infrastructure adapters and closed through the same lifecycle contract.

---

## Project Structure

```text
taskflow/
├── src/
│   ├── app.ts              # Express composition; no listener or process lifecycle
│   ├── server.ts
│   ├── config/            # env, logger
│   ├── infrastructure/    # clients, queues, and shutdown lifecycle
│   ├── middleware/        # authenticate, authorize, validate, rateLimiter, errorHandler
│   ├── modules/           # auth, organizations, projects, tasks, comments, jobs
│   └── shared/             # errors, types, utils
├── worker/
│   ├── worker.ts
│   ├── processors/email.processor.ts
│   └── services/email.service.ts
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── tests/
│   ├── unit/
│   └── integration/
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── package.json
```

---

## Data Model

```text
organizations ──< org_members >── users
      │
      └──< projects ──< tasks ──< task_assignments >── users
                            │
                            └──< comments >── users (author)
```

**Tables:** `users`, `organizations`, `org_members`, `projects`, `tasks`, `task_assignments`, `comments`.

**Enums (Postgres native enums, not strings):**
- `task_status`: `todo`, `in_progress`, `review`, `done`
- `task_priority`: `low`, `medium`, `high`, `urgent`

**Foreign keys & cascade behavior:**

| Relationship                          | On Delete   | Rationale                                                        |
| -------------------------------------- | ----------- | ------------------------------------------------------------------ |
| `projects.organization_id → organizations.id` | `RESTRICT`  | Orgs are never deleted through the app; prevent accidental orphaning. |
| `tasks.project_id → projects.id`       | `CASCADE`   | A task has no meaning without its project.                        |
| `task_assignments.task_id → tasks.id`  | `CASCADE`   | Assignment rows are dependent join data.                          |
| `task_assignments.user_id → users.id`  | `RESTRICT`  | Don't silently delete assignment history when a user is removed.  |
| `comments.task_id → tasks.id`          | `CASCADE`   | Comments have no meaning without the task.                        |
| `comments.author_id → users.id`        | `RESTRICT`  | Preserve comment history/authorship even if a user record changes state. |
| `org_members.org_id / user_id`         | `CASCADE`   | Membership is a pure join table; safe to cascade both ways.       |

`TODO:` confirm these match what's actually in `schema.prisma` — this table should be the source of truth, and inline comments in the schema should reference it.

**Indexes** (justified in code comments in `schema.prisma`, mirrored here):

| Column(s)                         | Reason                                             |
| ---------------------------------- | --------------------------------------------------- |
| `tasks(project_id)`                | Every task list is scoped to a project              |
| `tasks(status)`, `tasks(priority)` | Used directly in task filter queries                 |
| `tasks(due_date)`                  | Due-date range filtering                             |
| `task_assignments(user_id)`        | "My tasks" / assignee filter                         |
| `org_members(org_id)`, `(user_id)` | Auth middleware resolves org membership on every request |
| `comments(task_id)`                | Comment list per task                                |

---

## Multi-Tenant Security

Every organization-owned resource is fetched using the organization ID resolved from the **authenticated JWT**, never from the request body, query string, or route params.

```text
// Correct — organizationId comes from req.auth, not from the client
findTask({ id: taskId, organizationId: req.auth.organizationId })

// Never done — trusting a client-supplied org id
findTask({ id: taskId, organizationId: req.body.organizationId })
```

If a task/project belongs to a different organization than the requester, the service returns `403 Forbidden` with no resource data in the response body — not a `404`, and not a partial object. This is covered by an explicit integration test (see [Testing](#testing)).

---

## Authentication & Authorization

| Endpoint          | Description            |
| ------------------ | ------------------------ |
| `POST /auth/register` | Register user + organization |
| `POST /auth/login`    | Login, issue access + refresh tokens |
| `POST /auth/refresh`  | Exchange refresh token for new access token |
| `POST /auth/logout`   | Revoke refresh token |

- Passwords hashed with **bcrypt, cost factor 12**.
- Access token: JWT, **15 min TTL**.
- Refresh token: **7 day TTL**, stored in Postgres, revocable on logout.
- All four auth endpoints are rate-limited to **10 requests/minute/IP**.
- Roles: `org_admin`, `member`.

| Operation        | org_admin | member |
| ------------------ | :---------: | :------: |
| View/create/update projects | ✅ | ✅ |
| Delete projects     | ✅ | ❌ |
| Manage members       | ✅ | ❌ |
| Create/update/assign tasks | ✅ | ✅ |
| Comment              | ✅ | ✅ |

---

## Background Jobs

```text
Assign task
   │
   ├── Persist task_assignment row
   └── Enqueue notification job (BullMQ)
                │
                ▼
           Worker consumes job
                │
                ▼
           Send email (mocked)
```

The `POST /tasks/:taskId/assignments` endpoint persists the assignment and its outbox event before returning `201`. The worker publishes the event to BullMQ asynchronously, so the response does not wait on Redis, the worker, or the email provider.

**Retry policy:**
- Max attempts: 3
- Backoff: 1s → 2s → 4s (exponential)
- After the 3rd failure, the job moves to a dead-letter queue and its status is reported as `failed` via `GET /jobs/:id`

**Job status endpoint:**

```http
GET /api/v1/jobs/:jobId
```
```json
{
  "data": {
    "jobId": "a1b2c3",
    "status": "completed",
    "attemptsMade": 1,
    "type": "task-assignment-notification",
    "createdAt": "2026-08-20T10:15:00Z",
    "processedAt": "2026-08-20T10:15:02Z",
    "failedReason": null
  }
}
```
Supported `status` values: `pending`, `active`, `completed`, `failed`.

---

## Consistency Strategy

Risk: the assignment write succeeds but the BullMQ enqueue fails (Redis down, network blip), leaving the assignment persisted with no notification ever sent, and no record that anything went wrong.

**Chosen approach: transactional outbox.**

```text
Postgres transaction
    ├── INSERT task_assignment
    └── INSERT outbox_event (type = 'task.assigned', payload)
              │
              ▼
     Outbox publisher (polls / listens for new outbox rows)
              │
              ▼
          BullMQ enqueue
              │
              ▼
            Worker
```

Both the assignment row and the outbox event are written in a single Postgres transaction, so they either both commit or both roll back — there's no window where the assignment exists without a corresponding notification intent. A separate outbox publisher process picks up unprocessed outbox rows and pushes them to BullMQ, retrying the *enqueue* independently of the original HTTP request. Postgres remains the source of truth for business state; Redis/BullMQ is purely a delivery mechanism for async processing.

`TODO:` if the outbox pattern wasn't actually implemented and you instead used a simpler try/enqueue-then-log-on-failure approach, say that explicitly here instead — don't document a pattern that isn't in the code.

---

## API Reference

Base URL: `/api/v1`

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Register user + org |
| POST | `/auth/login` | Login |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Revoke refresh token |

### Members
| Method | Endpoint | Description |
|---|---|---|
| GET | `/members` | List org members |
| POST | `/members` | Add/invite member |
| PATCH | `/members/:userId` | Update member (role) |
| DELETE | `/members/:userId` | Remove member |

### Projects
| Method | Endpoint | Description |
|---|---|---|
| GET | `/projects` | List projects |
| POST | `/projects` | Create project |
| GET | `/projects/:projectId` | Get project |
| PATCH | `/projects/:projectId` | Update project |
| DELETE | `/projects/:projectId` | Delete project (admin only) |
| GET | `/projects/:projectId/dashboard` | Task counts grouped by status |

### Tasks
| Method | Endpoint | Description |
|---|---|---|
| GET | `/tasks` | List/filter tasks |
| POST | `/projects/:projectId/tasks` | Create task |
| GET | `/tasks/:taskId` | Get task |
| PATCH | `/tasks/:taskId` | Update task |
| DELETE | `/tasks/:taskId` | Delete task |

Filters: `status`, `priority`, `assignee`, `dueFrom`, `dueTo`, `projectId`, `page`, `limit`.

**Example — filtered, paginated list:**
```http
GET /api/v1/tasks?status=in_progress&priority=high&page=1&limit=20
```
```json
{
  "data": [
    { "id": "t_01", "title": "Fix login bug", "status": "in_progress", "priority": "high" }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 3 }
}
```

### Assignments
| Method | Endpoint | Description |
|---|---|---|
| POST | `/tasks/:taskId/assignments` | Assign user (must be in same org) |
| DELETE | `/tasks/:taskId/assignments/:userId` | Unassign user |

### Comments
| Method | Endpoint | Description |
|---|---|---|
| GET | `/tasks/:taskId/comments` | List comments |
| POST | `/tasks/:taskId/comments` | Create comment |
| PATCH | `/comments/:commentId` | Update comment |
| DELETE | `/comments/:commentId` | Delete comment |

### Jobs
| Method | Endpoint | Description |
|---|---|---|
| GET | `/jobs/:jobId` | Get background job status |

### Cross-tenant example

```http
GET /api/v1/tasks/t_from_other_org
Authorization: Bearer <token for org A>
```
```json
HTTP/1.1 403 Forbidden
{
  "error": "Access denied",
  "code": "FORBIDDEN",
  "details": {}
}
```
No task data is included in the response.

---

## Error Format

**Single, consistent shape used everywhere — matches the assignment spec exactly:**

```json
{
  "error": "Task not found",
  "code": "TASK_NOT_FOUND",
  "details": {}
}
```

`error` is a human-readable string, `code` is a stable machine-readable identifier, `details` carries optional structured context (e.g. Zod validation field errors).

| Status | Meaning |
|---:|---|
| 200 | OK |
| 201 | Created |
| 204 | Deleted |
| 400 | Invalid request / validation failure |
| 401 | Authentication required/failed |
| 403 | Forbidden (cross-tenant, insufficient role) |
| 404 | Not found |
| 409 | Conflict |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## Getting Started

### Prerequisites
Docker, Docker Compose, Node.js, npm.

```bash
git clone <repository-url>
cd taskflow
npm install
cp .env.example .env
docker compose up --build
```

Docker Compose starts four services: **API, Worker, PostgreSQL, Redis.**

---

## Environment Variables

```env
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://postgres:postgres@postgres:5432/taskflow
REDIS_URL=redis://redis:6379

JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d

BCRYPT_ROUNDS=12
```

Only `.env.example` is committed. The real `.env` is git-ignored — no secrets are ever committed to source control.

---

## Database & Seed Data

```bash
npx prisma migrate dev      # apply migrations locally
npx prisma migrate deploy   # apply migrations in prod/CI
npx prisma generate         # regenerate Prisma client
npx prisma db seed          # load seed data
npx prisma studio           # inspect data locally
```

Migrations are the only source of schema truth — no hand-maintained `schema.sql`. Each migration includes Prisma's generated `up` (and rollback support via `prisma migrate resolve` / re-running prior migration state) rather than a one-way-only change.

**Seed data includes:**
- 2 organizations
- 5 users
- Multiple projects
- 10+ tasks, distributed across projects with varied statuses and priorities
- Task assignments
- Sample comments

---

## Testing

```bash
npm test                 # all tests
npm run test:unit
npm run test:integration
npm run test:coverage
```

**Test isolation strategy:** integration tests run against a **dedicated test database** (separate `DATABASE_URL` in `.env.test`), reset between test files by truncating tables in a `beforeEach`/`afterEach` hook rather than reusing dev data. `TODO:` confirm this matches the actual approach — if transactions-per-test (rollback after each test) were used instead, describe that here instead, since it changes how parallel test runs behave.

**Unit tests:** auth logic (password hashing/verification, token issuance), authorization rules, task assignment validation, pagination helper, org-access checks.

**Integration tests:** register → login → refresh → logout flow, project CRUD, task CRUD, task assignment, validation error responses, **cross-tenant access attempt asserting `403` with no leaked task data**.

`TODO:` insert actual coverage % once `npm run test:coverage` is run, e.g. "Current coverage: 82% lines / 76% branches."

---

## API Documentation

- Swagger UI: `http://localhost:3000/api/docs`
- OpenAPI spec: `src/docs/openapi.yaml`
- Postman/Bruno collection: `/docs/taskflow.postman_collection.json` — **imports and runs with no manual edits**; base URL and auth token are read from collection variables that get set automatically by the login request's test script.

---

## Docker

`docker compose up --build` starts:
```text
api        - Express app, port 3000
worker     - BullMQ consumer, no exposed port
postgres   - PostgreSQL 16
redis      - Redis 7
```

---

## Design Decisions

- **PostgreSQL** — required by the assignment, and a good fit for relational, constraint-heavy, multi-tenant data with native enum support.
- **Prisma** — type-safe queries, first-class migration tooling, low friction for a small team.
- **Redis + BullMQ** — email sending shouldn't block the request thread; BullMQ gives retries, backoff, and job state out of the box.
- **Separate worker process** — isolates slow/flaky email I/O from API latency and lets each scale independently.
- **Modular monolith** — clear module boundaries (`auth`, `projects`, `tasks`, `comments`, `jobs`) without the operational overhead of microservices at this scale; modules could be extracted later if needed.

---

## Bonus Features

Only listing what's actually implemented — `TODO:` update to reflect reality before submitting.

| Bonus item | Status |
|---|---|
| Soft delete (`deleted_at` on projects/tasks) | ❌ Not implemented |
| Full-text search on task title + description | ❌ Not implemented |
| Refresh token rotation | ❌ Not implemented |
| Logout from all devices | ❌ Not implemented |
| Assignment dedup within 5s | ❌ Not implemented |
| Global email rate limit (50/min) | ❌ Not implemented |
| Coverage report | `TODO:` |
| Test asserting task assignment creates a queue job | `TODO:` |

Everything else in this document is a **core requirement**, not a bonus — this table exists specifically so it's unambiguous which optional items were attempted.

---

## Known Limitations

`TODO:` be honest here — e.g. "no CI pipeline configured," "logging is console-based, not structured," "no request tracing," "cursor pagination not implemented, offset only." A short, honest list here is worth more to an evaluator than silence.

---

## Submission

1. GitHub repository: `TODO:` link
2. Architecture document: `TODO:` link
3. OpenAPI/Swagger docs: `TODO:` link
4. Postman/Bruno collection: `TODO:` link
5. Demo recording: `TODO:` link
6. Setup instructions: this README

---

## Author

**Rohit Sharma**
TaskFlow — Backend Developer Technical Assignment