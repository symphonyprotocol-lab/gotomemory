import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface PageStorage {
  writeText(key: string, content: string): Promise<void>;
  readText(key: string): Promise<string>;
  deletePrefix(prefix: string): Promise<void>;
}

export class InMemoryPageStorage implements PageStorage {
  private readonly files = new Map<string, string>();

  writeText(key: string, content: string): Promise<void> {
    this.files.set(key, content);
    return Promise.resolve();
  }

  readText(key: string): Promise<string> {
    const found = this.files.get(key);
    if (found == null) return Promise.reject(new Error(`page storage key not found: ${key}`));
    return Promise.resolve(found);
  }

  deletePrefix(prefix: string): Promise<void> {
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) this.files.delete(key);
    }
    return Promise.resolve();
  }
}

export class FileSystemPageStorage implements PageStorage {
  constructor(private readonly rootDir: string) {}

  private pathFor(key: string): string {
    return join(this.rootDir, key);
  }

  async writeText(key: string, content: string): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  }

  async readText(key: string): Promise<string> {
    return readFile(this.pathFor(key), "utf8");
  }

  async deletePrefix(prefix: string): Promise<void> {
    await rm(this.pathFor(prefix), { recursive: true, force: true });
  }
}
