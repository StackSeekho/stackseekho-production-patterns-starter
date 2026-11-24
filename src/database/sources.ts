import type { Knex } from 'knex';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export class DynamicMigrationSource implements Knex.MigrationSource<string> {
  constructor(private migrationsDir: string) {}

  async getMigrations(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.migrationsDir);
      return files
        .filter((file) => file.endsWith('.ts') || file.endsWith('.js'))
        .sort();
    } catch {
      return [];
    }
  }

  getMigrationName(migration: string): string {
    return migration;
  }

  async getMigration(migration: string): Promise<{
    up: (knex: Knex) => Promise<void>;
    down: (knex: Knex) => Promise<void>;
  }> {
    const filePath = path.resolve(this.migrationsDir, migration);
    const mod = await import(pathToFileURL(filePath).href);
    return {
      up: mod.up,
      down: mod.down,
    };
  }
}

export class DynamicSeedSource {
  constructor(private seedsDir: string) {}

  async getSeeds(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.seedsDir);
      return files
        .filter((file) => file.endsWith('.ts') || file.endsWith('.js'))
        .sort()
        .map((file) => path.resolve(this.seedsDir, file));
    } catch {
      return [];
    }
  }

  async getSeed(filepath: string): Promise<{
    seed: (knex: Knex) => Promise<void>;
  }> {
    const mod = await import(pathToFileURL(filepath).href);
    return {
      seed: mod.seed,
    };
  }
}
