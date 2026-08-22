import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
  type ReactElement
} from "react";
import type { User } from "../graphql/types";
import { gqlRequest, GraphQLClientError, UNAUTHORIZED_EVENT } from "../graphql/client";
import {
  MUTATION_LOGIN,
  MUTATION_REGISTER
} from "../graphql/operations";
import type { AuthPayload, UserRole } from "../graphql/types";

const TOKEN_KEY = "support_tracker_token";
const USER_KEY = "support_tracker_user";

interface AuthState {
  user: User | null;
  token: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role: UserRole) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const [state, setState] = useState<AuthState>(() => {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const userRaw = localStorage.getItem(USER_KEY);
      if (token && userRaw) {
        return { token, user: JSON.parse(userRaw) as User };
      }
    } catch {
      // corrupt storage — clear it
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
    return { token: null, user: null };
  });

  // Keep storage in sync whenever state changes
  useEffect(() => {
    if (state.token && state.user) {
      localStorage.setItem(TOKEN_KEY, state.token);
      localStorage.setItem(USER_KEY, JSON.stringify(state.user));
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  }, [state]);

  useEffect(() => {
    const clearExpiredSession = () => setState({ token: null, user: null });
    window.addEventListener(UNAUTHORIZED_EVENT, clearExpiredSession);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, clearExpiredSession);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await gqlRequest<{ login: AuthPayload }>(
      MUTATION_LOGIN,
      { email, password }
    );
    setState({ token: data.login.token, user: data.login.user });
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string, role: UserRole) => {
      const data = await gqlRequest<{ register: AuthPayload }>(
        MUTATION_REGISTER,
        { name, email, password, role }
      );
      setState({ token: data.register.token, user: data.register.user });
    },
    []
  );

  const logout = useCallback(() => {
    setState({ token: null, user: null });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        isAuthenticated: state.token !== null && state.user !== null
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// Re-export for convenience in other files
export { GraphQLClientError };
