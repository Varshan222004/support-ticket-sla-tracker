import { beforeAll, describe, expect, test } from "bun:test";
import { execute, parse } from "graphql";
import { PrismaClient, UserRole } from "@prisma/client";
import { schema } from "../../src/graphql/schema";
import { TicketService } from "../../src/ticket/ticket.service";
import { SLAService } from "../../src/sla/sla.service";
import { AuthService } from "../../src/auth/auth.service";
import type { AuthenticatedUser, GraphQLContext } from "../../src/context";

const prisma = new PrismaClient();
const slaService = new SLAService(prisma);
const authService = new AuthService(prisma);
const ticketService = new TicketService(prisma, slaService);

let reporterUser: AuthenticatedUser;
let agentUser: AuthenticatedUser;

beforeAll(async () => {
  const reporter = await prisma.user.upsert({
    where: { email: "gql-reporter@example.com" },
    update: {},
    create: {
      name: "GQL Reporter",
      email: "gql-reporter@example.com",
      passwordHash: "dummyhash",
      role: UserRole.REPORTER
    }
  });

  const agent = await prisma.user.upsert({
    where: { email: "gql-agent@example.com" },
    update: {},
    create: {
      name: "GQL Agent",
      email: "gql-agent@example.com",
      passwordHash: "dummyhash",
      role: UserRole.AGENT
    }
  });

  reporterUser = { id: reporter.id, role: reporter.role };
  agentUser = { id: agent.id, role: agent.role };
});

function createContext(user: AuthenticatedUser | null): GraphQLContext {
  return {
    prisma,
    ticketService,
    slaService,
    authService,
    request: new Request("http://localhost:4000/graphql"),
    user
  };
}

describe("GraphQL Ticket Resolvers", () => {
  test("creates a ticket through GraphQL mutation and queries it", async () => {
    const createMutation = parse(`
      mutation {
        createTicket(
          title: "GraphQL Test Ticket",
          description: "Testing via GraphQL execute",
          priority: URGENT
        ) {
          id
          title
          priority
          status
          createdAt
          sla {
            firstResponseState
          }
        }
      }
    `);

    const createResult = await execute({
      schema,
      document: createMutation,
      contextValue: createContext(reporterUser)
    });

    expect(createResult.errors).toBeUndefined();
    const createdTicket = (createResult.data as { createTicket: { id: string; title: string; status: string } })?.createTicket;
    expect(createdTicket.id).toBeDefined();
    expect(createdTicket.title).toBe("GraphQL Test Ticket");
    expect(createdTicket.status).toBe("OPEN");

    const commentMutation = parse(`
      mutation AddPersistedComment($id: ID!) {
        addComment(ticketId: $id, content: "Persisted GraphQL comment") {
          id
          content
          author { email }
        }
      }
    `);

    const commentResult = await execute({
      schema,
      document: commentMutation,
      variableValues: { id: createdTicket.id },
      contextValue: createContext(reporterUser)
    });

    expect(commentResult.errors).toBeUndefined();

    // Query ticket
    const queryDocument = parse(`
      query GetTicket($id: ID!) {
        ticket(id: $id) {
          id
          title
          status
          reporter {
            email
          }
          comments {
            content
            author { email }
          }
        }
      }
    `);

    const queryResult = await execute({
      schema,
      document: queryDocument,
      variableValues: { id: createdTicket.id },
      contextValue: createContext(reporterUser)
    });

    expect(queryResult.errors).toBeUndefined();
    const fetched = (queryResult.data as {
      ticket: {
        id: string;
        title: string;
        reporter: { email: string };
        comments: { content: string; author: { email: string } }[];
      };
    })?.ticket;
    expect(fetched.id).toBe(createdTicket.id);
    expect(fetched.reporter.email).toBe("gql-reporter@example.com");
    expect(fetched.comments.some((comment) => comment.content === "Persisted GraphQL comment")).toBe(true);
    expect(fetched.comments.some((comment) => comment.author.email === "gql-reporter@example.com")).toBe(true);
  });

  test("returns error code for invalid status transition via GraphQL", async () => {
    // 1. Create ticket
    const ticket = await ticketService.createTicket(
      {
        title: "GQL Transition Error",
        description: "Testing GraphQL error extensions",
        priority: "LOW"
      },
      reporterUser
    );

    // 2. Try invalid transition directly to CLOSED
    const mutation = parse(`
      mutation CloseDirectly($id: ID!) {
        changeTicketStatus(ticketId: $id, status: CLOSED) {
          id
          status
        }
      }
    `);

    const result = await execute({
      schema,
      document: mutation,
      variableValues: { id: ticket.id },
      contextValue: createContext(agentUser)
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0].extensions?.code).toBe("INVALID_STATUS_TRANSITION");
  });
});
