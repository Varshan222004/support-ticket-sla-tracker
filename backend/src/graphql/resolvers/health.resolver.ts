import type { GraphQLContext } from "../../context";

export const healthResolver = {
  health: (_parent: unknown, _args: Record<string, never>, _context: GraphQLContext): string => "ok"
};
