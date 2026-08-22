import { beforeAll, describe, expect, test } from "bun:test";
import { PrismaClient, UserRole } from "@prisma/client";
import { AuthService } from "../../src/auth/auth.service";
import {
  DuplicateEmailError,
  InvalidCredentialsError,
  UnauthorizedError,
  ValidationError
} from "../../src/errors";

const prisma = new PrismaClient();
const authService = new AuthService(prisma);

describe("AuthService Unit Tests", () => {
  const testUser = {
    name: "Auth Test User",
    email: "auth-test-user@example.com",
    password: "Password123!",
    role: UserRole.REPORTER
  };

  beforeAll(async () => {
    // Clean up test users to ensure idempotent runs
    const emailsToClean = [
      testUser.email,
      "safe-user@example.com",
      "duplicate-email-test@example.com"
    ];
    // Delete tickets referencing these users first (FK constraint)
    const usersToDelete = await prisma.user.findMany({
      where: { email: { in: emailsToClean } },
      select: { id: true }
    });
    const userIds = usersToDelete.map((u) => u.id);
    if (userIds.length > 0) {
      await prisma.comment.deleteMany({ where: { authorId: { in: userIds } } });
      await prisma.ticket.deleteMany({ where: { reporterId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  test("1. register creates user", async () => {
    const result = await authService.register(
      testUser.name,
      testUser.email,
      testUser.password,
      testUser.role
    );

    expect(result.token).toBeDefined();
    expect(result.user).toBeDefined();
    expect(result.user.id).toBeDefined();
    expect(result.user.name).toBe(testUser.name);
    expect(result.user.email).toBe(testUser.email);
    expect(result.user.role).toBe(testUser.role);

    // Verify persisted in DB
    const dbUser = await prisma.user.findUnique({
      where: { email: testUser.email }
    });
    expect(dbUser).not.toBeNull();
    expect(dbUser?.name).toBe(testUser.name);
  });

  test("2. register hashes password with bcrypt", async () => {
    const dbUser = await prisma.user.findUnique({
      where: { email: testUser.email }
    });

    expect(dbUser?.passwordHash).toBeDefined();
    expect(dbUser?.passwordHash).not.toBe(testUser.password);
    expect(dbUser?.passwordHash.startsWith("$2")).toBe(true); // bcrypt prefix
    const isValid = await Bun.password.verify(testUser.password, dbUser!.passwordHash);
    expect(isValid).toBe(true);
  });

  test("3. register does not expose password hash", async () => {
    const result = await authService.register(
      "Safe User",
      "safe-user@example.com",
      "Password123!",
      UserRole.AGENT
    );

    expect((result.user as any).passwordHash).toBeUndefined();
    expect((result.user as any).password).toBeUndefined();
  });

  test("4. duplicate email rejected", async () => {
    await prisma.user.upsert({
      where: { email: "duplicate-email-test@example.com" },
      update: {},
      create: {
        name: "Duplicate User",
        email: "duplicate-email-test@example.com",
        passwordHash: "dummyhash",
        role: UserRole.REPORTER
      }
    });

    expect(
      authService.register(
        "Another User",
        "duplicate-email-test@example.com",
        "Password123!",
        UserRole.AGENT
      )
    ).rejects.toBeInstanceOf(DuplicateEmailError);
  });

  test("5. login succeeds with correct credentials", async () => {
    const result = await authService.login(testUser.email, testUser.password);

    expect(result.token).toBeDefined();
    expect(result.user.email).toBe(testUser.email);
    expect(result.user.name).toBe(testUser.name);
  });

  test("6. login fails with wrong password", async () => {
    expect(
      authService.login(testUser.email, "WrongPassword123!")
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  test("7. login fails with unknown email", async () => {
    expect(
      authService.login("non-existent-user@example.com", "SomePassword123!")
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  test("8. generated JWT verifies correctly", async () => {
    const loginResult = await authService.login(testUser.email, testUser.password);
    const verified = await authService.verifyToken(loginResult.token);

    expect(verified.sub).toBe(loginResult.user.id);
    expect(verified.role).toBe(loginResult.user.role);
  });

  test("9. invalid JWT rejected", async () => {
    expect(
      authService.verifyToken("invalid.jwt.token")
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  test("validation: rejects empty fields", async () => {
    expect(
      authService.register("   ", "valid@example.com", "Password123!", UserRole.REPORTER)
    ).rejects.toBeInstanceOf(ValidationError);

    expect(
      authService.register("Valid Name", "invalid-email", "Password123!", UserRole.REPORTER)
    ).rejects.toBeInstanceOf(ValidationError);

    expect(
      authService.register("Valid Name", "valid@example.com", "123", UserRole.REPORTER)
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
