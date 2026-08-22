import { PrismaClient, Priority, TicketStatus, UserRole } from "@prisma/client";
import {
  ForbiddenError,
  InvalidCommentError,
  InvalidStatusTransitionError,
  TicketNotFoundError,
  UnauthorizedError,
  UserNotFoundError,
  ValidationError
} from "../errors";
import type { AuthenticatedUser } from "../context";
import type { SLAService } from "../sla/sla.service";
import type { SLAState } from "../sla/types";

export interface CreateTicketInput {
  title: string;
  description: string;
  priority: Priority;
}

export interface ListTicketsArgs {
  status?: TicketStatus;
  priority?: Priority;
  assigneeId?: string;
  slaState?: SLAState;
  take?: number;
  cursor?: string;
}

export interface TicketDashboardMetrics {
  openTickets: number;
  inProgressTickets: number;
  atRiskTickets: number;
  breachedTickets: number;
}

const ALLOWED_STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.OPEN]: [TicketStatus.IN_PROGRESS],
  [TicketStatus.IN_PROGRESS]: [TicketStatus.RESOLVED],
  [TicketStatus.RESOLVED]: [TicketStatus.CLOSED],
  [TicketStatus.CLOSED]: []
};

export class TicketService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly slaService: SLAService
  ) {}

  async createTicket(input: CreateTicketInput, currentUser: AuthenticatedUser | null) {
    if (!currentUser) {
      throw new UnauthorizedError();
    }

    if (!input.title || !input.title.trim()) {
      throw new ValidationError("Title cannot be empty or whitespace");
    }

    if (!input.description || !input.description.trim()) {
      throw new ValidationError("Description cannot be empty or whitespace");
    }

    if (!input.priority || !Object.values(Priority).includes(input.priority)) {
      throw new ValidationError("Priority must be a valid enum value");
    }

    const reporter = await this.prisma.user.findUnique({
      where: { id: currentUser.id }
    });

    if (!reporter) {
      throw new UserNotFoundError(currentUser.id);
    }

    return this.prisma.ticket.create({
      data: {
        title: input.title.trim(),
        description: input.description.trim(),
        priority: input.priority,
        status: TicketStatus.OPEN,
        reporterId: currentUser.id,
        firstResponseAt: null,
        resolvedAt: null
      },
      include: {
        reporter: true,
        assignee: true,
        comments: {
          include: { author: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });
  }

  async assignTicket(
    ticketId: string,
    assigneeId: string,
    currentUser: AuthenticatedUser | null
  ) {
    if (!currentUser) {
      throw new UnauthorizedError();
    }

    if (currentUser.role !== UserRole.AGENT) {
      throw new ForbiddenError("Only an AGENT may perform ticket assignment");
    }

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId }
    });

    if (!ticket) {
      throw new TicketNotFoundError(ticketId);
    }

    const assignee = await this.prisma.user.findUnique({
      where: { id: assigneeId }
    });

    if (!assignee) {
      throw new UserNotFoundError(assigneeId);
    }

    if (assignee.role !== UserRole.AGENT) {
      throw new ForbiddenError("Assignee must have role AGENT");
    }

    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: { assigneeId },
      include: {
        reporter: true,
        assignee: true,
        comments: {
          include: { author: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });
  }

  async changeTicketStatus(
    ticketId: string,
    status: TicketStatus,
    currentUser: AuthenticatedUser | null
  ) {
    if (!currentUser) {
      throw new UnauthorizedError();
    }

    if (currentUser.role !== UserRole.AGENT) {
      throw new ForbiddenError("Only an AGENT may change ticket status");
    }

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId }
    });

    if (!ticket) {
      throw new TicketNotFoundError(ticketId);
    }

    if (!Object.values(TicketStatus).includes(status)) {
      throw new ValidationError("Invalid status value");
    }

    const allowed = ALLOWED_STATUS_TRANSITIONS[ticket.status] || [];
    if (!allowed.includes(status)) {
      throw new InvalidStatusTransitionError(ticket.status, status);
    }

    const shouldSetResolvedAt = status === TicketStatus.RESOLVED && !ticket.resolvedAt;

    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status,
        ...(shouldSetResolvedAt ? { resolvedAt: new Date() } : {})
      },
      include: {
        reporter: true,
        assignee: true,
        comments: {
          include: { author: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });
  }

  async resolveTicket(ticketId: string, currentUser: AuthenticatedUser | null) {
    if (!currentUser) {
      throw new UnauthorizedError();
    }

    if (currentUser.role !== UserRole.AGENT) {
      throw new ForbiddenError("Only an AGENT may resolve tickets");
    }

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId }
    });

    if (!ticket) {
      throw new TicketNotFoundError(ticketId);
    }

    if (ticket.status !== TicketStatus.IN_PROGRESS) {
      throw new InvalidStatusTransitionError(ticket.status, TicketStatus.RESOLVED);
    }

    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: TicketStatus.RESOLVED,
        resolvedAt: ticket.resolvedAt ?? new Date()
      },
      include: {
        reporter: true,
        assignee: true,
        comments: {
          include: { author: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });
  }

  async addComment(
    ticketId: string,
    content: string,
    currentUser: AuthenticatedUser | null
  ) {
    if (!currentUser) {
      throw new UnauthorizedError();
    }

    if (!content || !content.trim()) {
      throw new InvalidCommentError();
    }

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId }
    });

    if (!ticket) {
      throw new TicketNotFoundError(ticketId);
    }

    if (currentUser.role === UserRole.REPORTER && ticket.reporterId !== currentUser.id) {
      throw new ForbiddenError("REPORTER users may only comment on their own tickets");
    }

    const comment = await this.prisma.comment.create({
      data: {
        ticketId,
        authorId: currentUser.id,
        content: content.trim()
      },
      include: {
        author: true
      }
    });

    // FIRST RESPONSE RULE:
    // The first comment made by someone other than the ticket reporter is the first response.
    // Subsequent comments MUST NOT modify firstResponseAt.
    // Reporter comments MUST NOT set firstResponseAt.
    if (currentUser.id !== ticket.reporterId && ticket.firstResponseAt === null) {
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: { firstResponseAt: comment.createdAt }
      });
    }

    return comment;
  }

  async getTicket(id: string, currentUser: AuthenticatedUser | null) {
    if (!currentUser) {
      throw new UnauthorizedError();
    }

    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        reporter: true,
        assignee: true,
        comments: {
          include: { author: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (ticket && currentUser.role === UserRole.REPORTER && ticket.reporterId !== currentUser.id) {
      throw new ForbiddenError("REPORTER users may only view their own tickets");
    }

    return ticket;
  }

  async listTickets(args: ListTicketsArgs, currentUser: AuthenticatedUser | null) {
    if (!currentUser) {
      throw new UnauthorizedError();
    }

    const take = Math.min(Math.max(args.take ?? 20, 1), 100);

    const where: {
      status?: TicketStatus;
      priority?: Priority;
      assigneeId?: string;
      reporterId?: string;
    } = {};

    if (args.status) where.status = args.status;
    if (args.priority) where.priority = args.priority;
    if (args.assigneeId) where.assigneeId = args.assigneeId;
    if (currentUser.role === UserRole.REPORTER) where.reporterId = currentUser.id;

    if (args.slaState) {
      // Fetch all candidate tickets matching DB filters to apply SLA state filtering
      const candidateTickets = await this.prisma.ticket.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: {
          reporter: true,
          assignee: true,
          comments: {
            include: { author: true },
            orderBy: { createdAt: "asc" }
          }
        }
      });

      const holidays = await this.slaService.getHolidayDateSet();
      const now = new Date();

      const matchedTickets = candidateTickets.filter((ticket) => {
        const calculated = this.slaService.calculateTicketSLA(ticket, holidays, now);
        return calculated.overallState === args.slaState;
      });

      let startIndex = 0;
      if (args.cursor) {
        const cursorIndex = matchedTickets.findIndex((t) => t.id === args.cursor);
        if (cursorIndex !== -1) {
          startIndex = cursorIndex + 1;
        }
      }

      const pagedTickets = matchedTickets.slice(startIndex, startIndex + take);
      const hasNextPage = startIndex + take < matchedTickets.length;
      const endCursor =
        pagedTickets.length > 0 ? pagedTickets[pagedTickets.length - 1].id : null;

      return {
        nodes: pagedTickets,
        pageInfo: {
          hasNextPage,
          endCursor
        }
      };
    }

    const items = await this.prisma.ticket.findMany({
      where,
      take: take + 1,
      cursor: args.cursor ? { id: args.cursor } : undefined,
      skip: args.cursor ? 1 : 0,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        reporter: true,
        assignee: true,
        comments: {
          include: { author: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    const hasNextPage = items.length > take;
    const nodes = hasNextPage ? items.slice(0, take) : items;
    const endCursor = nodes.length > 0 ? nodes[nodes.length - 1].id : null;

    return {
      nodes,
      pageInfo: {
        hasNextPage,
        endCursor
      }
    };
  }

  async getDashboard(currentUser: AuthenticatedUser | null): Promise<TicketDashboardMetrics> {
    if (!currentUser) {
      throw new UnauthorizedError();
    }

    if (currentUser.role !== UserRole.AGENT) {
      throw new ForbiddenError("Only an AGENT may view the dashboard");
    }

    const [openTickets, inProgressTickets, activeTickets] = await Promise.all([
      this.prisma.ticket.count({ where: { status: TicketStatus.OPEN } }),
      this.prisma.ticket.count({ where: { status: TicketStatus.IN_PROGRESS } }),
      this.prisma.ticket.findMany({
        where: {
          status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] }
        }
      })
    ]);

    const holidays = await this.slaService.getHolidayDateSet();
    const now = new Date();

    let atRiskTickets = 0;
    let breachedTickets = 0;

    for (const ticket of activeTickets) {
      const calculated = this.slaService.calculateTicketSLA(ticket, holidays, now);
      if (calculated.overallState === "AT_RISK") {
        atRiskTickets++;
      } else if (calculated.overallState === "BREACHED") {
        breachedTickets++;
      }
    }

    return {
      openTickets,
      inProgressTickets,
      atRiskTickets,
      breachedTickets
    };
  }
}
