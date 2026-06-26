import type { SharedConversation } from "@gotomemory/contracts";

export interface ShareRecord extends SharedConversation {
  password_hash?: string;
  messages_object_key?: string;
}

export interface ShareRepository {
  create(record: ShareRecord): Promise<ShareRecord>;
  listByUser(userId: string): Promise<ShareRecord[]>;
  getById(id: string): Promise<ShareRecord | undefined>;
  findBySlug(slug: string): Promise<ShareRecord | undefined>;
  update(record: ShareRecord): Promise<ShareRecord>;
}

export interface ObjectStorage {
  put(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | undefined>;
  delete(key: string): Promise<void>;
}

export class InMemoryShareRepository implements ShareRepository {
  readonly records = new Map<string, ShareRecord>();

  async create(record: ShareRecord): Promise<ShareRecord> {
    this.records.set(record.id, clone(record));
    return clone(record);
  }

  async listByUser(userId: string): Promise<ShareRecord[]> {
    return [...this.records.values()].filter((record) => record.user_id === userId).map(clone);
  }

  async getById(id: string): Promise<ShareRecord | undefined> {
    const record = this.records.get(id);
    return record ? clone(record) : undefined;
  }

  async findBySlug(slug: string): Promise<ShareRecord | undefined> {
    const record = [...this.records.values()].find((item) => item.slug === slug);
    return record ? clone(record) : undefined;
  }

  async update(record: ShareRecord): Promise<ShareRecord> {
    this.records.set(record.id, clone(record));
    return clone(record);
  }
}

export class MemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, string>();

  async put(key: string, value: string): Promise<void> {
    this.objects.set(key, value);
  }

  async get(key: string): Promise<string | undefined> {
    return this.objects.get(key);
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

export class ObjectBackedShareRepository implements ShareRepository {
  readonly #base: ShareRepository;
  readonly #storage: ObjectStorage;
  readonly #maxInlineBytes: number;

  constructor(base: ShareRepository, storage: ObjectStorage, maxInlineBytes = 64 * 1024) {
    this.#base = base;
    this.#storage = storage;
    this.#maxInlineBytes = maxInlineBytes;
  }

  async create(record: ShareRecord): Promise<ShareRecord> {
    return this.#base.create(await this.#externalize(record));
  }

  async listByUser(userId: string): Promise<ShareRecord[]> {
    return Promise.all(
      (await this.#base.listByUser(userId)).map((record) => this.#hydrate(record))
    );
  }

  async getById(id: string): Promise<ShareRecord | undefined> {
    return this.#hydrateMaybe(await this.#base.getById(id));
  }

  async findBySlug(slug: string): Promise<ShareRecord | undefined> {
    return this.#hydrateMaybe(await this.#base.findBySlug(slug));
  }

  async update(record: ShareRecord): Promise<ShareRecord> {
    if (record.status === "deleted" && record.messages_object_key) {
      await this.#storage.delete(record.messages_object_key);
    }
    return this.#hydrate(await this.#base.update(await this.#externalize(record)));
  }

  async #externalize(record: ShareRecord): Promise<ShareRecord> {
    const serialized = JSON.stringify(record.messages);
    if (serialized.length <= this.#maxInlineBytes || record.messages_object_key) {
      return clone(record);
    }

    const key = `shares/${record.user_id}/${record.id}/messages.json`;
    await this.#storage.put(key, serialized);
    return {
      ...record,
      messages: [],
      messages_object_key: key
    };
  }

  async #hydrateMaybe(record: ShareRecord | undefined): Promise<ShareRecord | undefined> {
    return record ? this.#hydrate(record) : undefined;
  }

  async #hydrate(record: ShareRecord): Promise<ShareRecord> {
    if (!record.messages_object_key) {
      return clone(record);
    }

    const stored = await this.#storage.get(record.messages_object_key);
    return {
      ...record,
      messages: stored ? JSON.parse(stored) : []
    };
  }
}

export interface SqlClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export class PostgresShareRepository implements ShareRepository {
  readonly #client: SqlClient;

  constructor(client: SqlClient) {
    this.#client = client;
  }

  async create(record: ShareRecord): Promise<ShareRecord> {
    await this.#client.query(
      `insert into shared_conversations
       (id, user_id, slug, title, source_platform, messages_json, messages_object_key, visibility, password_hash, status, expires_at, view_count, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      toParams(record)
    );
    return clone(record);
  }

  async listByUser(userId: string): Promise<ShareRecord[]> {
    const result = await this.#client.query(
      "select * from shared_conversations where user_id = $1",
      [userId]
    );
    return result.rows.map(fromRow);
  }

  async getById(id: string): Promise<ShareRecord | undefined> {
    const result = await this.#client.query("select * from shared_conversations where id = $1", [
      id
    ]);
    return result.rows[0] ? fromRow(result.rows[0]) : undefined;
  }

  async findBySlug(slug: string): Promise<ShareRecord | undefined> {
    const result = await this.#client.query("select * from shared_conversations where slug = $1", [
      slug
    ]);
    return result.rows[0] ? fromRow(result.rows[0]) : undefined;
  }

  async update(record: ShareRecord): Promise<ShareRecord> {
    await this.#client.query(
      `update shared_conversations
       set title=$4, source_platform=$5, messages_json=$6, messages_object_key=$7, visibility=$8,
           password_hash=$9, status=$10, expires_at=$11, view_count=$12
       where id=$1 and user_id=$2`,
      toParams(record)
    );
    return clone(record);
  }
}

function toParams(record: ShareRecord): unknown[] {
  return [
    record.id,
    record.user_id,
    record.slug,
    record.title,
    record.source_platform ?? null,
    record.messages_object_key ? null : JSON.stringify(record.messages),
    record.messages_object_key ?? null,
    record.visibility,
    record.password_hash ?? null,
    record.status,
    record.expires_at ?? null,
    record.view_count,
    record.created_at
  ];
}

function fromRow(row: Record<string, unknown>): ShareRecord {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    slug: String(row.slug),
    title: String(row.title),
    source_platform: row.source_platform as ShareRecord["source_platform"],
    messages:
      typeof row.messages_json === "string"
        ? JSON.parse(row.messages_json)
        : Array.isArray(row.messages)
          ? row.messages
          : [],
    messages_object_key:
      typeof row.messages_object_key === "string" ? row.messages_object_key : undefined,
    visibility: row.visibility as ShareRecord["visibility"],
    password_hash: typeof row.password_hash === "string" ? row.password_hash : undefined,
    status: row.status as ShareRecord["status"],
    expires_at: typeof row.expires_at === "string" ? row.expires_at : null,
    view_count: Number(row.view_count ?? 0),
    created_at: String(row.created_at)
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
