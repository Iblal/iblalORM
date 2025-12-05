/**
 * IblalORM - Type-Safe TypeScript ORM
 *
 * Main entry point for the library.
 * Exports all public APIs for database access.
 */

// Database Adapter
export { DbAdapter, getDbAdapter } from "./db/DbAdapter";

// Query Builder
export { QueryBuilder } from "./query/QueryBuilder";
export { Table, InsertData, UpdateData } from "./query/Table";

// Configuration
export {
  dbConfig,
  sqlToTsTypeMap,
  getTsType,
  introspectionConfig,
} from "./config/db.config";
