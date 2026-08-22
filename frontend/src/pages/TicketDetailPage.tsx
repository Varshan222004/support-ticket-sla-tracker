import {
  useEffect,
  useState,
  useCallback,
  type ReactElement,
  type FormEvent
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { gqlRequest, GraphQLClientError } from "../graphql/client";
import {
  QUERY_TICKET,
  QUERY_USERS,
  MUTATION_ASSIGN_TICKET,
  MUTATION_CHANGE_STATUS,
  MUTATION_RESOLVE_TICKET,
  MUTATION_ADD_COMMENT
} from "../graphql/operations";
import type { Ticket, Comment, User, TicketStatus } from "../graphql/types";
import {
  SLABadge,
  PriorityBadge,
  StatusBadge,
  formatDate,
  formatMinutes
} from "../components/Badges";

export function TicketDetailPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, user } = useAuth();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [agents, setAgents] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [commentContent, setCommentContent] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const [selectedAssignee, setSelectedAssignee] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<TicketStatus | "">("");

  const isAgent = user?.role === "AGENT";

  const loadTicket = useCallback(() => {
    if (!id) return;
    gqlRequest<{ ticket: Ticket | null }>(QUERY_TICKET, { id }, token)
      .then((data) => {
        setTicket(data.ticket);
        setComments(data.ticket?.comments ?? []);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof GraphQLClientError ? err.message : "Failed to load ticket");
      })
      .finally(() => setLoading(false));
  }, [id, token]);

  useEffect(() => {
    setLoading(true);
    loadTicket();
  }, [loadTicket]);

  useEffect(() => {
    if (isAgent) {
      gqlRequest<{ users: User[] }>(QUERY_USERS, { role: "AGENT" }, token)
        .then((d) => setAgents(d.users))
        .catch(() => null);
    }
  }, [isAgent, token]);

  const clearMessages = () => {
    setActionError(null);
    setActionSuccess(null);
  };

  const handleAssign = async () => {
    if (!selectedAssignee || !ticket) return;
    clearMessages();
    setActionLoading(true);
    try {
      const data = await gqlRequest<{ assignTicket: Ticket }>(
        MUTATION_ASSIGN_TICKET,
        { ticketId: ticket.id, assigneeId: selectedAssignee },
        token
      );
      setTicket(data.assignTicket);
      setActionSuccess("Ticket assigned successfully.");
      setSelectedAssignee("");
    } catch (err) {
      setActionError(err instanceof GraphQLClientError ? err.message : "Assignment failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangeStatus = async () => {
    if (!selectedStatus || !ticket) return;
    clearMessages();
    setActionLoading(true);
    try {
      const data = await gqlRequest<{ changeTicketStatus: Ticket }>(
        MUTATION_CHANGE_STATUS,
        { ticketId: ticket.id, status: selectedStatus },
        token
      );
      setTicket(data.changeTicketStatus);
      setActionSuccess(`Status changed to ${selectedStatus.replace("_", " ")}.`);
      setSelectedStatus("");
    } catch (err) {
      setActionError(err instanceof GraphQLClientError ? err.message : "Status change failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!ticket) return;
    if (!window.confirm("Mark this ticket as resolved?")) return;
    clearMessages();
    setActionLoading(true);
    try {
      const data = await gqlRequest<{ resolveTicket: Ticket }>(
        MUTATION_RESOLVE_TICKET,
        { ticketId: ticket.id },
        token
      );
      setTicket(data.resolveTicket);
      setActionSuccess("Ticket resolved.");
    } catch (err) {
      setActionError(err instanceof GraphQLClientError ? err.message : "Resolve failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!commentContent.trim() || !ticket) return;
    setCommentError(null);
    setCommentLoading(true);
    try {
      const data = await gqlRequest<{ addComment: Comment }>(
        MUTATION_ADD_COMMENT,
        { ticketId: ticket.id, content: commentContent.trim() },
        token
      );
      setCommentContent("");
      // Reload ticket to pick up the persisted comment and firstResponseAt.
      loadTicket();
    } catch (err) {
      setCommentError(err instanceof GraphQLClientError ? err.message : "Failed to post comment");
    } finally {
      setCommentLoading(false);
    }
  };

  if (loading) return <div className="spinner" style={{ marginTop: 80 }} />;

  if (error || !ticket) {
    return (
      <div className="page-body">
        <div className="alert alert-error">{error ?? "Ticket not found."}</div>
        <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginTop: 12 }}>
          ← Back
        </button>
      </div>
    );
  }

  const worstSLA: import("../graphql/types").SLAState =
    ticket.sla.resolutionState === "BREACHED" || ticket.sla.firstResponseState === "BREACHED"
      ? "BREACHED"
      : ticket.sla.resolutionState === "AT_RISK" || ticket.sla.firstResponseState === "AT_RISK"
      ? "AT_RISK"
      : "ON_TRACK";

  const allowedTransitions: Record<TicketStatus, TicketStatus[]> = {
    OPEN: ["IN_PROGRESS"],
    IN_PROGRESS: ["RESOLVED"],
    RESOLVED: ["CLOSED"],
    CLOSED: []
  };
  const nextStatuses = allowedTransitions[ticket.status];

  return (
    <>
      <div className="page-header">
        <button className="back-link" onClick={() => navigate("/tickets")}>
          ← Back to Tickets
        </button>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <h1 className="page-title" style={{ flex: 1 }}>{ticket.title}</h1>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, paddingTop: 4 }}>
            <PriorityBadge priority={ticket.priority} />
            <StatusBadge status={ticket.status} />
            <SLABadge state={worstSLA} />
          </div>
        </div>
      </div>

      <div className="page-body">
        {actionError && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>{actionError}</div>
        )}
        {actionSuccess && (
          <div className="alert alert-success" style={{ marginBottom: 16 }}>{actionSuccess}</div>
        )}

        <div className="detail-grid">
          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Description */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Description</span>
              </div>
              <div className="card-body">
                <p className="description-text">{ticket.description}</p>
              </div>
            </div>

            {/* SLA Info */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">SLA Information</span>
              </div>
              <div className="card-body">
                <div className="sla-panel">
                  <div className="sla-clock">
                    <div className="sla-clock-label">First Response</div>
                    <SLABadge state={ticket.sla.firstResponseState} />
                    <div className="sla-clock-due" style={{ marginTop: 8 }}>
                      Due: {formatDate(ticket.sla.firstResponseDueAt)}
                    </div>
                    {ticket.firstResponseAt ? (
                      <div className="sla-clock-remaining" style={{ color: "var(--green)" }}>
                        ✓ Responded {formatDate(ticket.firstResponseAt)}
                      </div>
                    ) : (
                      <div
                        className="sla-clock-remaining"
                        style={{
                          color:
                            ticket.sla.firstResponseState === "BREACHED"
                              ? "var(--red)"
                              : ticket.sla.firstResponseState === "AT_RISK"
                              ? "var(--yellow)"
                              : "var(--green)"
                        }}
                      >
                        {formatMinutes(ticket.sla.firstResponseRemainingMinutes)} remaining
                      </div>
                    )}
                  </div>

                  <div className="sla-clock">
                    <div className="sla-clock-label">Resolution</div>
                    <SLABadge state={ticket.sla.resolutionState} />
                    <div className="sla-clock-due" style={{ marginTop: 8 }}>
                      Due: {formatDate(ticket.sla.resolutionDueAt)}
                    </div>
                    {ticket.resolvedAt ? (
                      <div className="sla-clock-remaining" style={{ color: "var(--green)" }}>
                        ✓ Resolved {formatDate(ticket.resolvedAt)}
                      </div>
                    ) : (
                      <div
                        className="sla-clock-remaining"
                        style={{
                          color:
                            ticket.sla.resolutionState === "BREACHED"
                              ? "var(--red)"
                              : ticket.sla.resolutionState === "AT_RISK"
                              ? "var(--yellow)"
                              : "var(--green)"
                        }}
                      >
                        {formatMinutes(ticket.sla.resolutionRemainingMinutes)} remaining
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Comments */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">
                  Comments {comments.length > 0 && `(${comments.length})`}
                </span>
              </div>
              <div className="card-body">
                {comments.length === 0 ? (
                  <div
                    className="empty-state"
                    style={{ padding: "24px 0" }}
                  >
                    <div className="empty-state-icon" style={{ fontSize: "1.5rem" }}>💬</div>
                    <div className="empty-state-title" style={{ fontSize: "0.9rem" }}>No comments yet</div>
                    <p style={{ fontSize: "0.8rem" }}>Add the first comment below.</p>
                  </div>
                ) : (
                  <div className="comment-list">
                    {comments.map((c) => (
                      <div key={c.id} className={`comment-item ${c.author.role === "AGENT" ? "agent-comment" : "reporter-comment"}`}>
                        <div className="comment-meta">
                          <span className="comment-author">{c.author.name}</span>
                          <span className={`user-role-badge ${c.author.role === "AGENT" ? "agent" : "reporter"}`}>
                            {c.author.role}
                          </span>
                          <span className="comment-time">{formatDate(c.createdAt)}</span>
                        </div>
                        <div className="comment-content">{c.content}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add comment form */}
                {ticket.status !== "CLOSED" && (
                  <form onSubmit={handleAddComment} style={{ marginTop: 16 }}>
                    <div className="form-group">
                      <textarea
                        className="form-textarea"
                        placeholder="Write a comment…"
                        value={commentContent}
                        onChange={(e) => setCommentContent(e.target.value)}
                        style={{ minHeight: 80 }}
                      />
                    </div>
                    {commentError && (
                      <div className="form-error" style={{ marginTop: 4 }}>{commentError}</div>
                    )}
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={commentLoading || !commentContent.trim()}
                      style={{ marginTop: 8 }}
                    >
                      {commentLoading ? "Posting…" : "Post Comment"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>

          {/* Right column — metadata + agent actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Metadata */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Details</span>
              </div>
              <div className="card-body">
                <div className="form-stack">
                  <div className="detail-meta-row">
                    <span className="detail-meta-label">Reporter</span>
                    <span className="detail-meta-value">{ticket.reporter.name}</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {ticket.reporter.email}
                    </span>
                  </div>
                  <div className="detail-meta-row">
                    <span className="detail-meta-label">Assignee</span>
                    <span className="detail-meta-value">
                      {ticket.assignee
                        ? `${ticket.assignee.name}`
                        : <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Unassigned</span>
                      }
                    </span>
                  </div>
                  <div className="detail-meta-row">
                    <span className="detail-meta-label">Created</span>
                    <span className="detail-meta-value">{formatDate(ticket.createdAt)}</span>
                  </div>
                  {ticket.firstResponseAt && (
                    <div className="detail-meta-row">
                      <span className="detail-meta-label">First Response</span>
                      <span className="detail-meta-value">{formatDate(ticket.firstResponseAt)}</span>
                    </div>
                  )}
                  {ticket.resolvedAt && (
                    <div className="detail-meta-row">
                      <span className="detail-meta-label">Resolved At</span>
                      <span className="detail-meta-value">{formatDate(ticket.resolvedAt)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Agent actions */}
            {isAgent && ticket.status !== "CLOSED" && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Agent Actions</span>
                </div>
                <div className="card-body">
                  <div className="form-stack">
                    {/* Assign */}
                    <div className="form-group">
                      <label className="form-label">Assign To</label>
                      <select
                        className="form-select"
                        value={selectedAssignee}
                        onChange={(e) => setSelectedAssignee(e.target.value)}
                      >
                        <option value="">Select agent…</option>
                        {agents.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={handleAssign}
                        disabled={!selectedAssignee || actionLoading}
                        style={{ marginTop: 6 }}
                      >
                        Assign
                      </button>
                    </div>

                    {/* Change status */}
                    {nextStatuses.length > 0 && ticket.status !== "RESOLVED" && (
                      <div className="form-group">
                        <label className="form-label">Change Status</label>
                        <select
                          className="form-select"
                          value={selectedStatus}
                          onChange={(e) => setSelectedStatus(e.target.value as TicketStatus)}
                        >
                          <option value="">Select status…</option>
                          {nextStatuses.map((s) => (
                            <option key={s} value={s}>{s.replace("_", " ")}</option>
                          ))}
                        </select>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={handleChangeStatus}
                          disabled={!selectedStatus || actionLoading}
                          style={{ marginTop: 6 }}
                        >
                          Update Status
                        </button>
                      </div>
                    )}

                    {/* Resolve */}
                    {ticket.status === "IN_PROGRESS" && (
                      <div className="divider" />
                    )}
                    {ticket.status === "IN_PROGRESS" && (
                      <button
                        className="btn btn-primary"
                        onClick={handleResolve}
                        disabled={actionLoading}
                        id="resolve-ticket-btn"
                      >
                        ✓ Mark as Resolved
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
