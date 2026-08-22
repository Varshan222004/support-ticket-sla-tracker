import type { GraphQLContext } from "../../context";

interface HolidayParent {
  id: string;
  date: Date | string;
  name: string;
}

export const holidayQueries = {
  holidays: async (_parent: unknown, _args: Record<string, never>, context: GraphQLContext) => {
    return context.prisma.holiday.findMany({
      orderBy: { date: "asc" }
    });
  }
};

export const holidayTypeResolvers = {
  Holiday: {
    date: (parent: HolidayParent): string => {
      return parent.date instanceof Date ? parent.date.toISOString() : String(parent.date);
    }
  }
};
