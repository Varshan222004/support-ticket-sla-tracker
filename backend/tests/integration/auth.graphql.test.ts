import { beforeAll, describe, expect, test } from "bun:test";
import { execute, parse } from "graphql";
import { PrismaClient, UserRole } from "@prisma/client";
import { schema } from "../../src/graphql/schema";
import { AuthService } from "../../src/auth/auth.service";
import { SLAService } from "../../src/sla/sla.service";
import { TicketService } from "../../src/ticket/ticket.service";
import type { AuthenticatedUser, GraphQLContext } from "../../src/context";

const prisma = new PrismaClient();
const authService = new AuthService(prisma);
const slaService = new SLAService(prisma);
const ticketService = new TicketService(prisma, slaService);

let reporterToken: string;
let agentToken: string;
let reporterUser: AuthenticatedUser;
let agentUser: AuthenticatedUser;

beforeAll(async () => {
  const emailsToClean = [
    "auth-gql-reporter@example.com",
    "auth-gql-agent@example.com",
    "register-mutation-test@example.com"
  ];

  // Must delete dependent rows before deleting users (FK constraint)
  const existingUsers = await prisma.user.findMany({
    where: { email: { in: emailsToClean } },
    select: { id: true }
  });
  const existingIds = existingUsers.map((u) => u.id);
  if (existingIds.length > 0) {
    await prisma.comment.deleteMany({ where: { authorId: { in: existingIds } } });
    await prisma.ticket.deleteMany({ where: { reporterId: { in: existingIds } } });
    await prisma.user.deleteMany({ where: { id: { in: existingIds } } });
  }

  const reporterAuth = await authService.register(
    "Auth GQL Reporter",
    "auth-gql-reporter@example.com",
    "Password123!",
    UserRole.REPORTER
  );
  reporterToken = reporterAuth.token;
  reporterUser = { id: reporterAuth.user.id, role: reporterAuth.user.role };

  const agentAuth = await authService.register(
    "Auth GQL Agent",
    "auth-gql-agent@example.com",
    "Password123!",
    UserRole.AGENT
  );
  agentToken = agentAuth.token;
  agentUser = { id: agentAuth.user.id, role: agentAuth.user.role };
});

async function createContextFromHeader(authorizationHeader?: string): Promise<GraphQLContext> {
  const headers = new Headers();
  if (authorizationHeader) {
    headers.set("authorization", authorizationHeader);
  }
  const request = new Request("http://localhost:4000/graphql", { headers });

  let user: GraphQLContext["user"] = null;
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    try {
      const payload = await authService.verifyToken(token);
      user = {
        id: payload.sub,
        role: payload.role
      };
    } catch {
      user = null;
    }
  }

  return {
    prisma,
    authService,
    slaService,
    ticketService,
    request,
    user
  };
}

