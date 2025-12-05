/**
 * IblalORM Table Repository
 *
 * Provides type-safe CRUD operations for a database table.
 * Wraps QueryBuilder and adds insert/update/delete functionality.
 *
 * @template TModel - The model interface for this table
 * @template TAutoFields - Keys of auto-generated fields (excluded from insert)
 */

import { getDbAdapter } from "../db/DbAdapter";
import { QueryBuilder } from "./QueryBuilder";
import { ModelRelationMeta } from "./RelationLoader";

/**
 * Convert camelCase to snake_case for SQL
 */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Helper type: Get keys where value extends a type
 */
type KeysWhereValueExtends<T, V> = {
  [K in keyof T]: V extends T[K] ? K : never;
}[keyof T];

/**
 * Helper type: Get keys where value does NOT extend a type
 */
type KeysWhereValueNotExtends<T, V> = {
  [K in keyof T]: V extends T[K] ? never : K;
}[keyof T];

/**
 * Helper type: Get keys of nullable properties (those that accept null)
 */
type NullableKeys<T> = KeysWhereValueExtends<T, null>;

/**
 * Helper type: Get keys of non-nullable properties
 */
type RequiredKeys<T> = KeysWhereValueNotExtends<T, null>;

/**
 * Helper type: Exclude relationship properties (those ending with ?)
 * Relationships are defined as optional in the interface
 */
type DataKeys<T> = {
  [K in keyof T]: T[K] extends (infer U)[] | undefined
    ? U extends object
      ? never // Array relationships
      : K
    : T[K] extends object | undefined
    ? never // Object relationships
    : K;
}[keyof T];

/**
 * Type for insertable data - excludes auto-generated fields
 * Makes nullable fields optional, requires non-nullable fields
 */
export type InsertData<TModel, TAutoFields extends keyof TModel> =
  // Required non-nullable fields (excluding auto-fields)
  Pick<TModel, Exclude<RequiredKeys<TModel> & DataKeys<TModel>, TAutoFields>> &
    // Optional nullable fields (excluding auto-fields)
    Partial<
      Pick<
        TModel,
        Exclude<NullableKeys<TModel> & DataKeys<TModel>, TAutoFields>
      >
    >;

/**
 * Type for updatable data - all fields optional, excludes auto-generated
 */
export type UpdateData<TModel, TAutoFields extends keyof TModel> = Partial<
  Pick<TModel, Exclude<DataKeys<TModel>, TAutoFields>>
>;

/**
 * Table Repository Class
 *
 * Provides full CRUD operations with type safety.
 * Auto-generated fields (like id, createdAt) are automatically
 * excluded from insert operations.
 */
export class Table<
  TModel extends object,
  TAutoFields extends keyof TModel = never
