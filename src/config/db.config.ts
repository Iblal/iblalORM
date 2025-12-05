/**
 * IblalORM Database Configuration
 *
 * This file contains:
 * 1. PostgreSQL connection credentials (placeholders)
 * 2. SQL-to-TypeScript type mapping for schema introspection
 */

import { PoolConfig } from "pg";

/**
 * PostgreSQL connection configuration
 * Replace these placeholders with your actual database credentials
 */
export const dbConfig: PoolConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME || "iblal_orm_db",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",

  // Connection pool settings
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 5000, // Return an error after 5 seconds if connection cannot be established
};

/**
 * SQL to TypeScript Type Mapping
 *
 * Maps PostgreSQL data types to their corresponding TypeScript primitives.
 * This mapping is used during schema introspection to generate type-safe interfaces.
 */
export const sqlToTsTypeMap: Record<string, string> = {
  // Numeric types
  smallint: "number",
  integer: "number",
  bigint: "number",
  decimal: "number",
  numeric: "number",
  real: "number",
  "double precision": "number",
  serial: "number",
  bigserial: "number",

  // Character types
  "character varying": "string",
  varchar: "string",
  character: "string",
  char: "string",
  text: "string",
  name: "string",

  // Boolean type
  boolean: "boolean",

  // Date/Time types
  "timestamp without time zone": "Date",
  "timestamp with time zone": "Date",
  timestamp: "Date",
  date: "Date",
  "time without time zone": "string",
  "time with time zone": "string",
  time: "string",
  interval: "string",

  // UUID type
  uuid: "string",

  // JSON types
  json: "Record<string, unknown>",
  jsonb: "Record<string, unknown>",

  // Binary types
  bytea: "Buffer",

  // Array types (basic support)
  ARRAY: "unknown[]",

  // Network types
  inet: "string",
  cidr: "string",
  macaddr: "string",

  // Other types
  money: "string",
  xml: "string",
};

/**
 * Get the TypeScript type for a given SQL type
 * Falls back to 'unknown' for unmapped types
 */
export function getTsType(sqlType: string): string {
  const normalizedType = sqlType.toLowerCase();
  return sqlToTsTypeMap[normalizedType] || "unknown";
}

/**
 * Configuration for the introspection process
 */
export const introspectionConfig = {
  // Schema to introspect (default: public)
  schema: process.env.DB_SCHEMA || "public",

  // Output directory for generated files
  outputDir: "./generated",

  // Output filename for generated models
  outputFile: "models.ts",
};
