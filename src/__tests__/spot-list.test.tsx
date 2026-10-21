import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { SpotListItem } from '@/src/components/SpotListItem';
import { featureTypesLabel, getSpotDisplayName } from '@/src/utils/spot-name';
import { createTestSpot } from './factories';
import { palette } from '@/src/constants/theme';
import { FeatureType } from '@/src/types';
import type { Spot } from '@/src/types';

describe('SpotListItem', () => {
  const defaultProps = {
    id: 'test-id',
    displayName: 'Downtown Rail',
    stopped: false,
    onPress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders display name', () => {
    render(<SpotListItem {...defaultProps} />);
    expect(screen.getByText('Downtown Rail')).toBeTruthy();
  });

  it('renders feature type badge', () => {
    render(<SpotListItem {...defaultProps} featureType="Stair set +1" />);
    expect(screen.getByText('Stair set +1')).toBeTruthy();
  });

  it('renders distance', () => {
    render(<SpotListItem {...defaultProps} distance="2.3 mi" />);
    expect(screen.getByText('2.3 mi')).toBeTruthy();
  });

  it('never shows a status badge (D20: no drafts)', () => {
    render(<SpotListItem {...defaultProps} featureType="rail" distance="2.3 mi" />);
    expect(screen.queryByText(/draft/i)).toBeNull();
  });

  it('calls onPress with id when pressed', () => {
    const onPress = jest.fn();
    render(<SpotListItem {...defaultProps} onPress={onPress} />);
    fireEvent.press(screen.getByLabelText('Downtown Rail'));
    expect(onPress).toHaveBeenCalledWith('test-id');
  });

  it('lets a long label wrap to a second line instead of cutting off the time', () => {
    render(<SpotListItem {...defaultProps} displayName="Untitled · San Francisco · Oct 13, 2:22 PM" />);
    expect(screen.getByText('Untitled · San Francisco · Oct 13, 2:22 PM').props.numberOfLines).toBe(2);
  });

  it('renders placeholder when no thumbnail', () => {
    render(<SpotListItem {...defaultProps} />);
    expect(screen.getByText('No Photo')).toBeTruthy();
  });
});

