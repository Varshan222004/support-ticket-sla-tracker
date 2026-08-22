import type { Priority } from "@prisma/client";

export type SLAState = "ON_TRACK" | "AT_RISK" | "BREACHED";

export interface SLAPolicy {
  firstResponseMinutes: number;
  resolutionMinutes: number;
}

export interface SLAInfo {
  firstResponseDueAt: string;
  resolutionDueAt: string;
  firstResponseState: SLAState;
  resolutionState: SLAState;
  firstResponseRemainingMinutes: number;
  resolutionRemainingMinutes: number;
}

export interface CalculatedSLA {
  info: SLAInfo;
  overallState: SLAState;
}

export interface TicketSLAParameters {
  priority: Priority;
  createdAt: Date;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
}

export const SLA_POLICIES: Record<Priority, SLAPolicy> = {
  URGENT: {
    firstResponseMinutes: 60, // 1 business hour
    resolutionMinutes: 240 // 4 business hours
  },
  HIGH: {
    firstResponseMinutes: 240, // 4 business hours
    resolutionMinutes: 1440 // 24 business hours
  },
  MEDIUM: {
    firstResponseMinutes: 480, // 8 business hours
    resolutionMinutes: 2880 // 48 business hours
  },
  LOW: {
    firstResponseMinutes: 1440, // 24 business hours
    resolutionMinutes: 4320 // 72 business hours
  }
};
