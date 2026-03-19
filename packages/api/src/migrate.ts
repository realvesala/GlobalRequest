import Database from 'better-sqlite3';
import db from './db';

const SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      sso_subject   TEXT UNIQUE NOT NULL,
      email         TEXT NOT NULL,
      display_name  TEXT NOT NULL,
      role          TEXT NOT NULL CHECK(role IN ('Requestor','Lab_Technician','Lab_Manager','Admin')),
      region        TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS labs (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      region        TEXT NOT NULL,
      contact_info  TEXT,
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS methods (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      description       TEXT,
      required_material TEXT,
      is_active         INTEGER NOT NULL DEFAULT 1,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lab_methods (
      lab_id    TEXT NOT NULL REFERENCES labs(id),
      method_id TEXT NOT NULL REFERENCES methods(id),
      PRIMARY KEY (lab_id, method_id)
    );

    CREATE TABLE IF NOT EXISTS requests (
      id                        TEXT PRIMARY KEY,
      requestor_id              TEXT NOT NULL REFERENCES users(id),
      method_id                 TEXT NOT NULL REFERENCES methods(id),
      material_description      TEXT NOT NULL,
      purpose_description       TEXT NOT NULL,
      desired_completion        TEXT NOT NULL,
      status                    TEXT NOT NULL CHECK(status IN ('Submitted','Assigned','In_Progress','Results_Ready','Closed','Unroutable')),
      assigned_lab_id           TEXT REFERENCES labs(id),
      assigned_technician_id    TEXT REFERENCES users(id),
      routing_override_reason   TEXT,
      routing_override_by       TEXT REFERENCES users(id),
      notes                     TEXT DEFAULT '[]',
      submitted_at              TEXT NOT NULL,
      updated_at                TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS request_status_history (
      id              TEXT PRIMARY KEY,
      request_id      TEXT NOT NULL REFERENCES requests(id),
      previous_status TEXT,
      new_status      TEXT NOT NULL,
      changed_by      TEXT NOT NULL REFERENCES users(id),
      changed_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS results (
      id          TEXT PRIMARY KEY,
      request_id  TEXT NOT NULL REFERENCES requests(id),
      uploaded_by TEXT NOT NULL REFERENCES users(id),
      file_key    TEXT NOT NULL,
      file_name   TEXT NOT NULL,
      mime_type   TEXT,
      uploaded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id),
      request_id  TEXT REFERENCES requests(id),
      event_type  TEXT NOT NULL,
      message     TEXT NOT NULL,
      is_read     INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL
    );
`;

/**
 * Run migrations on an arbitrary DB instance (useful for tests with in-memory DBs).
 */
export function runMigrationsOn(database: Database.Database): void {
  database.exec(SCHEMA_SQL);
}

export function runMigrations(): void {
  runMigrationsOn(db);
  console.log('Migrations complete.');
}

// Run directly if called as a script
if (require.main === module) {
  runMigrations();
}
