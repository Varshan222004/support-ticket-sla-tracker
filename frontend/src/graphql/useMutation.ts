import { useState, useCallback } from "react";
import { useAuth } from "../auth/AuthContext";
import { gqlRequest, GraphQLClientError } from "../graphql/client";

interface UseMutationResult<TData, TVariables> {
  mutate: (variables: TVariables) => Promise<TData | null>;
  loading: boolean;
  error: string | null;
  errorCode: string | null;
  reset: () => void;
}

export function useMutation<TData, TVariables = Record<string, unknown>>(
  query: string
): UseMutationResult<TData, TVariables> {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const reset = useCallback(() => {
    setError(null);
    setErrorCode(null);
  }, []);

  const mutate = useCallback(
    async (variables: TVariables): Promise<TData | null> => {
      setLoading(true);
      setError(null);
      setErrorCode(null);
      try {
        const data = await gqlRequest<TData>(
          query,
          variables as Record<string, unknown>,
          token
        );
        return data;
      } catch (err) {
        if (err instanceof GraphQLClientError) {
          setError(err.message);
          setErrorCode(err.code ?? null);
        } else {
          setError("An unexpected error occurred");
        }
        return null;
      } finally {
        setLoading(false);
      }
    },
    [query, token]
  );

  return { mutate, loading, error, errorCode, reset };
}
