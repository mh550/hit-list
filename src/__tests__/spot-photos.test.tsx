import { render, screen } from '@testing-library/react-native';
import { Image } from 'react-native';
import * as fileSystem from 'expo-file-system';
import { useMediaStore, useSpotsStore } from '@/src/stores';
import { spotPhotos } from '@/src/utils/spot-photos';
import { resolvePhotoUri } from '@/src/utils/photo-storage';
import { createTestMedia, createTestSpot } from './factories';

const fs = fileSystem as unknown as typeof import('../../__mocks__/expo-file-system');

let mockId = '';
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: mockId }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  Stack: { Screen: 'Stack.Screen' },
}));
jest.mock('@shopify/flash-list', () => ({ FlashList: jest.requireActual('react-native').FlatList }));

import SpotsScreen from '@/app/(tabs)/index';
import SpotDetailScreen from '@/app/spot/[id]/index';

const at = (min: number) => `2026-10-13T14:${String(min).padStart(2, '0')}:00.000Z`;
const imageUris = () =>
  screen.UNSAFE_queryAllByType(Image).map((i) => (i.props.source as { uri: string }).uri);

beforeEach(() => {
  fs.__resetFs();
  useSpotsStore.setState({ spots: [] });
  useMediaStore.setState({ mediaBySpot: {} });
});

describe('spotPhotos', () => {
  const spot = createTestSpot({ id: 's1' });
  const a = createTestMedia({ spot_id: 's1', created_at: at(1) });
  const b = createTestMedia({ spot_id: 's1', created_at: at(2) });
  const c = createTestMedia({ spot_id: 's1', created_at: at(3) });

  it('puts the primary photo first and keeps the rest in capture order', () => {
    expect(spotPhotos({ ...spot, primary_photo_id: b.id }, [a, b, c])).toEqual([b, a, c]);
  });

  it('keeps capture order when the primary id is unset or names no row', () => {
    expect(spotPhotos(spot, [a, b])).toEqual([a, b]);
    expect(spotPhotos({ ...spot, primary_photo_id: 'missing' }, [a, b])).toEqual([a, b]);
  });

  it('returns no photos for a spot without media', () => {
    expect(spotPhotos(spot, undefined)).toEqual([]);
  });
});

describe('Spots list thumbnails', () => {
  it('shows the primary photo for a spot with media and the placeholder for one without', () => {
    const withPhotos = createTestSpot({ name: 'Rail', created_at: at(5) });
    const without = createTestSpot({ name: 'Ledge', created_at: at(4) });
    const first = createTestMedia({ spot_id: withPhotos.id, created_at: at(1), file_path: 'photos/x/1.jpg' });
    const primary = createTestMedia({ spot_id: withPhotos.id, created_at: at(2), file_path: 'photos/x/2.jpg' });
    useSpotsStore.setState({ spots: [{ ...withPhotos, primary_photo_id: primary.id }, without] });
    useMediaStore.getState().setAll([first, primary]);

    render(<SpotsScreen />);

    expect(imageUris()).toEqual([resolvePhotoUri('photos/x/2.jpg')]);
    expect(screen.getAllByText('No Photo')).toHaveLength(1);
  });
});

describe('Spot detail gallery', () => {
  it('shows every photo with the primary first', () => {
    const spot = createTestSpot();
    const media = [1, 2, 3].map((n) =>
      createTestMedia({ spot_id: spot.id, created_at: at(n), file_path: `photos/${spot.id}/${n}.jpg` }),
    );
    useSpotsStore.setState({ spots: [{ ...spot, primary_photo_id: media[1].id }] });
    useMediaStore.getState().setAll(media);
    mockId = spot.id;

    render(<SpotDetailScreen />);

    expect(imageUris()).toEqual(
      [media[1], media[0], media[2]].map((m) => resolvePhotoUri(m.file_path)),
    );
  });

  it('shows no image (and never the photo id as a URI) for a spot without media', () => {
    const spot = createTestSpot({ primary_photo_id: 'b3c1f7a2-uuid-not-a-uri' });
    useSpotsStore.setState({ spots: [spot] });
    mockId = spot.id;

    render(<SpotDetailScreen />);

    expect(imageUris()).toEqual([]);
  });

  it('shows all 20 photos of a full spot', () => {
    const spot = createTestSpot();
    const media = Array.from({ length: 20 }, (_, n) =>
      createTestMedia({ spot_id: spot.id, created_at: at(n), file_path: `photos/${spot.id}/${n}.jpg` }),
    );
    useSpotsStore.setState({ spots: [spot] });
    useMediaStore.getState().setAll(media);
    mockId = spot.id;

    render(<SpotDetailScreen />);

    expect(imageUris()).toHaveLength(20);
  });
});
