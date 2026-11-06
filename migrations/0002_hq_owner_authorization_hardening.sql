-- migrations/0002_hq_owner_authorization_hardening.sql
-- Studio HQ Owner Authorization Hardening Schema & Tables

-- 1. Owner Users Table
CREATE TABLE IF NOT EXISTS hq_users (
    id TEXT PRIMARY KEY, -- Firebase UID
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'owner',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_login_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_hq_users_status ON hq_users(status);
CREATE INDEX IF NOT EXISTS idx_hq_users_email ON hq_users(email);

-- 2. Audit Logs Table
CREATE TABLE IF NOT EXISTS hq_audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hq_audit_user_action ON hq_audit_logs(user_id, created_at);

-- 3. CRM Clients Table
CREATE TABLE IF NOT EXISTS hq_clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    company TEXT,
    email TEXT,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hq_clients_status ON hq_clients(status);

-- 4. Projects Table
CREATE TABLE IF NOT EXISTS hq_projects (
    id TEXT PRIMARY KEY,
    client_id TEXT REFERENCES hq_clients(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'planning',
    budget REAL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hq_projects_status ON hq_projects(status);
CREATE INDEX IF NOT EXISTS idx_hq_projects_client ON hq_projects(client_id);

-- 5. Tasks Table
CREATE TABLE IF NOT EXISTS hq_tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES hq_projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'medium',
    due_date INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hq_tasks_project ON hq_tasks(project_id);

-- 6. Milestones Table
CREATE TABLE IF NOT EXISTS hq_milestones (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES hq_projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    target_date INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hq_milestones_project ON hq_milestones(project_id);
