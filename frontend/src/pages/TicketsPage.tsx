import { useEffect, useState, type ReactElement, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { gqlRequest, GraphQLClientError } from "../graphql/client";
import { QUERY_TICKETS } from "../graphql/operations";
import type {
  Ticket,
  TicketConnection,
  TicketStatus,
  Priority,
  SLAState
} from "../graphql/types";
import { SLABadge, PriorityBadge, StatusBadge, formatDate } from "../components/Badges";

const PAGE_SIZE = 20;

interface Filters {
  status: TicketStatus | "";
  priority: Priority | "";
  slaState: SLAState | "";
}

export function TicketsPage(): ReactElement {
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [connection, setConnection] = useState<TicketConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    status: "",
    priority: "",
    slaState: ""
  });

  const fetchTickets = (overrideCursor?: string | null) => {
    setLoading(true);
    setError(null);

    const vars: Record<string, unknown> = {
      take: PAGE_SIZE,
      cursor: overrideCursor !== undefined ? overrideCursor : cursor
    };
    if (filters.status) vars.status = filters.status;
    if (filters.priority) vars.priority = filters.priority;
    if (filters.slaState) vars.slaState = filters.slaState;

    gqlRequest<{ tickets: TicketConnection }>(QUERY_TICKETS, vars, token)
      .then((data) => setConnection(data.tickets))
      .catch((err) => {
        setError(err instanceof GraphQLClientError ? err.message : "Failed to load tickets");
      })
      .finally(() => setLoading(false));
  };

  // Re-fetch when filters change, reset cursor
  useEffect(() => {
    setCursor(null);
    fetchTickets(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, token]);

  const handleFilterChange =
    <K extends keyof Filters>(key: K) =>
    (e: ChangeEvent<HTMLSelectElement>) => {
      setFilters((f) => ({ ...f, [key]: e.target.value as Filters[K] }));
    };

  const loadMore = () => {
    const next = connection?.pageInfo.endCursor ?? null;
    setCursor(next);
    fetchTickets(next);
  };

  const tickets: Ticket[] = connection?.nodes ?? [];

  return (
    <>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 className="page-title">Tickets</h1>
            <p className="page-subtitle">
              {user?.role === "AGENT" ? "All support tickets" : "Your support tickets"} with real-time SLA status
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => navigate("/tickets/new")}
            style={{ marginTop: 4 }}
          >
            + New Ticket
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Filters */}
        <div className="filters-bar">
          <select
            className="filter-select"
            value={filters.status}
            onChange={handleFilterChange("status")}
            aria-label="Filter by status"
          >
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>

          <select
            className="filter-select"
            value={filters.priority}
            onChange={handleFilterChange("priority")}
            aria-label="Filter by priority"
          >
            <option value="">All Priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <select
            className="filter-select"
            value={filters.slaState}
            onChange={handleFilterChange("slaState")}
            aria-label="Filter by SLA state"
          >
            <option value="">All SLA States</option>
            <option value="ON_TRACK">On Track</option>
            <option value="AT_RISK">At Risk</option>
            <option value="BREACHED">Breached</option>
          </select>

          {(filters.status || filters.priority || filters.slaState) && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setFilters({ status: "", priority: "", slaState: "" })}
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Error */}
        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        {/* Table */}
        {loading && tickets.length === 0 ? (
          <div className="spinner" />
        ) : tickets.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🎫</div>
            <div className="empty-state-title">No tickets found</div>
            <p>Try adjusting your filters or create a new ticket.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>SLA</th>
                  <th>Reporter</th>
                  <th>Assignee</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id} onClick={() => navigate(`/tickets/${ticket.id}`)}>
                    <td>
                      <span className="table-link">{ticket.title}</span>
                    </td>
                    <td><PriorityBadge priority={ticket.priority} /></td>
                    <td><StatusBadge status={ticket.status} /></td>
                    <td>
                      <SLABadge state={
                        ticket.sla.resolutionState === "BREACHED" ||
                        ticket.sla.firstResponseState === "BREACHED"
                          ? "BREACHED"
                          : ticket.sla.resolutionState === "AT_RISK" ||
                            ticket.sla.firstResponseState === "AT_RISK"
                          ? "AT_RISK"
                          : "ON_TRACK"
                      } />
                    </td>
                    <td style={{ color: "var(--text-secondary)" }}>{ticket.reporter.name}</td>
                    <td style={{ color: "var(--text-muted)" }}>
                      {ticket.assignee?.name ?? <span style={{ fontStyle: "italic", opacity: 0.5 }}>Unassigned</span>}
                    </td>
                    <td style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {formatDate(ticket.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {connection?.pageInfo.hasNextPage && (
              <div className="pagination">
                <span>{tickets.length} tickets loaded</span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={loadMore}
                  disabled={loading}
                >
                  {loading ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
            {!connection?.pageInfo.hasNextPage && tickets.length > 0 && (
              <div className="pagination">
                <span>{tickets.length} total ticket{tickets.length !== 1 ? "s" : ""}</span>
                <span>End of list</span>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
