import { DatasetType } from "@/global/types/DatasetType";
import { DB_CONFIG } from "../constants/conts";
import { openDatabase } from "./datasetDb";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000"; // Replace with your backend API base URL
async function startChatWithDataset(
  rows: string[][],
  headers: string[],
  id: string,
  name: string,
  isActive: boolean,
  user_uid: string,
) {
  try {
    console.log("Sending data to backend:", { rows, headers, id, name, user_uid });
    const response = await fetch(`${API_BASE_URL}/upload-dataset`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include", // Required to send auth_token cookie
      body: JSON.stringify({
        rows: rows,
        headers: headers,
        dataset_id: id,
        dataset_name: name,
        isActive: isActive,
        user_uid: user_uid,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to start chat with the dataset");
    }

    const data = await response.json();
    if (data) {
      return data;
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error starting chat with the dataset:", error);
  }
}

async function askQuestion(question: string, user_uid: string, dataset_id: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/ask-question`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ question, user_uid, dataset_id }),
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data: { question: string; response: string } = await response.json();
    return data;
  } catch (error) {
    console.error("Error asking question:", error);
    throw error;
  }
}

async function makeDatasetActive(datasetId: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_CONFIG.STORE, "readwrite");
    const store = tx.objectStore(DB_CONFIG.STORE);
    const getReq = store.get(datasetId);

    getReq.onsuccess = () => {
      const record: DatasetType = getReq.result;
      if (record) {
        record.isActive = true;
        store.put(record);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}


async function clearChatHistory() {
  try {
    const response = await fetch(`${API_BASE_URL}/clear-chat-history`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
  } catch (error) {
    console.error("Error clearing chat history:", error);
  }
}


export { startChatWithDataset, askQuestion, makeDatasetActive, clearChatHistory };
