// Web stub for expo-sqlite.
// This app is native-only; SQLite is not available on web.
// Provides no-op implementations so the web bundle compiles without loading WebAssembly.
const noopDb = {
  execAsync: () => Promise.resolve(),
  runAsync: () => Promise.resolve(),
  getAllAsync: () => Promise.resolve([]),
  getFirstAsync: () => Promise.resolve(null),
};

module.exports = {
  SQLiteProvider: function SQLiteProvider({ children }) {
    return children;
  },
  useSQLiteContext: function useSQLiteContext() {
    return noopDb;
  },
};
