import { PrismaClient, Priority, TicketStatus, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 10,
  });
}

interface CommentSeedData {
  authorEmail: string;
  content: string;
  createdAt?: Date;
}

interface TicketSeedData {
  title: string;
  description: string;
  priority: Priority;
  status: TicketStatus;
  assignToAgent: boolean;
  firstResponseAt?: Date;
  resolvedAt?: Date;
  comments: CommentSeedData[];
}

const HOLIDAYS_DATA = [
  {
    date: new Date("2026-08-25T00:00:00.000Z"),
    name: "Summer Public Holiday",
  },
  {
    date: new Date("2026-09-07T00:00:00.000Z"),
    name: "Labor Day",
  },
  {
    date: new Date("2026-11-26T00:00:00.000Z"),
    name: "Thanksgiving Day",
  },
  {
    date: new Date("2026-12-25T00:00:00.000Z"),
    name: "Christmas Day",
  },
];

const TICKETS_DATA: TicketSeedData[] = [
  {
    title: "Production Outage: Payment gateway webhook returning 500 errors",
    description:
      "All checkout transactions for international payments are failing since 08:30 UTC. Webhook service is responding with 500 Internal Server Error, impacting live checkout flows.",
    priority: Priority.URGENT,
    status: TicketStatus.IN_PROGRESS,
    assignToAgent: true,
    firstResponseAt: new Date("2026-08-22T08:45:00.000Z"),
    comments: [
      {
        authorEmail: "reporter@example.com",
        content:
          "Impact has expanded to mobile apps. Engineering on-call lead has been paged.",
        createdAt: new Date("2026-08-22T08:35:00.000Z"),
      },
      {
        authorEmail: "agent@example.com",
        content:
          "Investigating the webhook ingress logs now. Replicating the 500 status on staging.",
        createdAt: new Date("2026-08-22T08:45:00.000Z"),
      },
      {
        authorEmail: "agent@example.com",
        content:
          "Identified a timeout in the third-party signature verification step. Applying hotfix to bypass expired certificate cache.",
        createdAt: new Date("2026-08-22T09:10:00.000Z"),
      },
    ],
  },
  {
    title: "Security Alert: Rate limiting bypass on password reset endpoint",
    description:
      "Automated vulnerability scan detected that the /api/auth/reset-password endpoint lacks IP-based rate limiting, allowing rapid retry attempts.",
    priority: Priority.HIGH,
    status: TicketStatus.OPEN,
    assignToAgent: false,
    comments: [
      {
        authorEmail: "reporter@example.com",
        content:
          "Security scan report attached in audit logs. Needs immediate agent review and Redis rate limiter implementation.",
        createdAt: new Date("2026-08-22T09:00:00.000Z"),
      },
    ],
  },
  {
    title: "Performance Degradation: Ticket search latency exceeds 3 seconds",
    description:
      "Customer support agents report that searching tickets with multiple filter tags takes 3 to 5 seconds during peak business hours.",
    priority: Priority.MEDIUM,
    status: TicketStatus.IN_PROGRESS,
    assignToAgent: true,
    firstResponseAt: new Date("2026-08-22T10:15:00.000Z"),
    comments: [
      {
        authorEmail: "reporter@example.com",
        content:
          "Affected teams are Support Tier 2 and Billing. Query plan shows full table scans on tickets table.",
        createdAt: new Date("2026-08-22T10:00:00.000Z"),
      },
      {
        authorEmail: "agent@example.com",
        content:
          "Added composite index on status and createdAt. Benchmarking query performance on staging replica.",
        createdAt: new Date("2026-08-22T10:15:00.000Z"),
      },
    ],
  },
  {
    title: "UI Enhancement: Add dark mode toggle to navigation header",
    description:
      "Users requested an option to toggle dark mode in the top navigation bar to reduce eye strain during evening shifts.",
    priority: Priority.LOW,
    status: TicketStatus.RESOLVED,
    assignToAgent: true,
    firstResponseAt: new Date("2026-08-21T14:30:00.000Z"),
    resolvedAt: new Date("2026-08-21T16:00:00.000Z"),
    comments: [
      {
        authorEmail: "agent@example.com",
        content:
          "Implemented CSS theme variables and persistent theme preference in local storage.",
        createdAt: new Date("2026-08-21T14:30:00.000Z"),
      },
      {
        authorEmail: "reporter@example.com",
        content:
          "Tested across Chrome, Safari, and Firefox. Theme switches smoothly without flickering. Approved for release.",
        createdAt: new Date("2026-08-21T15:50:00.000Z"),
      },
    ],
  },
];

