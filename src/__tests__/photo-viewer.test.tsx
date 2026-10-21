import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, Dimensions, FlatList, Image, StyleSheet, type AlertButton } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMediaStore, useSpotsStore } from '@/src/stores';
import { resolvePhotoUri } from '@/src/utils/photo-storage';
import type { Media } from '@/src/types';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { ZoomablePhoto } from '@/src/components';
import { createTestMedia, createTestSpot } from './factories';

// The real hooks update the stores; these do the same without a db (removePhotos resolves the ids it removed).
const mockUpdateSpot = jest.fn(async (id: string, updates: object) => {
  const { useSpotsStore: spots } = jest.requireActual('@/src/stores');
  spots.getState().updateSpot(id, updates);
});
const mockRemovePhotos = jest.fn(async (ids: string[]) => {
  const { useMediaStore: media } = jest.requireActual('@/src/stores');
  media.getState().removeMany(ids);
  return ids;
});
jest.mock('@/src/hooks/use-spot-actions', () => ({
  useSpotActions: () => ({ updateSpot: mockUpdateSpot, addSpot: jest.fn(), removeSpot: jest.fn() }),
}));
jest.mock('@/src/hooks/use-media-actions', () => ({
  useMediaActions: () => ({ removePhotos: mockRemovePhotos, savePhotos: jest.fn() }),
}));

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

