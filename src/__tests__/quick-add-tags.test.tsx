import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Spot } from '@/src/types';

const mockAddSpot = jest.fn().mockResolvedValue(undefined);
const mockSavePhotos = jest.fn().mockResolvedValue([]);
const mockDismissAll = jest.fn();

jest.mock('@/src/hooks/use-spot-actions', () => ({
  useSpotActions: () => ({ addSpot: mockAddSpot }),
}));
jest.mock('@/src/hooks/use-media-actions', () => ({
  useMediaActions: () => ({ savePhotos: mockSavePhotos }),
}));

import QuickAddReview from '@/app/add/review';

const savedSpot = () => mockAddSpot.mock.calls[0][0] as Spot;
const pressSave = async () => {
  fireEvent.press(screen.getByRole('button', { name: 'Save spot' }));
  await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());
};

describe("Quick Add review: tags behind 'Add details' (M6-02, spec §2.7)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useLocalSearchParams).mockReturnValue({
      photoUris: 'file:///c/a.jpg',
      latitude: '47.6',
      longitude: '-122.3',
    } as never);
    jest.mocked(useRouter).mockReturnValue({ dismissAll: mockDismissAll, push: jest.fn(), back: jest.fn() } as never);
  });

  it('first shows only the link, no chip, switch or speed segment', () => {
    render(<QuickAddReview />);

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    const link = screen.getByRole('button', { name: 'Add details' });
    expect(link).toHaveTextContent('Add details');
  });

  it('reveals the eight chips, the switch and five segments, and the link goes away', () => {
    render(<QuickAddReview />);
    fireEvent.press(screen.getByRole('button', { name: 'Add details' }));

    expect(screen.getAllByRole('checkbox')).toHaveLength(8);
    expect(screen.getByRole('switch', { name: 'Skate stopped' })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(screen.queryByText('Add details')).toBeNull();
  });

  it('saves the tags set under Add details', async () => {
    render(<QuickAddReview />);
    fireEvent.press(screen.getByRole('button', { name: 'Add details' }));
    fireEvent.press(screen.getByRole('checkbox', { name: 'Rail' }));
    fireEvent(screen.getByRole('switch', { name: 'Skate stopped' }), 'valueChange', true);
    fireEvent.press(screen.getByRole('radio', { name: /^Some:/ }));
    await pressSave();

    expect(mockAddSpot).toHaveBeenCalledTimes(1);
    expect(savedSpot()).toMatchObject({ feature_types: ['rail'], stopped: true, natural_speed: 2 });
  });

  it('saves an untagged, not-stopped, unrated spot when Add details was never opened', async () => {
    render(<QuickAddReview />);
    await pressSave();

    expect(mockAddSpot).toHaveBeenCalledTimes(1);
    const spot = savedSpot();
    expect(spot).toMatchObject({ feature_types: [], stopped: false });
    expect(spot.natural_speed).toBeUndefined();
  });

  it('keeps autoFocus on the name field and the Save text', () => {
    render(<QuickAddReview />);

    expect(screen.getByPlaceholderText(/Downtown Rail/).props.autoFocus).toBe(true);
    expect(screen.getByRole('button', { name: 'Save spot' })).toHaveTextContent('Save');
  });
});
