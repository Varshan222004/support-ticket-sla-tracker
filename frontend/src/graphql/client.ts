// Lightweight fetch-based GraphQL client — no Apollo, no large framework

const GRAPHQL_ENDPOINT = "http://localhost:4000/graphql";
export const UNAUTHORIZED_EVENT = "support-tracker:unauthorized";

export interface GraphQLError {
  message: string;
  extensions?: { code?: string };
}

export class GraphQLClientError extends Error {
  constructor(
    message: string,
    public readonly errors: GraphQLError[],
    public readonly code?: string
  ) {
    super(message);
    this.name = "GraphQLClientError";
  }
}

export async function gqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
  token?: string | null
): Promise<T> {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    throw new GraphQLClientError(
      `HTTP error ${response.status}`,
      [{ message: `Server responded with ${response.status}` }]
    );
  }

  const json = await response.json();

  if (json.errors && json.errors.length > 0) {
    const first = json.errors[0] as GraphQLError;
    if (first.extensions?.code === "UNAUTHORIZED") {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new GraphQLClientError(
      first.message,
      json.errors as GraphQLError[],
      first.extensions?.code
    );
  }

  return json.data as T;
}
