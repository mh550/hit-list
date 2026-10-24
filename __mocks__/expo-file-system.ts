// In-memory fake of expo-file-system 57. Member names and signatures are copied from
// node_modules/expo-file-system/build/{Paths,File,Directory,Directory.types}.d.ts and
// build/internal/NativeFileSystem.types.d.ts. Only what src/utils/photo-storage.ts and src/sync/photos.ts use
// (bytes(): Promise<Uint8Array>, write(content), delete(), Directory delete(), Paths.cache).
type Part = string | FakeFile | FakeDirectory;

let documentUri = 'file:///data/Documents/';
const CACHE_URI = 'file:///data/Caches/';
/** Every file and its bytes (an empty array unless a test or write() gave it some). */
const files = new Map<string, Uint8Array>();
/** The uri of every write(), copy() target and delete(), in order: a test can show a file was never written. */
const writes: string[] = [];
const dirs = new Set<string>();
let nextCopyError: Error | null = null;

function join(parts: Part[], dir: boolean): string {
  const raw = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  const m = raw.match(/^([a-z][a-z0-9+.-]*:\/\/)(.*)$/i);
  const scheme = m ? m[1] : '';
  const path = (m ? m[2] : raw).replace(/\/{2,}/g, '/').replace(/\/$/, '');
  const lead = scheme && !path.startsWith('/') ? '/' : '';
  return `${scheme}${lead}${path}${dir ? '/' : ''}`;
}

class FakeDirectory {
  readonly uri: string;
  constructor(...uris: Part[]) {
    this.uri = join(uris, true);
  }
  get exists(): boolean {
    return this.uri === documentUri || this.uri === CACHE_URI || dirs.has(this.uri);
  }
  create(options?: { intermediates?: boolean; overwrite?: boolean; idempotent?: boolean }): void {
    if (this.exists) {
      if (options?.idempotent) return;
      throw new Error(`Directory ${this.uri} already exists`);
    }
    const parent = new FakeDirectory(this.uri.replace(/[^/]+\/$/, ''));
    if (!parent.exists) {
      if (!options?.intermediates) throw new Error(`Parent of ${this.uri} does not exist`);
      parent.create({ intermediates: true, idempotent: true });
    }
    dirs.add(this.uri);
  }
  /** Deletes the directory and everything in it. */
  delete(): void {
    if (!this.exists) throw new Error(`Directory ${this.uri} does not exist`);
    for (const dir of [...dirs]) if (dir.startsWith(this.uri)) dirs.delete(dir);
    for (const uri of [...files.keys()]) if (uri.startsWith(this.uri)) files.delete(uri);
    writes.push(this.uri);
  }
}

class FakeFile {
  readonly uri: string;
  constructor(...uris: Part[]) {
    this.uri = join(uris, false);
  }
  get exists(): boolean {
    return files.has(this.uri);
  }
  get parentDirectory(): FakeDirectory {
    return new FakeDirectory(this.uri.replace(/[^/]+$/, ''));
  }
  async copy(destination: FakeFile, _options?: { overwrite?: boolean }): Promise<void> {
    if (nextCopyError) {
      const e = nextCopyError;
      nextCopyError = null;
      throw e;
    }
    if (!this.exists) throw new Error(`File ${this.uri} does not exist`);
    const target = destination;
    if (!target.parentDirectory.exists) {
      throw new Error(`Destination directory for ${target.uri} does not exist`);
    }
    writes.push(target.uri);
    files.set(target.uri, files.get(this.uri)!);
  }
  async bytes(): Promise<Uint8Array> {
    const content = files.get(this.uri);
    if (!content) throw new Error(`File ${this.uri} does not exist`);
    return content;
  }
  write(content: string | Uint8Array, _options?: { encoding?: string }): void {
    if (!this.parentDirectory.exists) throw new Error(`Directory for ${this.uri} does not exist`);
    writes.push(this.uri);
    files.set(this.uri, typeof content === 'string' ? new TextEncoder().encode(content) : content);
  }
  delete(): void {
    if (!files.delete(this.uri)) throw new Error(`File ${this.uri} does not exist`);
    writes.push(this.uri);
  }
}

export const Paths = {
  get document(): FakeDirectory {
    return new FakeDirectory(documentUri);
  },
  get cache(): FakeDirectory {
    return new FakeDirectory(CACHE_URI);
  },
};
export { FakeFile as File, FakeDirectory as Directory };

// Test hooks (not part of the real module).
export function __resetFs(doc = 'file:///data/Documents/'): void {
  documentUri = doc;
  files.clear();
  dirs.clear();
  writes.length = 0;
  nextCopyError = null;
}
export function __putFile(uri: string, content: Uint8Array = new Uint8Array()): void {
  files.set(uri, content);
}
export function __fileBytes(uri: string): Uint8Array | undefined {
  return files.get(uri);
}
/** The uris written to (write, copy target, delete) since the last __resetFs, in order. */
export function __writes(): string[] {
  return [...writes];
}
export function __fileExists(uri: string): boolean {
  return files.has(uri);
}
export function __failNextCopy(err: Error): void {
  nextCopyError = err;
}