describe("GraphQL Auth & Authorization Integration", () => {
  test("register mutation via GraphQL", async () => {
    const mutation = parse(`
      mutation RegisterUser {
        register(
          name: "Registered User"
          email: "register-mutation-test@example.com"
          password: "SecurePassword123!"
          role: REPORTER
        ) {
          token
          user {
            id
            name
            email
            role
          }
        }
      }
    `);

    const context = await createContextFromHeader();
    const result = await execute({
      schema,
      document: mutation,
      contextValue: context
    });

    expect(result.errors).toBeUndefined();
    const payload = (result.data as any)?.register;
    expect(payload.token).toBeDefined();
    expect(payload.user.email).toBe("register-mutation-test@example.com");
    expect(payload.user.role).toBe("REPORTER");
  });

  test("login mutation via GraphQL", async () => {
    const mutation = parse(`
      mutation LoginUser {
        login(
          email: "auth-gql-reporter@example.com"
          password: "Password123!"
        ) {
          token
          user {
            id
            name
            email
            role
          }
        }
      }
    `);

    const context = await createContextFromHeader();
    const result = await execute({
      schema,
      document: mutation,
      contextValue: context
    });

    expect(result.errors).toBeUndefined();
    const payload = (result.data as any)?.login;
    expect(payload.token).toBeDefined();
    expect(payload.user.email).toBe("auth-gql-reporter@example.com");
  });

  test("10. missing Authorization header produces unauthenticated context", async () => {
    const context = await createContextFromHeader(undefined);
    expect(context.user).toBeNull();
  });

  test("11. authenticated GraphQL request populates context.user from Bearer token", async () => {
    const context = await createContextFromHeader(`Bearer ${reporterToken}`);
    expect(context.user).not.toBeNull();
    expect(context.user?.id).toBe(reporterUser.id);
    expect(context.user?.role).toBe(UserRole.REPORTER);
  });

  test("12. unauthenticated mutation rejected with UNAUTHORIZED", async () => {
    const mutation = parse(`
      mutation CreateTicketUnauth {
        createTicket(
          title: "Unauthenticated ticket"
          description: "Should fail"
          priority: HIGH
        ) {
          id
        }
      }
    `);

    const context = await createContextFromHeader(undefined);
    const result = await execute({
      schema,
      document: mutation,
      contextValue: context
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0].extensions?.code).toBe("UNAUTHORIZED");
  });

  test("13. REPORTER authorization enforced: cannot assign, change status, or resolve ticket", async () => {
    // 1. Create ticket as reporter
    const createMutation = parse(`
      mutation CreateTicketAsReporter {
        createTicket(
          title: "Reporter Auth Test"
          description: "Testing role limitations"
          priority: MEDIUM
        ) {
          id
          status
        }
      }
    `);

    const reporterContext = await createContextFromHeader(`Bearer ${reporterToken}`);
    const createResult = await execute({
      schema,
      document: createMutation,
      contextValue: reporterContext
    });

    expect(createResult.errors).toBeUndefined();
    const ticketId = (createResult.data as any)?.createTicket?.id;

    // 2. Reporter attempts to assign ticket -> FORBIDDEN
    const assignMutation = parse(`
      mutation AssignAsReporter($id: ID!, $assigneeId: ID!) {
        assignTicket(ticketId: $id, assigneeId: $assigneeId) {
          id
        }
      }
    `);

    const assignResult = await execute({
      schema,
      document: assignMutation,
      variableValues: { id: ticketId, assigneeId: agentUser.id },
      contextValue: reporterContext
    });

    expect(assignResult.errors).toBeDefined();
    expect(assignResult.errors?.[0].extensions?.code).toBe("FORBIDDEN");

    // 3. Reporter attempts to change status -> FORBIDDEN
    const statusMutation = parse(`
      mutation ChangeStatusAsReporter($id: ID!) {
        changeTicketStatus(ticketId: $id, status: IN_PROGRESS) {
          id
        }
      }
    `);

    const statusResult = await execute({
      schema,
      document: statusMutation,
      variableValues: { id: ticketId },
      contextValue: reporterContext
    });

    expect(statusResult.errors).toBeDefined();
    expect(statusResult.errors?.[0].extensions?.code).toBe("FORBIDDEN");

    // 4. Reporter attempts to resolve ticket -> FORBIDDEN
    const resolveMutation = parse(`
      mutation ResolveAsReporter($id: ID!) {
        resolveTicket(ticketId: $id) {
          id
        }
      }
    `);

    const resolveResult = await execute({
      schema,
      document: resolveMutation,
      variableValues: { id: ticketId },
      contextValue: reporterContext
    });

    expect(resolveResult.errors).toBeDefined();
    expect(resolveResult.errors?.[0].extensions?.code).toBe("FORBIDDEN");
  });

  test("14. AGENT authorization enforced: can assign and resolve tickets", async () => {
    // 1. Create ticket
    const ticket = await ticketService.createTicket(
      {
        title: "Agent Permitted Action Ticket",
        description: "Agent will assign and resolve this ticket",
        priority: "LOW"
      },
      reporterUser
    );

    const agentContext = await createContextFromHeader(`Bearer ${agentToken}`);

    // 2. Agent assigns ticket -> SUCCESS
    const assignMutation = parse(`
      mutation AssignAsAgent($id: ID!, $assigneeId: ID!) {
        assignTicket(ticketId: $id, assigneeId: $assigneeId) {
          id
          assignee {
            id
            role
          }
        }
      }
    `);

    const assignResult = await execute({
      schema,
      document: assignMutation,
      variableValues: { id: ticket.id, assigneeId: agentUser.id },
      contextValue: agentContext
    });

    expect(assignResult.errors).toBeUndefined();
    expect((assignResult.data as any)?.assignTicket?.assignee?.id).toBe(agentUser.id);

    // 3. Change status to IN_PROGRESS
    await ticketService.changeTicketStatus(ticket.id, "IN_PROGRESS", agentUser);

    // 4. Agent resolves ticket -> SUCCESS
    const resolveMutation = parse(`
      mutation ResolveAsAgent($id: ID!) {
        resolveTicket(ticketId: $id) {
          id
          status
          resolvedAt
        }
      }
    `);

    const resolveResult = await execute({
      schema,
      document: resolveMutation,
      variableValues: { id: ticket.id },
      contextValue: agentContext
    });

    expect(resolveResult.errors).toBeUndefined();
    expect((resolveResult.data as any)?.resolveTicket?.status).toBe("RESOLVED");
    expect((resolveResult.data as any)?.resolveTicket?.resolvedAt).toBeDefined();
  });
});
