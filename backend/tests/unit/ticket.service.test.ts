import { beforeAll, describe, expect, test } from "bun:test";
import { PrismaClient, Priority, TicketStatus, UserRole } from "@prisma/client";
import { TicketService } from "../../src/ticket/ticket.service";
import { SLAService } from "../../src/sla/sla.service";
import {
  ForbiddenError,
  InvalidCommentError,
  InvalidStatusTransitionError,
  TicketNotFoundError,
  UnauthorizedError,
  UserNotFoundError,
  ValidationError
} from "../../src/errors";
import type { AuthenticatedUser } from "../../src/context";

const prisma = new PrismaClient();
const slaService = new SLAService(prisma);
const ticketService = new TicketService(prisma, slaService);

let reporterUser: AuthenticatedUser;
let agentUser: AuthenticatedUser;
let secondReporterUser: AuthenticatedUser;

beforeAll(async () => {
  const reporter = await prisma.user.upsert({
    where: { email: "test-reporter@example.com" },
    update: {},
    create: {
      name: "Test Reporter",
      email: "test-reporter@example.com",
      passwordHash: "dummyhash",
      role: UserRole.REPORTER
    }
  });

  const agent = await prisma.user.upsert({
    where: { email: "test-agent@example.com" },
    update: {},
    create: {
      name: "Test Agent",
      email: "test-agent@example.com",
      passwordHash: "dummyhash",
      role: UserRole.AGENT
    }
  });

  const secondReporter = await prisma.user.upsert({
    where: { email: "test-reporter2@example.com" },
    update: {},
    create: {
      name: "Test Reporter 2",
      email: "test-reporter2@example.com",
      passwordHash: "dummyhash",
      role: UserRole.REPORTER
    }
  });

  reporterUser = { id: reporter.id, role: reporter.role };
  agentUser = { id: agent.id, role: agent.role };
  secondReporterUser = { id: secondReporter.id, role: secondReporter.role };
});

