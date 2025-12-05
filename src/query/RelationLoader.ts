/**
 * IblalORM Relation Loader
 *
 * Provides functionality for eager loading relationships.
 * Uses separate queries (not JOINs) for better performance with
 * large datasets and to avoid the N+1 problem.
 *
 * @template TModel - The base model type
 * @template TRelations - Union of relation names to load
 */

import { getDbAdapter } from "../db/DbAdapter";

// ============================================================================
// Relationship Metadata Types
// ============================================================================

/**
 * Metadata for a single relationship
 */
export interface RelationMeta {
  type: "belongsTo" | "hasMany" | "hasOne";
  targetTable: string;
  sourceColumn: string;
  targetColumn: string;
}

/**
 * Metadata for all relationships on a model
 */
export type ModelRelationMeta = Record<string, RelationMeta>;

/**
 * Registry of all model relationship metadata
 */
export type RelationRegistry = Record<string, ModelRelationMeta>;

// ============================================================================
// Type Utilities for Relationship Loading
// ============================================================================

/**
 * Make specified relationship keys required (loaded)
 * This transforms the return type when using .include()
 */
export type WithLoadedRelations<
  TModel,
  TRelationKeys extends keyof TModel
> = TModel & Required<Pick<TModel, TRelationKeys>>;

// ============================================================================
// Relation Loader Class
// ============================================================================

/**
 * Handles loading of relationships for query results
 */
export class RelationLoader<TModel extends object> {
  private modelName: string;
  private tableName: string;
  private relationMeta: ModelRelationMeta;

  constructor(
    modelName: string,
    tableName: string,
    relationMeta: ModelRelationMeta
  ) {
    this.modelName = modelName;
    this.tableName = tableName;
    this.relationMeta = relationMeta;
  }

  /**
   * Load specified relationships for a set of records
   *
   * Uses batch loading to avoid N+1 queries:
   * - Collects all foreign keys from the records
   * - Loads all related records in a single query per relationship
   * - Maps related records back to their parents
   *
   * @param records - The parent records to load relations for
   * @param relationNames - Names of relations to load
   * @returns Records with relationships loaded
   */
  async loadRelations<TRelation extends string>(
    records: TModel[],
    relationNames: TRelation[]
  ): Promise<TModel[]> {
    if (records.length === 0) return records;

    const adapter = getDbAdapter();

    for (const relationName of relationNames) {
      const meta = this.relationMeta[relationName];
      if (!meta) {
        console.warn(
          `Unknown relationship "${relationName}" on ${this.modelName}`
        );
        continue;
      }

      if (meta.type === "belongsTo") {
        await this.loadBelongsTo(records, relationName, meta, adapter);
      } else if (meta.type === "hasMany") {
        await this.loadHasMany(records, relationName, meta, adapter);
      } else if (meta.type === "hasOne") {
        await this.loadHasOne(records, relationName, meta, adapter);
      }
    }

    return records;
  }

  /**
   * Load a belongsTo relationship
   * E.g., Post.author (Post belongsTo User via author_id)
   */
  private async loadBelongsTo(
    records: TModel[],
    relationName: string,
    meta: RelationMeta,
    adapter: ReturnType<typeof getDbAdapter>
  ): Promise<void> {
    // Get the foreign key column name in camelCase
    const fkColumn = this.snakeToCamel(meta.sourceColumn);

    // Collect all foreign key values (filter out nulls and duplicates)
    const fkValues = [
      ...new Set(
        records
          .map((r) => (r as Record<string, unknown>)[fkColumn])
          .filter((v) => v !== null && v !== undefined)
      ),
    ];

    if (fkValues.length === 0) return;

    // Build query to fetch all related records
    const targetColumnSnake = meta.targetColumn;
    const placeholders = fkValues.map((_, i) => `$${i + 1}`).join(", ");
    const sql = `SELECT * FROM "${meta.targetTable}" WHERE "${targetColumnSnake}" IN (${placeholders})`;

    const result = await adapter.query(sql, fkValues);

    // Create a map of target column value -> related record
    const relatedMap = new Map<unknown, unknown>();
    for (const row of result.rows) {
      const key = row[targetColumnSnake];
      relatedMap.set(key, this.transformRow(row));
    }

    // Attach related records to parents
    for (const record of records) {
      const fkValue = (record as Record<string, unknown>)[fkColumn];
      (record as Record<string, unknown>)[relationName] =
        relatedMap.get(fkValue) || null;
    }
  }

