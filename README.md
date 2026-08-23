# Support Ticket & SLA Tracker

A full-stack support ticket management system and deterministic business-hours SLA tracking engine. The system enforces role-based ticket workflows while authoritatively calculating first-response and resolution deadlines strictly within configured business hours (excluding nights, weekends, and holidays). Built with a schema-first GraphQL API, PostgreSQL persistence, and a React TypeScript dashboard.

---

## 1. Project Overview

Support teams need SLA measurement that strictly reflects operational business commitments rather than raw wall-clock time. This application tracks support tickets with dual SLA clocks (First Response and Resolution) calculated deterministically server-side.

- **Dual-Clock SLA Engine**: Computes first response and resolution targets strictly during business hours (Mon–Fri, 09:00–18:00).
- **Milestone Clock Freezing**: Response clock freezes upon the first non-reporter comment; resolution clock freezes when the ticket is marked resolved.
- **Role-Based Workflows**: Scoped access for customers (`REPORTER`) and full operational control for staff (`AGENT`).
- **Backend-Driven Presentation**: Frontend displays authoritative server-calculated SLA states and countdowns without client-side business calculations.

---

## 2. Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Runtime** | Bun v1.4+ / Node.js | Fast JavaScript/TypeScript runtime & package manager |
| **Language** | TypeScript (Strict Mode) | End-to-end type safety across backend and frontend (zero `any`) |
| **API Layer** | GraphQL Yoga + GraphQL v17 | Schema-first execution, context injection & error handling |
| **Database & ORM** | PostgreSQL 16 + Prisma ORM v6 | Relational persistence, migrations, and relational modeling |
| **Authentication** | `jose` (JWT) + `Bun.password` (bcrypt) | Stateless HS256 tokens and secure password hashing (cost 10) |
| **Frontend** | React 19 + TypeScript + Vite | Component-based UI with React Router v7 |
| **Styling** | Vanilla CSS (CSS Variables) | Custom design system with glassmorphic cards and badges |
| **Containerization**| Docker Compose | Containerized PostgreSQL 16 local database service |

---

## 3. Architecture Overview

```text
Frontend (React 19 SPA) ──HTTP POST /graphql (Bearer JWT)──> GraphQL Yoga Server
                                                                   │
                                                            Resolvers (Thin)
                                                                   │
                                                ┌──────────────────┴──────────────────┐
                                                ▼                                     ▼
                                       Domain Services (Auth/Ticket)            SLA Service (Pure Math)
                                                │                                     │
                                                └──────────────────┬──────────────────┘
                                                                   ▼
                                                            Prisma ORM Client ──> PostgreSQL 16
```

- **Resolvers**: Thin transport controllers that validate auth context and delegate to domain services.
- **Domain Services**: Encapsulate all business logic, permission rules, and state machine validations.
- **SLA Service**: Pure mathematical engine evaluating deadlines and consumption without side effects.
- **Prisma & PostgreSQL**: Enforces database-level foreign key constraints, indexes, and transactional integrity.

---

## 4. Database Schema Overview

The relational schema is managed via Prisma migrations:

