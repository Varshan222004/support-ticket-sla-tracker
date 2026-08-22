import type { PrismaClient, UserRole } from "@prisma/client";
import type { TicketService } from "./ticket/ticket.service";
import type { SLAService } from "./sla/sla.service";
import type { AuthService } from "./auth/auth.service";

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}

export interface GraphQLContext {
  prisma: PrismaClient;
  ticketService: TicketService;
  slaService: SLAService;
  authService: AuthService;
  request: Request;
  user: AuthenticatedUser | null;
}