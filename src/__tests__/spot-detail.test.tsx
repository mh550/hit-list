import type { ReactElement } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Image, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getSpotLegacy } from '@/src/db';
import { useMediaStore, useSettingsStore, useSpotsStore } from '@/src/stores';
import { palette } from '@/src/constants/theme';
import { resolvePhotoUri } from '@/src/utils/photo-storage';
import { FeatureType, UnitSystem, type Media, type Spot } from '@/src/types';
import { createTestMedia, createTestSpot } from './factories';

import SpotDetailScreen from '@/app/spot/[id]/index';

jest.mock('@/src/db', () => ({ ...jest.requireActual('@/src/db'), getSpotLegacy: jest.fn() }));
const legacyMock = jest.mocked(getSpotLegacy);

const push = jest.fn();

beforeEach(() => {
  legacyMock.mockReset();
  legacyMock.mockResolvedValue(null);
  push.mockReset();
  jest.mocked(useRouter).mockReturnValue({ push, back: jest.fn(), replace: jest.fn() } as never);
  useSettingsStore.getState().setUnits(UnitSystem.Imperial);
});

/** Renders the detail screen and lets the Older details lookup settle, so no act() warning reaches console.error. */
async function renderDetail(overrides: Partial<Spot> = {}, media: Media[] = []) {
  const spot = createTestSpot(overrides);
  useSpotsStore.setState({ spots: [spot] });
  useMediaStore.setState({ mediaBySpot: {} });
  useMediaStore.getState().setAll(media.map((m) => ({ ...m, spot_id: spot.id })));
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: spot.id } as never);
  render(<SpotDetailScreen />);
  await act(async () => {});
  return spot;
}

const texts = () => screen.getAllByText(/./).map((t) => t.props.children);

describe('Spot detail: notes', () => {
  it('shows the notes paragraph when the spot has notes', async () => {
    await renderDetail({ name: 'Pier 57', notes: 'under the bridge' });

    expect(screen.getByText('Pier 57')).toBeOnTheScreen();
    expect(screen.getByText('under the bridge')).toBeOnTheScreen();
  });

  it('shows no Notes label when the spot has no notes', async () => {
    await renderDetail({ name: 'Pier 57' });

    expect(screen.getByText('Pier 57')).toBeOnTheScreen();
    expect(screen.queryByText('Notes')).toBeNull();
  });

  it('shows only the title and the notes, no section from the removed model (D17)', async () => {
    await renderDetail({ name: 'Pier 57', notes: 'under the bridge' });

    expect(texts()).toEqual(['Pier 57', 'Notes', 'under the bridge']);
  });
});

