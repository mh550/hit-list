/**
 * Per rider, which load was asked for last: an older load that ends later must not put back what a newer one (or a
 * save, a dismiss) took off. One set per kind of load (friends, sends).
 */
export function createTickets() {
  const newest = new Map<string, number>();
  let last = 0;
  return {
    take(uid: string): number {
      last += 1;
      newest.set(uid, last);
      return last;
    },
    isNewest: (uid: string, ticket: number) => newest.get(uid) === ticket,
  };
}
