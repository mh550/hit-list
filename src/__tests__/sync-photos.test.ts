import { SaveFormat } from 'expo-image-manipulator';
import { fakeFs } from './helpers/fake-fs';
import { createFakeSupabase, fakeSession } from './helpers/fake-supabase';
import { createTestMedia } from './factories';
import { defaultPhotoIO, preparePhoto, uploadPhoto } from '@/src/sync/photos';
import type { SupabaseClient } from '@supabase/supabase-js';

// A stand-in for expo-image-manipulator 57. Member names and signatures from
// node_modules/expo-image-manipulator/build/:
//   index.d.ts / ImageManipulator.d.ts: `export { ExpoImageManipulator as ImageManipulator }` (the native module),
//     `export { SaveFormat }`
//   ImageManipulator.types.d.ts: `class ImageManipulator { manipulate(source: string | SharedRef<'image'>):
//     ImageManipulatorContext }`, `enum SaveFormat { JPEG = "jpeg", PNG = "png", WEBP = "webp" }`,
//     `SaveOptions { base64?; compress?; format? }`, `ImageResult { uri; width; height; base64? }`
//   ImageManipulatorContext.d.ts: `resize(size: { width?: number | null; height?: number | null }):
//     ImageManipulatorContext`, `renderAsync(): Promise<ImageRef>` (a SharedObject: `release()`)
//   ImageRef.d.ts: `width: number; height: number; saveAsync(options?: SaveOptions): Promise<ImageResult>` (a
//     SharedRef: `release()`)
// saveAsync writes a new JPEG into the cache directory, as the native module does.
const mockImage = {
  width: 4032,
  height: 3024,
  saved: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 7]),
  resizes: [] as { width?: number | null; height?: number | null }[],
  saves: [] as unknown[],
  released: 0,
};
jest.mock('expo-image-manipulator', () => {
  const fs = jest.requireActual<typeof import('./helpers/fake-fs')>('./helpers/fake-fs').fakeFs;
  let n = 0;
  return {
    SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
    ImageManipulator: {
      manipulate: jest.fn((_source: string) => {
        let size = { width: mockImage.width, height: mockImage.height };
        const context: { resize: jest.Mock; renderAsync: jest.Mock; release: jest.Mock } = {
          resize: jest.fn((next: { width?: number | null; height?: number | null }): typeof context => {
            mockImage.resizes.push(next);
            const ratio = next.width ? next.width / size.width : next.height! / size.height;
            size = { width: Math.round(size.width * ratio), height: Math.round(size.height * ratio) };
            return context;
          }),
          renderAsync: jest.fn(async () => ({
            ...size,
            saveAsync: jest.fn(async (options?: unknown) => {
              mockImage.saves.push(options);
              n += 1;
              const uri = `file:///data/Caches/ImageManipulator/out-${n}.jpg`;
              fs.__putFile(uri, mockImage.saved);
              return { uri, ...size };
            }),
            release: jest.fn(() => {
              mockImage.released += 1;
            }),
          })),
          release: jest.fn(() => {
            mockImage.released += 1;
          }),
        };
        return context;
      }),
    },
  };
});

const ORIGINAL = 'file:///data/Documents/photos/s1/m1.jpg';
const ORIGINAL_BYTES = new Uint8Array([1, 2, 3, 4]);

beforeEach(() => {
  fakeFs.__resetFs();
  fakeFs.__putFile(ORIGINAL, ORIGINAL_BYTES);
  Object.assign(mockImage, { width: 4032, height: 3024, resizes: [], saves: [], released: 0 });
});

