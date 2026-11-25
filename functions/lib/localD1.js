// functions/lib/localD1.js
// Local Node.js SQLite adapter implementing Cloudflare D1 prepare/bind/first/all/run/batch API
// Used exclusively for local Vite dev preview (.data/studio-hq-local.sqlite) and Node tests (:memory:).

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function createLocalD1(dbPath = ':memory:') {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec('PRAGMA journal_mode = WAL;');

  const d1 = {
    _sqlite: sqlite,
    prepare(sql) {
      let params = [];
      const stmtApi = {
        bind(...args) {
          params = args.map((v) => (v === undefined ? null : v));
          return stmtApi;
        },
        async first(colName) {
          const stmt = sqlite.prepare(sql);
          const row = stmt.get(...params);
          if (!row) return null;
          if (colName) return row[colName];
          return { ...row };
        },
        async all() {
          const stmt = sqlite.prepare(sql);
          const rows = stmt.all(...params);
          return {
            success: true,
            results: rows.map((r) => ({ ...r })),
            meta: { changes: 0 }
          };
        },
        async run() {
          const stmt = sqlite.prepare(sql);
          const columns = stmt.columns();
          if (columns.length > 0) {
            // D1 returns rows for statements that use RETURNING. Match that
            // behavior in the local SQLite adapter so canonical handlers can
            // consume batch results consistently in Node regression tests.
            const rows = stmt.all(...params);
            const isMutation = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql);
            const changes = isMutation
              ? Number(sqlite.prepare('SELECT changes() AS changes').get()?.changes ?? 0)
              : 0;
            return {
              success: true,
              results: rows.map((row) => ({ ...row })),
              meta: { changes, last_row_id: 0 }
            };
          }
          const info = stmt.run(...params);
          return {
            success: true,
            meta: {
              changes: Number(info?.changes ?? 0),
              last_row_id: Number(info?.lastInsertRowid ?? 0)
            }
          };
        }
      };
      return stmtApi;
    },
    async batch(statements) {
      const results = [];
      sqlite.exec('BEGIN');
      try {
        for (const s of statements) {
          results.push(await s.run());
        }
        sqlite.exec('COMMIT');
        return results;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
    exec(sqlText) {
      sqlite.exec(sqlText);
    },
    close() {
      sqlite.close();
    }
  };

  return d1;
}

export function applyHqMigrations(d1, migrationsDir = path.resolve('migrations/hq')) {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  d1.exec(`
    CREATE TABLE IF NOT EXISTS d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    );
  `);

  for (const file of files) {
    const existing = d1._sqlite
      .prepare('SELECT name FROM d1_migrations WHERE name = ?')
      .get(file);
    if (!existing) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      d1.exec(sql);
      d1._sqlite
        .prepare('INSERT INTO d1_migrations (name, applied_at) VALUES (?, ?)')
        .run(file, new Date().toISOString());
    }
  }
}
