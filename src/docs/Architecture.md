# TaskFlow — System Architecture

**Author:** Rohit Sharma
**Project:** TaskFlow — Backend Developer Technical Assignment
**Scope:** Multi-tenant project management API with asynchronous email notifications

---

## 1. Purpose of This Document

This document describes the architecture of TaskFlow: how the system is decomposed into processes, how a request flows through the codebase, how consistency is maintained between the database and the background job queue, and the reasoning behind the major technical decisions. It's written to be read independently of the code — someone unfamiliar with the repository should be able to understand the system's shape from this alone.

---

## 2. System Overview

TaskFlow is a multi-tenant backend where users belong to **organizations**. Organizations own **projects**, projects contain **tasks**, and tasks support **assignment** and **comments**. Assigning a task triggers an asynchronous email notification, processed by a separate worker so the API is never blocked on email delivery.

```text
Organization
    ├── Members (users, via org_members)
    └── Projects
          └── Tasks
                ├── Assignments
                └── Comments
```

Two properties shape almost every architectural decision in this system:

1. **Strict tenant isolation** — no query, anywhere in the codebase, may trust a client-supplied organization ID.
2. **Reliable async processing** — a task assignment must never be "lost" between being persisted and its notification being sent, even if Redis is briefly unavailable.

---

## 3. High-Level Architecture

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

**Processes:**

| Process    | Responsibility                                                        |
| ---------- | ---------------------------------------------------------------------- |
| API        | Handles HTTP requests, enforces auth/tenant rules, writes to Postgres  |
| Worker     | Publishes outbox events to BullMQ, consumes jobs, sends email, updates job status |
| PostgreSQL | System of record for all business state (users, orgs, tasks, outbox)   |
| Redis      | Backing store for BullMQ — job queue and job state, not business data  |

The API and worker are deployed as separate containers/processes. They share the same Prisma schema and connect to the same Postgres/Redis instances, but neither depends on the other being available to do its own job — the API can accept and persist assignments even if the worker or Redis is temporarily down; the outbox guarantees that work isn't lost, only delayed.

---

## 4. Request Lifecycle

Every HTTP request that touches business logic follows the same pipeline:

```text
HTTP Request
   │
   ▼
Middleware
   ├── Authenticate  (verify JWT, attach req.auth)
   ├── Rate limit     (auth routes: 10 req/min/IP)
   └── Validate       (Zod schema for body/query/params)
   │
   ▼
Controller   (HTTP ↔ service translation only)
   │
   ▼
Service      (business rules, tenant scoping, transactions)
   │
   ▼
Prisma       (data access)
   │
   ▼
PostgreSQL
```

**Layer responsibilities:**

- **Routes** — wire up method, path, middleware, and controller. No business logic lives here.
- **Controllers** — translate the HTTP request into a service call and the service result into an HTTP response. Deliberately thin; they should be boring to read.
- **Services** — own authorization checks, organization scoping, cross-entity validation (e.g. "is this assignee actually in the task's organization?"), and transaction boundaries.
- **Data access (Prisma)** — all queries are parameterized through Prisma and every organization-owned query includes `organizationId` sourced from `req.auth`, never from client input.

---

## 5. Component & Dependency Rules

```text
composition roots (server, worker)
        │
        ▼
   modules / application services
        │
        ▼
 infrastructure adapters (Prisma, Redis, BullMQ)
```

**Composition roots** — `src/server.ts` and `worker/worker.ts` are the only places that own a process lifecycle. `src/server.ts` starts the HTTP listener; `worker/worker.ts` starts the outbox poller and BullMQ consumers. `src/app.ts` only assembles the Express application (routes + middleware) and exports it — it never calls `.listen()`, which means integration tests can import the app directly with Supertest without spinning up a real server or a second process.

**Modules** (`auth`, `organizations`, `projects`, `tasks`, `comments`, `jobs`) — each owns its routes, controller, service, and any module-specific types. Modules do not import each other's services directly; cross-module needs (e.g. "does this user belong to this org") go through a shared service or the Prisma layer, keeping module boundaries real rather than nominal.

**Infrastructure adapters** — the Prisma client, Redis client, and BullMQ queue instances are process-level singletons, but their *lifecycle* (creation and teardown) is owned centrally rather than scattered across import sites. This matters for two reasons: it makes tests able to substitute or reset connections cleanly, and it gives the system one place to reason about graceful shutdown (see §8).

