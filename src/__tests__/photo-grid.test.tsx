import React from 'react';
import { Image, PixelRatio, StyleSheet, Text } from 'react-native';
import { render, screen, fireEvent, within } from '@testing-library/react-native';
import type { ReactTestInstance, ReactTestRendererJSON } from 'react-test-renderer';

import { PhotoGrid } from '@/src/components';
import { createTestMedia } from './factories';
import { createFakeSupabase, fakeSession, type FakeSupabase } from './helpers/fake-supabase';
import { fakeFs } from './helpers/fake-fs';

let mockFake: FakeSupabase | null = null;
jest.mock('@/src/sync/client', () => ({ getSupabase: () => mockFake }));

const photos = Array.from({ length: 7 }, (_, i) =>
  createTestMedia({ spot_id: 's1', file_path: `photos/s1/m${i}.jpg` }),
);

const tileStyle = (i: number) => StyleSheet.flatten(screen.getByTestId(`photo-tile-${i}`).props.style);

/** The nearest host (native) ancestor: the tile's wrapper View. */
function hostParent(node: ReactTestInstance): ReactTestInstance {
  let p = node.parent;
  while (p && typeof p.type !== 'string') p = p.parent;
  if (!p) throw new Error('no host parent');
  return p;
}

/** Depth-first order of the rendered host tree: testIDs and text children, as they would appear on screen. */
function treeOrder(node: ReactTestRendererJSON | ReactTestRendererJSON[] | null): string[] {
  if (node === null) return [];
  if (Array.isArray(node)) return node.flatMap(treeOrder);
  const own = typeof node.props.testID === 'string' ? [node.props.testID as string] : [];
  const children = (node.children ?? []).flatMap((c) => (typeof c === 'string' ? [c] : treeOrder(c)));
  return [...own, ...children];
}

