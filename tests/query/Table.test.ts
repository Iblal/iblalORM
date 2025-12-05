/**
 * IblalORM Table Repository Unit Tests
 *
 * Tests for the Table class including CRUD operations.
 */

import { Table, InsertData, UpdateData } from "../../src/query/Table";
import { QueryBuilder } from "../../src/query/QueryBuilder";

// Mock the DbAdapter
jest.mock("../../src/db/DbAdapter", () => ({
  getDbAdapter: jest.fn(() => ({
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  })),
}));

import { getDbAdapter } from "../../src/db/DbAdapter";

// Sample model interface for testing
interface TestPost {
  id: number;
  title: string;
  content: string;
  authorId: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Auto-generated fields
type PostAutoFields = "id" | "createdAt" | "updatedAt";

describe("Table", () => {
  let mockAdapter: { query: jest.Mock };
  let table: Table<TestPost, PostAutoFields>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAdapter = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    };
    (getDbAdapter as jest.Mock).mockReturnValue(mockAdapter);
    table = new Table<TestPost, PostAutoFields>("posts");
  });

  describe("constructor", () => {
    it("should create a Table instance with table name", () => {
      const t = new Table<TestPost>("posts");
      expect(t).toBeInstanceOf(Table);
    });

    it("should create a Table instance with custom auto fields", () => {
      const t = new Table<TestPost, PostAutoFields>("posts", [
        "id",
        "createdAt",
        "updatedAt",
      ]);
      expect(t).toBeInstanceOf(Table);
    });
  });

  describe("select()", () => {
    it("should return a QueryBuilder for SELECT * queries", () => {
      const builder = table.select("*");
      expect(builder).toBeInstanceOf(QueryBuilder);
    });

    it("should return a QueryBuilder for specific columns", () => {
      const builder = table.select("id", "title");
      expect(builder).toBeInstanceOf(QueryBuilder);
    });
  });

  describe("where()", () => {
    it("should return a QueryBuilder with WHERE condition", () => {
      const builder = table.where("authorId", 1);
      expect(builder).toBeInstanceOf(QueryBuilder);
    });
  });

  describe("findById()", () => {
    it("should find a record by ID", async () => {
      mockAdapter.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            title: "Test Post",
            content: "Test content",
            author_id: 1,
            published_at: null,
            created_at: new Date("2023-01-01"),
            updated_at: new Date("2023-01-01"),
          },
        ],
        rowCount: 1,
      });

      const result = await table.findById(1);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(1);
      expect(result?.title).toBe("Test Post");
    });

    it("should return null when record not found", async () => {
      mockAdapter.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await table.findById(999);

      expect(result).toBeNull();
    });
  });

  describe("findAll()", () => {
    it("should return all records", async () => {
      mockAdapter.query.mockResolvedValueOnce({
        rows: [
          { id: 1, title: "Post 1", content: "Content 1", author_id: 1 },
          { id: 2, title: "Post 2", content: "Content 2", author_id: 2 },
        ],
        rowCount: 2,
      });

      const results = await table.findAll();

      expect(results).toHaveLength(2);
      expect(results[0].title).toBe("Post 1");
      expect(results[1].title).toBe("Post 2");
    });

    it("should return empty array when no records", async () => {
      mockAdapter.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const results = await table.findAll();

      expect(results).toEqual([]);
    });
  });

  describe("insert()", () => {
    it("should insert a single record", async () => {
      const insertedRow = {
        id: 1,
        title: "New Post",
        content: "New content",
        author_id: 1,
        published_at: null,
        created_at: new Date("2023-01-01"),
        updated_at: new Date("2023-01-01"),
      };

      mockAdapter.query.mockResolvedValueOnce({
        rows: [insertedRow],
        rowCount: 1,
      });

      const data: InsertData<TestPost, PostAutoFields> = {
        title: "New Post",
        content: "New content",
        authorId: 1,
      };

      const result = await table.insert(data);

      expect(result.id).toBe(1);
      expect(result.title).toBe("New Post");
      expect(mockAdapter.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO "posts"'),
        expect.arrayContaining(["New Post", "New content", 1])
      );
    });

    it("should exclude auto-generated fields from INSERT", async () => {
      mockAdapter.query.mockResolvedValueOnce({
        rows: [{ id: 1, title: "Test", content: "Content", author_id: 1 }],
        rowCount: 1,
      });

      const data: InsertData<TestPost, PostAutoFields> = {
        title: "Test",
        content: "Content",
        authorId: 1,
      };

      await table.insert(data);

      const sqlCall = mockAdapter.query.mock.calls[0][0];
      expect(sqlCall).not.toContain('"id"');
      expect(sqlCall).not.toContain('"created_at"');
      expect(sqlCall).not.toContain('"updated_at"');
    });

    it("should handle nullable fields", async () => {
      mockAdapter.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            title: "Test",
            content: "Content",
            author_id: 1,
            published_at: new Date("2023-06-01"),
          },
        ],
        rowCount: 1,
      });

      const data: InsertData<TestPost, PostAutoFields> = {
        title: "Test",
        content: "Content",
        authorId: 1,
        publishedAt: new Date("2023-06-01"),
      };

      const result = await table.insert(data);

      expect(result.publishedAt).toEqual(new Date("2023-06-01"));
    });
  });

  describe("insertMany()", () => {
    it("should insert multiple records", async () => {
      mockAdapter.query.mockResolvedValueOnce({
        rows: [
          { id: 1, title: "Post 1", content: "Content 1", author_id: 1 },
          { id: 2, title: "Post 2", content: "Content 2", author_id: 2 },
        ],
        rowCount: 2,
      });

      const data: InsertData<TestPost, PostAutoFields>[] = [
        { title: "Post 1", content: "Content 1", authorId: 1 },
        { title: "Post 2", content: "Content 2", authorId: 2 },
      ];

      const results = await table.insertMany(data);

      expect(results).toHaveLength(2);
      expect(results[0].title).toBe("Post 1");
      expect(results[1].title).toBe("Post 2");
    });

    it("should return empty array when inserting empty array", async () => {
      const results = await table.insertMany([]);

      expect(results).toEqual([]);
      expect(mockAdapter.query).not.toHaveBeenCalled();
    });
  });

  describe("update()", () => {
    it("should update records matching condition", async () => {
      mockAdapter.query.mockResolvedValueOnce({
        rows: [
          { id: 1, title: "Updated Title", content: "Content", author_id: 1 },
        ],
        rowCount: 1,
      });

      const data: UpdateData<TestPost, PostAutoFields> = {
        title: "Updated Title",
      };

      const results = await table.update(data).where("id", 1).exec();

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Updated Title");
      expect(mockAdapter.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "posts"'),
        expect.arrayContaining(["Updated Title", 1])
      );
    });

    it("should automatically update updatedAt field", async () => {
      mockAdapter.query.mockResolvedValueOnce({
        rows: [{ id: 1, title: "Updated" }],
        rowCount: 1,
      });

      await table.update({ title: "Updated" }).where("id", 1).exec();

      const sqlCall = mockAdapter.query.mock.calls[0][0];
      expect(sqlCall).toContain('"updated_at" = CURRENT_TIMESTAMP');
    });

    it("should throw error when no WHERE condition", async () => {
      const data: UpdateData<TestPost, PostAutoFields> = {
        title: "Updated Title",
      };

      await expect(table.update(data).exec()).rejects.toThrow(
        "UPDATE requires at least one WHERE condition for safety"
      );
    });

    it("should throw error when no valid fields to update", async () => {
      // Empty object should throw
      await expect(table.update({}).where("id", 1).exec()).rejects.toThrow(
        "No valid fields to update"
      );
    });
  });

  describe("updateById()", () => {
    it("should update a record by ID", async () => {
      mockAdapter.query.mockResolvedValueOnce({
        rows: [{ id: 1, title: "Updated", content: "Content" }],
        rowCount: 1,
      });

      const result = await table.updateById(1, { title: "Updated" });

      expect(result).not.toBeNull();
      expect(result?.title).toBe("Updated");
    });

    it("should return null when record not found", async () => {
      mockAdapter.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await table.updateById(999, { title: "Updated" });

      expect(result).toBeNull();
    });
  });

  describe("delete()", () => {
    it("should delete records matching condition", async () => {
      mockAdapter.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const count = await table.delete().where("id", 1).exec();

      expect(count).toBe(1);
      expect(mockAdapter.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM "posts"'),
        [1]
      );
    });

    it("should throw error when no WHERE condition", async () => {
      await expect(table.delete().exec()).rejects.toThrow(
        "DELETE requires at least one WHERE condition for safety"
      );
    });

    it("should return 0 when no records deleted", async () => {
      mockAdapter.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const count = await table.delete().where("id", 999).exec();

      expect(count).toBe(0);
    });
  });

  describe("deleteById()", () => {
    it("should delete a record by ID", async () => {
      mockAdapter.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await table.deleteById(1);

      expect(result).toBe(true);
    });

    it("should return false when record not found", async () => {
      mockAdapter.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await table.deleteById(999);

      expect(result).toBe(false);
    });
  });

  describe("update chaining", () => {
    it("should support multiple WHERE conditions", async () => {
      mockAdapter.query.mockResolvedValueOnce({
        rows: [{ id: 1, title: "Updated" }],
        rowCount: 1,
      });

      await table
        .update({ title: "Updated" })
        .where("id", 1)
        .where("authorId", 5)
        .exec();

      const sqlCall = mockAdapter.query.mock.calls[0][0];
      expect(sqlCall).toContain("WHERE");
      expect(sqlCall).toContain('"id"');
      expect(sqlCall).toContain('"author_id"');
    });
  });

  describe("delete chaining", () => {
    it("should support multiple WHERE conditions", async () => {
      mockAdapter.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await table.delete().where("id", 1).where("authorId", 5).exec();

      const sqlCall = mockAdapter.query.mock.calls[0][0];
      expect(sqlCall).toContain("WHERE");
    });
  });
});
