import type { PrismaClient } from "@prisma/client";
import {
  calculateBusinessDeadline,
  calculateBusinessMinutesBetween,
  normalizeHolidays
} from "./business-hours";
import {
  SLA_POLICIES,
  type CalculatedSLA,
  type SLAInfo,
  type SLAState,
  type TicketSLAParameters
} from "./types";

export class SLAService {
  private readonly timezone: string;

  constructor(
    private readonly prisma: PrismaClient,
    timezone?: string
  ) {
    this.timezone =
      timezone ||
      Bun.env.BUSINESS_TIMEZONE ||
      process.env.BUSINESS_TIMEZONE ||
      "Asia/Kolkata";
  }

  getTimezone(): string {
    return this.timezone;
  }

  async getHolidayDateSet(): Promise<Set<string>> {
    const holidays = await this.prisma.holiday.findMany({
      select: { date: true }
    });
    return normalizeHolidays(
      holidays.map((h) => h.date),
      this.timezone
    );
  }

  calculateTicketSLA(
    ticket: TicketSLAParameters,
    holidays: Set<string> | Date[] | { date: Date }[],
    now: Date = new Date()
  ): CalculatedSLA {
    const holidaySet =
      holidays instanceof Set ? holidays : normalizeHolidays(holidays, this.timezone);
    const policy = SLA_POLICIES[ticket.priority];

    const firstResponseDueAt = calculateBusinessDeadline(
      ticket.createdAt,
      policy.firstResponseMinutes,
      holidaySet,
      this.timezone
    );

    const resolutionDueAt = calculateBusinessDeadline(
      ticket.createdAt,
      policy.resolutionMinutes,
      holidaySet,
      this.timezone
    );

    // 1. Calculate First Response SLA Clock
    let firstResponseState: SLAState;
    let firstResponseRemainingMinutes: number;

    if (ticket.firstResponseAt !== null) {
      // Completed clock: frozen at the event timestamp
      if (ticket.firstResponseAt.getTime() > firstResponseDueAt.getTime()) {
        firstResponseState = "BREACHED";
        firstResponseRemainingMinutes = 0;
      } else {
        const consumed = calculateBusinessMinutesBetween(
          ticket.createdAt,
          ticket.firstResponseAt,
          holidaySet,
          this.timezone
        );
        firstResponseRemainingMinutes = Math.max(0, policy.firstResponseMinutes - consumed);
        const consumedRatio = consumed / policy.firstResponseMinutes;
        // Exact boundary: 0% through 75% consumed is ON_TRACK; > 75% consumed is AT_RISK
        firstResponseState = consumedRatio <= 0.75 ? "ON_TRACK" : "AT_RISK";
      }
    } else {
      // Active clock against 'now'
      if (now.getTime() > firstResponseDueAt.getTime()) {
        firstResponseState = "BREACHED";
        firstResponseRemainingMinutes = 0;
      } else {
        const consumed = calculateBusinessMinutesBetween(
          ticket.createdAt,
          now,
          holidaySet,
          this.timezone
        );
        firstResponseRemainingMinutes = Math.max(0, policy.firstResponseMinutes - consumed);

        if (consumed >= policy.firstResponseMinutes) {
          firstResponseState = "BREACHED";
          firstResponseRemainingMinutes = 0;
        } else {
          const consumedRatio = consumed / policy.firstResponseMinutes;
          firstResponseState = consumedRatio <= 0.75 ? "ON_TRACK" : "AT_RISK";
        }
      }
    }

    // 2. Calculate Resolution SLA Clock
    let resolutionState: SLAState;
    let resolutionRemainingMinutes: number;

    if (ticket.resolvedAt !== null) {
      // Completed clock: frozen at resolution event timestamp
      if (ticket.resolvedAt.getTime() > resolutionDueAt.getTime()) {
        resolutionState = "BREACHED";
        resolutionRemainingMinutes = 0;
      } else {
        const consumed = calculateBusinessMinutesBetween(
          ticket.createdAt,
          ticket.resolvedAt,
          holidaySet,
          this.timezone
        );
        resolutionRemainingMinutes = Math.max(0, policy.resolutionMinutes - consumed);
        const consumedRatio = consumed / policy.resolutionMinutes;
        resolutionState = consumedRatio <= 0.75 ? "ON_TRACK" : "AT_RISK";
      }
    } else {
      // Active clock against 'now'
      if (now.getTime() > resolutionDueAt.getTime()) {
        resolutionState = "BREACHED";
        resolutionRemainingMinutes = 0;
      } else {
        const consumed = calculateBusinessMinutesBetween(
          ticket.createdAt,
          now,
          holidaySet,
          this.timezone
        );
        resolutionRemainingMinutes = Math.max(0, policy.resolutionMinutes - consumed);

        if (consumed >= policy.resolutionMinutes) {
          resolutionState = "BREACHED";
          resolutionRemainingMinutes = 0;
        } else {
          const consumedRatio = consumed / policy.resolutionMinutes;
          resolutionState = consumedRatio <= 0.75 ? "ON_TRACK" : "AT_RISK";
        }
      }
    }

    // 3. Determine Overall Ticket SLA State
    let overallState: SLAState = "ON_TRACK";
    if (firstResponseState === "BREACHED" || resolutionState === "BREACHED") {
      overallState = "BREACHED";
    } else if (firstResponseState === "AT_RISK" || resolutionState === "AT_RISK") {
      overallState = "AT_RISK";
    }

    const info: SLAInfo = {
      firstResponseDueAt: firstResponseDueAt.toISOString(),
      resolutionDueAt: resolutionDueAt.toISOString(),
      firstResponseState,
      resolutionState,
      firstResponseRemainingMinutes,
      resolutionRemainingMinutes
    };

    return {
      info,
      overallState
    };
  }

  async getTicketSLA(ticket: TicketSLAParameters, now: Date = new Date()): Promise<SLAInfo> {
    const holidays = await this.getHolidayDateSet();
    const result = this.calculateTicketSLA(ticket, holidays, now);
    return result.info;
  }
}
