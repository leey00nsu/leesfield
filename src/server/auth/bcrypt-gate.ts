/**
 * Caps concurrent bcrypt work in this process.
 *
 * Password hashing is deliberately expensive, so an unauthenticated burst
 * could otherwise queue unbounded CPU work. Waiting here is bounded by the
 * caller's own deadline expectations and keeps the event loop responsive.
 */

const MAX_CONCURRENT_BCRYPT = 2;

let active = 0;
const waiters: Array<() => void> = [];

export async function withBcryptSlot<T>(action: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT_BCRYPT) {
    await new Promise<void>((resolve) => {
      waiters.push(resolve);
    });
  }
  active += 1;
  try {
    return await action();
  } finally {
    active -= 1;
    const next = waiters.shift();
    if (next) next();
  }
}

