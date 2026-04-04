export const BACKEND_URLS = [
  process.env.NEXT_PUBLIC_ENGINE_API_URL || "https://amogh1221-deepcastle-api.hf.space",
  "https://amogh1221-deepcastle-api-2.hf.space",
  "https://amogh1221-deepcastle-api-3.hf.space",
  "https://amogh1221-deepcastle-api-4.hf.space",
  "https://amogh1221-deepcastle-api-5.hf.space"
];

let lastWorkedIndex = Math.floor(Math.random() * BACKEND_URLS.length);
let isLocked = false;

export function setBackendIndex(index: number, lock: boolean = false) {
  if (index >= 0 && index < BACKEND_URLS.length) {
    lastWorkedIndex = index;
    isLocked = lock;
  }
}

export async function fetchWithFailover(endpoint: string, options: RequestInit = {}) {
  // If we are locked to a specific node (P2P), don't try others.
  // It's better to fail than to connect to the wrong server room.
  const tryOrder = isLocked 
    ? [BACKEND_URLS[lastWorkedIndex]]
    : [
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
        // Sticky sessions: stay on the node that worked for the rest of the session
        // This ensures P2P room affinity and better caching.
        lastWorkedIndex = BACKEND_URLS.indexOf(tryOrder[i]);
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

export function getBackendIndex() {
  return lastWorkedIndex;
}
