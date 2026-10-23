/** The tail of the queue every sync and every exclusive task (adopt, Remove from this phone, a friends load) runs on. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs `task` once nothing else on the queue runs: never during a sync's push or pull, and a sync asked for meanwhile
 * waits for it. Adoption and Remove (S5-06) go through here, so no push or pull sees their transaction half done.
 * A task must not await syncNow or refreshFriends (they queue behind the task: a deadlock); `void syncNow(db)` inside
 * it, or awaiting it after runExclusive resolves, is fine.
 */
export function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}
