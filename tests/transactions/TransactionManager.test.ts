/**
 * IblalORM TransactionManager Unit Tests
 *
 * Tests for transaction handling with automatic commit/rollback.
 */

import { PoolClient } from 'pg';

// Create mock functions
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockPoolQuery = jest.fn();
const mockPoolConnect = jest.fn();

// Mock pg module
jest.mock('pg', () => ({
  Pool: jest.fn(() => ({
    query: mockPoolQuery,
    connect: mockPoolConnect,
    on: jest.fn(),
    totalCount: 5,
    idleCount: 3,
    waitingCount: 0,
  })),
}));

// Mock the config
jest.mock('../../src/config/db.config', () => ({
  dbConfig: {
    host: 'localhost',
    port: 5432,
    database: 'test_db',
    user: 'test_user',
    password: 'test_password',
  },
}));

describe('TransactionClient', () => {
  let TransactionClient: typeof import('../../src/transactions/TransactionManager').TransactionClient;
  let mockClient: PoolClient;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    mockClient = {
      query: mockClientQuery,
      release: mockClientRelease,
    } as unknown as PoolClient;

    ({ TransactionClient } = require('../../src/transactions/TransactionManager'));
  });

  describe('query()', () => {
    it('should execute a query within the transaction', async () => {
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test' }],
        rowCount: 1,
      });

      const trx = new TransactionClient(mockClient);
      const result = await trx.query('SELECT * FROM users WHERE id = $1', [1]);

      expect(mockClientQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1]);
      expect(result.rows).toEqual([{ id: 1, name: 'Test' }]);
    });

    it('should throw error if transaction is completed', async () => {
      const trx = new TransactionClient(mockClient);
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await trx.commit();

      await expect(trx.query('SELECT 1')).rejects.toThrow(
        'Transaction has already been completed'
      );
    });
  });

  describe('commit()', () => {
    it('should commit the transaction', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const trx = new TransactionClient(mockClient);
      await trx.commit();

      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
    });

    it('should throw error if already committed', async () => {
      mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const trx = new TransactionClient(mockClient);
      await trx.commit();

      await expect(trx.commit()).rejects.toThrow(
        'Transaction has already been completed'
      );
    });

    it('should mark transaction as inactive', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const trx = new TransactionClient(mockClient);
      expect(trx.isActive).toBe(true);
      
      await trx.commit();
      
      expect(trx.isActive).toBe(false);
    });
  });

  describe('rollback()', () => {
    it('should rollback the transaction', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const trx = new TransactionClient(mockClient);
      await trx.rollback();

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should not throw error if already rolled back', async () => {
      mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const trx = new TransactionClient(mockClient);
      await trx.rollback();
      
      // Should not throw
      await trx.rollback();
      
      // ROLLBACK should only be called once
      expect(mockClientQuery).toHaveBeenCalledTimes(1);
    });

    it('should mark transaction as inactive', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const trx = new TransactionClient(mockClient);
      await trx.rollback();
      
      expect(trx.isActive).toBe(false);
    });
  });

  describe('release()', () => {
    it('should release the client back to the pool', () => {
      const trx = new TransactionClient(mockClient);
      trx.release();

      expect(mockClientRelease).toHaveBeenCalled();
    });
  });

  describe('isActive', () => {
    it('should return true for new transaction', () => {
      const trx = new TransactionClient(mockClient);
      expect(trx.isActive).toBe(true);
    });

    it('should return false after commit', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const trx = new TransactionClient(mockClient);
      await trx.commit();
      
      expect(trx.isActive).toBe(false);
    });

    it('should return false after rollback', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const trx = new TransactionClient(mockClient);
      await trx.rollback();
      
      expect(trx.isActive).toBe(false);
    });
  });
});

describe('transaction()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    mockPoolConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    } as unknown as PoolClient);
  });

  it('should commit on successful callback', async () => {
    mockClientQuery.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

    const { transaction } = require('../../src/transactions/TransactionManager');
    
    const result = await transaction(async (trx: any) => {
      await trx.query('INSERT INTO users (name) VALUES ($1)', ['John']);
      return { success: true };
    });

    expect(result).toEqual({ success: true });
    expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
    expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
    expect(mockClientRelease).toHaveBeenCalled();
  });

  it('should rollback on callback error', async () => {
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const { transaction } = require('../../src/transactions/TransactionManager');
    
    await expect(
      transaction(async (trx: any) => {
        await trx.query('INSERT INTO users (name) VALUES ($1)', ['John']);
        throw new Error('Test error');
      })
    ).rejects.toThrow('Test error');

    expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
    expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClientRelease).toHaveBeenCalled();
  });

  it('should release client even on error', async () => {
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const { transaction } = require('../../src/transactions/TransactionManager');
    
    try {
      await transaction(async () => {
        throw new Error('Test error');
      });
    } catch (e) {
      // Expected
    }

    expect(mockClientRelease).toHaveBeenCalled();
  });
});
