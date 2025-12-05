# IblalORM

> **Type-Safe TypeScript ORM with Automated Type Generation from Database Schema**

IblalORM is a TypeScript ORM similar to other ORMs like Prisma and Entity Framework. It automatically generates type-safe TypeScript interfaces from your PostgreSQL database schema.

## 🎯 Features

- **Automated Type Generation**: Generate TypeScript interfaces directly from your database schema
- **Type-Safe Queries**: Full TypeScript support with auto-generated types
- **Connection Pooling**: Efficient database connections using `pg` driver's Pool
- **SQL Injection Prevention**: All queries use parameterized execution
- **Snake to Camel Case**: Automatic conversion of SQL naming conventions to TypeScript conventions

## 📋 Prerequisites

- Node.js >= 18.0.0
- PostgreSQL database
- npm or yarn

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Database Connection

Edit `src/config/db.config.ts` or set environment variables:

```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=iblal_orm_db
export DB_USER=postgres
export DB_PASSWORD=your_password
```

### 3. Create the Database and Tables

```bash
# Create database (if not exists)
createdb iblal_orm_db

# Run the sample schema
psql -h localhost -U postgres -d iblal_orm_db -f db/schema.sql
```

### 4. Run Schema Introspection

```bash
npm run introspect
```

This will generate TypeScript interfaces in `generated/models.ts`.

## 📁 Project Structure

```
iblalORM/
├── src/
│   ├── config/
│   │   └── db.config.ts      # Database configuration & type mappings
│   ├── db/
│   │   └── DbAdapter.ts      # Database connection pool adapter
│   └── cli/
│       └── introspect.ts     # CLI for schema introspection
├── db/
│   └── schema.sql            # Sample database schema
├── generated/
│   └── models.ts             # Auto-generated TypeScript models
├── package.json
├── tsconfig.json
└── README.md
```

## 🔧 Configuration

### Database Configuration

The database configuration is in `src/config/db.config.ts`:

```typescript
export const dbConfig: PoolConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME || "iblal_orm_db",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  max: 10, // Connection pool size
};
```

### SQL to TypeScript Type Mapping

The type mapping converts PostgreSQL types to TypeScript:

| PostgreSQL Type               | TypeScript Type           |
| ----------------------------- | ------------------------- |
| `VARCHAR`, `TEXT`, `CHAR`     | `string`                  |
| `INTEGER`, `SERIAL`, `BIGINT` | `number`                  |
| `BOOLEAN`                     | `boolean`                 |
| `TIMESTAMP`, `DATE`           | `Date`                    |
| `JSON`, `JSONB`               | `Record<string, unknown>` |
| `UUID`                        | `string`                  |

## 📝 Generated Output Example

Given the sample schema with `users` and `posts` tables, the introspection generates:

```typescript
/**
 * Generated interface for table: users
 */
export interface User {
  /** SQL: integer */
  id: number;
  /** SQL: character varying */
  email: string;
  /** SQL: character varying (nullable) */
  firstName: string | null;
  /** SQL: character varying (nullable) */
  lastName: string | null;
  /** SQL: timestamp without time zone (has default) */
  createdAt: Date;
  // ... more fields
}

/**
 * Generated interface for table: posts
 */
export interface Post {
  /** SQL: integer */
  id: number;
  /** SQL: integer */
  authorId: number;
  /** SQL: character varying */
  title: string;
  // ... more fields
}
```

## 🛠️ Available Scripts

| Script               | Description                                     |
| -------------------- | ----------------------------------------------- |
| `npm run introspect` | Generate TypeScript models from database schema |
| `npm run build`      | Compile TypeScript to JavaScript                |
| `npm run clean`      | Remove generated files and build artifacts      |

## 🔒 Security

- All database queries use parameterized execution to prevent SQL injection
- Connection credentials should be stored in environment variables
- Never commit `.env` files with real credentials

## 📚 Architecture

### DbAdapter

The `DbAdapter` class provides:

- Singleton pattern for connection management
- Connection pooling for efficiency
- Parameterized query execution
- Transaction support via `getClient()`

### Schema Introspection

The CLI tool:

1. Connects to the database using `DbAdapter`
2. Queries `information_schema.columns` for table metadata
3. Transforms SQL types to TypeScript types
4. Converts `snake_case` to `camelCase`
5. Generates and writes `models.ts`

## 🗺️ Roadmap

- [ ] **Phase 2**: Query Builder with type-safe WHERE clauses
- [ ] **Phase 3**: Relationship mapping (1:1, 1:N, N:N)
- [ ] **Phase 4**: Migration system
- [ ] **Phase 5**: Advanced features (hooks, soft deletes, etc.)

## 📄 License

MIT

---

**IblalORM** - Type-safe database access for TypeScript applications.
