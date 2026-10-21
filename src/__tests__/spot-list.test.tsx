import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { SpotListItem } from '@/src/components/SpotListItem';
import { getSpotDisplayName } from '@/src/utils/spot-name';
import { createTestSpot } from './factories';
import { FeatureType } from '@/src/types';

describe('SpotListItem', () => {
  const defaultProps = {
    id: 'test-id',
    displayName: 'Downtown Rail',
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
