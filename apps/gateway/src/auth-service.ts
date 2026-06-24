import { randomBytes } from "node:crypto";
import type { AuthLoginCredential, AuthProvider, AuthRepository, UserRecord } from "@gotomemory/db";

export interface AuthLoginRequest {
  provider: AuthProvider;
  provider_user_id: string;
  email: string;
  name: string;
  avatar_url?: string;
  mock_access_token: string;
}

export interface AuthUserResponse {
  id: string;
  tenant_id: string;
  provider: AuthProvider;
  provider_user_id: string;
  email: string;
  name: string;
  avatar_url?: string;
}

export interface AuthLoginResponse {
  access_token: string;
  token_type: "Bearer";
  expires_at: string;
  user: AuthUserResponse;
}

export class AuthValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthValidationError";
  }
}

/** Thrown when mock OAuth login is attempted in an environment that has it disabled. */
export class AuthDisabledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthDisabledError";
  }
}

function token(): string {
  return `gtms_${randomBytes(24).toString("base64url")}`;
}

function toCredential(req: AuthLoginRequest): AuthLoginCredential {
  if (!req.mock_access_token.startsWith(`mock_${req.provider}_`)) {
    throw new AuthValidationError("mock credential does not match provider");
  }
  return {
    provider: req.provider,
    providerUserId: req.provider_user_id,
    email: req.email,
    name: req.name,
    ...(req.avatar_url ? { avatarUrl: req.avatar_url } : {}),
  };
}

function toUserResponse(user: UserRecord): AuthUserResponse {
  return {
    id: user.id,
    tenant_id: user.tenantId,
    provider: user.provider,
    provider_user_id: user.providerUserId,
    email: user.email,
    name: user.name,
    ...(user.avatarUrl ? { avatar_url: user.avatarUrl } : {}),
  };
}

export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly sessionTtlMs = 1000 * 60 * 60 * 24 * 7,
    /** Whether the mock OAuth login path is accepted. Must be off in production. */
    private readonly allowMockAuth = true,
  ) {}

  async login(req: AuthLoginRequest): Promise<AuthLoginResponse> {
    if (!this.allowMockAuth) {
      throw new AuthDisabledError("mock authentication is disabled in this environment");
    }
    const now = this.clock();
    const nowIso = now.toISOString();
    const user = await this.repo.upsertUser(toCredential(req), nowIso);
    const expiresAt = new Date(now.getTime() + this.sessionTtlMs).toISOString();
    const accessToken = token();
    await this.repo.createSession({
      token: accessToken,
      userId: user.id,
      tenantId: user.tenantId,
      createdAt: nowIso,
      expiresAt,
    });
    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_at: expiresAt,
      user: toUserResponse(user),
    };
  }

  async me(accessToken: string): Promise<AuthUserResponse | null> {
    const session = await this.repo.getSession(accessToken, this.clock().toISOString());
    if (!session) return null;
    const user = await this.repo.getUser(session.userId);
    return user ? toUserResponse(user) : null;
  }

  async logout(accessToken: string): Promise<boolean> {
    return this.repo.revokeSession(accessToken, this.clock().toISOString());
  }
}