describe('Spot detail: tag line and speed', () => {
  const tagged: Partial<Spot> = {
    feature_types: [FeatureType.Rail, FeatureType.Ledge],
    stopped: true,
    natural_speed: 3,
    notes: 'low',
  };

  it('shows the feature types in stored order, a red-outlined Skate stopped tag, the speed bar and the notes', async () => {
    await renderDetail(tagged);

    const order = texts();
    expect(order.indexOf('Rail')).toBeGreaterThan(-1);
    expect(order.indexOf('Rail')).toBeLessThan(order.indexOf('Ledge'));
    expect(order.indexOf('Ledge')).toBeLessThan(order.indexOf('Skate stopped'));
    expect(StyleSheet.flatten(screen.getByTestId('tag-stopped').props.style).borderColor).toBe(palette.red[500]);
    expect(screen.getByLabelText('Natural speed: Enough')).toBeOnTheScreen();
    expect(screen.getByText('low')).toBeOnTheScreen();
  });

  it('reads the tags as text, not as checkboxes or buttons', async () => {
    await renderDetail(tagged, [createTestMedia()]);

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('shows no Skate stopped tag when the spot is not stopped', async () => {
    await renderDetail({ feature_types: [FeatureType.Rail], stopped: false });

    expect(screen.getByText('Rail')).toBeOnTheScreen();
    expect(screen.queryByText('Skate stopped')).toBeNull();
  });

  it('shows Skate stopped alone when the spot has no feature types', async () => {
    await renderDetail({ name: 'Bank', stopped: true });

    expect(texts()).toEqual(['Bank', 'Skate stopped']);
  });

  it('shows no speed bar when the speed is not rated', async () => {
    await renderDetail({ feature_types: [FeatureType.Rail] });

    expect(screen.queryByLabelText(/^Natural speed/)).toBeNull();
  });

  it('shows None for a speed of 0, which is a real rating', async () => {
    await renderDetail({ natural_speed: 0 });

    expect(screen.getByLabelText('Natural speed: None')).toBeOnTheScreen();
  });
});

describe('Spot detail: photos', () => {
  const at = (min: number) => `2026-10-13T14:${String(min).padStart(2, '0')}:00.000Z`;

  it('shows five photos in the grid with the primary first', async () => {
    const media = [1, 2, 3, 4, 5].map((n) => createTestMedia({ created_at: at(n), file_path: `photos/s/${n}.jpg` }));
    await renderDetail({ primary_photo_id: media[2].id }, media);

    [0, 1, 2, 3, 4].forEach((i) => expect(screen.getByTestId(`photo-tile-${i}`)).toBeOnTheScreen());
    expect(screen.queryByTestId('photo-tile-5')).toBeNull();
    const uris = screen.UNSAFE_queryAllByType(Image).map((i) => (i.props.source as { uri: string }).uri);
    expect(uris).toEqual([media[2], media[0], media[1], media[3], media[4]].map((m) => resolvePhotoUri(m.file_path)));
    expect(screen.queryByLabelText('Add photos')).toBeNull();
  });

  it('shows an Add photos tile for a spot without photos that opens edit', async () => {
    const spot = await renderDetail();

    fireEvent.press(screen.getByRole('button', { name: 'Add photos' }));

    expect(push).toHaveBeenCalledWith(`/spot/${spot.id}/edit`);
  });
});

describe('Spot detail: Older details', () => {
  it('is collapsed until pressed, then shows the archived rows', async () => {
    legacyMock.mockResolvedValue({ material: 'steel' });
    await renderDetail({ name: 'Pier 57' });

    const header = screen.getByRole('button', { name: 'Older details' });
    expect(header.props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.queryByText('Material')).toBeNull();

    fireEvent.press(header);

    expect(screen.getByText('Material')).toBeOnTheScreen();
    expect(screen.getByText('steel')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Older details' }).props.accessibilityState).toMatchObject({
      expanded: true,
    });

    fireEvent.press(screen.getByRole('button', { name: 'Older details' }));
    expect(screen.queryByText('Material')).toBeNull();
  });

  it('is absent when the spot has no archive', async () => {
    await renderDetail({ name: 'Pier 57' });

    expect(screen.queryByText('Older details')).toBeNull();
  });

  it('is absent when the archive has nothing to show', async () => {
    legacyMock.mockResolvedValue({});
    await renderDetail({ name: 'Pier 57' });

    expect(screen.queryByText('Older details')).toBeNull();
  });

  it('reads the archive once per mount with the db and the id, not on store updates', async () => {
    const spot = await renderDetail({ name: 'Pier 57' });

    expect(legacyMock).toHaveBeenCalledTimes(1);
    expect(legacyMock).toHaveBeenCalledWith(useSQLiteContext(), spot.id);

    await act(async () => {
      useSpotsStore.setState({ spots: [{ ...spot, notes: 'changed' }] });
    });
    screen.rerender(<SpotDetailScreen />);
    await act(async () => {});

    expect(screen.getByText('changed')).toBeOnTheScreen();
    expect(legacyMock).toHaveBeenCalledTimes(1);
  });

  it('warns once and shows no disclosure when the archive cannot be read', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    legacyMock.mockRejectedValue(new SyntaxError('Unexpected token'));

    await renderDetail({ name: 'Pier 57' });

    expect(screen.getByText('Pier 57')).toBeOnTheScreen();
    expect(screen.queryByText('Older details')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('shows lengths in the units picked on Profile', async () => {
    legacyMock.mockResolvedValue({ length_m: 3.6576 });
    await renderDetail({ name: 'Pier 57' });

    fireEvent.press(screen.getByRole('button', { name: 'Older details' }));
    expect(screen.getByText('12.0 ft')).toBeOnTheScreen();

    act(() => useSettingsStore.getState().setUnits(UnitSystem.Metric));

    expect(screen.getByText('3.7 m')).toBeOnTheScreen();
    expect(legacyMock).toHaveBeenCalledTimes(1);
  });
});

describe('Spot detail: nothing from the old model', () => {
  it('has no old section headers, Draft badge or Type label', async () => {
    legacyMock.mockResolvedValue({ material: 'steel' });
    await renderDetail(
      { feature_types: [FeatureType.Rail, FeatureType.StairSet], stopped: true, natural_speed: 2, notes: 'n' },
      [createTestMedia(), createTestMedia()],
    );
    fireEvent.press(screen.getByRole('button', { name: 'Older details' }));

    for (const banned of ['Feature', 'In-Run', 'Landing', 'Details', 'Draft', 'Type']) {
      expect(screen.queryByText(banned)).toBeNull();
    }
  });

  it('shows only the title for a spot with a name and one photo', async () => {
    await renderDetail({ name: 'Pier 57' }, [createTestMedia()]);

    expect(texts()).toEqual(['Pier 57']);
  });
});

describe('Spot detail: header', () => {
  it('Edit opens the edit route', async () => {
    const spot = await renderDetail({ name: 'Pier 57' });
    const { options } = screen.UNSAFE_getByType('Stack.Screen' as never).props as {
      options: { headerRight: () => ReactElement };
    };

    const header = render(options.headerRight());
    fireEvent.press(header.getByText('Edit'));
    header.unmount();

    expect(push).toHaveBeenCalledWith(`/spot/${spot.id}/edit`);
  });
});
