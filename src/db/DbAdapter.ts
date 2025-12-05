/**
 * IblalORM Database Adapter
 *
 * The single gateway for database interaction.
 * Uses a connection pool for efficiency and concurrency.
 * All queries are parameterized to prevent SQL injection.
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { dbConfig } from "../config/db.config";

/**
 * Database Adapter Class
 *
 * Provides a secure, pooled connection interface to PostgreSQL.
 * Implements the singleton pattern for connection management.
 */
export class DbAdapter {
  private static instance: DbAdapter | null = null;
  private pool: Pool;
  private isConnected: boolean = false;

  /**
   * Private constructor - use getInstance() to get the adapter
   */
  private constructor() {
    this.pool = new Pool(dbConfig);

    // Handle pool errors
    this.pool.on("error", (err: Error) => {
      console.error("Unexpected error on idle client:", err);
    });

    // Handle pool connection events
    this.pool.on("connect", () => {
      this.isConnected = true;
    });
  }

  /**
   * Get the singleton instance of DbAdapter
   */
  public static getInstance(): DbAdapter {
    if (!DbAdapter.instance) {
      DbAdapter.instance = new DbAdapter();
    }
    return DbAdapter.instance;
  }

  /**
   * Execute a parameterized SQL query
   *
   * This is the primary method for database interaction.
   * All parameters are properly escaped to prevent SQL injection.
   *
   * @param sql - The SQL query string with $1, $2, etc. placeholders
   * @param params - Array of parameter values to substitute
   * @returns Promise resolving to the query result
   *
   * @example
   * const result = await adapter.query(
   *   'SELECT * FROM users WHERE id = $1 AND status = $2',
   *   [userId, 'active']
   * );
   */
  public async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    try {
      const result = await this.pool.query<T>(sql, params);
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown database error";
      throw new Error(`Database query failed: ${errorMessage}`);
    }
  }

  /**
   * Get a client from the pool for transaction support
   *
   * Remember to release the client back to the pool when done!
   *
   * @returns Promise resolving to a pool client
   *
   * @example
   * const client = await adapter.getClient();
   * try {
   *   await client.query('BEGIN');
   *   // ... your transaction queries
   *   await client.query('COMMIT');
   * } catch (e) {
   *   await client.query('ROLLBACK');
   *   throw e;
   * } finally {
   *   client.release();
   * }
   */
  public async getClient(): Promise<PoolClient> {
    try {
      const client = await this.pool.connect();
      return client;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown connection error";
      throw new Error(`Failed to get database client: ${errorMessage}`);
    }
  }

  /**
   * Test the database connection
   *
   * @returns Promise resolving to true if connection is successful
   */
  public async testConnection(): Promise<boolean> {
    try {
      await this.query("SELECT 1");
      this.isConnected = true;
      return true;
    } catch (error) {
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Check if the adapter is currently connected
   */
  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Get pool statistics
   */
  public getPoolStats(): {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  } {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  /**
   * Close all connections in the pool
   *
   * Call this when shutting down the application
   */
  public async close(): Promise<void> {
    await this.pool.end();
    this.isConnected = false;
    DbAdapter.instance = null;
  }
}

/**
 * Export a convenience function to get the adapter instance
 */
export function getDbAdapter(): DbAdapter {
  return DbAdapter.getInstance();
}
