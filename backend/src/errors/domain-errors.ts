import { GraphQLError } from "graphql";

export type DomainErrorCode =
  | "VALIDATION_ERROR"
  | "TICKET_NOT_FOUND"
  | "USER_NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_STATUS_TRANSITION"
  | "INVALID_COMMENT"
  | "INVALID_CREDENTIALS"
  | "DUPLICATE_EMAIL";

export class DomainError extends GraphQLError {
  readonly code: DomainErrorCode;

  constructor(message: string, code: DomainErrorCode) {
    super(message, {
      extensions: {
        code
      }
    });
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
  }
}

export class TicketNotFoundError extends DomainError {
  constructor(ticketId: string) {
    super(`Ticket with ID '${ticketId}' was not found`, "TICKET_NOT_FOUND");
  }
}

export class UserNotFoundError extends DomainError {
  constructor(userId: string) {
    super(`User with ID '${userId}' was not found`, "USER_NOT_FOUND");
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "Authentication is required to perform this action") {
    super(message, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "You do not have permission to perform this action") {
    super(message, "FORBIDDEN");
  }
}

export class InvalidStatusTransitionError extends DomainError {
  constructor(currentStatus: string, targetStatus: string) {
    super(
      `Cannot transition ticket from '${currentStatus}' to '${targetStatus}'`,
      "INVALID_STATUS_TRANSITION"
    );
  }
}

export class InvalidCommentError extends DomainError {
  constructor(message = "Comment content cannot be empty or whitespace") {
    super(message, "INVALID_COMMENT");
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor(message = "Invalid email or password") {
    super(message, "INVALID_CREDENTIALS");
  }
}

export class DuplicateEmailError extends DomainError {
  constructor(message = "A user with this email already exists") {
    super(message, "DUPLICATE_EMAIL");
  }
}
