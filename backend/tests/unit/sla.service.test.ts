import { describe, expect, test } from "bun:test";
import { Priority } from "@prisma/client";
import {
  calculateBusinessDeadline,
  calculateBusinessMinutesBetween,
  getZonedParts,
  zonedToUtc
} from "../../src/sla/business-hours";
import { SLAService } from "../../src/sla/sla.service";
import { SLA_POLICIES } from "../../src/sla/types";

// Mock minimal Prisma client for pure unit testing without DB dependency
const mockPrisma = {
  holiday: {
    findMany: async () => [
      { date: new Date("2026-08-25T00:00:00.000Z"), name: "Summer Public Holiday" }
    ]
  }
} as any;

const TIMEZONE = "Asia/Kolkata";
const slaService = new SLAService(mockPrisma, TIMEZONE);

describe("SLA Engine - Business Hours & Deadlines", () => {
  // 1. Normal weekday calculation (e.g. Monday 10:00 IST + 1 hour -> Monday 11:00 IST)
  test("1. normal weekday calculation during business hours", () => {
    // 2026-08-17 is Monday. 10:00 IST = 04:30 UTC
    const monday1000 = new Date("2026-08-17T04:30:00.000Z");
    const deadline = calculateBusinessDeadline(monday1000, 60, [], TIMEZONE);
    const parts = getZonedParts(deadline, TIMEZONE);

    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(8);
    expect(parts.day).toBe(17);
    expect(parts.hour).toBe(11);
    expect(parts.minute).toBe(0);
  });

  // 2. Before business hours (Monday 07:00 IST -> begins at Monday 09:00 IST)
  test("2. ticket created before business hours starts counting at 09:00", () => {
    // Monday 07:00 IST = 01:30 UTC. 60 min SLA -> Due Monday 10:00 IST
    const monday0700 = new Date("2026-08-17T01:30:00.000Z");
    const deadline = calculateBusinessDeadline(monday0700, 60, [], TIMEZONE);
    const parts = getZonedParts(deadline, TIMEZONE);

    expect(parts.hour).toBe(10);
    expect(parts.minute).toBe(0);
    expect(parts.day).toBe(17);
  });

  // 3. After business hours (Monday 20:00 IST -> begins at Tuesday 09:00 IST)
  test("3. ticket created after business hours starts counting next business day at 09:00", () => {
    // Monday 20:00 IST = 14:30 UTC. 60 min SLA -> Due Tuesday 10:00 IST
    const monday2000 = new Date("2026-08-17T14:30:00.000Z");
    const deadline = calculateBusinessDeadline(monday2000, 60, [], TIMEZONE);
    const parts = getZonedParts(deadline, TIMEZONE);

    expect(parts.day).toBe(18); // Tuesday
    expect(parts.hour).toBe(10);
    expect(parts.minute).toBe(0);
  });

  // 4. Saturday creation (begins Monday 09:00)
  test("4. ticket created on Saturday begins next Monday at 09:00", () => {
    // 2026-08-22 is Saturday 14:00 IST. 60 min SLA -> Due Monday 10:00 IST
    const saturday1400 = new Date("2026-08-22T08:30:00.000Z");
    const deadline = calculateBusinessDeadline(saturday1400, 60, [], TIMEZONE);
    const parts = getZonedParts(deadline, TIMEZONE);

    expect(parts.day).toBe(24); // Monday Aug 24
    expect(parts.hour).toBe(10);
    expect(parts.minute).toBe(0);
  });

  // 5. Sunday creation (begins Monday 09:00)
  test("5. ticket created on Sunday begins next Monday at 09:00", () => {
    // 2026-08-23 is Sunday 10:00 IST. 120 min (2h) SLA -> Due Monday 11:00 IST
    const sunday1000 = new Date("2026-08-23T04:30:00.000Z");
    const deadline = calculateBusinessDeadline(sunday1000, 120, [], TIMEZONE);
    const parts = getZonedParts(deadline, TIMEZONE);

    expect(parts.day).toBe(24); // Monday Aug 24
    expect(parts.hour).toBe(11);
    expect(parts.minute).toBe(0);
  });

  // 6. Friday evening (Friday 17:00 IST + 4 business hours = Monday 12:00 IST)
  test("6. Friday evening spans across weekend into Monday", () => {
    // 2026-08-21 is Friday 17:00 IST = 11:30 UTC. 240 min (4h) SLA
    // Fri 17:00-18:00 (1h) + Mon 09:00-12:00 (3h) -> Due Mon 12:00
    const friday1700 = new Date("2026-08-21T11:30:00.000Z");
    const deadline = calculateBusinessDeadline(friday1700, 240, [], TIMEZONE);
    const parts = getZonedParts(deadline, TIMEZONE);

    expect(parts.day).toBe(24); // Monday
    expect(parts.hour).toBe(12);
    expect(parts.minute).toBe(0);
  });

  // 7. Friday 17:59 (1 min Friday, 239 min Monday -> Mon 12:59)
  test("7. Friday 17:59 consumes 1 minute and carries over remainder to Monday", () => {
    // Friday 17:59 IST = 12:29 UTC. 240 min SLA
    const friday1759 = new Date("2026-08-21T12:29:00.000Z");
    const deadline = calculateBusinessDeadline(friday1759, 240, [], TIMEZONE);
    const parts = getZonedParts(deadline, TIMEZONE);

    expect(parts.day).toBe(24); // Monday
    expect(parts.hour).toBe(12);
    expect(parts.minute).toBe(59);
  });

  // 8. Public holiday contributes zero business hours
  test("8. public holiday contributes zero business hours and is skipped", () => {
    // Monday 10:00 IST. Tuesday 2026-08-18 is a Holiday.
    // 9 business hours (540 min) SLA:
    // Mon 10:00-18:00 = 8 hours. Tue = 0 (Holiday). Wed 09:00-10:00 = 1 hour. -> Due Wed 10:00
    const monday1000 = new Date("2026-08-17T04:30:00.000Z");
    const deadline = calculateBusinessDeadline(monday1000, 540, ["2026-08-18"], TIMEZONE);
    const parts = getZonedParts(deadline, TIMEZONE);

    expect(parts.day).toBe(19); // Wednesday
    expect(parts.hour).toBe(10);
    expect(parts.minute).toBe(0);
  });

  // 9. Weekend + holiday combination (Friday 17:00 + Mon Holiday -> Due Tuesday 12:00)
  test("9. weekend + Monday holiday resumes on Tuesday 09:00", () => {
    const friday1700 = new Date("2026-08-21T11:30:00.000Z");
    // Monday 2026-08-24 is a holiday.
    const deadline = calculateBusinessDeadline(friday1700, 240, ["2026-08-24"], TIMEZONE);
    const parts = getZonedParts(deadline, TIMEZONE);

    expect(parts.day).toBe(25); // Tuesday
    expect(parts.hour).toBe(12);
    expect(parts.minute).toBe(0);
  });

  // 10. SLA crossing multiple business days (e.g. 24 business hours = 2 days + 6 hours)
  test("10. SLA duration spanning multiple business days", () => {
    // Monday 09:00 IST. 24 business hours (1440 min) = 9h (Mon) + 9h (Tue) + 6h (Wed 09:00-15:00)
    const monday0900 = new Date("2026-08-17T03:30:00.000Z");
    const deadline = calculateBusinessDeadline(monday0900, 1440, [], TIMEZONE);
    const parts = getZonedParts(deadline, TIMEZONE);

    expect(parts.day).toBe(19); // Wednesday
    expect(parts.hour).toBe(15);
    expect(parts.minute).toBe(0);
  });
});

