/**
 * db.js - IndexedDB ラッパー（履歴保存用）
 * 外部ライブラリなしで自作
 */

const DB_NAME = 'RomajiPracticeDB';
const DB_VERSION = 1;
const STORE_NAME = 'history';

let dbInstance = null;

/**
 * IndexedDBを開く
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      dbInstance = req.result;
      resolve(dbInstance);
    };
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('kana', 'kana', { unique: false });
        store.createIndex('verdict', 'verdict', { unique: false });
      }
    };
  });
}

/**
 * 履歴1件を保存（record.strokes: [{points:[{x,y,t,...}]}] 推奨）
 */
function saveRecord(record) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.add(record);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  });
}

/** addRecord は saveRecord の別名 */
function addRecord(record) {
  return saveRecord(record);
}

/**
 * 全履歴を取得（新しい順）
 */
function getAllRecords() {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const req = index.openCursor(null, 'prev');
      const results = [];
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
    });
  });
}

/**
 * IDで1件取得
 */
function getRecordById(id) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  });
}

/**
 * 1件削除
 */
function deleteRecord(id) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  });
}

/**
 * 全削除
 */
function deleteAllRecords() {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  });
}

/** clearAll は deleteAllRecords の別名 */
function clearAll() {
  return deleteAllRecords();
}

/**
 * フィルタ付き一覧（新しい順）
 * @param {{ kana?: string, difficulty?: string, verdict?: string }} filters
 */
function listRecords(filters) {
  return getAllRecords().then(records => {
    if (!filters) return records;
    return records.filter(r => {
      if (filters.kana && r.kana !== filters.kana) return false;
      if (filters.difficulty && r.difficulty !== filters.difficulty) return false;
      if (filters.verdict && r.verdict !== filters.verdict) return false;
      return true;
    });
  });
}

/**
 * 指定かなの直近 N 件を取得（Practice 内プレビュー用）
 */
function getLatestByKana(kana, limit = 10) {
  return getAllRecords().then(records => {
    return records.filter(r => r.kana === kana).slice(0, limit);
  });
}
