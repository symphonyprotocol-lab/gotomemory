export type AuthProvider = "google" | "github";

export interface AuthLoginCredential {
  provider: AuthProvider;
  providerUserId: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

export interface UserRecord {
  id: string;
  tenantId: string;
  provider: AuthProvider;
  providerUserId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  token: string;
  userId: string;
  tenantId: string;
  expiresAt: string;
  createdAt: string;
  revokedAt?: string;
}

export interface AuthRepository {
  upsertUser(credential: AuthLoginCredential, now: string): Promise<UserRecord>;
  createSession(session: SessionRecord): Promise<void>;
  getSession(token: string, now: string): Promise<SessionRecord | null>;
  getUser(id: string): Promise<UserRecord | null>;
  revokeSession(token: string, now: string): Promise<boolean>;
}

function cloneUser(user: UserRecord): UserRecord {
  return { ...user };
}

function cloneSession(session: SessionRecord): SessionRecord {
  return { ...session };
}

export class InMemoryAuthRepository implements AuthRepository {
  private readonly users = new Map<string, UserRecord>();
  private readonly usersByProvider = new Map<string, string>();
  private readonly sessions = new Map<string, SessionRecord>();

  private providerKey(provider: AuthProvider, providerUserId: string): string {
    return `${provider}:${providerUserId}`;
  }

  async upsertUser(credential: AuthLoginCredential, now: string): Promise<UserRecord> {
    const providerKey = this.providerKey(credential.provider, credential.providerUserId);
    const existingId = this.usersByProvider.get(providerKey);
    if (existingId) {
      const existing = this.users.get(existingId);
      if (existing) {
        const updated: UserRecord = {
          ...existing,
          email: credential.email,
          name: credential.name,
          ...(credential.avatarUrl ? { avatarUrl: credential.avatarUrl } : {}),
          updatedAt: now,
        };
        this.users.set(existing.id, updated);
        return cloneUser(updated);
      }
    }

    const user: UserRecord = {
      id: `usr_${credential.provider}_${credential.providerUserId}`,
      tenantId: "t1",
      provider: credential.provider,
      providerUserId: credential.providerUserId,
      email: credential.email,
      name: credential.name,
      ...(credential.avatarUrl ? { avatarUrl: credential.avatarUrl } : {}),
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    this.usersByProvider.set(providerKey, user.id);
    return cloneUser(user);
  }

  createSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.token, cloneSession(session));
    return Promise.resolve();
  }

  getSession(token: string, now: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(token);
    if (!session || session.revokedAt || Date.parse(session.expiresAt) <= Date.parse(now)) {
      return Promise.resolve(null);
    }
    return Promise.resolve(cloneSession(session));
  }

  getUser(id: string): Promise<UserRecord | null> {
    const user = this.users.get(id);
    return Promise.resolve(user ? cloneUser(user) : null);
  }

  revokeSession(token: string, now: string): Promise<boolean> {
    const session = this.sessions.get(token);
    if (!session || session.revokedAt) return Promise.resolve(false);
    this.sessions.set(token, { ...session, revokedAt: now });
    return Promise.resolve(true);
  }
}
