/**
 * IblalORM Query Builder
 *
 * A type-safe, fluent query builder with compile-time guarantees.
 * Uses TypeScript generics for type projection and validation.
 *
 * @template TModel - The model type being queried
 * @template TSelectKeys - Keys selected for projection (defaults to all keys)
 */

import { QueryResult } from "pg";
import { getDbAdapter } from "../db/DbAdapter";
import {
  RelationLoader,
  ModelRelationMeta,
  WithLoadedRelations,
} from "./RelationLoader";

// ============================================================================
// Type Utilities
// ============================================================================

/**
 * Comparison operators for WHERE clauses
 */
export type ComparisonOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "LIKE"
  | "ILIKE"
  | "IN"
  | "NOT IN"
  | "IS NULL"
  | "IS NOT NULL";

/**
 * Sort direction for ORDER BY
 */
export type SortDirection = "ASC" | "DESC";

/**
 * Where condition structure
 */
interface WhereCondition {
  column: string;
  operator: ComparisonOperator;
  value: unknown;
}

/**
 * Order by structure
 */
interface OrderByClause {
  column: string;
  direction: SortDirection;
}

/**
 * Convert camelCase to snake_case for SQL
 */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

// ============================================================================
// QueryBuilder Class
// ============================================================================

/**
 * Type-safe Query Builder
 *
 * Provides fluent API for building SQL queries with compile-time type checking.
 * The TSelectKeys generic tracks which columns are selected for type projection.
 *
 * @template TModel - The full model interface
 * @template TSelectKeys - Union of selected column keys (defaults to keyof TModel)
 * @template TIncluded - Union of included relationship keys
 */
export class QueryBuilder<
  TModel extends object,
  TSelectKeys extends keyof TModel = keyof TModel,
  TIncluded extends keyof TModel = never
