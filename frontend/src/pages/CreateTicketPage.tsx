import { useState, type FormEvent, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { gqlRequest, GraphQLClientError } from "../graphql/client";
import { MUTATION_CREATE_TICKET } from "../graphql/operations";
import type { Priority, Ticket } from "../graphql/types";

export function CreateTicketPage(): ReactElement {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!title.trim() || !description.trim()) {
      setError("Title and description are required.");
      return;
    }

    setLoading(true);
    try {
      const data = await gqlRequest<{ createTicket: Ticket }>(
        MUTATION_CREATE_TICKET,
        { title: title.trim(), description: description.trim(), priority },
        token
      );
      navigate(`/tickets/${data.createTicket.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof GraphQLClientError ? err.message : "Failed to create ticket.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <button className="back-link" onClick={() => navigate("/tickets")}>← Back to Tickets</button>
        <h1 className="page-title">Create Ticket</h1>
        <p className="page-subtitle">Describe the issue so the support team can help.</p>
      </div>
      <div className="page-body">
        <div className="card create-ticket-card" style={{ maxWidth: 760 }}>
          <div className="card-body">
            {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
            <form className="form-stack" onSubmit={handleSubmit} noValidate>
              <div className="form-group">
                <label className="form-label" htmlFor="ticket-title">Title</label>
                <input id="ticket-title" className="form-input" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="ticket-priority">Priority</label>
                <select id="ticket-priority" className="form-select" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="ticket-description">Description</label>
                <textarea id="ticket-description" className="form-textarea" value={description} onChange={(event) => setDescription(event.target.value)} style={{ minHeight: 160 }} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? "Creating…" : "Create Ticket"}</button>
                <button type="button" className="btn btn-secondary" onClick={() => navigate("/tickets")} disabled={loading}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