describe('PhotoGrid', () => {
  it('renders the primary photo full width at 4:3 and the rest as square tiles', () => {
    render(<PhotoGrid photos={photos} />);
    for (let i = 0; i < 7; i++) expect(screen.getByTestId(`photo-tile-${i}`)).toBeTruthy();
    expect(screen.queryByTestId('photo-tile-7')).toBeNull();
    expect(tileStyle(0)).toEqual(expect.objectContaining({ width: '100%', aspectRatio: 4 / 3 }));
    for (let i = 1; i < 7; i++) expect(tileStyle(i).aspectRatio).toBe(1);
  });

  it('reports a tap by index', () => {
    const onPressPhoto = jest.fn();
    render(<PhotoGrid photos={photos} onPressPhoto={onPressPhoto} />);
    fireEvent.press(screen.getByTestId('photo-tile-4'));
    expect(onPressPhoto).toHaveBeenCalledWith(4);
    expect(onPressPhoto).toHaveBeenCalledTimes(1);
  });

  it('labels every tile as an image button "Photo N of M"', () => {
    render(<PhotoGrid photos={photos} onPressPhoto={() => {}} />);
    const tiles = screen.getAllByRole('imagebutton');
    expect(tiles.map((t) => t.props.accessibilityLabel)).toEqual(
      photos.map((_, i) => `Photo ${i + 1} of 7`),
    );
  });

  it('renders each badge over its tile, beside the button so VoiceOver can reach it, with (media, index)', () => {
    const renderBadge = jest.fn(() => <Text>X</Text>);
    render(<PhotoGrid photos={photos} renderBadge={renderBadge} />);
    expect(screen.getAllByText('X')).toHaveLength(7);
    expect(renderBadge).toHaveBeenCalledWith(photos[0], 0);
    expect(renderBadge).toHaveBeenCalledWith(photos[6], 6);
    const tile3 = screen.getByTestId('photo-tile-3');
    expect(within(hostParent(tile3)).getAllByText('X')).toHaveLength(1);
    expect(within(tile3).queryAllByText('X')).toHaveLength(0);
  });

  it('renders the trailing tile after the last photo', () => {
    render(<PhotoGrid photos={photos} trailing={<Text>+</Text>} />);
    expect(screen.getByText('+')).toBeTruthy();
    const order = treeOrder(screen.toJSON());
    expect(order.indexOf('+')).toBeGreaterThan(order.indexOf('photo-tile-6'));
    expect(order.indexOf('photo-tile-6')).toBeGreaterThan(-1);
  });

  it('renders nothing with no photos and no trailing tile', () => {
    render(<PhotoGrid photos={[]} />);
    expect(screen.toJSON()).toBeNull();
  });

  it('renders only the trailing tile with no photos', () => {
    render(<PhotoGrid photos={[]} trailing={<Text>+</Text>} />);
    expect(screen.getByText('+')).toBeTruthy();
    expect(screen.queryAllByTestId(/^photo-tile-/)).toHaveLength(0);
    expect(screen.UNSAFE_queryAllByType(Image)).toHaveLength(0);
  });

  it('resolves image sources through resolvePhotoUri', () => {
    render(<PhotoGrid photos={photos} />);
    const images = screen.UNSAFE_queryAllByType(Image);
    expect(images).toHaveLength(7);
    const uri = (images[0].props.source as { uri: string }).uri;
    expect(uri.endsWith(photos[0].file_path)).toBe(true);
    expect(uri).not.toBe(photos[0].file_path);
  });

  it('makes tiles plain images without onPressPhoto', () => {
    // A 'dimmed' imagebutton would tell VoiceOver there is something to press.
    render(<PhotoGrid photos={photos.slice(0, 2)} />);
    const tile = screen.getByTestId('photo-tile-1');
    expect(tile.props.accessibilityRole).toBe('image');
    expect(tile.props.accessibilityState?.disabled).not.toBe(true);
    expect(screen.queryAllByRole('imagebutton')).toHaveLength(0);
  });

  it('sizes measured tiles to a pixel-snapped third of the row, the trailing tile too', () => {
    render(<PhotoGrid photos={photos.slice(0, 3)} trailing={<Text>+</Text>} />);
    const row = hostParent(hostParent(screen.getByTestId('photo-tile-1')));
    fireEvent(row, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 361, height: 200 } } });
    const scale = PixelRatio.get();
    const expected = Math.floor(((361 - 8) / 3) * scale) / scale;
    const widths = row.children
      .filter((c): c is ReactTestInstance => typeof c !== 'string')
      .map((c) => StyleSheet.flatten(c.props.style).width);
    expect(widths).toEqual([expected, expected, expected]);
    expect(3 * expected + 8).toBeLessThanOrEqual(361);
  });
});

describe("PhotoGrid: another rider's photos (S8, D91)", () => {
  const theirs = [
    createTestMedia({ id: 'a1', spot_id: 'sa', owner_id: 'u-ana', file_path: 'cache/photos/sa/a1.jpg' }),
    createTestMedia({ id: 'a2', spot_id: 'sa', owner_id: 'u-ana', file_path: 'cache/photos/sa/a2.jpg' }),
  ];

  beforeEach(() => {
    fakeFs.__resetFs();
    mockFake = createFakeSupabase({ session: fakeSession({ userId: 'u-me' }) });
    mockFake.objects.set('photos/u-ana/sa/a1.jpg', new Uint8Array([1]));
  });
  afterEach(() => {
    mockFake = null;
  });

  it('downloads into the cache and shows it; a refused download (403/404) shows the placeholder tile instead', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    render(<PhotoGrid photos={theirs} />);

    expect(await within(screen.getByTestId('photo-tile-1')).findByTestId('photo-placeholder')).toBeTruthy();
    const images = screen.UNSAFE_queryAllByType(Image);
    expect(images.map((i) => (i.props.source as { uri: string }).uri)).toEqual([
      'file:///data/Caches/photos/sa/a1.jpg',
    ]);
    expect(within(screen.getByTestId('photo-tile-0')).queryByTestId('photo-placeholder')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('a2'), 'Object not found');
    warn.mockRestore();
  });
});
