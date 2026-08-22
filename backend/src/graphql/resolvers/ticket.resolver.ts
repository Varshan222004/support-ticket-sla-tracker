import type { GraphQLContext } from "../../context";
import type { Priority, TicketStatus } from "@prisma/client";

interface TicketsQueryArgs {
  status?: TicketStatus;
  priority?: Priority;
  assigneeId?: string;
  slaState?: "ON_TRACK" | "AT_RISK" | "BREACHED";
  take?: number;
  cursor?: string;
}

interface TicketQueryArgs {
  id: string;
}

interface CreateTicketArgs {
  title: string;
  description: string;
  priority: Priority;
}

interface AssignTicketArgs {
  ticketId: string;
  assigneeId: string;
}

interface ChangeTicketStatusArgs {
  ticketId: string;
  status: TicketStatus;
}

interface AddCommentArgs {
  ticketId: string;
  content: string;
}

interface ResolveTicketArgs {
  ticketId: string;
}

interface TicketParent {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: TicketStatus;
  reporterId: string;
  assigneeId: string | null;
  createdAt: Date | string;
  firstResponseAt: Date | string | null;
  resolvedAt: Date | string | null;
  reporter?: unknown;
  assignee?: unknown;
  comments?: CommentParent[];
}

interface CommentParent {
  id: string;
  content: string;
  ticketId: string;
  authorId: string;
  createdAt: Date | string;
  author?: unknown;
}

export const ticketQueries = {
  tickets: async (_parent: unknown, args: TicketsQueryArgs, context: GraphQLContext) => {
    return context.ticketService.listTickets(args, context.user);
  },

  ticket: async (_parent: unknown, args: TicketQueryArgs, context: GraphQLContext) => {
    return context.ticketService.getTicket(args.id, context.user);
  },

  dashboard: async (_parent: unknown, _args: Record<string, never>, context: GraphQLContext) => {
    return context.ticketService.getDashboard(context.user);
  }
};

export const ticketMutations = {
  createTicket: async (_parent: unknown, args: CreateTicketArgs, context: GraphQLContext) => {
    return context.ticketService.createTicket(
      {
        title: args.title,
        description: args.description,
        priority: args.priority
      },
      context.user
    );
  },

  assignTicket: async (_parent: unknown, args: AssignTicketArgs, context: GraphQLContext) => {
    return context.ticketService.assignTicket(args.ticketId, args.assigneeId, context.user);
  },

  changeTicketStatus: async (
    _parent: unknown,
    args: ChangeTicketStatusArgs,
    context: GraphQLContext
  ) => {
    return context.ticketService.changeTicketStatus(args.ticketId, args.status, context.user);
  },

  addComment: async (_parent: unknown, args: AddCommentArgs, context: GraphQLContext) => {
    return context.ticketService.addComment(args.ticketId, args.content, context.user);
  },

  resolveTicket: async (_parent: unknown, args: ResolveTicketArgs, context: GraphQLContext) => {
    return context.ticketService.resolveTicket(args.ticketId, context.user);
  }
};

export const ticketTypeResolvers = {
  Ticket: {
    createdAt: (parent: TicketParent): string => {
      return parent.createdAt instanceof Date
        ? parent.createdAt.toISOString()
        : String(parent.createdAt);
    },
    firstResponseAt: (parent: TicketParent): string | null => {
      if (!parent.firstResponseAt) return null;
      return parent.firstResponseAt instanceof Date
        ? parent.firstResponseAt.toISOString()
        : String(parent.firstResponseAt);
    },
    resolvedAt: (parent: TicketParent): string | null => {
      if (!parent.resolvedAt) return null;
      return parent.resolvedAt instanceof Date
        ? parent.resolvedAt.toISOString()
        : String(parent.resolvedAt);
    },
    sla: async (parent: TicketParent, _args: unknown, context: GraphQLContext) => {
      const createdAt =
        parent.createdAt instanceof Date ? parent.createdAt : new Date(parent.createdAt);
      const firstResponseAt = parent.firstResponseAt
        ? parent.firstResponseAt instanceof Date
          ? parent.firstResponseAt
          : new Date(parent.firstResponseAt)
        : null;
      const resolvedAt = parent.resolvedAt
        ? parent.resolvedAt instanceof Date
          ? parent.resolvedAt
          : new Date(parent.resolvedAt)
        : null;

      return context.slaService.getTicketSLA({
        priority: parent.priority,
        createdAt,
        firstResponseAt,
        resolvedAt
      });
    },
    comments: async (parent: TicketParent, _args: unknown, context: GraphQLContext) => {
      if (parent.comments) {
        return parent.comments;
      }

      return context.prisma.comment.findMany({
        where: { ticketId: parent.id },
        include: { author: true },
        orderBy: { createdAt: "asc" }
      });
    }
  },

  Comment: {
    createdAt: (parent: CommentParent): string => {
      return parent.createdAt instanceof Date
        ? parent.createdAt.toISOString()
        : String(parent.createdAt);
    }
  }
};
