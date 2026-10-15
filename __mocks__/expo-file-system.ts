// In-memory fake of expo-file-system 57. Member names and signatures are copied from
// node_modules/expo-file-system/build/{Paths,File,Directory,Directory.types}.d.ts and
// build/internal/NativeFileSystem.types.d.ts. Only what src/utils/photo-storage.ts uses.
type Part = string | FakeFile | FakeDirectory;

let documentUri = 'file:///data/Documents/';
const files = new Set<string>();
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
    return this.uri === documentUri || dirs.has(this.uri);
  }
  get name(): string {
    return this.uri.replace(/\/$/, '').split('/').pop() ?? '';
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
}

class FakeFile {
  readonly uri: string;
  constructor(...uris: Part[]) {
    this.uri = join(uris, false);
  }
  get exists(): boolean {
    return files.has(this.uri);
  }
  get name(): string {
    return this.uri.split('/').pop() ?? '';
  }
  get parentDirectory(): FakeDirectory {
    return new FakeDirectory(this.uri.replace(/[^/]+$/, ''));
  }
  async copy(destination: FakeFile | FakeDirectory, _options?: { overwrite?: boolean }): Promise<void> {
    if (nextCopyError) {
      const e = nextCopyError;
      nextCopyError = null;
      throw e;
    }
    if (!this.exists) throw new Error(`File ${this.uri} does not exist`);
    const target = destination instanceof FakeDirectory ? new FakeFile(destination, this.name) : destination;
    if (!target.parentDirectory.exists) {
      throw new Error(`Destination directory for ${target.uri} does not exist`);
    }
    files.add(target.uri);
  }
}

export const Paths = {
  get document(): FakeDirectory {
    return new FakeDirectory(documentUri);
  },
};
export { FakeFile as File, FakeDirectory as Directory };

// Test hooks (not part of the real module).
export function __resetFs(doc = 'file:///data/Documents/'): void {
  documentUri = doc;
  files.clear();
  dirs.clear();
  nextCopyError = null;
}
export function __putFile(uri: string): void {
  files.add(uri);
}
export function __fileExists(uri: string): boolean {
  return files.has(uri);
}
export function __failNextCopy(err: Error): void {
  nextCopyError = err;
}
