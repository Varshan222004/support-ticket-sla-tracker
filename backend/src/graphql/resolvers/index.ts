import { healthResolver } from "./health.resolver";
import { ticketQueries, ticketMutations, ticketTypeResolvers } from "./ticket.resolver";
import { userQueries } from "./user.resolver";
import { holidayQueries, holidayTypeResolvers } from "./holiday.resolver";
import { authMutations } from "./auth.resolver";

export const resolvers = {
  Query: {
    ...healthResolver,
    ...ticketQueries,
    ...userQueries,
    ...holidayQueries
  },
  Mutation: {
    ...ticketMutations,
    ...authMutations
  },
  ...ticketTypeResolvers,
  ...holidayTypeResolvers
};
