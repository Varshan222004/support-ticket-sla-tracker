import type { GraphQLContext } from "../../context";
import type { UserRole } from "@prisma/client";

interface RegisterArgs {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

interface LoginArgs {
  email: string;
  password: string;
}

export const authMutations = {
  register: async (
    _parent: unknown,
    args: RegisterArgs,
    context: GraphQLContext
  ) => {
    return context.authService.register(
      args.name,
      args.email,
      args.password,
      args.role
    );
  },

  login: async (
    _parent: unknown,
    args: LoginArgs,
    context: GraphQLContext
  ) => {
    return context.authService.login(args.email, args.password);
  }
};
