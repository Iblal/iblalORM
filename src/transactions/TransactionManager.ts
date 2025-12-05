/**
 * IblalORM Transaction Manager
 *
 * Provides a high-level API for database transactions with
 * automatic COMMIT on success and ROLLBACK on failure.
 */

import { PoolClient } from "pg";
import { getDbAdapter } from "../db/DbAdapter";

/**
 * Transaction client interface
 *
 * Provides the same query interface as DbAdapter but uses
 * a dedicated client for transaction isolation.
 */
export class TransactionClient {
  private client: PoolClient;
  private isCompleted: boolean = false;

  constructor(client: PoolClient) {
    this.client = client;
  }

  /**
   * Execute a parameterized query within the transaction
   */
  async query<T = unknown>(
    sql: string,
    params: unknown[] = []
  ): Promise<{ rows: T[]; rowCount: number | null }> {
    if (this.isCompleted) {
      throw new Error("Transaction has already been completed");
    }

    const result = await this.client.query(sql, params);
    return {
      rows: result.rows as T[],
      rowCount: result.rowCount,
    };
  }

  /**
   * Commit the transaction
   */
  async commit(): Promise<void> {
    if (this.isCompleted) {
      throw new Error("Transaction has already been completed");
    }

    await this.client.query("COMMIT");
    this.isCompleted = true;
  }

  /**
   * Rollback the transaction
   */
  async rollback(): Promise<void> {
    if (this.isCompleted) {
      return; // Already completed, nothing to rollback
    }

    await this.client.query("ROLLBACK");
    this.isCompleted = true;
  }

  /**
   * Release the client back to the pool
   */
  release(): void {
    this.client.release();
  }

  /**
   * Check if transaction is still active
   */
  get isActive(): boolean {
    return !this.isCompleted;
  }
}

/**
 * Transaction callback type
 */
export type TransactionCallback<T> = (trx: TransactionClient) => Promise<T>;

/**
 * Execute a function within a database transaction
 *
 * The transaction will automatically:
 * - COMMIT if the callback succeeds
 * - ROLLBACK if the callback throws an error
 *
 * @param callback - Async function that receives a TransactionClient
 * @returns The result of the callback function
 *
 * @example
 * const result = await transaction(async (trx) => {
 *   await trx.query('INSERT INTO users (email) VALUES ($1)', ['a@b.com']);
 *   await trx.query('INSERT INTO profiles (user_id) VALUES ($1)', [1]);
 *   return { success: true };
 * });
 */
export async function transaction<T>(
  callback: TransactionCallback<T>
): Promise<T> {
  const adapter = getDbAdapter();
  const client = await adapter.getClient();
  const trx = new TransactionClient(client);

  try {
    // Start transaction
    await client.query("BEGIN");

    // Execute the callback
    const result = await callback(trx);

    // Commit if successful
    await trx.commit();

    return result;
  } catch (error) {
    // Rollback on any error
    await trx.rollback();
    throw error;
  } finally {
    // Always release the client back to the pool
    trx.release();
  }
}

/**
 * Transaction isolation levels
 */
export type IsolationLevel =
  | "READ UNCOMMITTED"
  | "READ COMMITTED"
  | "REPEATABLE READ"
  | "SERIALIZABLE";

/**
 * Execute a function within a transaction with specific isolation level
 *
 * @param isolationLevel - The transaction isolation level
 * @param callback - Async function that receives a TransactionClient
 * @returns The result of the callback function
 */
export async function transactionWithIsolation<T>(
  isolationLevel: IsolationLevel,
  callback: TransactionCallback<T>
): Promise<T> {
  const adapter = getDbAdapter();
  const client = await adapter.getClient();
  const trx = new TransactionClient(client);

  try {
    // Start transaction with isolation level
    await client.query(`BEGIN ISOLATION LEVEL ${isolationLevel}`);

    // Execute the callback
    const result = await callback(trx);

    // Commit if successful
    await trx.commit();

    return result;
  } catch (error) {
    // Rollback on any error
    await trx.rollback();
    throw error;
  } finally {
    // Always release the client back to the pool
    trx.release();
  }
}
