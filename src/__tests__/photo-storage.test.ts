import { fakeFs as fs } from './helpers/fake-fs';
import { persistPhoto, resolvePhotoUri } from '@/src/utils/photo-storage';

beforeEach(() => fs.__resetFs());

it('copies the source into the document directory and returns the relative path', async () => {
  fs.__putFile('file:///data/Caches/Camera/abc.jpg');

  await expect(persistPhoto('file:///data/Caches/Camera/abc.jpg', 's1', 'm1')).resolves.toBe(
    'photos/s1/m1.jpg',
  );

  expect(fs.__fileExists('file:///data/Documents/photos/s1/m1.jpg')).toBe(true);
});

it('reuses an existing spot directory for the second photo', async () => {
  fs.__putFile('file:///c/a.jpg');
  fs.__putFile('file:///c/b.jpg');

  await persistPhoto('file:///c/a.jpg', 's1', 'm1');

  await expect(persistPhoto('file:///c/b.jpg', 's1', 'm2')).resolves.toBe('photos/s1/m2.jpg');
  expect(fs.__fileExists('file:///data/Documents/photos/s1/m2.jpg')).toBe(true);
});

it('falls back to the source URI and warns when the copy fails', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  fs.__putFile('file:///c/a.jpg');
  fs.__failNextCopy(new Error('disk full'));

  await expect(persistPhoto('file:///c/a.jpg', 's1', 'm1')).resolves.toBe('file:///c/a.jpg');

  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

it('resolves a relative path against the current document directory', () => {
  expect(resolvePhotoUri('photos/s1/m1.jpg')).toBe('file:///data/Documents/photos/s1/m1.jpg');

  fs.__resetFs('file:///var/mobile/NEW-CONTAINER/Documents/');

  expect(resolvePhotoUri('photos/s1/m1.jpg')).toBe(
    'file:///var/mobile/NEW-CONTAINER/Documents/photos/s1/m1.jpg',
  );
});

it.each(['file:///c/a.jpg', 'https://x.test/a.jpg', 'ph://ABC-123', '/abs/a.jpg'])(
  'passes legacy or absolute %s through unchanged',
  (uri) => {
    expect(resolvePhotoUri(uri)).toBe(uri);
  },
);

it("resolves another rider's cached photo (cache/…) against the cache directory, never Documents (S8, §3.4)", () => {
  expect(resolvePhotoUri('cache/photos/s1/m1.jpg')).toBe('file:///data/Caches/photos/s1/m1.jpg');
  expect(resolvePhotoUri('photos/s1/m1.jpg')).toBe('file:///data/Documents/photos/s1/m1.jpg');
});
