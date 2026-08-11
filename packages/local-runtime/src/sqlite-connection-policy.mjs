export const SQLITE_BUSY_TIMEOUT_MS = 30_000;

export function configureSqliteConnection(database) {
  database.exec(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS};`);
  return database;
}
