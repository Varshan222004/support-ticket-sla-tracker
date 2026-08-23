# Support Ticket & SLA Tracker

A full-stack support ticket management system and business-hours SLA tracking engine. The application lets users raise tickets, allows support staff to triage and resolve them, and calculates First Response and Resolution SLA deadlines strictly during active business hours. Built with a schema-first GraphQL Yoga API, PostgreSQL with Prisma ORM, and a React + TypeScript frontend.

---

## Features

- **Authentication & RBAC**: Password hashing via bcrypt and stateless JWT authentication with `REPORTER` and `AGENT` roles.
- **Ticket Workflow**: Strict lifecycle state machine (`OPEN` → `IN_PROGRESS` → `RESOLVED` → `CLOSED`) with server-side validation.
- **Staff Assignment & Comments**: Ticket assignment to agents and threaded activity timelines for requester-agent communication.
- **Business-Hours SLA Engine**: Dual-clock tracking (First Response & Resolution) that skips non-working hours, weekends, and holidays.
- **Milestone Clock Freezing**: Response SLA freezes on the first non-reporter comment; resolution SLA freezes when marked resolved.
- **Configurable Holidays & Timezone**: Database-backed holiday exclusion and IANA timezone configuration.
- **Agent Dashboard**: KPI summary counts for Open, In Progress, At Risk, and Breached tickets.
- **Cursor-Based Pagination & Filtering**: Filter by status, priority, assignee, and SLA state with cursor pagination.
- **GraphQL API**: Schema-first design exposing typed queries, mutations, and domain error codes.

---

## Tech Stack

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Runtime** | Bun | v1.4+ | Fast JavaScript/TypeScript runtime & package manager |
| **Language** | TypeScript | Strict mode | End-to-end type safety across backend and frontend |
| **API Layer** | GraphQL Yoga | v5.22 | Schema-first execution, context injection & error handling |
| **Database** | PostgreSQL | 16 (Alpine) | Relational database persistence |
| **ORM** | Prisma | v6 | Schema modeling, relational queries, and migrations |
| **Auth** | `jose` + `Bun.password` | — | JWT token verification and bcrypt hashing (cost factor 10) |
| **Frontend** | React + Vite | React 19, Vite 8 | Single Page Application with React Router v7 |
| **Local DB** | Docker Compose | — | Containerized PostgreSQL 16 local instance |

---

## Architecture

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

- **Resolvers**: Kept thin. They extract authenticated user info from the request context and delegate directly to domain services.
- **Domain Services**: `TicketService` and `AuthService` handle business logic, validation rules, and database operations.
- **SLA Engine**: `SLAService` and `business-hours.ts` are isolated pure modules with zero database or GraphQL dependencies.
- **Backend-Driven SLA**: The backend calculates the SLA state and remaining business minutes. The frontend only displays what the API returns and does not calculate SLA status independently.

---

## Project Structure

```text
Support-Ticket-SLA-Tracker/
├── docker-compose.yml          # PostgreSQL 16 container definition
├── package.json                # Root workspace scripts
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # Data models, enums & indexes
│   │   ├── seed.ts             # Development seed data
│   │   └── migrations/         # Committed Prisma migration history
│   └── src/
│       ├── server.ts           # Server entrypoint & GraphQL Yoga configuration
│       ├── context.ts          # Auth extraction & context building
│       ├── auth/               # User registration, login, and JWT verification
│       ├── ticket/             # Ticket lifecycle, assignment, comments, and metrics
│       ├── sla/                # Business-hours calculation and SLA policies
│       ├── errors/             # Custom domain error classes
│       └── graphql/            # root.graphql SDL schema and modular resolvers
└── frontend/
    └── src/
        ├── App.tsx             # Route definitions and authentication guards
        ├── auth/               # AuthContext and token storage
        ├── graphql/            # Typed GraphQL operations and mutation hooks
        ├── pages/              # Dashboard, Tickets, CreateTicket, Detail, Auth views
        └── components/         # Layout, badges, and shared UI controls
```

---

## SLA Engine

The SLA engine calculates deadlines and elapsed business time strictly during working hours.

### Business Hours & Schedule
- **Schedule**: Monday through Friday, **09:00 to 18:00** (9 business hours / 540 minutes per working day).
- **Exclusions**: Non-working hours (18:00 to 09:00), weekends (Saturday and Sunday), and dates in the `Holiday` table contribute 0 business minutes.
- **Timezone**: All business-hour math is evaluated in the configured `BUSINESS_TIMEZONE` (defaults to `Asia/Kolkata`). Timestamps are stored in the database and returned via GraphQL as UTC ISO-8601 strings.

### SLA Policies

