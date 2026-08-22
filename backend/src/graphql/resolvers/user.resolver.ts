import type { GraphQLContext } from "../../context";
import type { UserRole } from "@prisma/client";
import { ForbiddenError, UnauthorizedError } from "../../errors";

interface UsersQueryArgs {
  role?: UserRole;
}

export const userQueries = {
  users: async (_parent: unknown, args: UsersQueryArgs, context: GraphQLContext) => {
    if (!context.user) {
      throw new UnauthorizedError();
    }

    if (context.user.role !== "AGENT") {
      throw new ForbiddenError("Only an AGENT may view users");
    }

    return context.prisma.user.findMany({
      where: args.role ? { role: args.role } : undefined,
      orderBy: { name: "asc" }
    });
  }
};
