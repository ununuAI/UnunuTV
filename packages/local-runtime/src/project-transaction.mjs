function rollbackOwnedTransaction(database) {
  if (!database.isTransaction) return;
  database.exec("ROLLBACK");
}

export function runDatabaseTransaction(database, work) {
  const ownsTransaction = !database.isTransaction;
  if (ownsTransaction) database.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    if (result && typeof result.then === "function") {
      return (async () => {
        try {
          const value = await result;
          if (ownsTransaction) database.exec("COMMIT");
          return value;
        } catch (error) {
          if (ownsTransaction) rollbackOwnedTransaction(database);
          throw error;
        }
      })();
    }
    if (ownsTransaction) database.exec("COMMIT");
    return result;
  } catch (error) {
    if (ownsTransaction) rollbackOwnedTransaction(database);
    throw error;
  }
}
