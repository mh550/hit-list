import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, FlatList, Image, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMediaStore, useSpotsStore } from '@/src/stores';
import { resolvePhotoUri } from '@/src/utils/photo-storage';
import type { Media } from '@/src/types';
import { createTestMedia, createTestSpot } from './factories';

import PhotoViewerScreen from '@/app/spot/[id]/photos';

const back = jest.fn();
const { width } = Dimensions.get('window');
const METRICS = {
  frame: { x: 0, y: 0, width, height: Dimensions.get('window').height },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

beforeEach(() => {
  back.mockReset();
  jest.mocked(useRouter).mockReturnValue({ push: jest.fn(), back, replace: jest.fn() } as never);
});

const at = (min: number) => `2026-10-13T14:${String(min).padStart(2, '0')}:00.000Z`;

/** A spot with `count` photos (the 4th is primary when there are at least 4), opened at `index`. */
function renderViewer(count: number, index?: string) {
  const spot = createTestSpot();
  const media: Media[] = Array.from({ length: count }, (_, i) =>
    createTestMedia({ spot_id: spot.id, created_at: at(i + 1), file_path: `photos/${spot.id}/${i}.jpg` }),
  );
  const withPrimary = count >= 4 ? { ...spot, primary_photo_id: media[3].id } : spot;
  useSpotsStore.setState({ spots: [withPrimary] });
  useMediaStore.setState({ mediaBySpot: {} });
  useMediaStore.getState().setAll(media);
  jest.mocked(useLocalSearchParams).mockReturnValue((index === undefined ? { id: spot.id } : { id: spot.id, index }) as never);
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <PhotoViewerScreen />
    </SafeAreaProvider>,
  );
  return { spot: withPrimary, media };
}

const list = () => screen.UNSAFE_getByType(FlatList);

describe('Photo viewer', () => {
  it('opens at ?index=2 of 7 and shows the counter 3 / 7', () => {
    renderViewer(7, '2');

    expect(screen.getByText('3 / 7')).toBeOnTheScreen();
    expect(list().props.initialScrollIndex).toBe(2);
    expect(screen.getByLabelText('Photo 3 of 7')).toBeOnTheScreen();
  });

  it('is a horizontal paging list with one window-wide page per photo', () => {
    renderViewer(7, '2');

    const props = list().props;
    expect(props.horizontal).toBe(true);
    expect(props.pagingEnabled).toBe(true);
    expect(props.getItemLayout(undefined, 4)).toEqual({ length: width, offset: 4 * width, index: 4 });
  });

  it('pages through the photos in spotPhotos order, primary first', () => {
    const { media } = renderViewer(7, '0');

    const ids = (list().props.data as Media[]).map((m) => m.id);
    expect(ids).toEqual([3, 0, 1, 2, 4, 5, 6].map((i) => media[i].id));
    const first = screen.getByLabelText('Photo 1 of 7');
    const uri = (first.findByType(Image).props.source as { uri: string }).uri;
    expect(uri).toBe(resolvePhotoUri(media[3].file_path));
  });

  it('keeps its order while open when the primary changes, and appends a photo added meanwhile (D29)', () => {
    const { spot, media } = renderViewer(4, '1');
    const before = (list().props.data as Media[]).map((m) => m.id);
    const added = createTestMedia({ spot_id: spot.id, created_at: at(30) });

    act(() => {
      useSpotsStore.setState({ spots: [{ ...spot, primary_photo_id: media[2].id }] });
      useMediaStore.getState().setAll([...media, added]);
    });

    expect((list().props.data as Media[]).map((m) => m.id)).toEqual([...before, added.id]);
    expect(screen.getByText('2 / 5')).toBeOnTheScreen();
  });

  it('labels each page as one image for VoiceOver', () => {
    renderViewer(7, '2');

    const page = screen.getByLabelText('Photo 3 of 7');
    expect(page.props.accessible).toBe(true);
    expect(page.props.accessibilityRole).toBe('image');
  });

  it('has a Close button that goes back', () => {
    renderViewer(7, '2');

    const close = screen.getByRole('button', { name: 'Close' });
    fireEvent.press(close);

    expect(back).toHaveBeenCalledTimes(1);
  });

  it('updates the counter when a swipe settles on page 5', () => {
    renderViewer(7, '2');

    act(() => {
      fireEvent(list(), 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 5 * width, y: 0 } } });
    });

    expect(screen.getByText('6 / 7')).toBeOnTheScreen();
  });

  it('opens an out-of-range index at the last photo', () => {
    renderViewer(7, '99');

    expect(screen.getByText('7 / 7')).toBeOnTheScreen();
    expect(list().props.initialScrollIndex).toBe(6);
  });

  it('opens at the first photo when the index is missing or not a number', () => {
    renderViewer(3);
    expect(screen.getByText('1 / 3')).toBeOnTheScreen();
    screen.unmount();

    renderViewer(3, 'abc');
    expect(screen.getByText('1 / 3')).toBeOnTheScreen();
  });

  it('is black with the status bar hidden', () => {
    renderViewer(2, '0');

    expect(StyleSheet.flatten(screen.getByTestId('photo-viewer').props.style).backgroundColor).toBe('#000');
    expect(screen.UNSAFE_getByType(StatusBar).props.hidden).toBe(true);
  });

  it('says Spot not found for an unknown spot', () => {
    useSpotsStore.setState({ spots: [] });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'nope', index: '0' } as never);
    render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <PhotoViewerScreen />
      </SafeAreaProvider>,
    );

    expect(screen.getByText('Spot not found')).toBeOnTheScreen();
    // Still closable.
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(back).toHaveBeenCalledTimes(1);
  });
});