| Priority | First Response Target | Resolution Target |
| :--- | :--- | :--- |
| **URGENT** | 1 business hour (60 min) | 4 business hours (240 min) |
| **HIGH** | 4 business hours (240 min) | 24 business hours (1,440 min / ~2.67 business days) |
| **MEDIUM** | 8 business hours (480 min) | 48 business hours (2,880 min / ~5.33 business days) |
| **LOW** | 24 business hours (1,440 min) | 72 business hours (4,320 min / 8 business days) |

### SLA States & Thresholds

For each active ticket, the backend evaluates:
- **`ON_TRACK`**: Consumed business time is ≤ 75% of the policy target.
- **`AT_RISK`**: Consumed business time is > 75% of the policy target and the current time is before the deadline.
- **`BREACHED`**: Current time has passed the deadline before the milestone was reached.

### Milestone Freezing

- **First Response**: Starts at ticket creation. When the first comment from a non-reporter (`AGENT`) is added, `firstResponseAt` is stamped and the response clock permanently freezes. Later comments do not overwrite this timestamp.
- **Resolution**: Starts at ticket creation. When the ticket moves to `RESOLVED`, `resolvedAt` is stamped and the resolution clock permanently freezes.
- **Historical Consistency**: Once a milestone is frozen, completed SLA clocks will not transition to `BREACHED` when checked at a later date.
- **24/7 Support Operations**: Support staff can resolve tickets or reply on weekends and outside working hours; the SLA engine clamps elapsed business time strictly to working hours (e.g. Friday 17:30 to Saturday 14:00 counts exactly 30 minutes).

---

## SLA Calculation Example

**Scenario**: A `HIGH` priority ticket (4h First Response Target) is created on **Friday at 17:00**.

1. **Friday 17:00–18:00**: 1 business hour consumed (3 hours remaining).
2. **Friday 18:00 to Monday 09:00**: Weekend is skipped (0 business hours consumed).
3. **Monday 09:00–12:00**: Remaining 3 business hours consumed.
4. **Calculated Deadline**: **Monday at 12:00**.

---

## Authentication & Authorization

- **Authentication**: User passwords are hashed with bcrypt (cost 10). Authentication returns an HS256 JWT containing user ID, email, and role.
- **Context Extraction**: The server validates the `Authorization: Bearer <token>` header on each request and attaches the user object to the GraphQL context.
- **Role Permissions**:
  - `REPORTER`: Can create tickets, view only their own tickets, and comment only on their own tickets.
  - `AGENT`: Can view all tickets, assign tickets, update status, resolve tickets, view user lists, and access dashboard metrics.

---

## Ticket Lifecycle

Status changes follow an explicit state machine:

```text
[OPEN] ──(Agent assigns/starts)──> [IN_PROGRESS] ──(Agent resolves)──> [RESOLVED] ──(Agent closes)──> [CLOSED]
```

- Invalid jumps (such as `OPEN` → `RESOLVED` or transitioning out of `CLOSED`) are rejected server-side with an `INVALID_STATUS_TRANSITION` error.
- Moving to `RESOLVED` automatically sets `resolvedAt` if not already populated.

---

## Database

The database uses PostgreSQL 16 with Prisma ORM:

- **`User`**: `id`, `name`, `email` (unique), `passwordHash`, `role` (`REPORTER` | `AGENT`), timestamps.
- **`Ticket`**: `id`, `title`, `description`, `priority`, `status`, `reporterId`, nullable `assigneeId`, `createdAt`, `firstResponseAt`, `resolvedAt`.
- **`Comment`**: `id`, `content`, `ticketId`, `authorId`, `createdAt`. Cascade-deleted when a ticket is deleted.
- **`Holiday`**: `id`, `date` (unique), `name`, `createdAt`.

Indexes are placed on `status`, `priority`, `reporterId`, `assigneeId`, `createdAt`, `ticketId`, and `authorId`.

---

## GraphQL API

The API uses a schema-first approach defined in `backend/src/graphql/schema/root.graphql`.

### Queries
- `tickets(status, priority, assigneeId, slaState, take, cursor): TicketConnection!`
- `ticket(id: ID!): Ticket`
- `dashboard: TicketDashboard!`
- `users(role: UserRole): [User!]!`
- `holidays: [Holiday!]!`
- `health: String!`

### Mutations
- `register(name, email, password, role): AuthPayload!`
- `login(email, password): AuthPayload!`
- `createTicket(title, description, priority): Ticket!`
- `assignTicket(ticketId, assigneeId): Ticket!`
- `changeTicketStatus(ticketId, status): Ticket!`
- `resolveTicket(ticketId): Ticket!`
- `addComment(ticketId, content): Comment!`

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

## Validation & Error Handling