describe('preparePhoto: re-encode for upload (D46)', () => {
  it('scales a landscape photo to a 2048 px long edge and saves JPEG at 0.85, as a new file in the cache', async () => {
    const prepared = await preparePhoto(ORIGINAL);

    expect(mockImage.resizes).toEqual([{ width: 2048 }]);
    expect(mockImage.saves).toEqual([{ compress: 0.85, format: SaveFormat.JPEG }]);
    expect(prepared.uri).toMatch(/^file:\/\/\/data\/Caches\//);
    expect(prepared.bytes).toEqual(mockImage.saved);
  });

  it('scales a portrait photo by its height', async () => {
    Object.assign(mockImage, { width: 3024, height: 4032 });

    await preparePhoto(ORIGINAL);

    expect(mockImage.resizes).toEqual([{ height: 2048 }]);
  });

  it.each([
    ['smaller', 1600, 1200],
    ['exactly 2048 wide', 2048, 1536],
  ])('leaves a %s photo at its size', async (_label, width, height) => {
    Object.assign(mockImage, { width, height });

    await preparePhoto(ORIGINAL);

    expect(mockImage.resizes).toEqual([]);
    expect(mockImage.saves).toEqual([{ compress: 0.85, format: SaveFormat.JPEG }]);
  });

  it('never writes the original file', async () => {
    await preparePhoto(ORIGINAL);

    expect(fakeFs.__writes()).not.toContain(ORIGINAL);
    expect(fakeFs.__fileBytes(ORIGINAL)).toEqual(ORIGINAL_BYTES);
  });

  it('releases every native image it made', async () => {
    await preparePhoto(ORIGINAL);

    // the context, the first render and the resized render
    expect(mockImage.released).toBe(3);
  });
});

describe('defaultPhotoIO: a media row’s file under Paths.document', () => {
  it('exists() resolves a relative file_path against the document directory', () => {
    expect(defaultPhotoIO.exists('photos/s1/m1.jpg')).toBe(true);
    expect(defaultPhotoIO.exists('photos/s1/gone.jpg')).toBe(false);
  });

  it('exists() also takes an absolute uri (a copy that failed kept the source uri)', () => {
    expect(defaultPhotoIO.exists(ORIGINAL)).toBe(true);
  });

  it('prepare() re-encodes the file and cleanup() deletes only the cache copy', async () => {
    const prepared = await defaultPhotoIO.prepare('photos/s1/m1.jpg');
    expect(prepared.bytes).toEqual(mockImage.saved);
    expect(fakeFs.__fileExists(prepared.uri)).toBe(true);

    prepared.cleanup();

    expect(fakeFs.__fileExists(prepared.uri)).toBe(false);
    expect(fakeFs.__fileBytes(ORIGINAL)).toEqual(ORIGINAL_BYTES);
    expect(fakeFs.__writes()).not.toContain(ORIGINAL);
  });
});

describe('uploadPhoto', () => {
  const asClient = (fake: ReturnType<typeof createFakeSupabase>) => fake as unknown as SupabaseClient;

  it('puts the bytes at photos/<owner>/<spot>/<media>.jpg as image/jpeg, overwriting a retry', async () => {
    const fake = createFakeSupabase({ session: fakeSession({ userId: 'rider-me' }) });
    const media = createTestMedia({ id: 'm1', spot_id: 's1' });
    const bytes = new Uint8Array([9, 8, 7]);

    const path = await uploadPhoto(asClient(fake), 'rider-me', media, bytes);

    expect(path).toBe('rider-me/s1/m1.jpg');
    expect(fake.storage.from).toHaveBeenCalledWith('photos');
    expect(fake.calls).toEqual([
      {
        kind: 'upload',
        bucket: 'photos',
        path: 'rider-me/s1/m1.jpg',
        body: bytes,
        options: { contentType: 'image/jpeg', upsert: true },
      },
    ]);
  });

  it('rejects with the storage error’s message', async () => {
    const fake = createFakeSupabase({ session: fakeSession({ userId: 'rider-me' }) });
    fake.failNext('upload', { message: 'new row violates row-level security policy', status: 403 });

    await expect(
      uploadPhoto(asClient(fake), 'rider-me', createTestMedia({ id: 'm1', spot_id: 's1' }), new Uint8Array([1])),
    ).rejects.toThrow('new row violates row-level security policy');
  });
});
