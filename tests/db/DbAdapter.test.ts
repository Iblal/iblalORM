/**
 * IblalORM DbAdapter Unit Tests
 *
 * Tests for the database adapter singleton pattern and query methods.
 */

import { PoolClient, QueryResult } from "pg";

// Create mock functions outside so we can access them
const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockOn = jest.fn();
const mockEnd = jest.fn();

// Mock pg module
jest.mock("pg", () => {
  return {
    Pool: jest.fn(() => ({
      query: mockQuery,
      connect: mockConnect,
      on: mockOn,
      totalCount: 5,
      idleCount: 3,
      waitingCount: 0,
      end: mockEnd,
    })),
  };
});

// Mock the config to avoid actual database connection
jest.mock("../../src/config/db.config", () => ({
  dbConfig: {
    host: "localhost",
    port: 5432,
    database: "test_db",
    user: "test_user",
    password: "test_password",
  },
}));

describe("DbAdapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe("getInstance()", () => {
    it("should return a DbAdapter instance", () => {
      const { DbAdapter } = require("../../src/db/DbAdapter");
      const instance = DbAdapter.getInstance();

      expect(instance).toBeDefined();
    });

    it("should return the same instance on subsequent calls (singleton)", () => {
      const { DbAdapter } = require("../../src/db/DbAdapter");
      const instance1 = DbAdapter.getInstance();
      const instance2 = DbAdapter.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe("query()", () => {
    it("should execute a query with parameters", async () => {
      const { DbAdapter } = require("../../src/db/DbAdapter");
      const mockResult: QueryResult = {
        rows: [{ id: 1, name: "Test" }],
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
      };

      mockQuery.mockResolvedValueOnce(mockResult);

      const adapter = DbAdapter.getInstance();
      const result = await adapter.query("SELECT * FROM users WHERE id = $1", [
        1,
      ]);

      expect(mockQuery).toHaveBeenCalledWith(
        "SELECT * FROM users WHERE id = $1",
        [1]
      );
      expect(result.rows).toEqual([{ id: 1, name: "Test" }]);
    });

    it("should execute a query without parameters", async () => {
      const { DbAdapter } = require("../../src/db/DbAdapter");
      const mockResult: QueryResult = {
        rows: [{ count: "42" }],
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
      };

      mockQuery.mockResolvedValueOnce(mockResult);

      const adapter = DbAdapter.getInstance();
      const result = await adapter.query("SELECT COUNT(*) FROM users");

      expect(mockQuery).toHaveBeenCalledWith("SELECT COUNT(*) FROM users", []);
      expect(result.rows[0].count).toBe("42");
    });

    it("should throw error when query fails", async () => {
      const { DbAdapter } = require("../../src/db/DbAdapter");
      mockQuery.mockRejectedValueOnce(new Error("Connection failed"));

      const adapter = DbAdapter.getInstance();

      await expect(adapter.query("SELECT * FROM users")).rejects.toThrow(
        "Database query failed: Connection failed"
      );
    });

    it("should handle unknown errors", async () => {
      const { DbAdapter } = require("../../src/db/DbAdapter");
      mockQuery.mockRejectedValueOnce("Unknown error");

      const adapter = DbAdapter.getInstance();

      await expect(adapter.query("SELECT * FROM users")).rejects.toThrow(
        "Database query failed: Unknown database error"
      );
    });
  });

  describe("getClient()", () => {
    it("should return a pool client for transactions", async () => {
      const { DbAdapter } = require("../../src/db/DbAdapter");
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient as unknown as PoolClient);

      const adapter = DbAdapter.getInstance();
      const client = await adapter.getClient();

      expect(client).toBe(mockClient);
      expect(mockConnect).toHaveBeenCalled();
    });

    it("should throw error when connection fails", async () => {
      const { DbAdapter } = require("../../src/db/DbAdapter");
      mockConnect.mockRejectedValueOnce(new Error("Pool exhausted"));

      const adapter = DbAdapter.getInstance();

      await expect(adapter.getClient()).rejects.toThrow(
        "Failed to get database client: Pool exhausted"
      );
    });
  });

  describe("testConnection()", () => {
    it("should return true when connection is successful", async () => {
      const { DbAdapter } = require("../../src/db/DbAdapter");
      mockQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const adapter = DbAdapter.getInstance();
      const result = await adapter.testConnection();

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith("SELECT 1", []);
    });

    it("should throw error when connection test fails", async () => {
      const { DbAdapter } = require("../../src/db/DbAdapter");
      mockQuery.mockRejectedValueOnce(new Error("Connection refused"));

      const adapter = DbAdapter.getInstance();

      await expect(adapter.testConnection()).rejects.toThrow();
    });
  });

  describe("getPoolStats()", () => {
    it("should return pool statistics", () => {
      const { DbAdapter } = require("../../src/db/DbAdapter");
      const adapter = DbAdapter.getInstance();
      const stats = adapter.getPoolStats();

      expect(stats).toEqual({
        totalCount: 5,
        idleCount: 3,
        waitingCount: 0,
      });
    });
  });

  describe("getConnectionStatus()", () => {
    it("should return connection status", () => {
      const { DbAdapter } = require("../../src/db/DbAdapter");
      const adapter = DbAdapter.getInstance();

      // Initially should be false (before any successful query)
      const status = adapter.getConnectionStatus();
      expect(typeof status).toBe("boolean");
    });
  });
});

describe("getDbAdapter()", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it("should return the DbAdapter singleton instance", () => {
    const { getDbAdapter, DbAdapter } = require("../../src/db/DbAdapter");

    const adapterFromFunction = getDbAdapter();
    const adapterFromClass = DbAdapter.getInstance();

    expect(adapterFromFunction).toBe(adapterFromClass);
  });
});
