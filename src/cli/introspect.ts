#!/usr/bin/env node
/**
 * IblalORM CLI - Schema Introspection & Type Generation
 *
 * This CLI tool:
 * 1. Connects to the PostgreSQL database
 * 2. Introspects the schema by reading information_schema.columns
 * 3. Generates TypeScript interfaces from the database tables
 * 4. Outputs the generated types to generated/models.ts
 */

import * as fs from "fs";
import * as path from "path";
import { getDbAdapter } from "../db/DbAdapter";
import { getTsType, introspectionConfig } from "../config/db.config";

/**
 * Column metadata from the database schema
 */
interface ColumnInfo {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  ordinal_position: number;
}

/**
 * Foreign key relationship metadata
 */
interface ForeignKeyInfo {
  constraint_name: string;
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
}

/**
 * Relationship structure for code generation
 */
interface RelationshipInfo {
  name: string;
  type: "belongsTo" | "hasMany" | "hasOne";
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  targetInterface: string;
}

/**
 * Parsed table structure for code generation
 */
interface TableStructure {
  tableName: string;
  columns: {
    columnName: string;
    tsPropertyName: string;
    sqlType: string;
    tsType: string;
    isNullable: boolean;
    hasDefault: boolean;
  }[];
  relationships: RelationshipInfo[];
}

/**
 * Convert snake_case to camelCase
 *
 * @param str - The snake_case string to convert
 * @returns The camelCase version of the string
 *
 * @example
 * snakeToCamel('first_name') // 'firstName'
 * snakeToCamel('user_id') // 'userId'
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert snake_case to PascalCase (for interface names)
 *
 * @param str - The snake_case string to convert
 * @returns The PascalCase version of the string
 *
 * @example
 * snakeToPascal('users') // 'Users'
 * snakeToPascal('blog_posts') // 'BlogPosts'
 */
