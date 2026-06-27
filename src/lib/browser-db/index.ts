const DB_NAME = "nexus-browser-db";
const DB_VERSION = 1;
const STORE_NAME = "app_state";
const STATE_KEY = "crm-data";

export function isBrowserDatabaseAvailable() {
  return typeof window !== "undefined" && Boolean(window.indexedDB);
}

function openBrowserDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!isBrowserDatabaseAvailable()) {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open IndexedDB."));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

function readRequest<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

export async function loadBrowserData<T>() {
  if (!isBrowserDatabaseAvailable()) return null;

  const database = await openBrowserDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(STATE_KEY) as IDBRequest<T | undefined>;
    const data = await readRequest(request);
    return data ?? null;
  } finally {
    database.close();
  }
}

export async function saveBrowserData(value: unknown) {
  if (!isBrowserDatabaseAvailable()) return;

  const database = await openBrowserDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const complete = transactionDone(transaction);
    transaction.objectStore(STORE_NAME).put(value, STATE_KEY);
    await complete;
  } finally {
    database.close();
  }
}
