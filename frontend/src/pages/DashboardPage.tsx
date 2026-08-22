import { useEffect, useState, type ReactElement } from "react";
import { useAuth } from "../auth/AuthContext";
import { gqlRequest, GraphQLClientError } from "../graphql/client";
import { QUERY_DASHBOARD } from "../graphql/operations";
import type { TicketDashboard } from "../graphql/types";

interface StatCardProps {
  label: string;
  value: number;
  sub: string;
  icon: string;
  color: "blue" | "green" | "yellow" | "red";
}

function StatCard({ label, value, sub, icon, color }: StatCardProps): ReactElement {
  return (
    <div className={`stat-card ${color}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

export function DashboardPage(): ReactElement {
  const { token } = useAuth();
  const [dashboard, setDashboard] = useState<TicketDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    gqlRequest<{ dashboard: TicketDashboard }>(QUERY_DASHBOARD, {}, token)
      .then((data) => {
        if (!cancelled) setDashboard(data.dashboard);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof GraphQLClientError ? err.message : "Failed to load dashboard");
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Real-time ticket and SLA metrics</p>
      </div>
      <div className="page-body">
        {loading && <div className="spinner" />}
        {error && <div className="alert alert-error">{error}</div>}
        {dashboard && (
          <>
            <div className="stats-grid">
              <StatCard
                label="Open Tickets"
                value={dashboard.openTickets}
                sub="Awaiting action"
                icon="🎫"
                color="blue"
              />
              <StatCard
                label="In Progress"
                value={dashboard.inProgressTickets}
                sub="Being worked on"
                icon="⚙️"
                color="green"
              />
              <StatCard
                label="At Risk"
                value={dashboard.atRiskTickets}
                sub="SLA > 75% consumed"
                icon="⚠️"
                color="yellow"
              />
              <StatCard
                label="Breached"
                value={dashboard.breachedTickets}
                sub="SLA deadline missed"
                icon="🔥"
                color="red"
              />
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">SLA Health Overview</span>
              </div>
              <div className="card-body">
                {dashboard.breachedTickets > 0 && (
                  <div className="alert alert-error" style={{ marginBottom: 12 }}>
                    ⚠ {dashboard.breachedTickets} ticket{dashboard.breachedTickets > 1 ? "s have" : " has"} breached SLA. Immediate action required.
                  </div>
                )}
                {dashboard.atRiskTickets > 0 && dashboard.breachedTickets === 0 && (
                  <div
                    className="alert"
                    style={{
                      background: "var(--yellow-dim)",
                      color: "var(--yellow)",
                      border: "1px solid rgba(234,179,8,0.3)",
                      marginBottom: 12
                    }}
                  >
                    ⚠ {dashboard.atRiskTickets} ticket{dashboard.atRiskTickets > 1 ? "s are" : " is"} at risk of breaching SLA.
                  </div>
                )}
                {dashboard.breachedTickets === 0 && dashboard.atRiskTickets === 0 && (
                  <div className="alert alert-success">
                    ✓ All active tickets are within SLA targets.
                  </div>
                )}
                <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ textAlign: "center", padding: "12px", background: "var(--bg-base)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      {dashboard.openTickets + dashboard.inProgressTickets}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>Active tickets</div>
                  </div>
                  <div style={{ textAlign: "center", padding: "12px", background: "var(--bg-base)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "1.6rem", fontWeight: 700, color: dashboard.breachedTickets > 0 ? "var(--red)" : dashboard.atRiskTickets > 0 ? "var(--yellow)" : "var(--green)" }}>
                      {dashboard.breachedTickets > 0 ? "❌" : dashboard.atRiskTickets > 0 ? "⚠️" : "✅"}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>SLA status</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