- **`User`**: Stores `id`, `name`, `email` (unique), `passwordHash`, `role` (`REPORTER` | `AGENT`), and timestamps.
- **`Ticket`**: Stores `id`, `title`, `description`, `priority` (`LOW`, `MEDIUM`, `HIGH`, `URGENT`), `status` (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`), `reporterId`, nullable `assigneeId`, `createdAt`, `firstResponseAt`, and `resolvedAt`.
- **`Comment`**: Stores `id`, `content`, `ticketId`, `authorId`, and `createdAt`. Cascade-deleted with tickets.
- **`Holiday`**: Stores unique calendar dates (`date`, `name`) excluded from business-hour calculations.

*Indexes*: Indexed on `status`, `priority`, `reporterId`, `assigneeId`, `createdAt`, `ticketId`, and `authorId` for performant filtering.

---

## 5. SLA Calculation Approach

SLA calculations are implemented server-side as pure functions:
1. **Target Calculation**: Translates `createdAt` into local business time, advances through working minutes (09:00–18:00), skips non-working periods (nights, weekends, holidays), and returns the UTC deadline.
2. **Consumption Calculation**: Computes the exact working minutes elapsed between `createdAt` and either the milestone timestamp (if completed) or `now()`.
3. **State Evaluation**: Evaluates elapsed business minutes against policy targets to derive real-time state and remaining minutes.

---

## 6. Business Hours, Weekends & Holidays

- **Business Hours**: Monday through Friday, **09:00 to 18:00** (9 business hours / 540 minutes per working day).
- **Nights & Weekends**: Time outside 09:00–18:00 and all hours on Saturday and Sunday contribute 0 business minutes.
- **Holidays**: Calendar dates present in the `Holiday` table contribute 0 business minutes.
- **Carryover Example**: A `HIGH` priority ticket (4h target) created **Friday at 17:00**:
  - Friday 17:00–18:00 consumes **1 business hour** (3 hours remaining).
  - Weekend (Saturday & Sunday) contributes **0 business hours**.
  - Monday 09:00–12:00 consumes remaining **3 business hours** → **Due Monday at 12:00**.

---

## 7. Timezone Handling

- **Storage**: All database timestamps and API inputs/outputs are standardized in UTC ISO-8601 strings.
- **Calculation**: Business hours are evaluated in the configured `BUSINESS_TIMEZONE` (defaults to `Asia/Kolkata`).
- **Date Normalization**: Calendar holidays are normalized to universal date keys (`YYYY-MM-DD`), preventing calendar shifts in negative UTC offset timezones.

---

## 8. SLA Policies

Default priority durations configured in the engine:

| Priority | First Response Target | Resolution Target |
| :--- | :--- | :--- |
| **URGENT** | 1 business hour (60 min) | 4 business hours (240 min) |
| **HIGH** | 4 business hours (240 min) | 24 business hours (1,440 min / ~2.67 business days) |
| **MEDIUM** | 8 business hours (480 min) | 48 business hours (2,880 min / ~5.33 business days) |
| **LOW** | 24 business hours (1,440 min) | 72 business hours (4,320 min / 8 business days) |

---

## 9. SLA State Rules

Each SLA clock evaluates to one of three states:

- **`ON_TRACK`**: Consumed business time is ≤ 75% of policy target.
- **`AT_RISK`**: Consumed business time is > 75% of policy target and current time is on or before the deadline.
- **`BREACHED`**: Current time has passed the calculated deadline before milestone completion.

---

## 10. SLA Milestone Freezing (First Response & Resolution)

- **First Response Milestone**: Triggered when the first comment from a non-reporter (`AGENT`) is added. `firstResponseAt` is recorded, and the first-response SLA clock freezes permanently at that timestamp. Subsequent comments do not alter this timestamp.
- **Resolution Milestone**: Triggered when a ticket transitions to `RESOLVED`. `resolvedAt` is stamped, and the resolution SLA clock freezes permanently.
- **Immutable Historical Record**: Once frozen, completed SLA clocks will never transition to `BREACHED`, even if viewed days later.
- **24/7 Operations**: Support staff can execute ticket actions on weekends or outside business hours; the SLA engine clamps elapsed business time strictly to working hours.

---

## 11. Ticket Status Transitions

Ticket lifecycle follows an enforced forward state machine:

```text
[OPEN] ──(Agent assigns/starts)──> [IN_PROGRESS] ──(Agent resolves)──> [RESOLVED] ──(Agent closes)──> [CLOSED]
```

- Disallowed transitions (e.g. `OPEN` → `RESOLVED`, `CLOSED` → `IN_PROGRESS`) are rejected server-side with `INVALID_STATUS_TRANSITION`.
- Transitioning to `RESOLVED` automatically populates `resolvedAt`.

---

## 12. Authentication & Authorization

- **Authentication**: Passwords are encrypted with bcrypt (cost factor 10). Stateless HS256 JWT tokens encode user ID, email, and role.
- **Context Extraction**: The server validates the `Authorization: Bearer <token>` header and injects the authenticated user into GraphQL context.
- **Server-Side RBAC**:
  - `REPORTER`: Can create tickets, view only their own reported tickets, and comment only on their own tickets.
  - `AGENT`: Can view all tickets, assign tickets to agents, change ticket status, resolve tickets, view user lists, and access dashboard metrics.

---

## 13. Validation & Error Handling

Domain exceptions extend `GraphQLError` and return structured extensions with machine-readable error codes:

| Error Code | Trigger Condition |
| :--- | :--- |
| `VALIDATION_ERROR` | Empty title/description, short password (<6 chars), invalid email or enum |
| `UNAUTHORIZED` | Missing, invalid, or expired JWT token |
| `FORBIDDEN` | Insufficient role permissions or accessing another user's ticket |
| `INVALID_STATUS_TRANSITION` | Attempting an invalid lifecycle status jump |
| `TICKET_NOT_FOUND` | Target ticket ID does not exist |
| `USER_NOT_FOUND` | Target user ID does not exist |
| `DUPLICATE_EMAIL` | Registering with an existing email address |
| `INVALID_CREDENTIALS` | Incorrect login email or password |

---

## 14. GraphQL API Overview

### Core Schema Contract
- **Queries**: `tickets(...)`, `ticket(id)`, `dashboard`, `users(role)`, `holidays`, `health`.
- **Mutations**: `register(...)`, `login(...)`, `createTicket(...)`, `assignTicket(...)`, `changeTicketStatus(...)`, `resolveTicket(...)`, `addComment(...)`.

### Sample Query
```graphql
query GetTicketDetails($id: ID!) {
  ticket(id: $id) {
    id
    title
    status
    priority
    firstResponseAt
    resolvedAt
    sla {
      firstResponseDueAt
      resolutionDueAt
      firstResponseState
      resolutionState
      firstResponseRemainingMinutes
      resolutionRemainingMinutes
    }
  }
}
```

---

## 15. Pagination & Filtering

- **Cursor-Based Pagination**: Ticket listing queries accept `take: Int` and `cursor: String` (ticket ID), returning `TicketConnection` with `nodes` and `PageInfo { hasNextPage, endCursor }`.
- **Database Cursor Query**: Standard queries order deterministically by `[createdAt DESC, id DESC]` using Prisma's native cursor pagination.
- **Dynamic SLA Filtering**: When filtering by dynamic `slaState`, candidate database records matching static filters are evaluated against the real-time SLA engine in memory, then cursor-sliced to maintain stable pagination.

---

## 16. Environment Variables

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://support:support@localhost:5432/support_tracker` |
| `JWT_SECRET` | Secret key for signing HS256 JWT tokens | `super-secret-jwt-key-min-32-chars-long` |
| `JWT_EXPIRATION` | Token expiration duration | `7d` |
| `BUSINESS_TIMEZONE` | IANA timezone for business hours | `Asia/Kolkata` |
| `PORT` | Backend HTTP server port | `4000` |

---

## 17. Setup Instructions

```bash
# 1. Install workspace dependencies
bun install

# 2. Configure environment variables
cp .env.example .env
cp backend/.env.example backend/.env

# 3. Start local PostgreSQL 16 container
docker compose up -d
```

---

## 18. Database Migration Instructions

```bash
# Run Prisma migrations against PostgreSQL
cd backend
bun run db:migrate
cd ..
```

---

## 19. Seed Data & Demo Credentials

```bash
# Populate database with initial users, tickets, and holidays
cd backend
bun run db:seed
cd ..
```

Default demo accounts (Password: `Password123!`):
- **Reporter**: `reporter@example.com` (`REPORTER` role)
- **Agent**: `agent@example.com` (`AGENT` role)

---

## 20. How to Run Backend

```bash
# Start backend server on http://localhost:4000/graphql
bun run dev:backend
```

---

## 21. How to Run Frontend

```bash
# Start frontend development server on http://localhost:5173
bun run dev:frontend
```

---

## 22. How to Run Tests

```bash
# 1. Run backend unit & integration tests
bun run test

# 2. Run TypeScript typecheck across backend and frontend
bun run typecheck

# 3. Build frontend production bundle
cd frontend && bun run build && cd ..
```

*Test Suite*: **76 automated tests across 7 test files (194 assertions, 0 failures)** covering business-hours math, holiday skips, DST, clock freezing, RBAC, GraphQL operations, and live PostgreSQL integration.

---

## 23. Known Limitations & Tradeoffs

- **In-Memory SLA Filtering**: Because SLA status is a dynamic function of `now()`, queries filtering by `slaState` evaluate calculated states in memory. For massive datasets, this would be optimized via background projections or cached materialized views.
- **Single Global Business Calendar**: Configured for one global timezone and holiday set rather than multi-tenant customer-specific schedules.
- **Continuous SLA Clock**: Does not include a "Waiting on Customer" pause status; clocks count continuously during business hours.
- **No Background Push Notifications**: SLA breach alerts are calculated dynamically on query rather than dispatched via background worker webhooks/emails.

---

## 24. How I'd Extend This

- **SLA Pause on Customer Response**: Introduce `WAITING_ON_CUSTOMER` status that suspends the SLA consumption timer until the customer replies.
- **Escalation & Notifications**: Background worker triggering automated webhook/email notifications when tickets enter `AT_RISK` or `BREACHED` status.
- **Per-Tenant Business Calendars**: Support custom business hours, timezones, and regional holiday calendars per organization or priority tier.
- **Audit Logging**: Structured historical audit trail logging every assignee change, status transition, and SLA milestone event.
ord hashing and strict `REPORTER` vs `AGENT` role boundaries.
4. **Ticket Workflow**: Strict server-enforced state machine (`OPEN` → `IN_PROGRESS` → `RESOLVED` → `CLOSED`).
5. **SLA Engine**: Computes exact working-minute consumption across day boundaries, weekends, and holidays.
6. **Milestone Freezing**: Response and resolution clocks permanently freeze upon respective event timestamps.
7. **Database**: Normalized PostgreSQL schema with foreign keys, indexes on query filters, and cascade delete rules.
8. **GraphQL**: Schema-first design exposing domain queries, mutations, and structured machine-readable error codes.
9. **Testing**: 74 automated unit and integration tests covering algorithmic edge cases and database workflows.
10. **Tradeoffs**: Prioritized deterministic backend SLA calculations and zero-dependency date math over heavy scheduling libraries.

## 20. Quick Interview Questions

- **Why GraphQL instead of REST?** Single round-trip queries fetch tickets, nested comments, and computed SLA info without over-fetching.
- **Why schema-first?** Defines a strict, language-agnostic contract upfront that frontend and backend can develop against in parallel.
- **Why separate domain services from resolvers?** Keeps GraphQL transport thin, makes business logic reusable, and allows independent unit testing without mock GraphQL contexts.
- **How does SLA calculation work?** It maps timestamps to local business time, counts active minutes between 09:00–18:00 on working days, skips weekends/holidays, and converts deadlines back to UTC.
- **How are weekends and holidays handled?** Saturdays, Sundays, and dates matching the `Holiday` table contribute 0 minutes; deadlines advance to 09:00 of the next working day.
- **How does SLA freezing work?** When `firstResponseAt` or `resolvedAt` is stamped, SLA calculation uses that static timestamp instead of `now()`, locking the state.
- **Why store timestamps in UTC?** Ensures unambiguous persistence and daylight savings safety while rendering localized times via `BUSINESS_TIMEZONE`.
- **How is authorization enforced?** Domain services verify `currentUser.role` before executing privileged operations, throwing `ForbiddenError` if unauthorized.
- **How does cursor pagination work?** Queries use `cursor: { id }` and `take: N+1` with composite ordering (`createdAt DESC, id DESC`) to yield deterministic pages.
- **How did you test the SLA engine?** Tested against 25 distinct unit scenarios including before/after hours, Friday evenings, holidays, and 75% boundary thresholds.

## 21. Running Tests & Quality Checks

```bash
# Typecheck backend and frontend
bun run typecheck

# Run backend unit & integration tests
bun run test

# Build frontend production bundle
cd frontend && bun run build
```

## 22. Git Workflow

Developed using incremental commits with conventional commit messages tracking architectural milestones across backend, SLA engine, GraphQL layer, test suite, and frontend integration.