async function main(): Promise<void> {
  console.log("🌱 Starting database seed...");

  const defaultPasswordHash = await hashPassword("Password123!");

  // 1. Seed Users (Idempotent via upsert)
  const demoReporter = await prisma.user.upsert({
    where: { email: "reporter@example.com" },
    update: {
      name: "Demo Reporter",
      role: UserRole.REPORTER,
      passwordHash: defaultPasswordHash,
    },
    create: {
      name: "Demo Reporter",
      email: "reporter@example.com",
      role: UserRole.REPORTER,
      passwordHash: defaultPasswordHash,
    },
  });

  const demoAgent = await prisma.user.upsert({
    where: { email: "agent@example.com" },
    update: {
      name: "Demo Agent",
      role: UserRole.AGENT,
      passwordHash: defaultPasswordHash,
    },
    create: {
      name: "Demo Agent",
      email: "agent@example.com",
      role: UserRole.AGENT,
      passwordHash: defaultPasswordHash,
    },
  });

  const users = [demoReporter, demoAgent];
  const userMap: Record<string, string> = {
    [demoReporter.email]: demoReporter.id,
    [demoAgent.email]: demoAgent.id,
  };

  // 2. Seed Holidays (Idempotent via upsert)
  const holidays = [];
  for (const holidayData of HOLIDAYS_DATA) {
    const holiday = await prisma.holiday.upsert({
      where: { date: holidayData.date },
      update: { name: holidayData.name },
      create: {
        date: holidayData.date,
        name: holidayData.name,
      },
    });
    holidays.push(holiday);
  }

  // 3. Seed Tickets & Comments (Idempotent)
  const tickets = [];
  let totalComments = 0;

  for (const ticketData of TICKETS_DATA) {
    const existingTicket = await prisma.ticket.findFirst({
      where: {
        title: ticketData.title,
        reporterId: demoReporter.id,
      },
    });

    const assigneeId = ticketData.assignToAgent ? demoAgent.id : null;

    let ticket;
    if (existingTicket) {
      ticket = await prisma.ticket.update({
        where: { id: existingTicket.id },
        data: {
          description: ticketData.description,
          priority: ticketData.priority,
          status: ticketData.status,
          assigneeId,
          firstResponseAt: ticketData.firstResponseAt,
          resolvedAt: ticketData.resolvedAt,
        },
      });
    } else {
      ticket = await prisma.ticket.create({
        data: {
          title: ticketData.title,
          description: ticketData.description,
          priority: ticketData.priority,
          status: ticketData.status,
          reporterId: demoReporter.id,
          assigneeId,
          firstResponseAt: ticketData.firstResponseAt,
          resolvedAt: ticketData.resolvedAt,
        },
      });
    }
    tickets.push(ticket);

    // Seed Comments for this ticket
    for (const commentData of ticketData.comments) {
      const authorId = userMap[commentData.authorEmail];
      if (!authorId) continue;

      const existingComment = await prisma.comment.findFirst({
        where: {
          ticketId: ticket.id,
          content: commentData.content,
          authorId,
        },
      });

      if (!existingComment) {
        await prisma.comment.create({
          data: {
            ticketId: ticket.id,
            authorId,
            content: commentData.content,
            createdAt: commentData.createdAt ?? new Date(),
          },
        });
      }
      totalComments++;
    }
  }

  console.log("\n✅ Database seed completed successfully!");
  console.log("----------------------------------------");
  console.log(`👤 Users seeded:    ${users.length}`);
  console.log(`🎫 Tickets seeded:  ${tickets.length}`);
  console.log(`💬 Comments seeded: ${totalComments}`);
  console.log(`📅 Holidays seeded: ${holidays.length}`);
  console.log("----------------------------------------\n");
}

main()
  .catch((e: unknown) => {
    console.error("❌ Error during database seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
