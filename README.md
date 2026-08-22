# Support Ticket & SLA Tracker

Development foundation for a support-ticket system with role-based workflows and business-hours SLA tracking.

## Stack

- Bun and TypeScript (strict mode)
- GraphQL Yoga with schema-first `.graphql` files
- PostgreSQL and Prisma
- React and TypeScript via Vite
- Docker Compose for local PostgreSQL

## Structure

```text
backend/   GraphQL API, Prisma, domain-service boundaries, and tests
frontend/  React application foundation
```

## Prerequisites

- Bun 1.0+
- Docker Desktop with Docker Compose

## Local development

1. Copy `.env.example` to `.env` and replace `JWT_SECRET`.
2. Install dependencies: `bun install`.
3. Start PostgreSQL: `docker compose up -d postgres`.
4. Start the API: `bun run dev:backend`.
5. Start the frontend: `bun run dev:frontend`.

Run type checks with `bun run typecheck`; build the frontend with `bun run --cwd frontend build`.

## Planned architecture

GraphQL resolvers will stay thin and call application services in the ticket and auth areas. The SLA engine will be a dedicated, isolated, testable service; neither resolvers nor the frontend will calculate SLA state. Prisma models and migrations will be added after the core domain model is agreed.

## Current scope

This repository intentionally contains only the development foundation. Authentication, authorization, ticket workflows, comments, pagination, dashboard statistics, data models, migrations, seed data, and SLA algorithms are not yet implemented.
