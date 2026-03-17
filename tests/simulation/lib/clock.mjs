/**
 * Timing utilities for performance measurement.
 *
 * Uses `performance.now()` (available in Node 16+) for sub-millisecond
 * precision.
 */

// ---------------------------------------------------------------------------
// timer()
// ---------------------------------------------------------------------------

/**
 * Create a simple stopwatch.
 *
 * @returns {{ elapsed(): number, reset(): void }}
 *
 * @example
 *   const t = timer();
 *   await doStuff();
 *   console.log(`Took ${t.elapsed()} ms`);
 */
export function timer() {
  let start = performance.now();

  return {
    /** Milliseconds since creation (or last reset). */
    elapsed() {
      return Math.round((performance.now() - start) * 100) / 100;
    },

    /** Reset the start time to now. */
    reset() {
      start = performance.now();
    },
  };
}

// ---------------------------------------------------------------------------
// measureAsync()
// ---------------------------------------------------------------------------

/**
 * Run an async function and measure how long it takes.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<{ result: T, durationMs: number }>}
 *
 * @example
 *   const { result, durationMs } = await measureAsync(() => api.projects.list());
 *   console.log(`Got ${result.length} projects in ${durationMs} ms`);
 */
export async function measureAsync(fn) {
  const start = performance.now();
  const result = await fn();
  const durationMs = Math.round((performance.now() - start) * 100) / 100;
  return { result, durationMs };
}

// ---------------------------------------------------------------------------
// measureSync()
// ---------------------------------------------------------------------------

/**
 * Run a synchronous function and measure how long it takes.
 *
 * @template T
 * @param {() => T} fn
 * @returns {{ result: T, durationMs: number }}
 */
export function measureSync(fn) {
  const start = performance.now();
  const result = fn();
  const durationMs = Math.round((performance.now() - start) * 100) / 100;
  return { result, durationMs };
}

// ---------------------------------------------------------------------------
// sleep()
// ---------------------------------------------------------------------------

/**
 * Promise-based sleep.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// timeout()
// ---------------------------------------------------------------------------

/**
 * Race a promise against a timeout.  Rejects with a descriptive error if
 * the timeout fires first.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number}      ms
 * @param {string}      [label="Operation"]  Label for the error message
 * @returns {Promise<T>}
 */
export function timeout(promise, ms, label = "Operation") {
  return new Promise((resolve, reject) => {
    const id = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms} ms`)),
      ms,
    );

    promise
      .then((val) => {
        clearTimeout(id);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(id);
        reject(err);
      });
  });
}

// ---------------------------------------------------------------------------
// formatDuration()
// ---------------------------------------------------------------------------

/**
 * Human-readable duration string.
 *
 * @param {number} ms
 * @returns {string}  e.g. "1.23 s", "456 ms", "2m 3s"
 */
export function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}