Domain errors extend `GraphQLError` with machine-readable error codes in `extensions.code`:

- `VALIDATION_ERROR`: Empty fields, invalid emails, short passwords (<6 chars), invalid priority enums.
- `UNAUTHORIZED`: Missing, expired, or invalid JWT tokens.
- `FORBIDDEN`: Permission violations (e.g. reporter attempting agent actions or viewing others' tickets).
- `INVALID_STATUS_TRANSITION`: Disallowed ticket lifecycle transitions.
- `TICKET_NOT_FOUND` / `USER_NOT_FOUND`: Requested entity does not exist.
- `DUPLICATE_EMAIL` / `INVALID_CREDENTIALS`: Auth failures.

---

## Pagination & Filtering

- **Cursor Pagination**: The `tickets` query supports cursor pagination with `take` and `cursor` (ticket ID), returning `nodes` and `PageInfo { hasNextPage, endCursor }`.
- **Standard Queries**: Evaluated at the database level with deterministic ordering (`[createdAt DESC, id DESC]`).
- **Dynamic SLA Filtering**: When filtering by `slaState`, candidate records matching static database filters are evaluated against the SLA calculation in memory and sliced using cursor offsets.

---

## Setup & Running

### Prerequisites
- [Bun](https://bun.sh/) (v1.4+)
- [Docker](https://www.docker.com/) (for local PostgreSQL)

### 1. Install Dependencies
```bash
bun install
```

### 2. Configure Environment
```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

### 3. Start Database
```bash
docker compose up -d
```

### 4. Run Migrations & Seed Data
```bash
cd backend
bun run db:migrate
bun run db:seed
cd ..
```

### 5. Start Development Servers
```bash
# Terminal 1: Backend API (http://localhost:4000/graphql)
bun run dev:backend

# Terminal 2: Frontend App (http://localhost:5173)
bun run dev:frontend
```

---

## Environment Variables

Configured in `.env` and `backend/.env`:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://support:support@localhost:5432/support_tracker` |
| `JWT_SECRET` | Secret key for signing JWT tokens | `super-secret-jwt-key-min-32-chars-long` |
| `JWT_EXPIRATION` | Token expiration duration | `7d` |
| `BUSINESS_TIMEZONE` | IANA timezone for SLA business hours | `Asia/Kolkata` |
| `PORT` | Backend HTTP server port | `4000` |

---

## Seed Data

Running `bun run db:seed` populates the database with test data:

- **Reporter Account**: `reporter@example.com` / `Password123!`
- **Agent Account**: `agent@example.com` / `Password123!`
- Demo tickets across Urgent, High, Medium, and Low priorities with threaded comments.
- Sample public holidays.

---

## Testing

The project includes unit tests for the core business logic and integration tests against a live PostgreSQL instance running in Docker.

```bash
# Run backend test suite
bun run test
```

**Test Suite Results**:
- **76 tests passed, 0 failures (194 assertions across 7 test files)**.
- Covers business-hour arithmetic, weekend carryover, holiday skips, DST, clock freezing, RBAC permissions, GraphQL operations, and database flows.

---

## Quality Checks

Commands used to verify project correctness:

```bash
# 1. Typecheck backend and frontend
bun run typecheck

# 2. Run backend test suite
bun run test

# 3. Build frontend production bundle
cd frontend && bun run build && cd ..
```

---

## Design Decisions

- **Backend-Authoritative SLA**: All SLA deadlines and states are computed on the backend to avoid clock-drift and logic duplication across clients.
- **Isolated Math Logic**: Business-hours calculation uses native `Intl.DateTimeFormat` and UTC date math in a pure service, making it fast and easy to test across timezones without external date libraries.
- **Schema-First API**: The `.graphql` file serves as the explicit contract between backend and frontend.
- **Server-Enforced RBAC**: Permissions are checked directly in domain services rather than relying on frontend UI visibility.

---

## Known Limitations

- **Single Business Calendar**: The app uses one global timezone and holiday set rather than per-organization schedules.
- **No SLA Pause State**: Clocks run continuously during working hours; there is currently no "Waiting on Customer" pause status.
- **In-Memory SLA Filtering**: Filtering tickets by dynamic SLA state evaluates calculated states in memory after applying static database filters.
- **No Push Notifications**: SLA breach evaluations happen on-query rather than through background worker alerts or websockets.

---

## How I'd Extend This

With more time, I would add:
- A `WAITING_ON_CUSTOMER` status to pause SLA consumption while waiting for requester replies.
- Background worker jobs to send email/webhook alerts when tickets enter `AT_RISK` or `BREACHED` states.
- Multi-tenant business calendars supporting custom business hours, timezones, and regional holidays.
- Audit history logging every assignee change, status transition, and SLA event.