> {
  private tableName: string;
  private modelName: string;
  private autoFields: Set<string>;
  private relationMeta: ModelRelationMeta;

  constructor(
    tableName: string,
    autoFields: Array<keyof TModel & string> = [],
    modelName?: string,
    relationMeta?: ModelRelationMeta
  ) {
    this.tableName = tableName;
    this.modelName = modelName || "";
    this.relationMeta = relationMeta || {};
    // Default auto fields + custom ones
    this.autoFields = new Set(["id", "createdAt", "updatedAt", ...autoFields]);
  }

  /**
   * Set relationship metadata (for internal use or post-construction setup)
   */
  setRelationMeta(modelName: string, meta: ModelRelationMeta): this {
    this.modelName = modelName;
    this.relationMeta = meta;
    return this;
  }

  // ==========================================================================
  // QUERY BUILDER - Start a SELECT query
  // ==========================================================================

  /**
   * Select all columns - starts a query builder chain
   */
  select(columns: "*"): QueryBuilder<TModel, keyof TModel>;

  /**
   * Select specific columns - starts a query builder chain with type projection
   */
  select<K extends keyof TModel & string>(
    ...columns: K[]
  ): QueryBuilder<TModel, K>;

  /**
   * Implementation
   */
  select<K extends keyof TModel & string>(
    ...columns: K[] | ["*"]
  ): QueryBuilder<TModel, K> | QueryBuilder<TModel, keyof TModel> {
    const builder = new QueryBuilder<TModel>(
      this.tableName,
      this.modelName,
      this.relationMeta
    );

    if (columns.length === 1 && columns[0] === "*") {
      return builder.select("*");
    }

    return builder.select(...(columns as K[]));
  }

  /**
   * Start a query with a WHERE clause
   */
  where<K extends keyof TModel & string>(
    column: K,
    value: TModel[K]
  ): QueryBuilder<TModel, keyof TModel> {
    return new QueryBuilder<TModel>(
      this.tableName,
      this.modelName,
      this.relationMeta
    ).where(column, value);
  }

  /**
   * Find a record by ID
   */
  async findById(id: number | string): Promise<TModel | null> {
    const builder = new QueryBuilder<TModel>(
      this.tableName,
      this.modelName,
      this.relationMeta
    );
    return builder
      .where(
        "id" as keyof TModel & string,
        id as unknown as TModel[keyof TModel & string]
      )
      .first() as Promise<TModel | null>;
  }

  /**
   * Get all records
   */
  async findAll(): Promise<TModel[]> {
    const builder = new QueryBuilder<TModel>(
      this.tableName,
      this.modelName,
      this.relationMeta
    );
    return builder.select("*").exec() as Promise<TModel[]>;
  }

  // ==========================================================================
  // INSERT - Type-safe with auto-field exclusion
  // ==========================================================================

  /**
   * Insert a single record
   *
   * Auto-generated fields (id, createdAt, updatedAt) are automatically
   * excluded from the input type, preventing accidental overwrites.
   *
   * @param data - Data to insert (auto fields excluded)
   * @returns The inserted record with all fields
   */
  async insert(data: InsertData<TModel, TAutoFields>): Promise<TModel> {
    const adapter = getDbAdapter();

    const entries = Object.entries(data as Record<string, unknown>).filter(
      ([key]) => !this.autoFields.has(key)
    );

    const columns = entries.map(([key]) => `"${camelToSnake(key)}"`);
    const placeholders = entries.map((_, i) => `$${i + 1}`);
    const values = entries.map(([, value]) => value);

    const sql = `
      INSERT INTO "${this.tableName}" (${columns.join(", ")})
      VALUES (${placeholders.join(", ")})
      RETURNING *
    `;

    const result = await adapter.query(sql, values);
    return this.transformRow(result.rows[0]) as TModel;
  }

  /**
   * Insert multiple records
   *
   * @param dataArray - Array of records to insert
   * @returns Array of inserted records
   */
  async insertMany(
    dataArray: InsertData<TModel, TAutoFields>[]
  ): Promise<TModel[]> {
    if (dataArray.length === 0) return [];

    const adapter = getDbAdapter();

    // Get columns from first record
    const firstRecord = dataArray[0] as Record<string, unknown>;
    const keys = Object.keys(firstRecord).filter(
      (key) => !this.autoFields.has(key)
    );
    const columns = keys.map((key) => `"${camelToSnake(key)}"`);

    // Build VALUES for all records
    const allValues: unknown[] = [];
    const valueRows: string[] = [];

    dataArray.forEach((data, rowIndex) => {
      const record = data as Record<string, unknown>;
      const placeholders = keys.map((key, colIndex) => {
        allValues.push(record[key]);
        return `$${rowIndex * keys.length + colIndex + 1}`;
      });
      valueRows.push(`(${placeholders.join(", ")})`);
    });

    const sql = `
      INSERT INTO "${this.tableName}" (${columns.join(", ")})
      VALUES ${valueRows.join(", ")}
      RETURNING *
    `;

    const result = await adapter.query(sql, allValues);
    return result.rows.map((row) => this.transformRow(row) as TModel);
  }

  // ==========================================================================
  // UPDATE - Type-safe partial updates
  // ==========================================================================

  /**
   * Update records matching a condition
   *
   * @param data - Partial data to update
   * @returns UpdateBuilder for chaining where conditions
   */
  update(data: UpdateData<TModel, TAutoFields>): UpdateBuilder<TModel> {
    return new UpdateBuilder<TModel>(this.tableName, data, this.autoFields);
  }

  /**
   * Update a record by ID
   *
   * @param id - Record ID
   * @param data - Partial data to update
   * @returns Updated record or null if not found
   */
  async updateById(
    id: number | string,
    data: UpdateData<TModel, TAutoFields>
  ): Promise<TModel | null> {
    const result = await this.update(data)
      .where(
        "id" as keyof TModel & string,
        id as unknown as TModel[keyof TModel & string]
      )
      .exec();
    return result[0] || null;
  }

  // ==========================================================================
  // DELETE
  // ==========================================================================

  /**
   * Start a delete operation
   * @returns DeleteBuilder for chaining where conditions
   */
  delete(): DeleteBuilder<TModel> {
    return new DeleteBuilder<TModel>(this.tableName);
  }

  /**
   * Delete a record by ID
   * @returns true if deleted, false if not found
   */
  async deleteById(id: number | string): Promise<boolean> {
    const count = await this.delete()
      .where(
        "id" as keyof TModel & string,
        id as unknown as TModel[keyof TModel & string]
      )
      .exec();
    return count > 0;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Transform a database row from snake_case to camelCase
   */
  private transformRow(row: Record<string, unknown>): Record<string, unknown> {
    const transformed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) =>
        letter.toUpperCase()
      );
      transformed[camelKey] = value;
    }

    return transformed;
  }
}

