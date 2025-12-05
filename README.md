# IblalORM

> **Type-Safe TypeScript ORM with Automated Type Generation from Database Schema**

IblalORM is a TypeScript ORM similar to other ORMs like Prisma and Entity Framework. It automatically generates type-safe TypeScript interfaces from your PostgreSQL database schema.

## 🎯 Features

- **Automated Type Generation**: Generate TypeScript interfaces directly from your database schema
- **Type-Safe Queries**: Full TypeScript support with auto-generated types
- **Fluent Query Builder**: Chainable API with `.select()`, `.where()`, `.orderBy()`, `.limit()`
- **Type Projection**: `Pick<TModel, TSelectKeys>` ensures only selected columns are returned
- **Relationship Loading**: Eager loading with `.include()` and type-safe relationship traversal
- **Transaction Support**: Automatic COMMIT/ROLLBACK with `transaction()` wrapper
- **Migration System**: Create, run, and track database migrations
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

Create a `.env` file or set environment variables:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=iblal_orm_db
DB_USER=postgres
DB_PASSWORD=your_password
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

This generates TypeScript interfaces and a database client in `generated/`.

## 💻 Usage Examples

### Basic Queries

```typescript
import { db } from "./generated/client";

// Select all fields
const users = await db.user.select("*").exec();

// Select specific columns (type-safe projection)
const emails = await db.user.select("id", "email").exec();
// emails[0].email ✅ works
// emails[0].firstName ❌ TypeScript error - not selected

// WHERE clauses
const activeUsers = await db.user
  .select("*")
  .where("isActive", true)
  .where("role", "admin")
  .exec();

// Operators
const recentPosts = await db.post
  .select("*")
  .where("viewCount", ">", 100)
  .orderBy("createdAt", "DESC")
  .limit(10)
  .exec();
```

### Relationship Loading

```typescript
// Load posts with author (belongsTo)
const posts = await db.post
  .select("*")
  .include("user") // Eager load author
  .exec();

// TypeScript knows user is loaded (not undefined)
posts.forEach((post) => {
  console.log(`${post.title} by ${post.user.email}`);
});

// Load users with their posts (hasMany)
const users = await db.user.select("*").include("posts").exec();

users.forEach((user) => {
  console.log(`${user.displayName} has ${user.posts.length} posts`);
});
```

### Insert & Update

```typescript
// Insert - auto-generated fields (id, createdAt, updatedAt) excluded
const newUser = await db.user.insert({
  email: "new@example.com",
  passwordHash: "hashed",
  firstName: "John",
  lastName: "Doe",
});

// Update with type-safe builder
await db.user
  .update()
  .set({ isActive: true, role: "admin" })
  .where("id", newUser.id)
  .exec();

// Delete
await db.post.delete().where("id", postId).exec();
```

### Transactions

```typescript
import { transaction } from "./src/transactions/TransactionManager";

// Automatic COMMIT on success, ROLLBACK on error
const result = await transaction(async (trx) => {
  // Insert user
  const userResult = await trx.query(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *`,
    ["test@example.com", "hash123"]
  );

  // Insert related profile
  await trx.query(`INSERT INTO profiles (user_id, bio) VALUES ($1, $2)`, [
    userResult.rows[0].id,
    "My bio",
  ]);

  return userResult.rows[0];
});
```

### Migrations

```bash
# Create a new migration
npm run migrate:create add_categories_table

# Run pending migrations
npm run migrate:run

# Check migration status
npm run migrate:status
```

Migration files are stored in `migrations/` and tracked in `_iblal_migrations` table.

## 📁 Project Structure

```
iblalORM/
├── src/
│   ├── config/
│   │   └── db.config.ts          # Database configuration & type mappings
│   ├── db/
│   │   └── DbAdapter.ts          # Database connection pool adapter
│   ├── query/
│   │   ├── QueryBuilder.ts       # Fluent query builder with generics
│   │   ├── Table.ts              # CRUD operations per table
│   │   └── RelationLoader.ts     # Eager loading for relationships
│   ├── migrations/
│   │   └── MigrationManager.ts   # Migration tracking & execution
│   ├── transactions/
│   │   └── TransactionManager.ts # Transaction wrapper with auto COMMIT/ROLLBACK
│   └── cli/
│       ├── introspect.ts         # Schema introspection & code generation
│       └── migrate.ts            # Migration CLI commands
├── db/
│   └── schema.sql                # Sample database schema
├── migrations/                   # Migration SQL files
├── generated/
│   ├── models.ts                 # Auto-generated TypeScript interfaces
│   └── client.ts                 # Auto-generated database client
├── package.json
├── tsconfig.json
└── README.md
```

## 🛠️ Available Scripts

| Script                   | Description                                     |
| ------------------------ | ----------------------------------------------- |
| `npm run introspect`     | Generate TypeScript models from database schema |
| `npm run migrate:create` | Create a new migration file                     |
| `npm run migrate:run`    | Run pending migrations                          |
| `npm run migrate:status` | Show migration status                           |
| `npm run build`          | Compile TypeScript to JavaScript                |
| `npm run clean`          | Remove generated files and build artifacts      |

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

- [x] **Phase 1**: Schema introspection & type generation
- [x] **Phase 2**: Query Builder with fluent API & type projection
- [x] **Phase 3**: Transactions, migrations, and relationship loading
- [ ] **Phase 4**: Advanced features (hooks, soft deletes, caching)
- [ ] **Phase 5**: CLI enhancements & documentation

## 📄 License

MIT

---

**IblalORM** - Type-safe database access for TypeScript applications.