function snakeToPascal(str: string): string {
  const camel = snakeToCamel(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * Singularize a table name for interface naming
 * Simple implementation - handles common cases
 *
 * @param name - The plural table name
 * @returns The singular form
 */
function singularize(name: string): string {
  if (name.endsWith("ies")) {
    return name.slice(0, -3) + "y";
  }
  if (
    name.endsWith("ses") ||
    name.endsWith("xes") ||
    name.endsWith("ches") ||
    name.endsWith("shes")
  ) {
    return name.slice(0, -2);
  }
  if (name.endsWith("s") && !name.endsWith("ss")) {
    return name.slice(0, -1);
  }
  return name;
}

/**
 * SQL query to introspect the database schema
 * Reads from information_schema.columns to get table and column metadata
 */
const INTROSPECTION_QUERY = `
  SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default,
    ordinal_position
  FROM 
    information_schema.columns
  WHERE 
    table_schema = $1
    AND table_name NOT LIKE 'pg_%'
    AND table_name NOT LIKE 'sql_%'
    AND table_name NOT LIKE '_iblal_%'
  ORDER BY 
    table_name, 
    ordinal_position;
`;

/**
 * SQL query to introspect foreign key relationships
 */
const FOREIGN_KEYS_QUERY = `
  SELECT
    tc.constraint_name,
    tc.table_name AS source_table,
    kcu.column_name AS source_column,
    ccu.table_name AS target_table,
    ccu.column_name AS target_column
  FROM
    information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
  WHERE
    tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = $1;
`;

/**
 * Fetch schema metadata from the database
 */
async function introspectSchema(schema: string): Promise<ColumnInfo[]> {
  const adapter = getDbAdapter();

  console.log(`🔍 Introspecting schema: ${schema}`);

  const result = await adapter.query<ColumnInfo>(INTROSPECTION_QUERY, [schema]);

  console.log(`   Found ${result.rows.length} columns across tables`);

  return result.rows;
}

/**
 * Fetch foreign key relationships from the database
 */
async function introspectForeignKeys(
  schema: string
): Promise<ForeignKeyInfo[]> {
  const adapter = getDbAdapter();

  console.log(`🔗 Introspecting relationships...`);

  const result = await adapter.query<ForeignKeyInfo>(FOREIGN_KEYS_QUERY, [
    schema,
  ]);

  console.log(`   Found ${result.rows.length} foreign key relationships`);

  return result.rows;
}

/**
 * Process foreign keys into relationship definitions
 */
function processRelationships(
  tables: TableStructure[],
  foreignKeys: ForeignKeyInfo[]
): void {
  const tableMap = new Map(tables.map((t) => [t.tableName, t]));

  for (const fk of foreignKeys) {
    const sourceTable = tableMap.get(fk.source_table);
    const targetTable = tableMap.get(fk.target_table);

    if (!sourceTable || !targetTable) continue;

    const targetInterfaceName = snakeToPascal(singularize(fk.target_table));
    const sourceInterfaceName = snakeToPascal(singularize(fk.source_table));

    // Add "belongsTo" relationship on the source table (e.g., Post belongsTo User)
    const belongsToName = snakeToCamel(singularize(fk.target_table));
    sourceTable.relationships.push({
      name: belongsToName,
      type: "belongsTo",
      sourceTable: fk.source_table,
      sourceColumn: fk.source_column,
      targetTable: fk.target_table,
      targetColumn: fk.target_column,
      targetInterface: targetInterfaceName,
    });

    // Add "hasMany" relationship on the target table (e.g., User hasMany Posts)
    const hasManyName = snakeToCamel(fk.source_table); // Keep plural
    targetTable.relationships.push({
      name: hasManyName,
      type: "hasMany",
      sourceTable: fk.target_table,
      sourceColumn: fk.target_column,
      targetTable: fk.source_table,
      targetColumn: fk.source_column,
      targetInterface: sourceInterfaceName,
    });
  }
}

/**
 * Group columns by table and transform to TypeScript structure
 */
function processSchemaData(columns: ColumnInfo[]): TableStructure[] {
  const tableMap = new Map<string, TableStructure>();

  for (const col of columns) {
    if (!tableMap.has(col.table_name)) {
      tableMap.set(col.table_name, {
        tableName: col.table_name,
        columns: [],
        relationships: [],
      });
    }

    const table = tableMap.get(col.table_name)!;
    table.columns.push({
      columnName: col.column_name,
      tsPropertyName: snakeToCamel(col.column_name),
      sqlType: col.data_type,
      tsType: getTsType(col.data_type),
      isNullable: col.is_nullable === "YES",
      hasDefault: col.column_default !== null,
    });
  }

  return Array.from(tableMap.values());
}

/**
 * Generate TypeScript interface code from table structure
 */
function generateInterface(table: TableStructure): string {
  const interfaceName = snakeToPascal(singularize(table.tableName));

  const properties = table.columns
    .map((col) => {
      const nullable = col.isNullable ? " | null" : "";
      const comment = `  /** SQL: ${col.sqlType}${
        col.isNullable ? " (nullable)" : ""
      }${col.hasDefault ? " (has default)" : ""} */`;
      return `${comment}\n  ${col.tsPropertyName}: ${col.tsType}${nullable};`;
    })
    .join("\n");

  // Generate relationship properties (optional by default)
  const relationshipProps = table.relationships
    .map((rel) => {
      if (rel.type === "hasMany") {
        return `  /** Relationship: ${rel.type} ${rel.targetInterface} */\n  ${rel.name}?: ${rel.targetInterface}[];`;
      } else {
        return `  /** Relationship: ${rel.type} ${rel.targetInterface} */\n  ${rel.name}?: ${rel.targetInterface};`;
      }
    })
    .join("\n");

  const allProperties = relationshipProps
    ? `${properties}\n\n  // Relationships\n${relationshipProps}`
    : properties;

  return `/**
 * Generated interface for table: ${table.tableName}
 * 
 * @generated This file is auto-generated. Do not edit manually.
 */
export interface ${interfaceName} {
${allProperties}
}`;
}

/**
 * Generate the complete models.ts file content
 */
function generateModelsFile(tables: TableStructure[]): string {
  const header = `/**
 * IblalORM Generated Models
 * 
 * This file is auto-generated by the introspect CLI command.
 * Do not edit this file manually - your changes will be overwritten.
 * 
 * Generated at: ${new Date().toISOString()}
 * Schema: ${introspectionConfig.schema}
 * Tables: ${tables.length}
 */

`;

  const interfaces = tables.map(generateInterface).join("\n\n");

  // Generate WithRelations types for type-safe .include()
  const withRelationsTypes = tables
    .filter((t) => t.relationships.length > 0)
    .map((t) => {
      const interfaceName = snakeToPascal(singularize(t.tableName));
      const relationNames = t.relationships
        .map((r) => `"${r.name}"`)
        .join(" | ");

      return `/**
 * Type helper for ${interfaceName} with loaded relationships
 */
export type ${interfaceName}WithRelations<R extends ${relationNames}> = ${interfaceName} & Required<Pick<${interfaceName}, R>>;`;
    })
    .join("\n\n");

  // Generate relationship metadata for runtime
  const relationshipMeta = tables
    .filter((t) => t.relationships.length > 0)
    .map((t) => {
      const interfaceName = snakeToPascal(singularize(t.tableName));
      const relations = t.relationships
        .map(
          (r) =>
            `    ${r.name}: { type: "${r.type}", targetTable: "${r.targetTable}", sourceColumn: "${r.sourceColumn}", targetColumn: "${r.targetColumn}" }`
        )
        .join(",\n");
      return `  ${interfaceName}: {\n${relations}\n  }`;
    })
    .join(",\n");

  const relationshipMetaExport = relationshipMeta
    ? `
/**
 * Relationship metadata for runtime queries
 */
export const relationshipMeta = {
${relationshipMeta}
} as const;

export type RelationshipMeta = typeof relationshipMeta;
`
    : "";

  // Generate a type that maps table names to their interfaces
  const tableNameMapping = tables
    .map((t) => `  ${t.tableName}: ${snakeToPascal(singularize(t.tableName))};`)
    .join("\n");

  const tableMapType = `
/**
 * Type mapping from table names to their interfaces
 */
export interface TableMap {
${tableNameMapping}
}

/**
 * Union type of all table names
 */
export type TableName = keyof TableMap;

/**
 * Get the interface type for a given table name
 */
export type TableType<T extends TableName> = TableMap[T];
`;

  return (
    header +
    interfaces +
    "\n\n" +
    withRelationsTypes +
    relationshipMetaExport +
    tableMapType
  );
}

/**
 * Generate the client.ts file with table accessors
 */
function generateClientFile(tables: TableStructure[]): string {
  const interfaceNames = tables.map((t) =>
    snakeToPascal(singularize(t.tableName))
  );
  const imports = interfaceNames.join(", ");

  // Check if any table has relationships
  const hasRelationships = tables.some((t) => t.relationships.length > 0);
  const relationshipMetaImport = hasRelationships ? ", relationshipMeta" : "";

  // Generate auto field types based on actual table columns
  const autoFieldTypes = tables
    .map((t) => {
      const name = snakeToPascal(singularize(t.tableName));
      const columnNames = new Set(t.columns.map((c) => c.tsPropertyName));

      // Only include fields that actually exist in the table AND have defaults
      const autoFields: string[] = [];
      if (columnNames.has("id")) {
        const idCol = t.columns.find((c) => c.tsPropertyName === "id");
        if (idCol?.hasDefault) autoFields.push("id");
      }
      if (columnNames.has("createdAt")) {
        const createdAtCol = t.columns.find(
          (c) => c.tsPropertyName === "createdAt"
        );
        if (createdAtCol?.hasDefault) autoFields.push("createdAt");
      }
      if (columnNames.has("updatedAt")) {
        const updatedAtCol = t.columns.find(
          (c) => c.tsPropertyName === "updatedAt"
        );
        if (updatedAtCol?.hasDefault) autoFields.push("updatedAt");
      }

      if (autoFields.length === 0) {
        return `export type ${name}AutoFields = never;`;
      }

      return `export type ${name}AutoFields = ${autoFields
        .map((f) => `"${f}"`)
        .join(" | ")};`;
    })
    .join("\n");

  const tableProperties = tables
    .map((t) => {
      const interfaceName = snakeToPascal(singularize(t.tableName));
      const propName = singularize(t.tableName);
      const columnNames = new Set(t.columns.map((c) => c.tsPropertyName));

      // Build auto-excludes comment based on actual fields
      const autoFields: string[] = [];
      if (columnNames.has("id")) {
        const idCol = t.columns.find((c) => c.tsPropertyName === "id");
        if (idCol?.hasDefault) autoFields.push("id");
      }
      if (columnNames.has("createdAt")) {
        const createdAtCol = t.columns.find(
          (c) => c.tsPropertyName === "createdAt"
        );
        if (createdAtCol?.hasDefault) autoFields.push("createdAt");
      }
      if (columnNames.has("updatedAt")) {
        const updatedAtCol = t.columns.find(
          (c) => c.tsPropertyName === "updatedAt"
        );
        if (updatedAtCol?.hasDefault) autoFields.push("updatedAt");
      }

      const autoExcludesComment =
        autoFields.length > 0
          ? `Auto-excludes: ${autoFields.join(", ")} from inserts`
          : "No auto-generated fields";

      return `  /**
   * Table accessor for \`${t.tableName}\` table
   * ${autoExcludesComment}
   */
  public readonly ${propName}: Table<${interfaceName}, ${interfaceName}AutoFields>;`;
    })
    .join("\n\n");

  const tableInitializers = tables
    .map((t) => {
      const interfaceName = snakeToPascal(singularize(t.tableName));
      const propName = singularize(t.tableName);
      const hasRels = t.relationships.length > 0;
      const columnNames = new Set(t.columns.map((c) => c.tsPropertyName));

      // Build array of actual auto fields
      const autoFields: string[] = [];
      if (columnNames.has("id")) {
        const idCol = t.columns.find((c) => c.tsPropertyName === "id");
        if (idCol?.hasDefault) autoFields.push("id");
      }
      if (columnNames.has("createdAt")) {
        const createdAtCol = t.columns.find(
          (c) => c.tsPropertyName === "createdAt"
        );
        if (createdAtCol?.hasDefault) autoFields.push("createdAt");
      }
      if (columnNames.has("updatedAt")) {
        const updatedAtCol = t.columns.find(
          (c) => c.tsPropertyName === "updatedAt"
        );
        if (updatedAtCol?.hasDefault) autoFields.push("updatedAt");
      }

      const autoFieldsArray =
        autoFields.length > 0
          ? `[${autoFields.map((f) => `"${f}"`).join(", ")}]`
          : "[]";

      if (hasRels) {
        return `    this.${propName} = new Table<${interfaceName}, ${interfaceName}AutoFields>(
      "${t.tableName}",
      ${autoFieldsArray},
      "${interfaceName}",
      relationshipMeta.${interfaceName}
    );`;
      } else {
        return `    this.${propName} = new Table<${interfaceName}, ${interfaceName}AutoFields>(
      "${t.tableName}",
      ${autoFieldsArray}
    );`;
      }
    })
    .join("\n\n");

  return `/**
 * IblalORM Database Client
 *
 * Main entry point for database operations.
 * Provides type-safe table accessors (db.user, db.post, etc.)
 *
 * This file is auto-generated by the introspect command.
 * Re-generate it when your schema changes.
 * 
 * Generated at: ${new Date().toISOString()}
 */

import { Table } from "../src/query/Table";
import { getDbAdapter, DbAdapter } from "../src/db/DbAdapter";

// Import generated model types${
    hasRelationships ? " and relationship metadata" : ""
  }
import { ${imports}${relationshipMetaImport} } from "./models";

// ============================================================================
// Auto-Generated Field Types
// ============================================================================

/**
 * Fields that are auto-generated by the database
 * These are excluded from INSERT operations
 */
${autoFieldTypes}

// ============================================================================
// Database Client Class
// ============================================================================

/**
 * IblalORM Database Client
 *
 * Provides type-safe access to all tables in the database.
 * Use the table properties to perform CRUD operations.
 *
 * @example
 * const db = new IblalClient();
 *
 * // Select with type projection
 * const users = await db.user.select('id', 'email').exec();
 *
 * // Insert with auto-field exclusion
 * const newUser = await db.user.insert({ email: 'test@example.com', ... });
 */
export class IblalClient {
  private adapter: DbAdapter;

${tableProperties}

  constructor() {
    this.adapter = getDbAdapter();

    // Initialize table accessors
${tableInitializers}
  }

  /**
   * Test the database connection
   */
  async testConnection(): Promise<boolean> {
    return this.adapter.testConnection();
  }

  /**
   * Get pool statistics
   */
  getPoolStats() {
    return this.adapter.getPoolStats();
  }

  /**
   * Close all database connections
   */
  async close(): Promise<void> {
    return this.adapter.close();
  }

  /**
   * Execute a raw SQL query (escape hatch)
   * Use parameterized queries for safety!
   */
  async raw<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.adapter.query(sql, params);
    return result.rows as T[];
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let clientInstance: IblalClient | null = null;

/**
 * Get the singleton database client
 */
export function getClient(): IblalClient {
  if (!clientInstance) {
    clientInstance = new IblalClient();
  }
  return clientInstance;
}

/**
 * Create a new database client instance
 */
export function createClient(): IblalClient {
  return new IblalClient();
}

// Convenience export
export const db = getClient();

// Default export
export default db;
`;
}

/**
 * Ensure the output directory exists
 */
function ensureOutputDirectory(outputPath: string): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
}

/**
 * Write the generated code to file
 */
function writeGeneratedFile(content: string, outputPath: string): void {
  ensureOutputDirectory(outputPath);
  fs.writeFileSync(outputPath, content, "utf-8");
  console.log(`✅ Generated: ${outputPath}`);
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  console.log("\n🚀 IblalORM Schema Introspection\n");
  console.log("================================\n");

  const adapter = getDbAdapter();

  try {
    // Test database connection
    console.log("📡 Testing database connection...");
    await adapter.testConnection();
    console.log("   Connection successful!\n");

    // Introspect the schema
    const columns = await introspectSchema(introspectionConfig.schema);

    if (columns.length === 0) {
      console.warn(
        "\n⚠️  No tables found in the schema. Make sure your database has tables."
      );
      console.log(
        "   You can run the schema.sql file to create sample tables.\n"
      );
      return;
    }

    // Process the schema data
    const tables = processSchemaData(columns);
    console.log(`\n📊 Processing ${tables.length} table(s):`);
    tables.forEach((t) => {
      console.log(`   - ${t.tableName} (${t.columns.length} columns)`);
    });

    // Introspect foreign key relationships
    const foreignKeys = await introspectForeignKeys(introspectionConfig.schema);
    processRelationships(tables, foreignKeys);

    // Log relationships found
    const totalRelationships = tables.reduce(
      (sum, t) => sum + t.relationships.length,
      0
    );
    if (totalRelationships > 0) {
      console.log(`\n🔗 Found ${totalRelationships} relationships:`);
      tables.forEach((t) => {
        t.relationships.forEach((r) => {
          console.log(
            `   - ${t.tableName}.${r.name} (${r.type} ${r.targetInterface})`
          );
        });
      });
    }

    // Generate TypeScript code
    console.log("\n🔨 Generating TypeScript interfaces...");
    const generatedCode = generateModelsFile(tables);

    // Write models file
    const outputPath = path.join(
      process.cwd(),
      introspectionConfig.outputDir,
      introspectionConfig.outputFile
    );
    writeGeneratedFile(generatedCode, outputPath);

    // Generate client file
    console.log("🔨 Generating database client...");
    const clientCode = generateClientFile(tables);
    const clientPath = path.join(
      process.cwd(),
      introspectionConfig.outputDir,
      "client.ts"
    );
    writeGeneratedFile(clientCode, clientPath);

    console.log("\n✨ Introspection complete!\n");
  } catch (error) {
    console.error("\n❌ Error during introspection:");
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    } else {
      console.error("   Unknown error occurred");
    }
    process.exit(1);
  } finally {
    // Always close the connection pool
    await adapter.close();
  }
}

// Run the CLI
main();