describe("SLA Policies & Priority Durations", () => {
  test("11. URGENT policy has 1h first response, 4h resolution", () => {
    expect(SLA_POLICIES[Priority.URGENT].firstResponseMinutes).toBe(60);
    expect(SLA_POLICIES[Priority.URGENT].resolutionMinutes).toBe(240);
  });

  test("12. HIGH policy has 4h first response, 24h resolution", () => {
    expect(SLA_POLICIES[Priority.HIGH].firstResponseMinutes).toBe(240);
    expect(SLA_POLICIES[Priority.HIGH].resolutionMinutes).toBe(1440);
  });

  test("13. MEDIUM policy has 8h first response, 48h resolution", () => {
    expect(SLA_POLICIES[Priority.MEDIUM].firstResponseMinutes).toBe(480);
    expect(SLA_POLICIES[Priority.MEDIUM].resolutionMinutes).toBe(2880);
  });

  test("14. LOW policy has 24h first response, 72h resolution", () => {
    expect(SLA_POLICIES[Priority.LOW].firstResponseMinutes).toBe(1440);
    expect(SLA_POLICIES[Priority.LOW].resolutionMinutes).toBe(4320);
  });

  test("15. first-response deadline calculation for URGENT", () => {
    const monday0900 = new Date("2026-08-17T03:30:00.000Z");
    const sla = slaService.calculateTicketSLA(
      {
        priority: Priority.URGENT,
        createdAt: monday0900,
        firstResponseAt: null,
        resolvedAt: null
      },
      new Set(),
      monday0900
    );

    const parts = getZonedParts(new Date(sla.info.firstResponseDueAt), TIMEZONE);
    expect(parts.hour).toBe(10); // 09:00 + 1h = 10:00
    expect(parts.minute).toBe(0);
  });

  test("16. resolution deadline calculation for URGENT", () => {
    const monday0900 = new Date("2026-08-17T03:30:00.000Z");
    const sla = slaService.calculateTicketSLA(
      {
        priority: Priority.URGENT,
        createdAt: monday0900,
        firstResponseAt: null,
        resolvedAt: null
      },
      new Set(),
      monday0900
    );

    const parts = getZonedParts(new Date(sla.info.resolutionDueAt), TIMEZONE);
    expect(parts.hour).toBe(13); // 09:00 + 4h = 13:00
    expect(parts.minute).toBe(0);
  });
});

