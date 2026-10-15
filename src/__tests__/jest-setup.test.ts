import { useSQLiteContext } from 'expo-sqlite';

describe('global jest setup', () => {
  it('useSQLiteContext returns the same db object on every call', () => {
    // A fresh object per call changes hook dependencies each render and loops effects in screen tests.
    expect(useSQLiteContext()).toBe(useSQLiteContext());
  });
});
