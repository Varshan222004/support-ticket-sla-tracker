import { useState, type ReactElement, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, GraphQLClientError } from "../auth/AuthContext";

export function LoginPage(): ReactElement {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) { setError("Email is required"); return; }
    if (!password) { setError("Password is required"); return; }

    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof GraphQLClientError) {
        if (err.code === "INVALID_CREDENTIALS") {
          setError("Invalid email or password. Please try again.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Unable to connect to server. Is the backend running?");
      }
    } finally {
      setLoading(false);
    }
  };

  if (showRegister) return <RegisterPage onBack={() => setShowRegister(false)} />;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">🎫</div>
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">Sign in to your Support Tracker account</p>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 20 }}>{error}</div>}

        <form onSubmit={handleSubmit} className="form-stack" noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button
            id="login-submit"
            type="submit"
            className="btn btn-primary btn-full"
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <div className="auth-switch">
          Don't have an account?{" "}
          <button onClick={() => setShowRegister(true)}>Create account</button>
        </div>
      </div>
    </div>
  );
}

interface RegisterPageProps {
  onBack?: () => void;
}

export function RegisterPage({ onBack }: RegisterPageProps): ReactElement {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"REPORTER" | "AGENT">("REPORTER");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError("Name is required"); return; }
    if (!email.trim()) { setError("Email is required"); return; }
    if (!email.includes("@")) { setError("Enter a valid email address"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }

    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password, role);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof GraphQLClientError) {
        if (err.code === "DUPLICATE_EMAIL") {
          setError("An account with this email already exists.");
        } else if (err.code === "VALIDATION_ERROR") {
          setError(`Validation failed: ${err.message}`);
        } else {
          setError(err.message);
        }
      } else {
        setError("Unable to connect to server. Is the backend running?");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">🎫</div>
          <h1 className="auth-title">Create account</h1>
          <p className="auth-subtitle">Join the Support Tracker platform</p>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 20 }}>{error}</div>}

        <form onSubmit={handleSubmit} className="form-stack" noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="reg-name">Full Name</label>
            <input
              id="reg-name"
              type="text"
              className="form-input"
              placeholder="Jane Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              autoComplete="name"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-email">Email</label>
            <input
              id="reg-email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-password">Password</label>
            <input
              id="reg-password"
              type="password"
              className="form-input"
              placeholder="Min. 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-role">Role</label>
            <select
              id="reg-role"
              className="form-select"
              value={role}
              onChange={(e) => setRole(e.target.value as "REPORTER" | "AGENT")}
            >
              <option value="REPORTER">Reporter — submit and track tickets</option>
              <option value="AGENT">Agent — manage and resolve tickets</option>
            </select>
          </div>

          <button
            id="register-submit"
            type="submit"
            className="btn btn-primary btn-full"
            disabled={loading}
          >
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <div className="auth-switch">
          Already have an account?{" "}
          <button onClick={onBack ?? (() => navigate("/login"))}>Sign in</button>
        </div>
      </div>
    </div>
  );
}