describe("SLA States & Consumption Boundaries", () => {
  // URGENT SLA: 60 minutes target
  // 0m to 45m (0% - 75%) = ON_TRACK
  // 45m 01s to 59m 59s (> 75% to < 100%) = AT_RISK
  // >= 60m (>= 100%) = BREACHED

  test("17. ON_TRACK state when consumed <= 75%", () => {
    const createdAt = new Date("2026-08-17T03:30:00.000Z"); // 09:00 IST
    const now = new Date("2026-08-17T04:00:00.000Z"); // 09:30 IST (30m consumed / 60m = 50%)

    const sla = slaService.calculateTicketSLA(
      {
        priority: Priority.URGENT,
        createdAt,
        firstResponseAt: null,
        resolvedAt: null
      },
      new Set(),
      now
    );

    expect(sla.info.firstResponseState).toBe("ON_TRACK");
    expect(sla.info.firstResponseRemainingMinutes).toBe(30);
  });

  test("18. exactly 75% boundary is ON_TRACK", () => {
    const createdAt = new Date("2026-08-17T03:30:00.000Z"); // 09:00 IST
    const now = new Date("2026-08-17T04:15:00.000Z"); // 09:45 IST (45m consumed / 60m = 75.0%)

    const sla = slaService.calculateTicketSLA(
      {
        priority: Priority.URGENT,
        createdAt,
        firstResponseAt: null,
        resolvedAt: null
      },
      new Set(),
      now
    );

    expect(sla.info.firstResponseState).toBe("ON_TRACK");
    expect(sla.info.firstResponseRemainingMinutes).toBe(15);
  });

  test("19. AT_RISK state when consumed > 75% and deadline has not passed", () => {
    const createdAt = new Date("2026-08-17T03:30:00.000Z"); // 09:00 IST
    const now = new Date("2026-08-17T04:16:00.000Z"); // 09:46 IST (46m consumed / 60m = 76.67%)

    const sla = slaService.calculateTicketSLA(
      {
        priority: Priority.URGENT,
        createdAt,
        firstResponseAt: null,
        resolvedAt: null
      },
      new Set(),
      now
    );

    expect(sla.info.firstResponseState).toBe("AT_RISK");
    expect(sla.info.firstResponseRemainingMinutes).toBe(14);
    expect(sla.overallState).toBe("AT_RISK");
  });

  test("20. BREACHED state when deadline has passed", () => {
    const createdAt = new Date("2026-08-17T03:30:00.000Z"); // 09:00 IST
    const now = new Date("2026-08-17T04:31:00.000Z"); // 10:01 IST (61m elapsed)

    const sla = slaService.calculateTicketSLA(
      {
        priority: Priority.URGENT,
        createdAt,
        firstResponseAt: null,
        resolvedAt: null
      },
      new Set(),
      now
    );

    expect(sla.info.firstResponseState).toBe("BREACHED");
    expect(sla.info.firstResponseRemainingMinutes).toBe(0);
    expect(sla.overallState).toBe("BREACHED");
  });
});