This layering means a new external dependency — a real email provider, a payment gateway, anything — gets added as an infrastructure adapter with the same lifecycle contract as Prisma and Redis, not wired ad hoc into a service.

---

## 6. Multi-Tenant Isolation

Tenant isolation is enforced at the service layer, not the database layer (no row-level security is used — RLS was considered but adds operational complexity disproportionate to this project's scope; the trade-off is documented here rather than left implicit).

**Rule:** every query for an organization-owned resource (`projects`, `tasks`, `task_assignments`, `comments`) includes `organizationId` resolved from the authenticated JWT.

```text
// Correct
findTask({ id: taskId, organizationId: req.auth.organizationId })

// Never done
findTask({ id: taskId, organizationId: req.body.organizationId })
```

If the resource doesn't exist *within that organization* — whether because it doesn't exist at all, or because it belongs to a different organization — the service returns `403 Forbidden` with no resource data in the body. The API deliberately does not distinguish "not found" from "not yours" in the response, so an attacker probing IDs across tenants can't use response differences to enumerate resources that exist in another org.

This is the single most security-critical rule in the codebase and is covered by a dedicated integration test (§10).

---

## 7. Consistency Strategy: Transactional Outbox

**Problem:** a task assignment write to Postgres can succeed while the corresponding BullMQ enqueue fails (Redis unreachable, network blip). Without a safeguard, the database would show the assignment as complete while no notification is ever sent — and nothing would record that this happened.

**Solution:** transactional outbox pattern.

```text
Postgres transaction
    ├── INSERT task_assignment
    └── INSERT outbox_event (type = 'task.assigned', payload)
              │
              ▼
     Outbox publisher (worker process)
              │
              ▼
          BullMQ enqueue
              │
              ▼
            Worker consumer
              │
              ▼
        Email Service (mocked)
```

**How it works:**

1. The assignment endpoint writes the `task_assignment` row and an `outbox_event` row in a **single Postgres transaction**. Either both commit or both roll back — there is no state where an assignment exists without a corresponding notification intent recorded.
2. A separate outbox publisher (running inside the worker process) polls for unpublished outbox rows and pushes them onto BullMQ. This enqueue step can fail and be retried independently of the original HTTP request — the client has already received their `201` and moved on.
3. Once an event is successfully handed to BullMQ, the outbox row is marked published, so the publisher never re-sends the same event on its next poll.
4. From that point, BullMQ's own retry/backoff/dead-letter behavior (§8) takes over for the *delivery* of the email itself.

**Why this over the alternative ("just enqueue in the request handler"):** the naive approach — call `queue.add()` directly inside the assignment endpoint — makes the HTTP response's success depend on Redis being reachable at that exact moment, and offers no recovery path if the enqueue silently fails. The outbox decouples "did we durably record intent to notify" (a Postgres transaction, which we already trust for correctness) from "did we successfully hand that off to the queue" (a separate, retryable concern). Postgres remains the single source of truth for business state; Redis/BullMQ exists purely as a delivery mechanism.

---

## 8. Background Job Reliability

Once a job reaches BullMQ, delivery is governed by:

| Property        | Value                              |
| ---------------- | ------------------------------------ |
| Max attempts      | 3                                   |
| Backoff           | Exponential: 1s → 2s → 4s           |
| On final failure  | Moved to dead-letter queue, job status reported as `failed` |

```text
Attempt 1 ──fail──► wait 1s ──► Attempt 2 ──fail──► wait 2s ──► Attempt 3 ──fail──► wait 4s ──► Dead-letter queue
```

Job status is queryable independently of the original assignment request:

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

`status` is one of `pending`, `active`, `completed`, `failed` — sourced directly from BullMQ's job state rather than a separately maintained status field, so there's no risk of the two drifting out of sync.

### Graceful shutdown

`src/infrastructure/shutdown.ts` is the single shutdown contract for the process. On `SIGTERM`/`SIGINT`:

1. Stop accepting new work — the API stops accepting new connections; the worker stops polling the outbox and pulling new jobs from BullMQ.
2. Let in-flight work finish (or time out).
3. Close infrastructure connections in order: BullMQ workers → Redis client → Prisma client.

This ordering avoids the common failure mode where a process closes its database connection while a job is still mid-write.

---

## 9. Authentication & Authorization

| Endpoint          | Purpose                          |
| ------------------ | ---------------------------------- |
| `POST /auth/register` | Create user + organization       |
| `POST /auth/login`    | Issue access + refresh tokens    |
| `POST /auth/refresh`  | Exchange refresh token for a new access token |
| `POST /auth/logout`   | Revoke the refresh token          |

- **Passwords:** bcrypt, cost factor 12.
- **Access token:** JWT, 15-minute TTL, stateless — verified on every request by the `authenticate` middleware, which attaches `req.auth = { userId, organizationId, role }`.
- **Refresh token:** 7-day TTL, persisted in Postgres so it can be revoked server-side on logout (a pure-JWT refresh token can't be invalidated before expiry; storing it is what makes logout meaningful).
- **Rate limiting:** all four auth endpoints are limited to 10 requests/minute/IP, mitigating credential-stuffing and brute-force attempts.
- **Roles:** `org_admin`, `member`, enforced per-route via an `authorize` middleware that checks `req.auth.role` after `authenticate` has run.

Authorization is intentionally kept as a middleware/service concern rather than embedded in controllers, so role rules can be unit-tested in isolation from HTTP.

---

## 10. Testing Strategy

```text
npm run test:unit          # pure functions, no I/O
npm run test:integration   # full HTTP request → DB round trip
npm run test:coverage
```

**Isolation:** integration tests run against a dedicated test database (separate `DATABASE_URL` via `.env.test`), reset between test files to avoid state leaking across suites and to keep dev data untouched by test runs.

**Unit tests** target logic with no I/O dependency: password hashing/verification, JWT issuance, pagination math, assignment validation rules, org-membership checks.

**Integration tests** exercise the full stack through Supertest against the exported (but not listening) Express app: register → login → refresh → logout, project CRUD, task CRUD, task assignment, validation error shapes, and — most importantly — a dedicated **cross-tenant access test** asserting a `403` with no resource data leaked in the body.

---

## 11. Deployment Topology

```text
docker compose up --build
```

| Service    | Image / Role                  | Exposed |
| ----------- | ------------------------------- | :-------: |
| `api`      | Express app                    | 3000    |
| `worker`   | BullMQ consumer + outbox publisher | —       |
| `postgres` | PostgreSQL 16                  | 5432    |
| `redis`    | Redis 7                        | 6379    |

All four services are required to start together; the API and worker are stateless and can, in principle, be scaled horizontally behind a load balancer without code changes, since all shared state lives in Postgres/Redis rather than process memory.

---

## 12. Key Design Decisions

| Decision                    | Reasoning                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------- |
| PostgreSQL over NoSQL         | Relational, constraint-heavy, multi-tenant data with native enum support; required by the assignment |
| Prisma as ORM                 | Type-safe queries, integrated migrations, low friction for a small codebase |
| Redis + BullMQ                | Email sending must not block the request thread; BullMQ provides retries, backoff, and job state natively |
| Transactional outbox over direct enqueue | Removes the request's success from depending on Redis being reachable at that instant; makes failure recovery explicit rather than silent |
| Separate worker process       | Isolates slow/flaky email I/O from API latency; each can scale independently |
| Modular monolith over microservices | Clear domain boundaries without the operational cost of distributed services at this scale; modules are structured to be extractable later if needed |
| Service-layer tenant scoping over RLS | Simpler to implement and reason about for the assignment's scope; documented trade-off rather than an oversight |

---

## 13. Known Limitations

- No CI pipeline configured for automated test runs on push.
- Logging is console-based rather than structured (e.g. no JSON logs / correlation IDs across the API → outbox → worker hop).
- No distributed tracing between the API's outbox write and the worker's eventual processing of it — debugging a stuck event currently means querying the `outbox_events` table directly.
- Offset-based pagination only; no cursor-based option.
- Outbox publisher currently polls rather than using `LISTEN/NOTIFY`, which is simpler but adds up to poll-interval latency before a job is enqueued.

---

## 14. Summary

TaskFlow's architecture is built around two non-negotiable guarantees: **no cross-tenant data ever leaks**, and **no assignment's notification is ever silently dropped**. Everything else — the modular monolith split, the outbox pattern, the composition-root/infrastructure-adapter layering — exists in service of making those two guarantees easy to verify and hard to accidentally break as the codebase grows.