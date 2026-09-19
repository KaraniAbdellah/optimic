import { DatasetType } from "@/global/types/DatasetType";
import { DB_CONFIG } from "../constants/conts";
const API_KEY = import.meta.env.VITE_API_URL;

export const openDatabase = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_CONFIG.NAME, DB_CONFIG.VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_CONFIG.STORE)) {
        db.createObjectStore(DB_CONFIG.STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export async function getStoredDatasets(
  userUid: string | undefined,
): Promise<DatasetType[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_CONFIG.STORE, "readonly");
    const store = tx.objectStore(DB_CONFIG.STORE);
    const req = store.getAll();

    req.onsuccess = () => {
      const datasets = req.result || [];

      const filteredDatasets = datasets.filter(
        (dataset: DatasetType) => dataset.user_uid === userUid,
      );

      resolve(filteredDatasets);
    };

    req.onerror = () => reject(req.error);
  });
}


export async function persistDataset(dataset: DatasetType): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_CONFIG.STORE, "readwrite");
    const store = tx.objectStore(DB_CONFIG.STORE);
    store.put(dataset);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function persistPolicy(id: string, policy: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_CONFIG.STORE, "readwrite");
    const store = tx.objectStore(DB_CONFIG.STORE);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const record: DatasetType = getReq.result;
      if (record) {
        record.policy = policy;
        store.put(record);
      }
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeDataset(
  id: string,
  userUid: string,
): Promise<void> {
  const db = await openDatabase();
  console.log(
    `Attempting to delete dataset with ID: ${id} for user UID: ${userUid}`,
  );

  // 1. Call backend API to delete from Qdrant
  const res = await fetch(`${API_KEY}/delete-dataset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Include authorization headers here if using auth tokens
    },
    credentials: "include", // Include cookies if needed
    body: JSON.stringify({
      dataset_id: id,
      user_uid: userUid,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      errorBody.message || `Failed to delete dataset: ${res.statusText}`,
    );
  }

  // 2. Delete from local IndexedDB only after remote deletion succeeds
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_CONFIG.STORE, "readwrite");
    const store = tx.objectStore(DB_CONFIG.STORE);
    store.delete(id);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function clearAllDatasetsFromIndexDb(user_uid: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_CONFIG.STORE, "readwrite");
    const store = tx.objectStore(DB_CONFIG.STORE);
    const getAllReq = store.getAll();

    getAllReq.onsuccess = () => {
      const datasets = getAllReq.result || [];
      for (const dataset of datasets) {
        if (dataset.user_uid === user_uid) {
          store.delete(dataset.id);
        }
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}