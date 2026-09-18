export const POLL_INTERVAL_MS = 300;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Calls fn() every POLL_INTERVAL_MS until it returns a truthy value or
// timeoutMs elapses. Returns that value, or null on timeout.
export async function retryUntil(fn, timeoutMs) {
  const start = Date.now();
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() - start >= timeoutMs) return null;
    await sleep(POLL_INTERVAL_MS);
  }
}
