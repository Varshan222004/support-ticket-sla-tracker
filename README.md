# Support Ticket & SLA Tracker

A full-stack support ticket management system and deterministic business-hours SLA tracking engine. The system enforces role-based ticket workflows while authoritatively calculating first-response and resolution deadlines strictly within configured business hours (excluding nights, weekends, and holidays). Built with a schema-first GraphQL API, PostgreSQL persistence, and a React TypeScript dashboard.

## 1. Features

- **Authentication & Roles**: Secure bcrypt hashing and stateless JWT auth with strict `REPORTER` (customer) and `AGENT` (staff) role separation.
- **Ticket Lifecycle**: Enforced state transitions (`OPEN` → `IN_PROGRESS` → `RESOLVED` → `CLOSED`) with server-side validation.
- **Assignment & Comments**: Staff triage and assignment with real-time threaded discussion timelines.
- **Deterministic SLA Engine**: Dual-clock tracking (First Response and Resolution) computed strictly during business hours.
- **Milestone SLA Freezing**: Response SLA freezes on the first non-reporter comment; resolution SLA freezes when marked resolved.
- **Configurable Holidays & Timezones**: Database-backed holiday exclusion and IANA timezone support.
- **Dashboard & KPIs**: Real-time agent metrics for Open, In Progress, At Risk, and Breached tickets.
- **Cursor-Based Pagination & Filtering**: Scalable ticket querying by status, priority, assignee, and SLA state.
- **Error Handling**: Domain-driven GraphQL error extensions with machine-readable error codes.

## 2. Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Runtime** | Bun v1.4+ | Fast JavaScript/TypeScript runtime & package manager |
| **Language** | TypeScript | End-to-end type safety across backend and frontend |
| **API Layer** | GraphQL Yoga + GraphQL v17 | Schema-first execution, context injection & error handling |
| **Database & ORM** | PostgreSQL 16 + Prisma ORM v6 | Relational persistence, migrations, and schema modeling |
| **Auth** | `jose` (JWT) + `Bun.password` (bcrypt) | Stateless tokens and secure password hashing |
| **Frontend** | React 19 + TypeScript + Vite | Component-based UI with React Router v7 |
| **Styling** | Vanilla CSS (CSS Variables) | Custom design system with glassmorphic cards and badges |
| **Local DB** | Docker Compose | Local PostgreSQL 16 containerized instance |

## 3. Architecture

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

- **Resolvers**: Thin transport controllers that extract auth context and delegate directly to domain services.
- **Domain Services**: Encapsulate all business logic, permission rules, and state validations outside resolvers.
- **SLA Engine**: Pure calculation module that evaluates business deadlines and consumption without side effects.
- **Prisma & PostgreSQL**: Enforces database-level foreign key constraints, indexes, and transactional integrity.

## 4. Project Structure

```text
Support-Ticket-SLA-Tracker/
├── docker-compose.yml          # PostgreSQL 16 container service
├── package.json                # Workspace scripts (typecheck, test, dev)
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # Prisma data models, enums & indexes
│   │   ├── seed.ts             # Idempotent development seed data
│   │   └── migrations/         # PostgreSQL migration history
│   └── src/
│       ├── server.ts           # Bun HTTP server & GraphQL Yoga setup
│       ├── context.ts          # Auth & service context creation
│       ├── auth/               # AuthService (registration, login, JWT)
│       ├── ticket/             # TicketService (lifecycle, assignment, metrics)
│       ├── sla/                # SLAService & business-hours calculation logic
│       ├── errors/             # Domain errors with GraphQL error codes
│       └── graphql/            # root.graphql schema & modular resolvers
└── frontend/
    └── src/
        ├── App.tsx             # React Router routing & route guards
        ├── auth/               # AuthContext & token storage
        ├── graphql/            # Typed GraphQL client & operations
        ├── pages/              # Dashboard, Tickets, CreateTicket, Details, Auth
        └── components/         # AppShell, Layout, Badges & UI controls
```

## 5. Database Model

- **User**: Stores credentials (`passwordHash`), name, email (unique), and `UserRole` (`REPORTER` | `AGENT`).
- **Ticket**: Stores title, description, `Priority` (`LOW`, `MEDIUM`, `HIGH`, `URGENT`), `TicketStatus`, foreign keys (`reporterId`, nullable `assigneeId`), and milestone timestamps (`firstResponseAt`, `resolvedAt`).
- **Comment**: Threaded activity messages linked to tickets and authors (`ticketId`, `authorId`). Cascade-deleted with tickets.
- **Holiday**: Unique calendar dates (`date`, `name`) excluded from business-hour SLA calculations.

