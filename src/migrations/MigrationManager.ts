/**
 * IblalORM Migration System
 *
 * Handles database schema migrations with versioning and tracking.
 * Migrations are SQL files stored in the migrations/ directory.
 */

import * as fs from "fs";
import * as path from "path";
import { getDbAdapter } from "../db/DbAdapter";

/**
 * Migration record stored in the database
 */
interface MigrationRecord {
  id: number;
  name: string;
  executed_at: Date;
}

/**
 * Migration file info
 */
interface MigrationFile {
  name: string;
  path: string;
  version: string;
}

/**
 * Migration Manager
 *
 * Handles tracking and executing database migrations.
 */
export class MigrationManager {
  private migrationsDir: string;
  private tableName: string = "_iblal_migrations";

  constructor(migrationsDir: string = "./migrations") {
    this.migrationsDir = migrationsDir;
  }

  /**
   * Ensure the migrations tracking table exists
   */
  async ensureMigrationsTable(): Promise<void> {
    const adapter = getDbAdapter();

    const sql = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await adapter.query(sql, []);
  }

  /**
   * Get list of already executed migrations
   */
  async getExecutedMigrations(): Promise<string[]> {
    const adapter = getDbAdapter();

    const result = await adapter.query<MigrationRecord>(
      `SELECT name FROM ${this.tableName} ORDER BY id ASC`,
      []
    );

    return result.rows.map((row) => row.name);
  }

  /**
   * Get list of pending migrations (not yet executed)
   */
  async getPendingMigrations(): Promise<MigrationFile[]> {
    const allMigrations = this.getAllMigrationFiles();
    const executed = await this.getExecutedMigrations();

    return allMigrations.filter((m) => !executed.includes(m.name));
  }

  /**
   * Get all migration files from the migrations directory
   */
  getAllMigrationFiles(): MigrationFile[] {
    if (!fs.existsSync(this.migrationsDir)) {
      return [];
    }

    const files = fs.readdirSync(this.migrationsDir);

    return files
      .filter((f) => f.endsWith(".sql"))
      .sort() // Ensures version order
      .map((f) => ({
        name: f,
        path: path.join(this.migrationsDir, f),
        version: f.split("_")[0],
      }));
  }

  /**
   * Run a single migration
   */
  async runMigration(migration: MigrationFile): Promise<void> {
    const adapter = getDbAdapter();
    const sql = fs.readFileSync(migration.path, "utf-8");

    // Execute migration in a transaction
    const client = await adapter.getClient();

    try {
      await client.query("BEGIN");

      // Execute the migration SQL
      await client.query(sql);

      // Record the migration
      await client.query(`INSERT INTO ${this.tableName} (name) VALUES ($1)`, [
        migration.name,
      ]);

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Run all pending migrations
   */
  async runAllPending(): Promise<string[]> {
    await this.ensureMigrationsTable();

    const pending = await this.getPendingMigrations();
    const executed: string[] = [];

    for (const migration of pending) {
      console.log(`  ▶ Running: ${migration.name}`);
      await this.runMigration(migration);
      executed.push(migration.name);
      console.log(`    ✅ Complete`);
    }

    return executed;
  }

  /**
   * Create a new migration file
   */
  createMigration(name: string): string {
    // Ensure migrations directory exists
    if (!fs.existsSync(this.migrationsDir)) {
      fs.mkdirSync(this.migrationsDir, { recursive: true });
    }

    // Generate timestamp version
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T]/g, "")
      .slice(0, 14);

    // Sanitize name
    const sanitizedName = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");

    const filename = `${timestamp}_${sanitizedName}.sql`;
    const filepath = path.join(this.migrationsDir, filename);

    // Create template content
    const template = `-- Migration: ${name}
-- Created at: ${new Date().toISOString()}

-- Write your migration SQL here
-- Example:
-- ALTER TABLE users ADD COLUMN bio TEXT;

`;

    fs.writeFileSync(filepath, template, "utf-8");

    return filepath;
  }

  /**
   * Get migration status
   */
  async getStatus(): Promise<{
    executed: string[];
    pending: MigrationFile[];
  }> {
    await this.ensureMigrationsTable();

    const executed = await this.getExecutedMigrations();
    const pending = await this.getPendingMigrations();

    return { executed, pending };
  }
}

/**
 * Export singleton instance
 */
let migrationManager: MigrationManager | null = null;

export function getMigrationManager(migrationsDir?: string): MigrationManager {
  if (!migrationManager) {
    migrationManager = new MigrationManager(migrationsDir);
  }
  return migrationManager;
}