// ============================================================================
// UPDATE BUILDER
// ============================================================================

/**
 * Builder for UPDATE operations with WHERE support
 */
export class UpdateBuilder<TModel extends object> {
  private tableName: string;
  private data: Record<string, unknown>;
  private autoFields: Set<string>;
  private whereConditions: Array<{
    column: string;
    value: unknown;
  }> = [];

  constructor(
    tableName: string,
    data: Record<string, unknown>,
    autoFields: Set<string>
  ) {
    this.tableName = tableName;
    this.data = data;
    this.autoFields = autoFields;
  }

  /**
   * Add WHERE condition
   */
  where<K extends keyof TModel & string>(
    column: K,
    value: TModel[K]
  ): UpdateBuilder<TModel> {
    this.whereConditions.push({ column, value });
    return this;
  }

  /**
   * Execute the update
   * @returns Array of updated records
   */
  async exec(): Promise<TModel[]> {
    if (this.whereConditions.length === 0) {
      throw new Error(
        "UPDATE requires at least one WHERE condition for safety"
      );
    }

    const adapter = getDbAdapter();

    // Build SET clause
    const entries = Object.entries(this.data).filter(
      ([key]) => !this.autoFields.has(key)
    );

    if (entries.length === 0) {
      throw new Error("No valid fields to update");
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];

    entries.forEach(([key, value], index) => {
      setClauses.push(
        `"${key.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`)}" = $${
          index + 1
        }`
      );
      values.push(value);
    });

    // Add updatedAt automatically
    setClauses.push(`"updated_at" = CURRENT_TIMESTAMP`);

    // Build WHERE clause
    const whereClauses = this.whereConditions.map((cond, index) => {
      const paramIndex = entries.length + index + 1;
      values.push(cond.value);
      return `"${cond.column.replace(
        /[A-Z]/g,
        (l) => `_${l.toLowerCase()}`
      )}" = $${paramIndex}`;
    });

    const sql = `
      UPDATE "${this.tableName}"
      SET ${setClauses.join(", ")}
      WHERE ${whereClauses.join(" AND ")}
      RETURNING *
    `;

    const result = await adapter.query(sql, values);
    return result.rows.map((row) => this.transformRow(row) as TModel);
  }

  private transformRow(row: Record<string, unknown>): Record<string, unknown> {
    const transformed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) =>
        letter.toUpperCase()
      );
      transformed[camelKey] = value;
    }
    return transformed;
  }
}

// ============================================================================
// DELETE BUILDER
// ============================================================================

/**
 * Builder for DELETE operations with WHERE support
 */
export class DeleteBuilder<TModel extends object> {
  private tableName: string;
  private whereConditions: Array<{
    column: string;
    value: unknown;
  }> = [];

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  /**
   * Add WHERE condition
   */
  where<K extends keyof TModel & string>(
    column: K,
    value: TModel[K]
  ): DeleteBuilder<TModel> {
    this.whereConditions.push({ column, value });
    return this;
  }

  /**
   * Execute the delete
   * @returns Number of deleted rows
   */
  async exec(): Promise<number> {
    if (this.whereConditions.length === 0) {
      throw new Error(
        "DELETE requires at least one WHERE condition for safety"
      );
    }

    const adapter = getDbAdapter();
    const values: unknown[] = [];

    const whereClauses = this.whereConditions.map((cond, index) => {
      values.push(cond.value);
      return `"${cond.column.replace(
        /[A-Z]/g,
        (l) => `_${l.toLowerCase()}`
      )}" = $${index + 1}`;
    });

    const sql = `
      DELETE FROM "${this.tableName}"
      WHERE ${whereClauses.join(" AND ")}
    `;

    const result = await adapter.query(sql, values);
    return result.rowCount || 0;
  }
}