> {
  private tableName: string;
  private modelName: string = "";
  private selectedColumns: Array<keyof TModel & string> | "*" = "*";
  private whereConditions: WhereCondition[] = [];
  private orderByClauses: OrderByClause[] = [];
  private limitCount: number | null = null;
  private offsetCount: number | null = null;
  private includedRelations: string[] = [];
  private relationMeta: ModelRelationMeta = {};

  /**
   * Create a new QueryBuilder instance
   * @param tableName - The database table name
   * @param modelName - The model name (for relationship loading)
   * @param relationMeta - Relationship metadata for this model
   */
  constructor(
    tableName: string,
    modelName?: string,
    relationMeta?: ModelRelationMeta
  ) {
    this.tableName = tableName;
    this.modelName = modelName || "";
    this.relationMeta = relationMeta || {};
  }

  /**
   * Set relationship metadata (for internal use)
   */
  setRelationMeta(modelName: string, meta: ModelRelationMeta): this {
    this.modelName = modelName;
    this.relationMeta = meta;
    return this;
  }

  // ==========================================================================
  // INCLUDE - Eager Loading Relationships
  // ==========================================================================

  /**
   * Include a relationship in the query results
   *
   * This triggers eager loading of the specified relationship.
   * The return type is transformed to make the relationship required.
   *
   * @template R - The relationship key to include
   * @param relation - Name of the relationship to load
   * @returns Query builder with updated return type
   *
   * @example
   * // Load posts with author
   * const posts = await db.post
   *   .select('*')
   *   .include('author')
   *   .exec();
   * // posts[0].author is now required (not undefined)
   */
  include<R extends keyof TModel & string>(
    relation: R
  ): QueryBuilder<TModel, TSelectKeys, TIncluded | R> {
    const builder = this.clone<TSelectKeys, TIncluded | R>();
    builder.includedRelations.push(relation);
    return builder;
  }

  // ==========================================================================
  // SELECT - Type Projection
  // ==========================================================================

  /**
   * Select all columns
   * Returns builder with all model keys selected
   */
  select(columns: "*"): QueryBuilder<TModel, keyof TModel, TIncluded>;

  /**
   * Select specific columns with type projection
   * The returned builder's TSelectKeys is narrowed to only the selected columns
   *
   * @template K - Union of selected column keys
   * @param columns - Column names to select (must be valid model keys)
   */
  select<K extends keyof TModel & string>(
    ...columns: K[]
  ): QueryBuilder<TModel, K, TIncluded>;

  /**
   * Implementation of select overloads
   */
  select<K extends keyof TModel & string>(
    ...columns: K[] | ["*"]
  ):
    | QueryBuilder<TModel, K, TIncluded>
    | QueryBuilder<TModel, keyof TModel, TIncluded> {
    // Create new instance to maintain immutability
    const builder = this.clone<K, TIncluded>();

    if (columns.length === 1 && columns[0] === "*") {
      builder.selectedColumns = "*";
    } else {
      builder.selectedColumns = columns as Array<keyof TModel & string>;
    }

    return builder as QueryBuilder<TModel, K, TIncluded>;
  }

  // ==========================================================================
  // WHERE - Type-Safe Filtering
  // ==========================================================================

  /**
   * Add a WHERE condition with equality check
   *
   * @param column - Column name (must be keyof TModel)
   * @param value - Value to compare against
   */
  where<K extends keyof TModel & string>(
    column: K,
    value: TModel[K]
  ): QueryBuilder<TModel, TSelectKeys, TIncluded>;

  /**
   * Add a WHERE condition with custom operator
   *
   * @param column - Column name (must be keyof TModel)
   * @param operator - Comparison operator
   * @param value - Value to compare against
   */
  where<K extends keyof TModel & string>(
    column: K,
    operator: ComparisonOperator,
    value: TModel[K] | TModel[K][]
  ): QueryBuilder<TModel, TSelectKeys, TIncluded>;

  /**
   * Implementation of where overloads
   */
  where<K extends keyof TModel & string>(
    column: K,
    operatorOrValue: ComparisonOperator | TModel[K],
    value?: TModel[K] | TModel[K][]
  ): QueryBuilder<TModel, TSelectKeys, TIncluded> {
    const builder = this.clone<TSelectKeys, TIncluded>();

    let operator: ComparisonOperator;
    let actualValue: unknown;

    if (value === undefined) {
      // Two-argument form: where(column, value) - defaults to equality
      operator = "=";
      actualValue = operatorOrValue;
    } else {
      // Three-argument form: where(column, operator, value)
      operator = operatorOrValue as ComparisonOperator;
      actualValue = value;
    }

    builder.whereConditions.push({
      column,
      operator,
      value: actualValue,
    });

    return builder;
  }

  /**
   * Add a WHERE IS NULL condition
   */
  whereNull<K extends keyof TModel & string>(
    column: K
  ): QueryBuilder<TModel, TSelectKeys, TIncluded> {
    const builder = this.clone<TSelectKeys, TIncluded>();
    builder.whereConditions.push({
      column,
      operator: "IS NULL",
      value: null,
    });
    return builder;
  }

  /**
   * Add a WHERE IS NOT NULL condition
   */
  whereNotNull<K extends keyof TModel & string>(
    column: K
  ): QueryBuilder<TModel, TSelectKeys, TIncluded> {
    const builder = this.clone<TSelectKeys, TIncluded>();
    builder.whereConditions.push({
      column,
      operator: "IS NOT NULL",
      value: null,
    });
    return builder;
  }

  // ==========================================================================
  // ORDER BY - Type-Safe Sorting
  // ==========================================================================

  /**
   * Add ORDER BY clause
   *
   * @param column - Column to sort by (must be keyof TModel)
   * @param direction - Sort direction (ASC or DESC)
   */
  orderBy<K extends keyof TModel & string>(
    column: K,
    direction: SortDirection = "ASC"
  ): QueryBuilder<TModel, TSelectKeys, TIncluded> {
    const builder = this.clone<TSelectKeys, TIncluded>();
    builder.orderByClauses.push({ column, direction });
    return builder;
  }

  // ==========================================================================
  // LIMIT & OFFSET
  // ==========================================================================

  /**
   * Limit the number of results
   */
  limit(count: number): QueryBuilder<TModel, TSelectKeys, TIncluded> {
    const builder = this.clone<TSelectKeys, TIncluded>();
    builder.limitCount = count;
    return builder;
  }

  /**
   * Skip a number of results
   */
  offset(count: number): QueryBuilder<TModel, TSelectKeys, TIncluded> {
    const builder = this.clone<TSelectKeys, TIncluded>();
    builder.offsetCount = count;
    return builder;
  }

  // ==========================================================================
  // SQL Building (Private)
  // ==========================================================================

  /**
   * Build the SELECT clause
   */
  private buildSelectClause(): string {
    if (this.selectedColumns === "*") {
      return "*";
    }
    return this.selectedColumns
      .map((col) => `"${camelToSnake(col)}"`)
      .join(", ");
  }

  /**
   * Build the WHERE clause and collect parameters
   */
  private buildWhereClause(params: unknown[]): string {
    if (this.whereConditions.length === 0) {
      return "";
    }

    const conditions = this.whereConditions.map((cond) => {
      const columnName = `"${camelToSnake(cond.column)}"`;

      if (cond.operator === "IS NULL") {
        return `${columnName} IS NULL`;
      }

      if (cond.operator === "IS NOT NULL") {
        return `${columnName} IS NOT NULL`;
      }

      if (cond.operator === "IN" || cond.operator === "NOT IN") {
        const values = cond.value as unknown[];
        const placeholders = values.map((v) => {
          params.push(v);
          return `$${params.length}`;
        });
        return `${columnName} ${cond.operator} (${placeholders.join(", ")})`;
      }

      params.push(cond.value);
      return `${columnName} ${cond.operator} $${params.length}`;
    });

    return `WHERE ${conditions.join(" AND ")}`;
  }

  /**
   * Build the ORDER BY clause
   */
  private buildOrderByClause(): string {
    if (this.orderByClauses.length === 0) {
      return "";
    }

    const clauses = this.orderByClauses.map(
      (o) => `"${camelToSnake(o.column)}" ${o.direction}`
    );

    return `ORDER BY ${clauses.join(", ")}`;
  }

  /**
   * Build the complete SELECT query
   */
  private buildSelectQuery(): { sql: string; params: unknown[] } {
    const params: unknown[] = [];

    const selectClause = this.buildSelectClause();
    const whereClause = this.buildWhereClause(params);
    const orderByClause = this.buildOrderByClause();

    let sql = `SELECT ${selectClause} FROM "${this.tableName}"`;

    if (whereClause) sql += ` ${whereClause}`;
    if (orderByClause) sql += ` ${orderByClause}`;
    if (this.limitCount !== null) sql += ` LIMIT ${this.limitCount}`;
    if (this.offsetCount !== null) sql += ` OFFSET ${this.offsetCount}`;

    return { sql, params };
  }

  // ==========================================================================
  // EXECUTION
  // ==========================================================================

  /**
   * Result type that includes loaded relationships
   * Uses conditional type to make included relations required
   */
  private ResultType!: Pick<TModel, TSelectKeys> &
    Required<Pick<TModel, TIncluded>>;

  /**
   * Execute the query and return results
   *
   * The return type uses Pick<TModel, TSelectKeys> for the base fields
   * and adds Required<Pick<TModel, TIncluded>> for loaded relationships.
   *
   * @returns Promise resolving to array of projected model objects with relations
   */
  async exec(): Promise<
    Array<Pick<TModel, TSelectKeys> & Required<Pick<TModel, TIncluded>>>
  > {
    const adapter = getDbAdapter();
    const { sql, params } = this.buildSelectQuery();

    const result = await adapter.query(sql, params);

    // Transform snake_case results to camelCase
    let rows = result.rows.map((row) => this.transformRow(row)) as TModel[];

    // Load relationships if any were included
    if (
      this.includedRelations.length > 0 &&
      Object.keys(this.relationMeta).length > 0
    ) {
      const loader = new RelationLoader<TModel>(
        this.modelName,
        this.tableName,
        this.relationMeta
      );
      rows = await loader.loadRelations(rows, this.includedRelations);
    }

    return rows as Array<
      Pick<TModel, TSelectKeys> & Required<Pick<TModel, TIncluded>>
    >;
  }

  /**
   * Execute and return the first result or null
   */
  async first(): Promise<
    (Pick<TModel, TSelectKeys> & Required<Pick<TModel, TIncluded>>) | null
  > {
    const results = await this.limit(1).exec();
    return results[0] || null;
  }

  /**
   * Execute and return the count of matching rows
   */
  async count(): Promise<number> {
    const adapter = getDbAdapter();
    const params: unknown[] = [];
    const whereClause = this.buildWhereClause(params);

    let sql = `SELECT COUNT(*) as count FROM "${this.tableName}"`;
    if (whereClause) sql += ` ${whereClause}`;

    const result = await adapter.query<{ count: string }>(sql, params);
    return parseInt(result.rows[0].count, 10);
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Clone the builder for immutable operations
   */
  private clone<
    NewSelectKeys extends keyof TModel,
    NewIncluded extends keyof TModel = TIncluded
  >(): QueryBuilder<TModel, NewSelectKeys, NewIncluded> {
    const builder = new QueryBuilder<TModel, NewSelectKeys, NewIncluded>(
      this.tableName,
      this.modelName,
      this.relationMeta
    );
    builder.selectedColumns = this.selectedColumns;
    builder.whereConditions = [...this.whereConditions];
    builder.orderByClauses = [...this.orderByClauses];
    builder.limitCount = this.limitCount;
    builder.offsetCount = this.offsetCount;
    builder.includedRelations = [...this.includedRelations];
    return builder;
  }

  /**
   * Transform a database row from snake_case to camelCase
   */
  private transformRow(
    row: Record<string, unknown>
  ): Pick<TModel, TSelectKeys> {
    const transformed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) =>
        letter.toUpperCase()
      );
      transformed[camelKey] = value;
    }

    return transformed as Pick<TModel, TSelectKeys>;
  }

  /**
   * Get the raw SQL query (for debugging)
   */
  toSQL(): { sql: string; params: unknown[] } {
    return this.buildSelectQuery();
  }
}
