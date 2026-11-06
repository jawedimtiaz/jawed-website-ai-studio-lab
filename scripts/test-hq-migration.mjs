import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const sql = readFileSync('migrations/hq/0001_studio_hq_schema.sql', 'utf8');
const db = new DatabaseSync(':memory:');

try {
  // D1 enforces foreign keys by default; mirror that behavior in local SQLite.\n  db.exec('PRAGMA foreign_keys = ON');\n  db.exec(sql);

  const expectedTables = [
    'hq_users', 'clients', 'client_contacts', 'projects',
    'project_milestones', 'project_tasks', 'repositories',
    'deployments', 'approvals', 'qa_checks', 'quotations',
    'invoices', 'payments', 'maintenance_plans', 'assets',
    'activity_notes', 'audit_logs'
  ];
  const actualTables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all().map(row => row.name);
  for (const table of expectedTables) assert.ok(actualTables.includes(table), `missing table: ${table}`);

  db.prepare("INSERT INTO hq_users (uid,email) VALUES (?,?)").run('owner-1', 'jawedimtiaz@gmail.com');
  db.prepare("INSERT INTO clients (id,name,created_by) VALUES (?,?,?)").run('client-1', 'Test Client', 'owner-1');
  db.prepare("INSERT INTO projects (id,client_id,name,created_by) VALUES (?,?,?,?)")
    .run('project-1', 'client-1', 'Test Website', 'owner-1');

  // Archive and restore are reversible.
  db.prepare("UPDATE clients SET archived_at=?, archived_by=? WHERE id=?")
    .run('2026-11-06T00:00:00.000Z', 'owner-1', 'client-1');
  assert.equal(db.prepare("SELECT archived_at FROM clients WHERE id=?").get('client-1').archived_at, '2026-11-06T00:00:00.000Z');
  db.prepare("UPDATE clients SET archived_at=NULL, archived_by=NULL WHERE id=?").run('client-1');
  assert.equal(db.prepare("SELECT archived_at FROM clients WHERE id=?").get('client-1').archived_at, null);

  // Restrictive foreign keys prevent deleting a client with a project.
  assert.throws(() => db.prepare("DELETE FROM clients WHERE id=?").run('client-1'));

  // Audit rows are append-only.
  db.prepare("INSERT INTO audit_logs (id,actor_uid,actor_email,action,entity_type,entity_id,after_json) VALUES (?,?,?,?,?,?,?)")
    .run('audit-1', 'owner-1', 'jawedimtiaz@gmail.com', 'create', 'client', 'client-1', JSON.stringify({ name: 'Test Client' }));
  assert.throws(() => db.prepare("UPDATE audit_logs SET action='tamper' WHERE id='audit-1'").run());
  assert.throws(() => db.prepare("DELETE FROM audit_logs WHERE id='audit-1'").run());

  // JSON audit payloads must be valid JSON.
  assert.throws(() => db.prepare(
    "INSERT INTO audit_logs (id,actor_email,action,entity_type,after_json) VALUES ('bad-json','owner@example.com','create','client','not-json')"
  ).run());

  const fkErrors = db.prepare('PRAGMA foreign_key_check').all();
  assert.equal(fkErrors.length, 0, 'foreign key check must be clean');

  console.log(`Studio HQ D1 schema validation passed: ${expectedTables.length} tables, archive/restore, FK restrictions, append-only audit, JSON validation.`);
} finally {
  db.close();
}
