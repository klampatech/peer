/**
 * SQLite database initialization using sql.js (WebAssembly-based SQLite)
 */

import initSqlJs, { type Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/peer.db');

let db: Database | null = null;

/**
 * Initialize the SQLite database
 */
export async function initDatabase(): Promise<Database> {
  if (db) {
    return db;
  }

  const SQL = await initSqlJs();

  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Run schema initialization
  initializeSchema(db);

  // Save database periodically
  setInterval(() => {
    if (db) {
      saveDatabase();
    }
  }, 30000); // Save every 30 seconds

  return db;
}

/**
 * Initialize database schema
 */
function initializeSchema(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      room_token TEXT NOT NULL,
      peer_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      deleted INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Create index for efficient room message queries
  database.run(`
    CREATE INDEX IF NOT EXISTS idx_messages_room_token
    ON messages(room_token, timestamp)
  `);

  // Create index for cleanup queries
  database.run(`
    CREATE INDEX IF NOT EXISTS idx_messages_deleted_timestamp
    ON messages(deleted, timestamp)
  `);
}

/**
 * Get the database instance
 */
export function getDatabase(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Save database to disk
 */
export function saveDatabase(): void {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
  }
}
