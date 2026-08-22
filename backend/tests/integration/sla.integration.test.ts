import { beforeAll, describe, expect, test } from "bun:test";
import { PrismaClient, Priority, TicketStatus, UserRole } from "@prisma/client";
import { TicketService } from "../../src/ticket/ticket.service";
import { SLAService } from "../../src/sla/sla.service";
import type { AuthenticatedUser } from "../../src/context";

const prisma = new PrismaClient();
const slaService = new SLAService(prisma);
const ticketService = new TicketService(prisma, slaService);

let reporterUser: AuthenticatedUser;
let agentUser: AuthenticatedUser;

beforeAll(async () => {
  const reporter = await prisma.user.upsert({
    where: { email: "sla-integration-reporter@example.com" },
    update: {},
    create: {
      name: "SLA Integration Reporter",
      email: "sla-integration-reporter@example.com",
      passwordHash: "dummyhash",
      role: UserRole.REPORTER
    }
  });

  const agent = await prisma.user.upsert({
    where: { email: "sla-integration-agent@example.com" },
    update: {},
    create: {
      name: "SLA Integration Agent",
      email: "sla-integration-agent@example.com",
      passwordHash: "dummyhash",
      role: UserRole.AGENT
    }
  });

  // Ensure a test holiday exists
  await prisma.holiday.upsert({
    where: { date: new Date("2026-08-25T00:00:00.000Z") },
    update: { name: "Summer Public Holiday" },
    create: {
      date: new Date("2026-08-25T00:00:00.000Z"),
      name: "Summer Public Holiday"
    }
  });

  reporterUser = { id: reporter.id, role: reporter.role };
  agentUser = { id: agent.id, role: agent.role };
});

describe("SLA & Ticket Integration Flow", () => {
  test("end-to-end flow: create ticket -> calculate SLA -> add comments -> freeze completed firstResponseAt", async () => {
    // 1. Create ticket
    const ticket = await ticketService.createTicket(
      {
        title: "Integration SLA Flow Ticket",
        description: "Testing end-to-end SLA tracking with real PostgreSQL",
        priority: Priority.URGENT
      },
      reporterUser
    );

    expect(ticket.id).toBeDefined();
    expect(ticket.firstResponseAt).toBeNull();

    // 2. Calculate initial SLA (unresponded)
    const initialSLA = await slaService.getTicketSLA(ticket);
    expect(initialSLA.firstResponseDueAt).toBeDefined();
    expect(initialSLA.resolutionDueAt).toBeDefined();
    expect(["ON_TRACK", "AT_RISK", "BREACHED"]).toContain(initialSLA.firstResponseState);

    // 3. Reporter adds a comment (must NOT set firstResponseAt)
    await ticketService.addComment(
      ticket.id,
      "Reporter follow-up comment",
      reporterUser
    );

    const afterReporterComment = await ticketService.getTicket(ticket.id, reporterUser);
    expect(afterReporterComment?.firstResponseAt).toBeNull();

    // 4. Agent adds first response comment (MUST set firstResponseAt)
    const agentComment = await ticketService.addComment(
      ticket.id,
      "Agent acknowledged and looking into it",
      agentUser
    );

    const afterAgentComment = await ticketService.getTicket(ticket.id, agentUser);
    expect(afterAgentComment?.firstResponseAt).not.toBeNull();
    expect(afterAgentComment?.firstResponseAt?.getTime()).toBe(
      agentComment.createdAt.getTime()
    );

    // 5. Calculate SLA again (first-response clock must now be frozen and completed)
    const completedResponseSLA = await slaService.getTicketSLA(afterAgentComment!);
    expect(["ON_TRACK", "AT_RISK"]).toContain(completedResponseSLA.firstResponseState);

    // 6. Test listTickets filtering by slaState
    const ticketsOnTrack = await ticketService.listTickets({
      slaState: "ON_TRACK",
      take: 10
    }, agentUser);
    expect(Array.isArray(ticketsOnTrack.nodes)).toBe(true);

    // 7. Test dashboard counts with real SLA calculations
    const dashboard = await ticketService.getDashboard(agentUser);
    expect(typeof dashboard.openTickets).toBe("number");
    expect(typeof dashboard.inProgressTickets).toBe("number");
    expect(typeof dashboard.atRiskTickets).toBe("number");
    expect(typeof dashboard.breachedTickets).toBe("number");
  });
});
