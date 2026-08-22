// Shared TypeScript types matching the GraphQL schema exactly

export type UserRole = "REPORTER" | "AGENT";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type SLAState = "ON_TRACK" | "AT_RISK" | "BREACHED";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface SLAInfo {
  firstResponseDueAt: string;
  resolutionDueAt: string;
  firstResponseState: SLAState;
  resolutionState: SLAState;
  firstResponseRemainingMinutes: number;
  resolutionRemainingMinutes: number;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: TicketStatus;
  reporter: User;
  assignee: User | null;
  createdAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  sla: SLAInfo;
  comments?: Comment[];
}

export interface Comment {
  id: string;
  content: string;
  author: User;
  createdAt: string;
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface TicketConnection {
  nodes: Ticket[];
  pageInfo: PageInfo;
}

export interface TicketDashboard {
  openTickets: number;
  inProgressTickets: number;
  atRiskTickets: number;
  breachedTickets: number;
}

export interface AuthPayload {
  token: string;
  user: User;
}