describe("TicketService", () => {
  describe("createTicket", () => {
    test("creates ticket with valid inputs and default OPEN status", async () => {
      const ticket = await ticketService.createTicket(
        {
          title: "Login issue",
          description: "Cannot login with Google OAuth",
          priority: Priority.HIGH
        },
        reporterUser
      );

      expect(ticket.id).toBeDefined();
      expect(ticket.title).toBe("Login issue");
      expect(ticket.description).toBe("Cannot login with Google OAuth");
      expect(ticket.priority).toBe(Priority.HIGH);
      expect(ticket.status).toBe(TicketStatus.OPEN);
      expect(ticket.reporterId).toBe(reporterUser.id);
      expect(ticket.firstResponseAt).toBeNull();
      expect(ticket.resolvedAt).toBeNull();
    });

    test("rejects when currentUser is null", async () => {
      expect(
        ticketService.createTicket(
          {
            title: "Valid Title",
            description: "Valid Description",
            priority: Priority.MEDIUM
          },
          null
        )
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    test("rejects empty title", async () => {
      expect(
        ticketService.createTicket(
          {
            title: "   ",
            description: "Some description",
            priority: Priority.LOW
          },
          reporterUser
        )
      ).rejects.toBeInstanceOf(ValidationError);
    });

    test("rejects empty description", async () => {
      expect(
        ticketService.createTicket(
          {
            title: "Some title",
            description: "   ",
            priority: Priority.LOW
          },
          reporterUser
        )
      ).rejects.toBeInstanceOf(ValidationError);
    });

    test("rejects invalid ticket input (invalid priority)", async () => {
      expect(
        ticketService.createTicket(
          {
            title: "Some title",
            description: "Some description",
            priority: "CRITICAL" as Priority
          },
          reporterUser
        )
      ).rejects.toBeInstanceOf(ValidationError);
    });

    test("rejects non-existent user", async () => {
      expect(
        ticketService.createTicket(
          {
            title: "Some title",
            description: "Some description",
            priority: Priority.LOW
          },
          { id: "00000000-0000-0000-0000-000000000000", role: UserRole.REPORTER }
        )
      ).rejects.toBeInstanceOf(UserNotFoundError);
    });
  });

  describe("assignTicket", () => {
    test("assigns ticket to an agent by an agent", async () => {
      const ticket = await ticketService.createTicket(
        {
          title: "Assignment test ticket",
          description: "Needs assignment",
          priority: Priority.MEDIUM
        },
        reporterUser
      );

      const assigned = await ticketService.assignTicket(ticket.id, agentUser.id, agentUser);
      expect(assigned.assigneeId).toBe(agentUser.id);
    });

    test("rejects assignment by non-agent (reporter)", async () => {
      const ticket = await ticketService.createTicket(
        {
          title: "Unauthorized assign test",
          description: "Testing role check",
          priority: Priority.LOW
        },
        reporterUser
      );

      expect(
        ticketService.assignTicket(ticket.id, agentUser.id, reporterUser)
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    test("rejects assigning non-agent user", async () => {
      const ticket = await ticketService.createTicket(
        {
          title: "Assign to reporter test",
          description: "Testing assignee role check",
          priority: Priority.LOW
        },
        reporterUser
      );

      expect(
        ticketService.assignTicket(ticket.id, secondReporterUser.id, agentUser)
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    test("rejects non-existent ticket", async () => {
      expect(
        ticketService.assignTicket(
          "00000000-0000-0000-0000-000000000000",
          agentUser.id,
          agentUser
        )
      ).rejects.toBeInstanceOf(TicketNotFoundError);
    });

    test("rejects non-existent assignee", async () => {
      const ticket = await ticketService.createTicket(
        {
          title: "Non-existent assignee test",
          description: "Testing assignee existence",
          priority: Priority.LOW
        },
        reporterUser
      );

      expect(
        ticketService.assignTicket(
          ticket.id,
          "00000000-0000-0000-0000-000000000000",
          agentUser
        )
      ).rejects.toBeInstanceOf(UserNotFoundError);
    });
  });

  describe("status transitions", () => {
    test("valid status transition: OPEN -> IN_PROGRESS", async () => {
      const ticket = await ticketService.createTicket(
        {
          title: "Status transition test",
          description: "Testing transition rules",
          priority: Priority.MEDIUM
        },
        reporterUser
      );

      const inProgress = await ticketService.changeTicketStatus(
        ticket.id,
        TicketStatus.IN_PROGRESS,
        agentUser
      );
      expect(inProgress.status).toBe(TicketStatus.IN_PROGRESS);
    });

    test("rejects status change by non-agent (reporter)", async () => {
      const ticket = await ticketService.createTicket(
        {
          title: "Reporter status change test",
          description: "Reporters cannot change ticket status",
          priority: Priority.MEDIUM
        },
        reporterUser
      );

      expect(
        ticketService.changeTicketStatus(ticket.id, TicketStatus.IN_PROGRESS, reporterUser)
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    test("valid status transition: IN_PROGRESS -> RESOLVED and sets resolvedAt", async () => {
      const ticket = await ticketService.createTicket(
        {
          title: "Resolve transition test",
          description: "Testing transition to resolved",
          priority: Priority.HIGH
        },
        reporterUser
      );

      await ticketService.changeTicketStatus(ticket.id, TicketStatus.IN_PROGRESS, agentUser);
      const resolved = await ticketService.changeTicketStatus(
        ticket.id,
        TicketStatus.RESOLVED,
        agentUser
      );

      expect(resolved.status).toBe(TicketStatus.RESOLVED);
      expect(resolved.resolvedAt).toBeInstanceOf(Date);
    });

    test("invalid status transition: OPEN -> RESOLVED", async () => {
      const ticket = await ticketService.createTicket(
        {
          title: "Invalid jump test",
          description: "Cannot jump directly to resolved",
          priority: Priority.LOW
        },
        reporterUser
      );

      expect(
        ticketService.changeTicketStatus(ticket.id, TicketStatus.RESOLVED, agentUser)
      ).rejects.toBeInstanceOf(InvalidStatusTransitionError);
    });

    test("invalid status transition: OPEN -> CLOSED", async () => {
      const ticket = await ticketService.createTicket(
        {
          title: "Invalid jump to closed",
          description: "Cannot close directly from open",
          priority: Priority.LOW
        },
        reporterUser
      );

      expect(
        ticketService.changeTicketStatus(ticket.id, TicketStatus.CLOSED, agentUser)
      ).rejects.toBeInstanceOf(InvalidStatusTransitionError);
    });

    test("invalid status transition: CLOSED -> OPEN", async () => {
      const ticket = await ticketService.createTicket(
        {
          title: "Full flow to closed",
          description: "Testing terminal state",
          priority: Priority.LOW
        },
        reporterUser
      );

      await ticketService.changeTicketStatus(ticket.id, TicketStatus.IN_PROGRESS, agentUser);
      await ticketService.changeTicketStatus(ticket.id, TicketStatus.RESOLVED, agentUser);
      await ticketService.changeTicketStatus(ticket.id, TicketStatus.CLOSED, agentUser);

      expect(
        ticketService.changeTicketStatus(ticket.id, TicketStatus.OPEN, agentUser)
      ).rejects.toBeInstanceOf(InvalidStatusTransitionError);
    });
  });

  describe("resolveTicket", () => {
    test("resolves an IN_PROGRESS ticket by agent and records resolvedAt", async () => {
      const ticket = await ticketService.createTicket(
        {
          title: "Resolve method test",
          description: "Testing dedicated resolve method",
          priority: Priority.URGENT
        },
        reporterUser
      );

      await ticketService.changeTicketStatus(ticket.id, TicketStatus.IN_PROGRESS, agentUser);
      const resolved = await ticketService.resolveTicket(ticket.id, agentUser);

      expect(resolved.status).toBe(TicketStatus.RESOLVED);
      expect(resolved.resolvedAt).toBeInstanceOf(Date);
    });

    test("rejects resolve when ticket is in OPEN status", async () => {
      const ticket = await ticketService.createTicket(
        {
          title: "Resolve OPEN ticket test",
          description: "Cannot resolve while still open",
          priority: Priority.MEDIUM
        },
        reporterUser
      );

      expect(ticketService.resolveTicket(ticket.id, agentUser)).rejects.toBeInstanceOf(
        InvalidStatusTransitionError
      );
    });

    test("rejects resolve by non-agent (reporter)", async () => {
      const ticket = await ticketService.createTicket(
        {
          title: "Reporter resolve test",
          description: "Reporter cannot resolve",
          priority: Priority.MEDIUM
        },
        reporterUser
      );

      await ticketService.changeTicketStatus(ticket.id, TicketStatus.IN_PROGRESS, agentUser);
      expect(ticketService.resolveTicket(ticket.id, reporterUser)).rejects.toBeInstanceOf(
        ForbiddenError
      );
    });
  });

  describe("addComment and firstResponseAt rule", () => {
    test("rejects empty comment", async () => {
      const ticket = await ticketService.createTicket(
        {
          title: "Comment test ticket",
          description: "Testing comments",
          priority: Priority.LOW
        },
        reporterUser
      );

      expect(
        ticketService.addComment(ticket.id, "   ", reporterUser)
      ).rejects.toBeInstanceOf(InvalidCommentError);
    });

    test("reporter comment does not set firstResponseAt", async () => {
      const ticket = await ticketService.createTicket(
        {
          title: "Reporter first comment test",
          description: "Reporter adding follow-up details",
          priority: Priority.HIGH
        },
        reporterUser
      );

      const comment1 = await ticketService.addComment(
        ticket.id,
        "Here are more logs from reporter",
        reporterUser
      );
      expect(comment1.id).toBeDefined();

      const refreshed = await ticketService.getTicket(ticket.id, reporterUser);
      expect(refreshed?.firstResponseAt).toBeNull();
    });

    test("first agent comment sets firstResponseAt", async () => {
      const ticket = await ticketService.createTicket(
        {
          title: "Agent first comment test",
          description: "Testing first response timestamp",
          priority: Priority.URGENT
        },
        reporterUser
      );

      // Reporter comments first
      await ticketService.addComment(ticket.id, "Initial reporter note", reporterUser);

      // Agent responds
      const agentComment = await ticketService.addComment(
        ticket.id,
        "Agent is investigating",
        agentUser
      );

      const refreshed = await ticketService.getTicket(ticket.id, reporterUser);
      expect(refreshed?.firstResponseAt).not.toBeNull();
      expect(refreshed?.firstResponseAt?.getTime()).toBe(agentComment.createdAt.getTime());
    });

    test("subsequent agent comments do not overwrite firstResponseAt", async () => {
      const ticket = await ticketService.createTicket(
        {
          title: "Subsequent comments test",
          description: "Ensuring idempotency of firstResponseAt",
          priority: Priority.MEDIUM
        },
        reporterUser
      );

      // First response by agent
      const firstAgentComment = await ticketService.addComment(
        ticket.id,
        "First agent response",
        agentUser
      );

      const afterFirst = await ticketService.getTicket(ticket.id, reporterUser);
      const originalFirstResponseAt = afterFirst?.firstResponseAt;
      expect(originalFirstResponseAt).toBeDefined();

      // Second agent response
      await new Promise((resolve) => setTimeout(resolve, 50));
      await ticketService.addComment(ticket.id, "Second agent follow-up", agentUser);

      const afterSecond = await ticketService.getTicket(ticket.id, reporterUser);
      expect(afterSecond?.firstResponseAt?.getTime()).toBe(
        originalFirstResponseAt?.getTime()
      );
    });
  });

  describe("listTickets and getDashboard", () => {
    test("limits a REPORTER ticket list to their own tickets", async () => {
      const ownTicket = await ticketService.createTicket(
        {
          title: "Reporter visible ticket",
          description: "Only the reporter should see this ticket",
          priority: Priority.LOW
        },
        reporterUser
      );
      await ticketService.createTicket(
        {
          title: "Other reporter ticket",
          description: "This ticket belongs to another reporter",
          priority: Priority.LOW
        },
        secondReporterUser
      );

      const result = await ticketService.listTickets({ take: 100 }, reporterUser);
      expect(result.nodes.some((ticket) => ticket.id === ownTicket.id)).toBe(true);
      expect(result.nodes.every((ticket) => ticket.reporterId === reporterUser.id)).toBe(true);
    });

    test("rejects a REPORTER attempting to view another reporter's ticket", async () => {
      const ticket = await ticketService.createTicket(
        {
          title: "Private reporter ticket",
          description: "This must not be accessible to another reporter",
          priority: Priority.LOW
        },
        secondReporterUser
      );

      expect(ticketService.getTicket(ticket.id, reporterUser)).rejects.toBeInstanceOf(ForbiddenError);
    });

    test("lists tickets with pagination and filtering", async () => {
      const result = await ticketService.listTickets({
        take: 5,
        priority: Priority.HIGH
      }, agentUser);

      expect(Array.isArray(result.nodes)).toBe(true);
      expect(result.pageInfo).toBeDefined();
      expect(typeof result.pageInfo.hasNextPage).toBe("boolean");
    });

    test("returns dashboard metrics for open and inProgress tickets", async () => {
      const dashboard = await ticketService.getDashboard(agentUser);
      expect(typeof dashboard.openTickets).toBe("number");
      expect(typeof dashboard.inProgressTickets).toBe("number");
      expect(dashboard.atRiskTickets).toBe(0);
      expect(dashboard.breachedTickets).toBe(0);
    });
  });
});