*Relationships*: `User` 1:N `Ticket` (as reporter and assignee), `Ticket` 1:N `Comment`, `User` 1:N `Comment`.

## 6. Authentication & Authorization

- **Authentication**: Passwords are hashed with bcrypt (cost 10). Successful login/registration issues a signed HS256 JWT containing `sub` (User ID), `role`, and `email`.
- **Context Injection**: GraphQL server extracts the `Authorization: Bearer <token>` header, verifies the JWT, and attaches the authenticated user to the request context.
- **Role Permissions**:
  - `REPORTER` (Requester): Can create tickets, view only their own reported tickets, and comment only on their own tickets.
  - `AGENT` (Support Staff): Can view all tickets, assign tickets to agents, perform status transitions, resolve tickets, view all users, and access the dashboard KPI metrics.

## 7. Ticket Lifecycle

```text
[OPEN] ──(Agent assigns/starts)──> [IN_PROGRESS] ──(Agent resolves)──> [RESOLVED] ──(Agent closes)──> [CLOSED]
```

- Status changes must follow allowed forward paths; invalid transitions (e.g. `OPEN` → `RESOLVED` or modifying `CLOSED`) are rejected server-side with `INVALID_STATUS_TRANSITION`.
- Transitioning to `RESOLVED` automatically stamps `resolvedAt` if not already set.

## 8. SLA Engine

### Business Hours & Policies
- **Working Schedule**: Monday through Friday, **09:00 to 18:00** (9 business hours / 540 minutes per working day).
- **Excluded Time**: Non-working hours (nights), weekends (Saturday & Sunday), and dates in the `Holiday` table contribute 0 business minutes.
- **Timezone**: All calculations run against `BUSINESS_TIMEZONE` (defaults to `Asia/Kolkata`), while timestamps are stored and transmitted in UTC ISO-8601 strings.

| Priority | First Response Target | Resolution Target |
| :--- | :--- | :--- |
| **URGENT** | 1 business hour (60 min) | 4 business hours (240 min) |
| **HIGH** | 4 business hours (240 min) | 24 business hours (1,440 min / ~2.67 business days) |
| **MEDIUM** | 8 business hours (480 min) | 48 business hours (2,880 min / ~5.33 business days) |
| **LOW** | 24 business hours (1,440 min) | 72 business hours (4,320 min / 8 business days) |

### SLA States & Freezing
- **`ON_TRACK`**: Consumed business time is ≤ 75% of target duration.
- **`AT_RISK`**: Consumed business time is > 75% of target duration and deadline has not passed.
- **`BREACHED`**: Current time has exceeded the calculated deadline before milestone completion.
- **Clock Freezing**: When the first non-reporter comment is created, `firstResponseAt` is recorded and First Response SLA freezes permanently. When a ticket is resolved, `resolvedAt` is recorded and Resolution SLA freezes permanently.

## 9. Example SLA Calculation

**Ticket**: `HIGH` Priority (4h First Response Target), created on **Friday at 17:00**.
1. **Friday 17:00–18:00**: Consumes **1 business hour** (3 hours remaining).
2. **Friday 18:00 – Monday 09:00**: Weekend is skipped (0 business hours consumed).
3. **Monday 09:00–12:00**: Consumes remaining **3 business hours**.
4. **Target First Response Deadline**: **Monday at 12:00**.

## 10. GraphQL API

### Operations
- **Queries**: `tickets(status, priority, assigneeId, slaState, take, cursor)`, `ticket(id)`, `dashboard`, `users(role)`, `holidays`, `health`.
- **Mutations**: `register(name, email, password, role)`, `login(email, password)`, `createTicket(title, description, priority)`, `assignTicket(ticketId, assigneeId)`, `changeTicketStatus(ticketId, status)`, `resolveTicket(ticketId)`, `addComment(ticketId, content)`.

### Sample Query
```graphql
query GetTicketWithSLA($id: ID!) {
  ticket(id: $id) {
    id title status priority
    sla {
      firstResponseDueAt resolutionDueAt
      firstResponseState resolutionState
      firstResponseRemainingMinutes
    }
  }
}
```

## 11. Validation & Error Handling

