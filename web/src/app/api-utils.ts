export const BACKEND_URL = process.env.NEXT_PUBLIC_ENGINE_API_URL || "https://amogh1221-deepcastle-api.hf.space";

export async function fetchWithFailover(endpoint: string, options: RequestInit = {}) {
  const baseUrl = BACKEND_URL.replace(/\/$/, "");
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      signal: options.signal || controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (err: any) {
    clearTimeout(id);
    if (err.name === 'AbortError' && options.signal?.aborted) throw err;
    console.warn(`Failed to reach ${baseUrl}:`, err);
    throw err;
  }
}

export function getBackendUrl() {
  return BACKEND_URL;
}
