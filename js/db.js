// Envoltura mínima de IndexedDB.
const DB_NAME = 'abarroteria-pos';
const DB_VERSION = 1;
export const STORES = ['products', 'sales', 'movements', 'shifts', 'cashMoves', 'customers', 'creditMoves', 'invoices', 'kv'];

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('products', { keyPath: 'id' }).createIndex('codeList', 'codeList', { multiEntry: true });
      const sales = db.createObjectStore('sales', { keyPath: 'id' });
      sales.createIndex('date', 'date');
      sales.createIndex('shiftId', 'shiftId');
      sales.createIndex('folio', 'folio');
      db.createObjectStore('movements', { keyPath: 'id' }).createIndex('productId', 'productId');
      db.createObjectStore('shifts', { keyPath: 'id' }).createIndex('openedAt', 'openedAt');
      db.createObjectStore('cashMoves', { keyPath: 'id' }).createIndex('shiftId', 'shiftId');
      db.createObjectStore('customers', { keyPath: 'id' });
      db.createObjectStore('creditMoves', { keyPath: 'id' }).createIndex('customerId', 'customerId');
      db.createObjectStore('invoices', { keyPath: 'id' }).createIndex('date', 'date');
      db.createObjectStore('kv', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

export const req = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

// Ejecuta fn dentro de una transacción. Si fn lanza un error, no se guarda nada.
export async function tx(names, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(names, mode);
    const stores = Object.fromEntries(names.map((name) => [name, transaction.objectStore(name)]));
    let result;
    let failure = null;
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(failure || transaction.error);
    transaction.onabort = () => reject(failure || transaction.error);
    Promise.resolve()
      .then(() => fn(stores))
      .then((value) => { result = value; })
      .catch((error) => {
        failure = error;
        try { transaction.abort(); } catch { reject(error); }
      });
  });
}

export const getAll = (store) => tx([store], 'readonly', (s) => req(s[store].getAll()));
export const get = (store, key) => tx([store], 'readonly', (s) => req(s[store].get(key)));
export const put = (store, value) => tx([store], 'readwrite', (s) => req(s[store].put(value)));

export const getAllByIndex = (store, index, query) => tx([store], 'readonly',
  (s) => req(s[store].index(index).getAll(query)));

export const uid = () => crypto.randomUUID();