Domain exceptions inherit from `GraphQLError` and expose machine-readable codes in `extensions.code`:
- `VALIDATION_ERROR`: Empty fields, invalid emails, short passwords (<6 chars), invalid enums.
- `UNAUTHORIZED`: Missing, invalid, or expired JWT token.
- `FORBIDDEN`: Role permission violations (e.g. reporter accessing other tickets or dashboard).
- `INVALID_STATUS_TRANSITION`: Attempting disallowed lifecycle jumps.
- `TICKET_NOT_FOUND` / `USER_NOT_FOUND`: Target entity missing in database.
- `DUPLICATE_EMAIL` / `INVALID_CREDENTIALS`: Authentication failures.

## 12. Frontend

- **Auth & Route Guards**: Public pages (`/login`, `/register`) and protected application routes (`/dashboard`, `/tickets`, `/tickets/:id`, `/tickets/new`) with role-based redirection.
- **Agent Dashboard**: Real-time KPI summary counters (Open, In Progress, At Risk, Breached) with quick-filter deep links.
- **Ticket Queue**: Multi-attribute filtering (Status, Priority, Assignee, SLA state) with forward cursor pagination.
- **Ticket Details**: Status action buttons, staff assignment dropdown, SLA status cards, and real-time comment stream with first-response badge.

## 13. Testing

- **Suite**: **74 tests passing across 7 test files (191 assertions, 0 failures)**.
- **Unit Tests**: Pure business-hours math, weekend carryover, holiday skips, boundary conditions (75% threshold), clock freezing, auth hashing/JWT, and TicketService logic.
- **Integration Tests**: End-to-end GraphQL execution testing authentication, role permissions, and full ticket SLA lifecycles against PostgreSQL.

## 14. Setup & Running

```bash
# 1. Install dependencies
bun install

# 2. Configure environment variables
cp .env.example .env
cp backend/.env.example backend/.env

# 3. Start PostgreSQL container
docker compose up -d

# 4. Run database migrations & seed data
cd backend
bun run db:migrate
bun run db:seed
cd ..

# 5. Start Backend server (Terminal 1) -> http://localhost:4000/graphql
bun run dev:backend

# 6. Start Frontend application (Terminal 2) -> http://localhost:5173
bun run dev:frontend
```

## 15. Environment Variables

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://support:support@localhost:5432/support_tracker` |
| `JWT_SECRET` | Secret key for signing HS256 tokens | Long secure random string |
| `JWT_EXPIRATION` | Token validity duration | `7d` |
| `BUSINESS_TIMEZONE` | IANA timezone for business hours | `Asia/Kolkata` |
| `PORT` | Backend HTTP port | `4000` |

## 16. Seed Data

Seeded via `bun run db:seed` with default password `Password123!`:
- **Reporter**: `reporter@example.com` (`REPORTER` role)
- **Agent**: `agent@example.com` (`AGENT` role)
- Pre-seeded tickets across Urgent, High, Medium, and Low priorities with threaded comments and configured public holidays.

## 17. Design Decisions & Tradeoffs

- **Backend-Authoritative SLA**: All SLA deadlines and states are calculated by the backend to prevent clock-drift discrepancies.
- **Pure SLA Engine**: Calculation logic uses native `Intl` and `Date.UTC` without external date dependencies, simplifying testing.
- **Schema-First GraphQL**: Explicit `.graphql` contract decouples API design from database schema and client implementations.
- **Cursor-Based Pagination**: Orders by `[createdAt DESC, id DESC]` for deterministic pagination resilient to real-time insertions.
- **Server-Side Role Guarding**: Authorization enforced at the service level rather than relying on frontend UI hiding.

## 18. Known Limitations

- **Single Business Calendar**: Supports one global timezone and holiday set rather than multi-tenant customer schedules.
- **No SLA Pause on Customer Pending**: Clocks run continuously during business hours without a "Waiting on Customer" pause state.
- **In-Memory SLA Filtering**: Tickets matching SLA states are filtered dynamically in memory after fetching database candidates.
- **No Asynchronous Event Notifications**: Does not include email, webhook, or WebSocket push notifications for SLA breaches.

## 19. Interview Walkthrough Guide

1. **Problem**: Standard elapsed time unfairly penalizes support teams; SLA tracking requires strict business-hour accounting.
2. **Architecture**: Clean layered architecture separating GraphQL transport, domain services, SLA calculation, and Prisma ORM.
3. **Authentication**: Stateless JWT auth with bcrypt password hashing and strict `REPORTER` vs `AGENT` role boundaries.
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
