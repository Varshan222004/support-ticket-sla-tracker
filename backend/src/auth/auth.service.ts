import { PrismaClient, UserRole } from "@prisma/client";
import { SignJWT, jwtVerify } from "jose";
import {
  DuplicateEmailError,
  InvalidCredentialsError,
  UnauthorizedError,
  ValidationError
} from "../errors";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuthPayload {
  token: string;
  user: AuthUser;
}

export interface JwtUserPayload {
  sub: string;
  role: UserRole;
  email: string;
}

export class AuthService {
  private readonly secret: Uint8Array;
  private readonly expiration: string;

  constructor(
    private readonly prisma: PrismaClient,
    jwtSecret?: string,
    jwtExpiration?: string
  ) {
    const rawSecret =
      jwtSecret ||
      Bun.env.JWT_SECRET ||
      process.env.JWT_SECRET;

    if (!rawSecret) {
      throw new Error("JWT_SECRET environment variable is required");
    }

    this.secret = new TextEncoder().encode(rawSecret);
    this.expiration =
      jwtExpiration ||
      Bun.env.JWT_EXPIRATION ||
      process.env.JWT_EXPIRATION ||
      "7d";
  }

  async register(
    name: string,
    email: string,
    password: string,
    role: UserRole
  ): Promise<AuthPayload> {
    const normalizedName = name?.trim();
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedName) {
      throw new ValidationError("Name cannot be empty or whitespace");
    }

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new ValidationError("A valid email address is required");
    }

    if (!password || !password.trim()) {
      throw new ValidationError("Password cannot be empty or whitespace");
    }

    if (password.length < 6) {
      throw new ValidationError("Password must be at least 6 characters long");
    }

    if (!Object.values(UserRole).includes(role)) {
      throw new ValidationError("Invalid user role");
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingUser) {
      throw new DuplicateEmailError(`A user with email '${normalizedEmail}' already exists`);
    }

    const passwordHash = await Bun.password.hash(password, {
      algorithm: "bcrypt",
      cost: 10
    });

    const user = await this.prisma.user.create({
      data: {
        name: normalizedName,
        email: normalizedEmail,
        passwordHash,
        role
      }
    });

    const authUser: AuthUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    const token = await this.createToken(authUser);

    return {
      token,
      user: authUser
    };
  }

  async login(email: string, password: string): Promise<AuthPayload> {
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      throw new InvalidCredentialsError();
    }

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!user) {
      throw new InvalidCredentialsError();
    }

    const passwordValid = await Bun.password.verify(
      password,
      user.passwordHash
    );

    if (!passwordValid) {
      throw new InvalidCredentialsError();
    }

    const authUser: AuthUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    const token = await this.createToken(authUser);

    return {
      token,
      user: authUser
    };
  }

  async verifyToken(token: string): Promise<JwtUserPayload> {
    try {
      const { payload } = await jwtVerify(token, this.secret);

      if (
        typeof payload.sub !== "string" ||
        (payload.role !== UserRole.REPORTER && payload.role !== UserRole.AGENT)
      ) {
        throw new UnauthorizedError("Invalid token payload");
      }

      return {
        sub: payload.sub,
        role: payload.role as UserRole,
        email: typeof payload.email === "string" ? payload.email : ""
      };
    } catch (err: unknown) {
      if (err instanceof UnauthorizedError) {
        throw err;
      }
      throw new UnauthorizedError("Invalid or expired authentication token");
    }
  }

  private async createToken(user: AuthUser): Promise<string> {
    return new SignJWT({
      role: user.role,
      email: user.email
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime(this.expiration)
      .sign(this.secret);
  }
}