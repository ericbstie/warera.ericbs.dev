// The market history store: a plain SQLite file on the server, written by the
// poller and read back by /api/history.

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "path";
import type { BookSnapshot, DailyRow } from "./history";

export const DB_PATH = process.env.WARERA_DB_PATH ?? "data/warera.sqlite";

/**
 * Both tables are read as "one item, in time order", which is exactly their
 * primary key, so WITHOUT ROWID stores the rows in that order instead of
 * keeping a second index alongside a rowid nobody ever looks up.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS book_snapshot (
  item_code TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  best_bid REAL,
  best_ask REAL,
  bid_depth REAL NOT NULL,
  ask_depth REAL NOT NULL,
  day_value REAL NOT NULL DEFAULT 0,
  day_quantity REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (item_code, captured_at)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS daily_trading (
  item_code TEXT NOT NULL,
  value_at TEXT NOT NULL,
  avg_value REAL NOT NULL,
  total_value REAL NOT NULL,
  total_quantity REAL NOT NULL,
  transactions_count INTEGER NOT NULL,
  PRIMARY KEY (item_code, value_at)
) WITHOUT ROWID;
`;

export function openDatabase(file = DB_PATH): Database {
  // The path is configurable, so the directory it names may not exist yet.
  if (file !== ":memory:") mkdirSync(path.dirname(path.resolve(file)), { recursive: true });

  const db = new Database(file, { create: true, strict: true });
  // WAL keeps a poll's writes from blocking the reads serving a page, and the
  // busy timeout covers the moment they do collide.
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/**
 * The day totals arrived after the first version of this table, and a store
 * already collecting shouldn't have to be thrown away to gain them. Defaulted
 * to 0, which reads as "nothing traded then" — true enough of a poll that
 * never recorded it.
 */
function migrate(db: Database): void {
  const columns = db.query("PRAGMA table_info(book_snapshot)").all() as Array<{ name: string }>;
  const present = new Set(columns.map(column => column.name));
  for (const column of ["day_value", "day_quantity"]) {
    if (!present.has(column)) db.exec(`ALTER TABLE book_snapshot ADD COLUMN ${column} REAL NOT NULL DEFAULT 0`);
  }
}

/** A snapshot is an observation of a moment, so a repeat of one is a no-op. */
export function recordSnapshots(db: Database, rows: BookSnapshot[]): number {
  const insert = db.query(
    `INSERT INTO book_snapshot (item_code, captured_at, best_bid, best_ask, bid_depth, ask_depth, day_value, day_quantity)
     VALUES ($itemCode, $capturedAt, $bestBid, $bestAsk, $bidDepth, $askDepth, $dayValue, $dayQuantity)
     ON CONFLICT (item_code, captured_at) DO NOTHING`,
  );
  return db.transaction((values: BookSnapshot[]) => {
    for (const row of values) insert.run(row);
    return values.length;
  })(rows);
}

/**
 * Today's totals keep growing until the day closes, so a day already on file
 * is overwritten rather than kept — the newest reading is the complete one.
 */
export function recordDailyTrading(db: Database, rows: DailyRow[]): number {
  const insert = db.query(
    `INSERT INTO daily_trading (item_code, value_at, avg_value, total_value, total_quantity, transactions_count)
     VALUES ($itemCode, $valueAt, $avgValue, $totalValue, $totalQuantity, $transactionsCount)
     ON CONFLICT (item_code, value_at) DO UPDATE SET
       avg_value = excluded.avg_value,
       total_value = excluded.total_value,
       total_quantity = excluded.total_quantity,
       transactions_count = excluded.transactions_count`,
  );
  return db.transaction((values: DailyRow[]) => {
    for (const row of values) insert.run(row);
    return values.length;
  })(rows);
}

export type StoredSnapshot = Omit<BookSnapshot, "itemCode">;
export type StoredDaily = Omit<DailyRow, "itemCode">;

export function readSnapshots(db: Database, itemCode: string, since = 0): StoredSnapshot[] {
  return db
    .query(
      `SELECT captured_at AS capturedAt, best_bid AS bestBid, best_ask AS bestAsk,
              bid_depth AS bidDepth, ask_depth AS askDepth,
              day_value AS dayValue, day_quantity AS dayQuantity
       FROM book_snapshot
       WHERE item_code = $itemCode AND captured_at >= $since
       ORDER BY captured_at`,
    )
    .all({ itemCode, since }) as StoredSnapshot[];
}

/**
 * The poll just before a window, which is what the first bar in it needs to
 * report its own volume rather than everything since midnight.
 */
export function readSnapshotBefore(db: Database, itemCode: string, at: number): StoredSnapshot | null {
  return (db
    .query(
      `SELECT captured_at AS capturedAt, best_bid AS bestBid, best_ask AS bestAsk,
              bid_depth AS bidDepth, ask_depth AS askDepth,
              day_value AS dayValue, day_quantity AS dayQuantity
       FROM book_snapshot
       WHERE item_code = $itemCode AND captured_at < $at
       ORDER BY captured_at DESC
       LIMIT 1`,
    )
    .get({ itemCode, at }) ?? null) as StoredSnapshot | null;
}

/** Days are stored as the `YYYY-MM-DD` upstream sends, which sorts as text. */
export function readDailyTrading(db: Database, itemCode: string, since = ""): StoredDaily[] {
  return db
    .query(
      `SELECT value_at AS valueAt, avg_value AS avgValue, total_value AS totalValue,
              total_quantity AS totalQuantity, transactions_count AS transactionsCount
       FROM daily_trading
       WHERE item_code = $itemCode AND value_at >= $since
       ORDER BY value_at`,
    )
    .all({ itemCode, since }) as StoredDaily[];
}

/**
 * The ticker wants a week's move for every item at once, which is one query
 * rather than one per item. The comparison itself stays in weeklyChangePct,
 * so the ticker means the same thing whichever side computes it.
 */
export function readDailyByItem(db: Database, since: string): Map<string, StoredDaily[]> {
  const rows = db
    .query(
      `SELECT item_code AS itemCode, value_at AS valueAt, avg_value AS avgValue, total_value AS totalValue,
              total_quantity AS totalQuantity, transactions_count AS transactionsCount
       FROM daily_trading
       WHERE value_at >= $since
       ORDER BY item_code, value_at`,
    )
    .all({ since }) as Array<StoredDaily & { itemCode: string }>;

  const byItem = new Map<string, StoredDaily[]>();
  for (const { itemCode, ...row } of rows) {
    const existing = byItem.get(itemCode);
    if (existing) existing.push(row);
    else byItem.set(itemCode, [row]);
  }
  return byItem;
}
