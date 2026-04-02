export const BACKEND_URLS = [
  process.env.NEXT_PUBLIC_ENGINE_API_URL || "https://amogh1221-deepcastle-api.hf.space",
  "https://amogh1221-deepcastle-api-2.hf.space",
  "https://amogh1221-deepcastle-api-3.hf.space",
  "https://amogh1221-deepcastle-api-4.hf.space",
  "https://amogh1221-deepcastle-api-5.hf.space"
];

let lastWorkedIndex = 0;

export async function fetchWithFailover(endpoint: string, options: RequestInit = {}) {
  const tryOrder = [
    ...BACKEND_URLS.slice(lastWorkedIndex),
    ...BACKEND_URLS.slice(0, lastWorkedIndex)
  ];

  for (let i = 0; i < tryOrder.length; i++) {
    const baseUrl = tryOrder[i].replace(/\/$/, "");
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 10000); // 10s individual timeout

      const response = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        signal: options.signal || controller.signal
      });
      clearTimeout(id);

      if (response.ok) {
        // Set the STARTING point for the NEXT request to the one AFTER this one
        lastWorkedIndex = (BACKEND_URLS.indexOf(tryOrder[i]) + 1) % BACKEND_URLS.length;
        return response;
      }
      console.warn(`Backend ${baseUrl} returned ${response.status}, trying next...`);
    } catch (err: any) {
      if (err.name === 'AbortError' && options.signal?.aborted) throw err;
      console.warn(`Failed to reach ${baseUrl}:`, err);
    }
  }

  throw new Error("All backends are offline or busy. Please try again in 30 seconds.");
}

export function getBackendUrl() {
  return BACKEND_URLS[lastWorkedIndex];
}