describe("Completed SLA Clocks (Freezing Behavior)", () => {
  test("21. completed first-response SLA remains frozen on-time even after current time breaches deadline", () => {
    const createdAt = new Date("2026-08-17T03:30:00.000Z"); // 09:00 IST
    const firstResponseAt = new Date("2026-08-17T03:50:00.000Z"); // 09:20 IST (20m consumed, ON_TRACK)
    const futureTime = new Date("2026-08-25T10:00:00.000Z"); // Days later!

    const sla = slaService.calculateTicketSLA(
      {
        priority: Priority.URGENT,
        createdAt,
        firstResponseAt,
        resolvedAt: null
      },
      new Set(),
      futureTime
    );

    // First response was met in 20 min -> state remains ON_TRACK and remaining minutes is frozen at 40
    expect(sla.info.firstResponseState).toBe("ON_TRACK");
    expect(sla.info.firstResponseRemainingMinutes).toBe(40);
  });

  test("22. completed resolution SLA remains frozen on-time even after current time passes deadline", () => {
    const createdAt = new Date("2026-08-17T03:30:00.000Z"); // 09:00 IST
    const firstResponseAt = new Date("2026-08-17T03:40:00.000Z"); // 09:10 IST
    const resolvedAt = new Date("2026-08-17T05:30:00.000Z"); // 11:00 IST (2 hours consumed of 4h)
    const futureTime = new Date("2026-09-01T10:00:00.000Z"); // Weeks later

    const sla = slaService.calculateTicketSLA(
      {
        priority: Priority.URGENT,
        createdAt,
        firstResponseAt,
        resolvedAt
      },
      new Set(),
      futureTime
    );

    expect(sla.info.resolutionState).toBe("ON_TRACK");
    expect(sla.info.resolutionRemainingMinutes).toBe(120);
    expect(sla.overallState).toBe("ON_TRACK");
  });
});

describe("Holidays & Timezone Verification", () => {
  test("23. holiday date actually shifts deadline to next business day", () => {
    const start = new Date("2026-08-24T03:30:00.000Z"); // Mon 09:00 IST
    // Without holiday: 9 business hours = Mon 18:00
    const noHolidayDeadline = calculateBusinessDeadline(start, 540, [], TIMEZONE);
    expect(getZonedParts(noHolidayDeadline, TIMEZONE).day).toBe(24);

    // With Monday 2026-08-24 as holiday: shifts to Tue 18:00
    const holidayDeadline = calculateBusinessDeadline(start, 540, ["2026-08-24"], TIMEZONE);
    const holidayParts = getZonedParts(holidayDeadline, TIMEZONE);
    expect(holidayParts.day).toBe(25);
    expect(holidayParts.hour).toBe(18);
  });

  test("24. configured timezone (e.g. America/New_York) is respected", () => {
    const nyTz = "America/New_York";
    // 2026-08-17 09:00 EDT = 13:00 UTC
    const monday0900EDT = new Date("2026-08-17T13:00:00.000Z");
    const deadline = calculateBusinessDeadline(monday0900EDT, 60, [], nyTz);
    const parts = getZonedParts(deadline, nyTz);

    expect(parts.hour).toBe(10); // 10:00 EDT
    expect(parts.minute).toBe(0);
  });

  test("25. UTC to local timezone conversions are exact and unambiguous", () => {
    // 2026-08-17 17:30 IST = 12:00 UTC
    const localTime = zonedToUtc(2026, 8, 17, 17, 30, 0, TIMEZONE);
    expect(localTime.toISOString()).toBe("2026-08-17T12:00:00.000Z");

    const parts = getZonedParts(localTime, TIMEZONE);
    expect(parts.hour).toBe(17);
    expect(parts.minute).toBe(30);
  });
});
