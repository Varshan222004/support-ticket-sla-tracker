// All GraphQL operations in one place. Only use fields that exist in root.graphql.

export const USER_FIELDS = `
  id
  name
  email
  role
`;

export const SLA_FIELDS = `
  firstResponseDueAt
  resolutionDueAt
  firstResponseState
  resolutionState
  firstResponseRemainingMinutes
  resolutionRemainingMinutes
`;

export const TICKET_FIELDS = `
  id
  title
  description
  priority
  status
  reporter { ${USER_FIELDS} }
  assignee { ${USER_FIELDS} }
  createdAt
  firstResponseAt
  resolvedAt
  sla { ${SLA_FIELDS} }
`;

export const COMMENT_FIELDS = `
  id
  content
  author { ${USER_FIELDS} }
  createdAt
`;

// ── Queries ────────────────────────────────────────────────

export const QUERY_DASHBOARD = `
  query Dashboard {
    dashboard {
      openTickets
      inProgressTickets
      atRiskTickets
      breachedTickets
    }
  }
`;

export const QUERY_TICKETS = `
  query Tickets(
    $status: TicketStatus
    $priority: Priority
    $assigneeId: ID
    $slaState: SLAState
    $take: Int
    $cursor: String
  ) {
    tickets(
      status: $status
      priority: $priority
      assigneeId: $assigneeId
      slaState: $slaState
      take: $take
      cursor: $cursor
    ) {
      nodes { ${TICKET_FIELDS} }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const QUERY_TICKET = `
  query Ticket($id: ID!) {
    ticket(id: $id) {
      ${TICKET_FIELDS}
      comments { ${COMMENT_FIELDS} }
    }
  }
`;

export const QUERY_USERS = `
  query Users($role: UserRole) {
    users(role: $role) { ${USER_FIELDS} }
  }
`;

// ── Mutations ──────────────────────────────────────────────

export const MUTATION_LOGIN = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      user { ${USER_FIELDS} }
    }
  }
`;

export const MUTATION_REGISTER = `
  mutation Register($name: String!, $email: String!, $password: String!, $role: UserRole!) {
    register(name: $name, email: $email, password: $password, role: $role) {
      token
      user { ${USER_FIELDS} }
    }
  }
`;

export const MUTATION_CREATE_TICKET = `
  mutation CreateTicket($title: String!, $description: String!, $priority: Priority!) {
    createTicket(title: $title, description: $description, priority: $priority) {
      ${TICKET_FIELDS}
    }
  }
`;

export const MUTATION_ASSIGN_TICKET = `
  mutation AssignTicket($ticketId: ID!, $assigneeId: ID!) {
    assignTicket(ticketId: $ticketId, assigneeId: $assigneeId) {
      ${TICKET_FIELDS}
    }
  }
`;

export const MUTATION_CHANGE_STATUS = `
  mutation ChangeTicketStatus($ticketId: ID!, $status: TicketStatus!) {
    changeTicketStatus(ticketId: $ticketId, status: $status) {
      ${TICKET_FIELDS}
    }
  }
`;

export const MUTATION_RESOLVE_TICKET = `
  mutation ResolveTicket($ticketId: ID!) {
    resolveTicket(ticketId: $ticketId) {
      ${TICKET_FIELDS}
    }
  }
`;

export const MUTATION_ADD_COMMENT = `
  mutation AddComment($ticketId: ID!, $content: String!) {
    addComment(ticketId: $ticketId, content: $content) {
      ${COMMENT_FIELDS}
    }
  }
`;
