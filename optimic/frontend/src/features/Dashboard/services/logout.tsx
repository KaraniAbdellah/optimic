const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default async function logout(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/logout`, {
      method: "POST",
      credentials: "include", // Sends & clears cookies
    });

    return response.ok;
  } catch (error) {
    console.error("Logout error:", error);
    return false;
  } finally {
    localStorage.clear();
    sessionStorage.clear();
  }
}