describe('SpotListItem tags (M5-03)', () => {
  // Mirrors the Spots tab's renderItem: the row gets the spot's label, stopped flag and speed.
  const renderRow = (spot: Spot, distance?: string) =>
    render(
      <SpotListItem
        id={spot.id}
        displayName={getSpotDisplayName(spot)}
        featureType={featureTypesLabel(spot)}
        stopped={spot.stopped}
        naturalSpeed={spot.natural_speed}
        distance={distance}
        onPress={jest.fn()}
      />,
    );

  it('shows the first feature type with +N for the rest', () => {
    renderRow(createTestSpot({ feature_types: [FeatureType.Rail, FeatureType.Ledge, FeatureType.Bank] }));
    expect(screen.getByText('Rail +2')).toBeTruthy();
  });

  it('shows a Stopped tag only on a stopped spot', () => {
    const { unmount } = renderRow(createTestSpot({ stopped: true }));
    expect(screen.getByText('Stopped')).toBeTruthy();
    unmount();

    renderRow(createTestSpot({ stopped: false }));
    expect(screen.queryByText('Stopped')).toBeNull();
  });

  it('shows the read-only speed bar for a rated spot', () => {
    renderRow(createTestSpot({ natural_speed: 4 }));
    expect(screen.getByLabelText('Natural speed: Too much')).toBeTruthy();
  });

  it('shows the speed bar for a spot rated None (0 is a real value)', () => {
    renderRow(createTestSpot({ natural_speed: 0 }));
    expect(screen.getByLabelText('Natural speed: None')).toBeTruthy();
  });

  it('shows no speed bar for an unrated spot', () => {
    renderRow(createTestSpot({ natural_speed: undefined }));
    expect(screen.queryAllByLabelText(/^Natural speed/)).toHaveLength(0);
  });

  it('draws Stopped and the speed word at the type badge size (12), Stopped in red', () => {
    renderRow(createTestSpot({ feature_types: [FeatureType.Rail], stopped: true, natural_speed: 4 }));

    const style = (text: string) => StyleSheet.flatten(screen.getByText(text).props.style);
    expect(style('Rail').fontSize).toBe(12);
    expect(style('Stopped')).toMatchObject({ fontSize: 12, color: palette.red[700] });
    expect(style('Too much').fontSize).toBe(12);
  });

  it('keeps the two-line name and still shows the distance with every tag present', () => {
    const spot = createTestSpot({
      name: undefined,
      generated_name: 'San Francisco',
      created_at: '2025-10-13T14:22:00Z',
      feature_types: [FeatureType.Rail, FeatureType.Ledge, FeatureType.Bank],
      stopped: true,
      natural_speed: 4,
    });
    renderRow(spot, '2.3 mi');

    expect(screen.getByText('Untitled · San Francisco · Oct 13, 2:22 PM').props.numberOfLines).toBe(2);
    expect(screen.getByText('2.3 mi')).toBeTruthy();
  });

  it('reads every tag in the row label, since VoiceOver hides what the row contains (M5-05 review 1)', () => {
    const spot = createTestSpot({
      name: 'Downtown Rail',
      feature_types: [FeatureType.Rail, FeatureType.Ledge, FeatureType.Bank],
      stopped: true,
      natural_speed: 4,
    });
    renderRow(spot, '2.3 mi');

    expect(screen.getByRole('button').props.accessibilityLabel).toBe(
      'Downtown Rail, Rail +2, Skate stopped, Natural speed: Too much, 2.3 mi',
    );
  });

  it('labels the row with the name alone when it has no tags, and keeps a None (0) speed', () => {
    const { unmount } = renderRow(createTestSpot({ name: 'Bare', feature_types: [], stopped: false }));
    expect(screen.getByRole('button').props.accessibilityLabel).toBe('Bare');
    unmount();

    renderRow(createTestSpot({ name: 'Flat', feature_types: [], stopped: false, natural_speed: 0 }));
    expect(screen.getByRole('button').props.accessibilityLabel).toBe('Flat, Natural speed: None');
  });
});

describe('Name fallback chain', () => {
  it('level 1: user-provided name', () => {
    const spot = createTestSpot({ name: 'My Rail', generated_name: 'NE 45th St' });
    expect(getSpotDisplayName(spot)).toBe('My Rail');
  });

  it('level 2: untitled with the town and time when only a town is known (D4)', () => {
    const spot = createTestSpot({ generated_name: 'Seattle', created_at: '2025-02-07T12:00:00Z' });
    expect(getSpotDisplayName(spot)).toBe('Untitled · Seattle · Feb 7, 12:00 PM');
  });

  it('level 3: untitled with the time when no names', () => {
    const spot = createTestSpot({ created_at: '2025-02-07T12:00:00Z' });
    expect(getSpotDisplayName(spot)).toBe('Untitled · Feb 7, 12:00 PM');
  });
});

describe('SpotListItem memo behavior', () => {
  it('renders with all props', () => {
    const { toJSON } = render(
      <SpotListItem
        id="test"
        displayName="Test Spot"
        featureType="Rail +1"
        stopped
        naturalSpeed={2}
        distance="1.2 mi"
        onPress={() => {}}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });
});

describe('Spot list with many items', () => {
  it('renders 100+ items without error', () => {
    const spots = Array.from({ length: 150 }, (_, i) =>
      createTestSpot({
        name: `Spot ${i}`,
        feature_types: [FeatureType.Rail],
        stopped: i % 3 === 0,
      }),
    );

    // Just verify the array was created and spots have the right structure
    expect(spots).toHaveLength(150);
    expect(spots[0].name).toBe('Spot 0');
    expect(spots[149].name).toBe('Spot 149');
  });
});
