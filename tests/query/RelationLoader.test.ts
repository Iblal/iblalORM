/**
 * IblalORM RelationLoader Unit Tests
 *
 * Tests for eager loading relationships.
 */

import {
  RelationLoader,
  RelationMeta,
  ModelRelationMeta,
} from "../../src/query/RelationLoader";

// Mock the DbAdapter
const mockQuery = jest.fn();

jest.mock("../../src/db/DbAdapter", () => ({
  getDbAdapter: jest.fn(() => ({
    query: mockQuery,
  })),
}));

// Sample model interfaces for testing
interface TestUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  posts?: TestPost[];
  profile?: TestProfile;
}

interface TestPost {
  id: number;
  title: string;
  content: string;
  authorId: number;
  author?: TestUser;
  categoryId: number | null;
  category?: TestCategory;
}

interface TestProfile {
  id: number;
  userId: number;
  bio: string;
  user?: TestUser;
}

interface TestCategory {
  id: number;
  name: string;
  posts?: TestPost[];
}

describe("RelationLoader", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("loadRelations()", () => {
    describe("belongsTo relationships", () => {
      it("should load belongsTo relationship", async () => {
        const relationMeta: ModelRelationMeta = {
          author: {
            type: "belongsTo",
            targetTable: "users",
            sourceColumn: "author_id",
            targetColumn: "id",
          },
        };

        const posts = [
          { id: 1, title: "Post 1", content: "Content 1", authorId: 1 },
          { id: 2, title: "Post 2", content: "Content 2", authorId: 2 },
        ] as unknown as TestPost[];

        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              email: "user1@test.com",
              first_name: "John",
              last_name: "Doe",
            },
            {
              id: 2,
              email: "user2@test.com",
              first_name: "Jane",
              last_name: "Smith",
            },
          ],
          rowCount: 2,
        });

        const loader = new RelationLoader<TestPost>(
          "Post",
          "posts",
          relationMeta
        );
        const result = await loader.loadRelations(posts, ["author"]);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('SELECT * FROM "users"'),
          [1, 2]
        );

        expect(result[0].author).toEqual({
          id: 1,
          email: "user1@test.com",
          firstName: "John",
          lastName: "Doe",
        });
        expect(result[1].author).toEqual({
          id: 2,
          email: "user2@test.com",
          firstName: "Jane",
          lastName: "Smith",
        });
      });

      it("should handle null foreign keys in belongsTo", async () => {
        const relationMeta: ModelRelationMeta = {
          category: {
            type: "belongsTo",
            targetTable: "categories",
            sourceColumn: "category_id",
            targetColumn: "id",
          },
        };

        const posts = [
          { id: 1, title: "Post 1", categoryId: 1 },
          { id: 2, title: "Post 2", categoryId: null },
        ] as unknown as TestPost[];

        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 1, name: "Tech" }],
          rowCount: 1,
        });

        const loader = new RelationLoader<TestPost>(
          "Post",
          "posts",
          relationMeta
        );
        const result = await loader.loadRelations(posts, ["category"]);

        expect(result[0].category).toEqual({ id: 1, name: "Tech" });
        expect(result[1].category).toBeNull();
      });

      it("should not make query when all foreign keys are null", async () => {
        const relationMeta: ModelRelationMeta = {
          category: {
            type: "belongsTo",
            targetTable: "categories",
            sourceColumn: "category_id",
            targetColumn: "id",
          },
        };

        const posts = [
          { id: 1, title: "Post 1", categoryId: null },
          { id: 2, title: "Post 2", categoryId: null },
        ] as unknown as TestPost[];

        const loader = new RelationLoader<TestPost>(
          "Post",
          "posts",
          relationMeta
        );
        await loader.loadRelations(posts, ["category"]);

        expect(mockQuery).not.toHaveBeenCalled();
      });
    });

    describe("hasMany relationships", () => {
      it("should load hasMany relationship", async () => {
        const relationMeta: ModelRelationMeta = {
          posts: {
            type: "hasMany",
            targetTable: "posts",
            sourceColumn: "id",
            targetColumn: "author_id",
          },
        };

        const users = [
          {
            id: 1,
            email: "user1@test.com",
            firstName: "John",
            lastName: "Doe",
          },
          {
            id: 2,
            email: "user2@test.com",
            firstName: "Jane",
            lastName: "Smith",
          },
        ] as unknown as TestUser[];

        mockQuery.mockResolvedValueOnce({
          rows: [
            { id: 1, title: "Post 1", author_id: 1 },
            { id: 2, title: "Post 2", author_id: 1 },
            { id: 3, title: "Post 3", author_id: 2 },
          ],
          rowCount: 3,
        });

        const loader = new RelationLoader<TestUser>(
          "User",
          "users",
          relationMeta
        );
        const result = await loader.loadRelations(users, ["posts"]);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('SELECT * FROM "posts"'),
          [1, 2]
        );

        expect(result[0].posts).toHaveLength(2);
        expect(result[0].posts?.[0].title).toBe("Post 1");
        expect(result[0].posts?.[1].title).toBe("Post 2");
        expect(result[1].posts).toHaveLength(1);
        expect(result[1].posts?.[0].title).toBe("Post 3");
      });

      it("should return empty array for hasMany when no related records", async () => {
        const relationMeta: ModelRelationMeta = {
          posts: {
            type: "hasMany",
            targetTable: "posts",
            sourceColumn: "id",
            targetColumn: "author_id",
          },
        };

        const users = [
          { id: 1, email: "user1@test.com" },
        ] as unknown as TestUser[];

        mockQuery.mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        });

        const loader = new RelationLoader<TestUser>(
          "User",
          "users",
          relationMeta
        );
        const result = await loader.loadRelations(users, ["posts"]);

        expect(result[0].posts).toEqual([]);
      });
    });

    describe("hasOne relationships", () => {
      it("should load hasOne relationship", async () => {
        const relationMeta: ModelRelationMeta = {
          profile: {
            type: "hasOne",
            targetTable: "profiles",
            sourceColumn: "id",
            targetColumn: "user_id",
          },
        };

        const users = [
          { id: 1, email: "user1@test.com" },
          { id: 2, email: "user2@test.com" },
        ] as unknown as TestUser[];

        mockQuery.mockResolvedValueOnce({
          rows: [
            { id: 1, user_id: 1, bio: "Bio for user 1" },
            { id: 2, user_id: 2, bio: "Bio for user 2" },
          ],
          rowCount: 2,
        });

        const loader = new RelationLoader<TestUser>(
          "User",
          "users",
          relationMeta
        );
        const result = await loader.loadRelations(users, ["profile"]);

        expect(result[0].profile).toEqual({
          id: 1,
          userId: 1,
          bio: "Bio for user 1",
        });
        expect(result[1].profile).toEqual({
          id: 2,
          userId: 2,
          bio: "Bio for user 2",
        });
      });

      it("should return null for hasOne when no related record", async () => {
        const relationMeta: ModelRelationMeta = {
          profile: {
            type: "hasOne",
            targetTable: "profiles",
            sourceColumn: "id",
            targetColumn: "user_id",
          },
        };

        const users = [
          { id: 1, email: "user1@test.com" },
        ] as unknown as TestUser[];

        mockQuery.mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        });

        const loader = new RelationLoader<TestUser>(
          "User",
          "users",
          relationMeta
        );
        const result = await loader.loadRelations(users, ["profile"]);

        expect(result[0].profile).toBeNull();
      });
    });

    describe("edge cases", () => {
      it("should return empty array when no records provided", async () => {
        const relationMeta: ModelRelationMeta = {};
        const loader = new RelationLoader<TestUser>(
          "User",
          "users",
          relationMeta
        );

        const result = await loader.loadRelations([], ["posts"]);

        expect(result).toEqual([]);
        expect(mockQuery).not.toHaveBeenCalled();
      });

      it("should warn and skip unknown relationships", async () => {
        const relationMeta: ModelRelationMeta = {};
        const users = [
          { id: 1, email: "test@test.com" },
        ] as unknown as TestUser[];

        const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

        const loader = new RelationLoader<TestUser>(
          "User",
          "users",
          relationMeta
        );
        await loader.loadRelations(users, ["unknownRelation" as any]);

        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Unknown relationship "unknownRelation"')
        );

        consoleWarnSpy.mockRestore();
      });

      it("should load multiple relationships in sequence", async () => {
        const relationMeta: ModelRelationMeta = {
          posts: {
            type: "hasMany",
            targetTable: "posts",
            sourceColumn: "id",
            targetColumn: "author_id",
          },
          profile: {
            type: "hasOne",
            targetTable: "profiles",
            sourceColumn: "id",
            targetColumn: "user_id",
          },
        };

        const users = [
          { id: 1, email: "user1@test.com" },
        ] as unknown as TestUser[];

        mockQuery
          .mockResolvedValueOnce({
            rows: [{ id: 1, title: "Post 1", author_id: 1 }],
            rowCount: 1,
          })
          .mockResolvedValueOnce({
            rows: [{ id: 1, user_id: 1, bio: "Bio" }],
            rowCount: 1,
          });

        const loader = new RelationLoader<TestUser>(
          "User",
          "users",
          relationMeta
        );
        const result = await loader.loadRelations(users, ["posts", "profile"]);

        expect(mockQuery).toHaveBeenCalledTimes(2);
        expect(result[0].posts).toHaveLength(1);
        expect(result[0].profile).toBeDefined();
      });
    });
  });
});
