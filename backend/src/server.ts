import { createYoga } from "graphql-yoga";
import { prisma } from "./db/client";
import { AuthService } from "./auth/auth.service";
import { SLAService } from "./sla/sla.service";
import { TicketService } from "./ticket/ticket.service";
import type { GraphQLContext } from "./context";
import { schema } from "./graphql/schema";

const authService = new AuthService(prisma);
const slaService = new SLAService(prisma);
const ticketService = new TicketService(prisma, slaService);

const yoga = createYoga<GraphQLContext>({
  schema,
  graphqlEndpoint: "/graphql",
  context: async ({ request }) => {
    const authorization = request.headers.get("authorization");

    let user: GraphQLContext["user"] = null;

    if (authorization?.startsWith("Bearer ")) {
      const token = authorization.slice("Bearer ".length).trim();

      try {
        const payload = await authService.verifyToken(token);

        user = {
          id: payload.sub,
          role: payload.role
        };
      } catch {
        user = null;
      }
    }

    return {
      prisma,
      authService,
      slaService,
      ticketService,
      request,
      user
    };
  }
});

const server = Bun.serve({
  fetch: (request: Request) => yoga.fetch(request),
  port: Number(Bun.env.PORT ?? 4000)
});

console.info(
  `GraphQL Yoga is running at http://localhost:${server.port}/graphql`
);