describe('Photo viewer: zoom, pan and swipe-down close', () => {
  const { height } = Dimensions.get('window');
  // Gesture callbacks hand results to React through scheduleOnRN, which the worklets mock queues as a microtask.
  // The first ACTIVE event only starts a gesture (onStart); onUpdate runs from the second one on.
  const flush = () => act(async () => {});
  const pinchTo = (page: number, scale: number) =>
    fireGestureHandler(getByGestureTestId(`viewer-${page}-pinch`), [
      { state: State.BEGAN, scale: 1, focalX: width / 2, focalY: height / 2 },
      { state: State.ACTIVE, scale: 1, focalX: width / 2, focalY: height / 2 },
      { state: State.ACTIVE, scale, focalX: width / 2, focalY: height / 2 },
      { state: State.END, scale, focalX: width / 2, focalY: height / 2 },
    ]);
  const swipeDown = (page: number, dy: number) =>
    fireGestureHandler(getByGestureTestId(`viewer-${page}-pan`), [
      { state: State.BEGAN, translationX: 0, translationY: 0 },
      { state: State.ACTIVE, translationX: 0, translationY: 0 },
      { state: State.ACTIVE, translationX: 0, translationY: dy },
      { state: State.END, translationX: 0, translationY: dy },
    ]);

  it('gives every page a ZoomablePhoto of the window size showing that photo', () => {
    const { media } = renderViewer(7, '2');

    const zoomable = screen.getByLabelText('Photo 3 of 7').findByType(ZoomablePhoto);
    expect(zoomable.props.width).toBe(width);
    expect(zoomable.props.height).toBe(height);
    expect(zoomable.props.uri).toBe(resolvePhotoUri(media[1].file_path));
    expect(zoomable.props.recyclingKey).toBe(media[1].id);
  });

  it('pages at 1× and locks paging once the page reports a zoom past 1.05×', () => {
    renderViewer(7, '2');
    expect(list().props.scrollEnabled).toBe(true);

    const zoomable = screen.getByLabelText('Photo 3 of 7').findByType(ZoomablePhoto);
    act(() => zoomable.props.onScaleChange(2));
    expect(list().props.scrollEnabled).toBe(false);

    act(() => zoomable.props.onScaleChange(1));
    expect(list().props.scrollEnabled).toBe(true);
  });

  it('locks paging after a pinch to 2× and unlocks after a pinch back to 1×', async () => {
    renderViewer(7, '2');

    pinchTo(2, 2);
    await flush();
    expect(list().props.scrollEnabled).toBe(false);

    pinchTo(2, 0.5);
    await flush();
    expect(list().props.scrollEnabled).toBe(true);
  });

  it('snaps a pinch that ends at or below 1.05× back to 1×', async () => {
    renderViewer(7, '2');

    pinchTo(2, 1.04);
    await flush();
    expect(list().props.scrollEnabled).toBe(true);
    // Unzoomed, so a swipe down still closes.
    swipeDown(2, 150);
    await flush();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('toggles between 1× and 2.5× on a double tap', async () => {
    renderViewer(7, '2');
    const doubleTap = () =>
      fireGestureHandler(getByGestureTestId('viewer-2-double-tap'), [
        { state: State.BEGAN, x: width / 2, y: height / 2 },
        { state: State.ACTIVE, x: width / 2, y: height / 2 },
        { state: State.END, x: width / 2, y: height / 2 },
      ]);

    doubleTap();
    await flush();
    expect(list().props.scrollEnabled).toBe(false);

    doubleTap();
    await flush();
    expect(list().props.scrollEnabled).toBe(true);
  });

  it('closes on a swipe down of 150 at 1×', async () => {
    renderViewer(7, '2');

    swipeDown(2, 150);
    await flush();

    expect(back).toHaveBeenCalledTimes(1);
  });

  it('does not close on a swipe down of 119 at 1×', async () => {
    renderViewer(7, '2');

    swipeDown(2, 119);
    await flush();

    expect(back).not.toHaveBeenCalled();
  });

  it('pans instead of closing on a swipe down of 150 at 2×', async () => {
    renderViewer(7, '2');
    pinchTo(2, 2);
    await flush();

    swipeDown(2, 150);
    await flush();

    expect(back).not.toHaveBeenCalled();
  });
});

describe('ZoomablePhoto', () => {
  const size = { width: 390, height: 844 };
  const centre = { focalX: 195, focalY: 422 };
  const flush = () => act(async () => {});
  function renderPhoto() {
    const onScaleChange = jest.fn();
    const onRequestClose = jest.fn();
    render(
      <ZoomablePhoto
        uri="file:///p.jpg"
        recyclingKey="m1"
        {...size}
        onScaleChange={onScaleChange}
        onRequestClose={onRequestClose}
        testIdPrefix="zp"
      />,
    );
    return { onScaleChange, onRequestClose };
  }
  const pinch = (scale: number) =>
    fireGestureHandler(getByGestureTestId('zp-pinch'), [
      { state: State.BEGAN, scale: 1, ...centre },
      { state: State.ACTIVE, scale: 1, ...centre },
      { state: State.ACTIVE, scale, ...centre },
      { state: State.END, scale, ...centre },
    ]);

  it('reports the settled scale: clamped to 4, and 1 after a pinch that ends at 1.04', async () => {
    const { onScaleChange } = renderPhoto();

    pinch(6);
    await flush();
    expect(onScaleChange).toHaveBeenLastCalledWith(4);

    pinch(1.04 / 4);
    await flush();
    expect(onScaleChange).toHaveBeenLastCalledWith(1);
  });

  it('does not close when a long swipe down is cancelled instead of ending', async () => {
    const { onRequestClose } = renderPhoto();

    fireGestureHandler(getByGestureTestId('zp-pan'), [
      { state: State.BEGAN, translationX: 0, translationY: 0 },
      { state: State.ACTIVE, translationX: 0, translationY: 0 },
      { state: State.ACTIVE, translationX: 0, translationY: 200 },
      { state: State.CANCELLED, translationX: 0, translationY: 200 },
    ]);
    await flush();

    expect(onRequestClose).not.toHaveBeenCalled();
  });
});

describe('Photo viewer: long-press options', () => {
  const flush = () => act(async () => {});
  let alert: jest.SpyInstance;
  beforeEach(() => {
    mockUpdateSpot.mockClear();
    mockRemovePhotos.mockClear();
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alert.mockRestore());

  const longPress = async (page: number) => {
    fireGestureHandler(getByGestureTestId(`viewer-${page}-long-press`), [
      { state: State.BEGAN },
      { state: State.ACTIVE },
      { state: State.END },
    ]);
    await flush();
  };
  const buttons = (call: number) => alert.mock.calls[call][2] as AlertButton[];
  // A Cancel button has no onPress: the alert just closes.
  const press = async (call: number, text: string) => {
    await act(async () => {
      buttons(call).find((b) => b.text === text)!.onPress?.();
    });
  };
  /** Long-press `page`, choose Remove photo, then confirm. */
  const removePage = async (page: number) => {
    await longPress(page);
    await press(0, 'Remove photo');
    await press(1, 'Remove');
  };

  it('offers Set as primary, Remove photo (destructive) and Cancel on a long press', async () => {
    renderViewer(7, '2');

    await longPress(2);

    expect(alert).toHaveBeenCalledTimes(1);
    expect(buttons(0).map((b) => b.text)).toEqual(['Set as primary', 'Remove photo', 'Cancel']);
    expect(buttons(0)[1].style).toBe('destructive');
    expect(buttons(0)[2].style).toBe('cancel');
  });

  it('tells VoiceOver users each page has options', () => {
    renderViewer(7, '2');

    expect(screen.getByLabelText('Photo 3 of 7').props.accessibilityHint).toBe('Double-tap and hold for options');
  });

  it('offers the same options through the long-press accessibility action', () => {
    renderViewer(7, '2');
    const page = screen.getByLabelText('Photo 3 of 7');
    expect(page.props.accessibilityActions).toEqual([{ name: 'longpress', label: 'Photo options' }]);

    fireEvent(page, 'accessibilityAction', { nativeEvent: { actionName: 'longpress' } });

    expect(alert).toHaveBeenCalledTimes(1);
    expect(buttons(0).map((b) => b.text)).toEqual(['Set as primary', 'Remove photo', 'Cancel']);
  });

  it('says so when setting the primary fails', async () => {
    renderViewer(7, '2');
    mockUpdateSpot.mockRejectedValueOnce(new Error('disk full'));

    await longPress(2);
    await press(0, 'Set as primary');

    expect(alert).toHaveBeenCalledTimes(2);
    expect(alert.mock.calls[1][0]).toBe("This photo couldn't be set as primary");
  });

  it('sets the pressed photo as primary and stays on the same page', async () => {
    const { spot, media } = renderViewer(7, '2');
    const before = (list().props.data as Media[]).map((m) => m.id);

    await longPress(2);
    await press(0, 'Set as primary');

    expect(mockUpdateSpot).toHaveBeenCalledTimes(1);
    expect(mockUpdateSpot).toHaveBeenCalledWith(spot.id, { primary_photo_id: media[1].id });
    expect(screen.getByText('3 / 7')).toBeOnTheScreen();
    expect((list().props.data as Media[]).map((m) => m.id)).toEqual(before);
  });

  it('asks before removing, then removes the photo once and shows the next one in its place', async () => {
    const { media } = renderViewer(7, '2');

    await longPress(2);
    await press(0, 'Remove photo');
    expect(alert).toHaveBeenCalledTimes(2);
    expect(alert.mock.calls[1][0]).toBe('Remove this photo?');
    expect(buttons(1).find((b) => b.text === 'Remove')!.style).toBe('destructive');
    expect(mockRemovePhotos).not.toHaveBeenCalled();

    await press(1, 'Remove');

    expect(mockRemovePhotos).toHaveBeenCalledTimes(1);
    expect(mockRemovePhotos).toHaveBeenCalledWith([media[1].id]);
    expect(screen.getByText('3 / 6')).toBeOnTheScreen();
    const uri = screen.getByLabelText('Photo 3 of 6').findByType(ZoomablePhoto).props.uri as string;
    expect(uri).toBe(resolvePhotoUri(media[2].file_path));
    // Not the primary, so the spot is left alone.
    expect(mockUpdateSpot).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });

  it('keeps the photo when the removal is cancelled', async () => {
    renderViewer(7, '2');

    await longPress(2);
    await press(0, 'Remove photo');
    await press(1, 'Cancel');

    expect(mockRemovePhotos).not.toHaveBeenCalled();
    expect(screen.getByText('3 / 7')).toBeOnTheScreen();
  });

  it('moves to the new last page after removing the last photo', async () => {
    const scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => {});
    renderViewer(7, '6');

    await removePage(6);

    expect(screen.getByText('6 / 6')).toBeOnTheScreen();
    expect(scrollToIndex).toHaveBeenCalledWith({ index: 5, animated: false });
    scrollToIndex.mockRestore();
  });

  it('keeps showing the same photo when an earlier one is removed', async () => {
    const scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => {});
    const { media } = renderViewer(7, '4'); // page 4 is media[4]; page 1 is media[0]

    act(() => useMediaStore.getState().removeMany([media[0].id]));

    expect(screen.getByText('4 / 6')).toBeOnTheScreen();
    expect(scrollToIndex).toHaveBeenCalledWith({ index: 3, animated: false });
    expect((list().props.data as Media[])[3].id).toBe(media[4].id);
    scrollToIndex.mockRestore();
  });

  it('makes the next photo primary when the primary is removed', async () => {
    const { spot, media } = renderViewer(7, '0');

    await removePage(0);

    expect(mockRemovePhotos).toHaveBeenCalledWith([media[3].id]);
    expect(mockUpdateSpot).toHaveBeenCalledWith(spot.id, { primary_photo_id: media[0].id });
    expect(screen.getByText('1 / 6')).toBeOnTheScreen();
  });

  it('makes the previous photo primary when the primary on the last page is removed', async () => {
    const { spot, media } = renderViewer(7, '6');
    act(() => useSpotsStore.setState({ spots: [{ ...spot, primary_photo_id: media[6].id }] }));

    await removePage(6);

    expect(mockUpdateSpot).toHaveBeenCalledWith(spot.id, { primary_photo_id: media[5].id });
    expect(screen.getByText('6 / 6')).toBeOnTheScreen();
  });

  it('still closes when clearing the primary of the only photo fails', async () => {
    renderViewer(1, '0');
    mockUpdateSpot.mockRejectedValueOnce(new Error('disk full'));

    await removePage(0);

    expect(back).toHaveBeenCalledTimes(1);
  });

  it('clears the primary and closes the viewer when the only photo is removed', async () => {
    const { spot, media } = renderViewer(1, '0');

    await removePage(0);

    expect(mockRemovePhotos).toHaveBeenCalledWith([media[0].id]);
    expect(mockUpdateSpot).toHaveBeenCalledWith(spot.id, { primary_photo_id: null });
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('unlocks paging after removing a zoomed photo', async () => {
    renderViewer(7, '2');
    act(() => screen.getByLabelText('Photo 3 of 7').findByType(ZoomablePhoto).props.onScaleChange(2));
    expect(list().props.scrollEnabled).toBe(false);

    await removePage(2);

    expect(list().props.scrollEnabled).toBe(true);
  });

  it('keeps the photo and says so when the removal fails', async () => {
    renderViewer(7, '2');
    mockRemovePhotos.mockResolvedValueOnce([]);

    await removePage(2);

    expect(screen.getByText('3 / 7')).toBeOnTheScreen();
    expect(mockUpdateSpot).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(3);
    expect(alert.mock.calls[2][0]).toBe("This photo couldn't be removed");
  });
});

describe('ZoomablePhoto: long press', () => {
  it('calls onLongPress when held', async () => {
    const onLongPress = jest.fn();
    render(<ZoomablePhoto uri="file:///p.jpg" recyclingKey="m1" width={390} height={844} onLongPress={onLongPress} testIdPrefix="zp" />);

    fireGestureHandler(getByGestureTestId('zp-long-press'), [{ state: State.BEGAN }, { state: State.ACTIVE }, { state: State.END }]);
    await act(async () => {});

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});
