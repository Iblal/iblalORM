-- IblalORM Sample Schema
-- 
-- This file contains sample tables for testing the schema introspection
-- and type generation features of IblalORM.
--
-- Run this file against your PostgreSQL database to set up test data:
--   psql -h localhost -U postgres -d iblal_orm_db -f db/schema.sql

-- =============================================================================
-- Drop existing tables (for clean re-runs)
-- =============================================================================

DROP TABLE IF EXISTS posts CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- =============================================================================
-- Users Table
-- =============================================================================

CREATE TABLE users (
    -- Primary key
    id              SERIAL PRIMARY KEY,
    
    -- User credentials
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    
    -- Profile information
    first_name      VARCHAR(100),
    last_name       VARCHAR(100),
    display_name    VARCHAR(100),
    bio             TEXT,
    avatar_url      VARCHAR(500),
    
    -- Account status
    is_active       BOOLEAN DEFAULT TRUE,
    is_verified     BOOLEAN DEFAULT FALSE,
    role            VARCHAR(50) DEFAULT 'user',
    
    -- Metadata
    last_login_at   TIMESTAMP WITHOUT TIME ZONE,
    login_count     INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster email lookups
CREATE INDEX idx_users_email ON users(email);

-- Index for filtering by status
CREATE INDEX idx_users_active ON users(is_active);

COMMENT ON TABLE users IS 'Stores user account information';
COMMENT ON COLUMN users.id IS 'Unique identifier for the user';
COMMENT ON COLUMN users.email IS 'User email address - used for authentication';
COMMENT ON COLUMN users.password_hash IS 'Hashed password (never store plain text!)';

-- =============================================================================
-- Posts Table
-- =============================================================================

CREATE TABLE posts (
    -- Primary key
    id              SERIAL PRIMARY KEY,
    
    -- Foreign key to users
    author_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Post content
    title           VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) NOT NULL UNIQUE,
    content         TEXT NOT NULL,
    excerpt         VARCHAR(500),
    
    -- Post metadata
    status          VARCHAR(50) DEFAULT 'draft',
    is_featured     BOOLEAN DEFAULT FALSE,
    view_count      INTEGER DEFAULT 0,
    
    -- SEO fields
    meta_title      VARCHAR(255),
    meta_description VARCHAR(500),
    
    -- Publishing info
    published_at    TIMESTAMP WITHOUT TIME ZONE,
    
    -- Timestamps
    created_at      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster author lookups
CREATE INDEX idx_posts_author ON posts(author_id);

-- Index for slug lookups
CREATE INDEX idx_posts_slug ON posts(slug);

-- Index for filtering by status
CREATE INDEX idx_posts_status ON posts(status);

-- Composite index for common queries
CREATE INDEX idx_posts_published ON posts(status, published_at) 
    WHERE status = 'published';

COMMENT ON TABLE posts IS 'Stores blog posts created by users';
COMMENT ON COLUMN posts.author_id IS 'Reference to the user who created this post';
COMMENT ON COLUMN posts.slug IS 'URL-friendly version of the title';
COMMENT ON COLUMN posts.status IS 'Post status: draft, published, archived';

-- =============================================================================
-- Sample Data (Optional)
-- =============================================================================

-- Insert sample users
INSERT INTO users (email, password_hash, first_name, last_name, display_name, is_verified, role)
VALUES 
    ('admin@example.com', '$2b$10$sample_hash_1', 'Admin', 'User', 'Admin', TRUE, 'admin'),
    ('john@example.com', '$2b$10$sample_hash_2', 'John', 'Doe', 'JohnD', TRUE, 'user'),
    ('jane@example.com', '$2b$10$sample_hash_3', 'Jane', 'Smith', 'JaneS', FALSE, 'user');

-- Insert sample posts
INSERT INTO posts (author_id, title, slug, content, excerpt, status, published_at)
VALUES 
    (1, 'Welcome to IblalORM', 'welcome-to-iblalorm', 
     'This is a sample post demonstrating the IblalORM type generation features.', 
     'Learn about IblalORM''s automatic type generation.',
     'published', CURRENT_TIMESTAMP),
    (2, 'Getting Started with TypeScript', 'getting-started-typescript',
     'TypeScript provides static typing for JavaScript, making your code more robust.',
     'An introduction to TypeScript for beginners.',
     'published', CURRENT_TIMESTAMP),
    (2, 'Advanced ORM Patterns', 'advanced-orm-patterns',
     'Exploring advanced patterns for working with ORMs in TypeScript.',
     'Deep dive into ORM design patterns.',
     'draft', NULL);

-- =============================================================================
-- Verification Queries
-- =============================================================================

-- Verify tables were created
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

-- Verify columns
-- SELECT table_name, column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' 
-- ORDER BY table_name, ordinal_position;
