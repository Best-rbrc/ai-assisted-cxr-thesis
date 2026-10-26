type QueuedOperation = {
  id: string;
  fn: () => Promise<void>;
  retries: number;
  maxRetries: number;
};

const QUEUE_KEY = "chexstudy_retry_queue";
const queue: QueuedOperation[] = [];
let processing = false;

async function processQueue() {
  if (processing || queue.length === 0) return;
  processing = true;

  while (queue.length > 0) {
    const op = queue[0];
    try {
      await op.fn();
      queue.shift();
    } catch (err) {
      op.retries++;
      if (op.retries >= op.maxRetries) {
        console.error(`[RetryQueue] Operation ${op.id} failed after ${op.maxRetries} attempts`, err);
        queue.shift();
      } else {
        const delay = Math.min(1000 * Math.pow(2, op.retries), 10000);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  processing = false;
}

export function enqueueOperation(id: string, fn: () => Promise<void>, maxRetries = 3) {
  queue.push({ id, fn, retries: 0, maxRetries });
  processQueue();
}

export async function withRetry<T>(label: string, fn: () => Promise<T>, maxRetries = 3): Promise<T | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) {
        console.error(`[RetryQueue] ${label} failed after ${maxRetries + 1} attempts`, err);
        return null;
      }
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  return null;
}
