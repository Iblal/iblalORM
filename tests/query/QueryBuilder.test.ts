/**
 * IblalORM QueryBuilder Unit Tests
 *
 * Tests for the QueryBuilder class functionality.
 * Uses mocking to isolate database interactions.
 */

import {
  QueryBuilder,
  ComparisonOperator,
  SortDirection,
} from "../../src/query/QueryBuilder";

// Mock the DbAdapter
jest.mock("../../src/db/DbAdapter", () => ({
  getDbAdapter: jest.fn(() => ({
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  })),
}));

import { getDbAdapter } from "../../src/db/DbAdapter";

// Sample model interface for testing
interface TestUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
  isActive: boolean;
  age: number | null;
}

describe("QueryBuilder", () => {
  let mockAdapter: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAdapter = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    };
    (getDbAdapter as jest.Mock).mockReturnValue(mockAdapter);
  });

  describe("constructor", () => {
    it("should create a QueryBuilder instance with table name", () => {
      const builder = new QueryBuilder<TestUser>("users");
      expect(builder).toBeInstanceOf(QueryBuilder);
    });

    it("should create a QueryBuilder instance with model name and relation meta", () => {
      const builder = new QueryBuilder<TestUser>("users", "User", {});
      expect(builder).toBeInstanceOf(QueryBuilder);
    });
  });

  describe("select()", () => {
    it("should build SELECT * query", async () => {
      const builder = new QueryBuilder<TestUser>("users");
      await builder.select("*").exec();

      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT * FROM "users"',
        []
      );
    });

    it("should build SELECT with specific columns", async () => {
      const builder = new QueryBuilder<TestUser>("users");
      await builder.select("id", "email").exec();

      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT "id", "email" FROM "users"',
        []
      );
    });

    it("should convert camelCase column names to snake_case", async () => {
      const builder = new QueryBuilder<TestUser>("users");
      await builder.select("firstName", "lastName", "createdAt").exec();

      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT "first_name", "last_name", "created_at" FROM "users"',
        []
      );
    });
  });

  describe("where()", () => {
    it("should build WHERE clause with equality operator", async () => {
      const builder = new QueryBuilder<TestUser>("users");
      await builder.select("*").where("id", 1).exec();

      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT * FROM "users" WHERE "id" = $1',
        [1]
      );
    });

    it("should build WHERE clause with custom operator", async () => {
      const builder = new QueryBuilder<TestUser>("users");
      await builder.select("*").where("age", ">", 18).exec();

      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT * FROM "users" WHERE "age" > $1',
        [18]
      );
    });

    it("should build WHERE clause with multiple conditions", async () => {
      const builder = new QueryBuilder<TestUser>("users");
      await builder
        .select("*")
        .where("isActive", true)
        .where("age", ">=", 21)
        .exec();

      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT * FROM "users" WHERE "is_active" = $1 AND "age" >= $2',
        [true, 21]
      );
    });

    it("should build WHERE IN clause", async () => {
      const builder = new QueryBuilder<TestUser>("users");
      await builder.select("*").where("id", "IN", [1, 2, 3]).exec();

      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT * FROM "users" WHERE "id" IN ($1, $2, $3)',
        [1, 2, 3]
      );
    });

    it("should build WHERE NOT IN clause", async () => {
      const builder = new QueryBuilder<TestUser>("users");
      await builder.select("*").where("id", "NOT IN", [1, 2]).exec();

      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT * FROM "users" WHERE "id" NOT IN ($1, $2)',
        [1, 2]
      );
    });

    it("should build WHERE LIKE clause", async () => {
      const builder = new QueryBuilder<TestUser>("users");
      await builder.select("*").where("email", "LIKE", "%@gmail.com").exec();

      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT * FROM "users" WHERE "email" LIKE $1',
        ["%@gmail.com"]
      );
    });

    it("should build WHERE ILIKE clause (case-insensitive)", async () => {
      const builder = new QueryBuilder<TestUser>("users");
      await builder.select("*").where("firstName", "ILIKE", "%john%").exec();

      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT * FROM "users" WHERE "first_name" ILIKE $1',
        ["%john%"]
      );
    });
  });

  describe("whereNull() and whereNotNull()", () => {
    it("should build WHERE IS NULL clause", async () => {
      const builder = new QueryBuilder<TestUser>("users");
      await builder.select("*").whereNull("age").exec();

      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT * FROM "users" WHERE "age" IS NULL',
        []
      );
    });

    it("should build WHERE IS NOT NULL clause", async () => {
      const builder = new QueryBuilder<TestUser>("users");
      await builder.select("*").whereNotNull("age").exec();

      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT * FROM "users" WHERE "age" IS NOT NULL',
        []
      );
    });
  });

  describe("orderBy()", () => {
    it("should build ORDER BY clause with default ASC direction", async () => {
      const builder = new QueryBuilder<TestUser>("users");
      await builder.select("*").orderBy("createdAt").exec();

      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT * FROM "users" ORDER BY "created_at" ASC',
        []
      );
    });

    it("should build ORDER BY clause with DESC direction", async () => {
      const builder = new QueryBuilder<TestUser>("users");
      await builder.select("*").orderBy("createdAt", "DESC").exec();

      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT * FROM "users" ORDER BY "created_at" DESC',
        []
      );
    });

    it("should build ORDER BY with multiple columns", async () => {
      const builder = new QueryBuilder<TestUser>("users");
      await builder
        .select("*")
        .orderBy("lastName", "ASC")
        .orderBy("firstName", "ASC")
        .exec();

      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT * FROM "users" ORDER BY "last_name" ASC, "first_name" ASC',
        []
      );
    });
  });

  describe("limit() and offset()", () => {
    it("should build query with LIMIT", async () => {
      const builder = new QueryBuilder<TestUser>("users");
      await builder.select("*").limit(10).exec();

      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT * FROM "users" LIMIT 10',
        []
      );
    });

    it("should build query with OFFSET", async () => {
      const builder = new QueryBuilder<TestUser>("users");
      await builder.select("*").offset(5).exec();

      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT * FROM "users" OFFSET 5',
        []
      );
    });

    it("should build query with both LIMIT and OFFSET", async () => {
      const builder = new QueryBuilder<TestUser>("users");
      await builder.select("*").limit(10).offset(20).exec();

      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT * FROM "users" LIMIT 10 OFFSET 20',
        []
      );
    });
  });

  describe("exec()", () => {
    it("should return empty array when no results", async () => {
      mockAdapter.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const builder = new QueryBuilder<TestUser>("users");
      const results = await builder.select("*").exec();

      expect(results).toEqual([]);
    });

    it("should transform snake_case results to camelCase", async () => {
      mockAdapter.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            email: "test@example.com",
            first_name: "John",
            last_name: "Doe",
            created_at: new Date("2023-01-01"),
            is_active: true,
            age: 30,
          },
        ],
        rowCount: 1,
      });

      const builder = new QueryBuilder<TestUser>("users");
      const results = await builder.select("*").exec();

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 1,
        email: "test@example.com",
        firstName: "John",
        lastName: "Doe",
        createdAt: new Date("2023-01-01"),
        isActive: true,
        age: 30,
      });
    });
  });

  describe("first()", () => {
    it("should return first result", async () => {
      mockAdapter.query.mockResolvedValueOnce({
        rows: [{ id: 1, email: "test@example.com" }],
        rowCount: 1,
      });

      const builder = new QueryBuilder<TestUser>("users");
      const result = await builder.select("*").first();

      expect(result).toEqual({ id: 1, email: "test@example.com" });
    });

    it("should return null when no results", async () => {
      mockAdapter.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const builder = new QueryBuilder<TestUser>("users");
      const result = await builder.select("*").first();

      expect(result).toBeNull();
    });

    it("should add LIMIT 1 to query", async () => {
      mockAdapter.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const builder = new QueryBuilder<TestUser>("users");
      await builder.select("*").first();

      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT * FROM "users" LIMIT 1',
        []
      );
    });
  });

  describe("count()", () => {
    it("should return count of all rows", async () => {
      mockAdapter.query.mockResolvedValueOnce({
        rows: [{ count: "42" }],
        rowCount: 1,
      });

      const builder = new QueryBuilder<TestUser>("users");
      const count = await builder.select("*").count();

      expect(count).toBe(42);
      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM "users"',
        []
      );
    });

    it("should return count with WHERE conditions", async () => {
      mockAdapter.query.mockResolvedValueOnce({
        rows: [{ count: "10" }],
        rowCount: 1,
      });

      const builder = new QueryBuilder<TestUser>("users");
      const count = await builder.select("*").where("isActive", true).count();

      expect(count).toBe(10);
      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM "users" WHERE "is_active" = $1',
        [true]
      );
    });
  });

  describe("toSQL()", () => {
    it("should return SQL string and params", () => {
      const builder = new QueryBuilder<TestUser>("users");
      const { sql, params } = builder
        .select("id", "email")
        .where("isActive", true)
        .orderBy("createdAt", "DESC")
        .limit(10)
        .toSQL();

      expect(sql).toBe(
        'SELECT "id", "email" FROM "users" WHERE "is_active" = $1 ORDER BY "created_at" DESC LIMIT 10'
      );
      expect(params).toEqual([true]);
    });
  });

  describe("immutability", () => {
    it("should return a new builder instance on each chained call", async () => {
      const builder1 = new QueryBuilder<TestUser>("users");
      const builder2 = builder1.select("*");
      const builder3 = builder2.where("id", 1);
      const builder4 = builder3.orderBy("createdAt");

      // Each builder should be a different instance
      expect(builder1).not.toBe(builder2);
      expect(builder2).not.toBe(builder3);
      expect(builder3).not.toBe(builder4);
    });

    it("should not affect original builder when chaining", async () => {
      const builder1 = new QueryBuilder<TestUser>("users").select("*");
      const builder2 = builder1.where("id", 1);
      const builder3 = builder1.where("id", 2);

      await builder2.exec();
      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT * FROM "users" WHERE "id" = $1',
        [1]
      );

      await builder3.exec();
      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT * FROM "users" WHERE "id" = $1',
        [2]
      );
    });
  });

  describe("complex queries", () => {
    it("should build complex query with all clauses", async () => {
      const builder = new QueryBuilder<TestUser>("users");
      await builder
        .select("id", "email", "firstName")
        .where("isActive", true)
        .where("age", ">=", 18)
        .whereNotNull("email")
        .orderBy("lastName", "ASC")
        .orderBy("firstName", "ASC")
        .limit(25)
        .offset(50)
        .exec();

      expect(mockAdapter.query).toHaveBeenCalledWith(
        'SELECT "id", "email", "first_name" FROM "users" WHERE "is_active" = $1 AND "age" >= $2 AND "email" IS NOT NULL ORDER BY "last_name" ASC, "first_name" ASC LIMIT 25 OFFSET 50',
        [true, 18]
      );
    });
  });
});