  /**
   * Load a hasMany relationship
   * E.g., User.posts (User hasMany Posts via author_id)
   */
  private async loadHasMany(
    records: TModel[],
    relationName: string,
    meta: RelationMeta,
    adapter: ReturnType<typeof getDbAdapter>
  ): Promise<void> {
    // Get the primary key column on the source table
    const pkColumn = this.snakeToCamel(meta.sourceColumn);

    // Collect all primary key values
    const pkValues = [
      ...new Set(
        records
          .map((r) => (r as Record<string, unknown>)[pkColumn])
          .filter((v) => v !== null && v !== undefined)
      ),
    ];

    if (pkValues.length === 0) return;

    // Build query to fetch all related records
    const targetColumnSnake = meta.targetColumn;
    const placeholders = pkValues.map((_, i) => `$${i + 1}`).join(", ");
    const sql = `SELECT * FROM "${meta.targetTable}" WHERE "${targetColumnSnake}" IN (${placeholders})`;

    const result = await adapter.query(sql, pkValues);

    // Create a map of foreign key value -> array of related records
    const relatedMap = new Map<unknown, unknown[]>();
    for (const row of result.rows) {
      const key = row[targetColumnSnake];
      if (!relatedMap.has(key)) {
        relatedMap.set(key, []);
      }
      relatedMap.get(key)!.push(this.transformRow(row));
    }

    // Attach related records to parents
    for (const record of records) {
      const pkValue = (record as Record<string, unknown>)[pkColumn];
      (record as Record<string, unknown>)[relationName] =
        relatedMap.get(pkValue) || [];
    }
  }

  /**
   * Load a hasOne relationship
   * Similar to hasMany but expects single record
   */
  private async loadHasOne(
    records: TModel[],
    relationName: string,
    meta: RelationMeta,
    adapter: ReturnType<typeof getDbAdapter>
  ): Promise<void> {
    // Same as hasMany but only take first result
    const pkColumn = this.snakeToCamel(meta.sourceColumn);

    const pkValues = [
      ...new Set(
        records
          .map((r) => (r as Record<string, unknown>)[pkColumn])
          .filter((v) => v !== null && v !== undefined)
      ),
    ];

    if (pkValues.length === 0) return;

    const targetColumnSnake = meta.targetColumn;
    const placeholders = pkValues.map((_, i) => `$${i + 1}`).join(", ");
    const sql = `SELECT * FROM "${meta.targetTable}" WHERE "${targetColumnSnake}" IN (${placeholders})`;

    const result = await adapter.query(sql, pkValues);

    // Create a map of foreign key value -> first related record
    const relatedMap = new Map<unknown, unknown>();
    for (const row of result.rows) {
      const key = row[targetColumnSnake];
      if (!relatedMap.has(key)) {
        relatedMap.set(key, this.transformRow(row));
      }
    }

    // Attach related records to parents
    for (const record of records) {
      const pkValue = (record as Record<string, unknown>)[pkColumn];
      (record as Record<string, unknown>)[relationName] =
        relatedMap.get(pkValue) || null;
    }
  }

  /**
   * Transform a database row from snake_case to camelCase
   */
  private transformRow(row: Record<string, unknown>): Record<string, unknown> {
    const transformed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      const camelKey = this.snakeToCamel(key);
      transformed[camelKey] = value;
    }

    return transformed;
  }

  /**
   * Convert snake_case to camelCase
   */
  private snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }
}
