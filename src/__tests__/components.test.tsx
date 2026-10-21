import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { Button } from '@/src/components/Button';
import { SegmentedControl } from '@/src/components/SegmentedControl';
import { Chip } from '@/src/components/Chip';
import { EmptyState } from '@/src/components/EmptyState';
import { Card, CardContent, CardTitle } from '@/src/components/Card';
import { FormInput } from '@/src/components/FormField';

describe('Button', () => {
  it('renders title', () => {
    render(<Button title="Save" onPress={() => {}} />);
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    render(<Button title="Save" onPress={onPress} />);
    fireEvent.press(screen.getByText('Save'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    render(<Button title="Save" onPress={onPress} disabled />);
    fireEvent.press(screen.getByText('Save'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('SegmentedControl', () => {
  const segments = [
    { label: 'Map', value: 'map' },
    { label: 'List', value: 'list' },
  ];

  it('renders all segments', () => {
    render(
      <SegmentedControl segments={segments} selectedValue="map" onValueChange={() => {}} />,
    );
    expect(screen.getByText('Map')).toBeTruthy();
    expect(screen.getByText('List')).toBeTruthy();
  });

  it('calls onValueChange when tapped', () => {
    const onValueChange = jest.fn();
    render(
      <SegmentedControl segments={segments} selectedValue="map" onValueChange={onValueChange} />,
    );
    fireEvent.press(screen.getByText('List'));
    expect(onValueChange).toHaveBeenCalledWith('list');
  });
});

describe('Chip', () => {
  it('renders label', () => {
    render(<Chip label="Rail" />);
    expect(screen.getByText('Rail')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    render(<Chip label="Rail" onPress={onPress} />);
    fireEvent.press(screen.getByText('Rail'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('EmptyState', () => {
  it('renders title and message', () => {
    render(<EmptyState title="No Spots" message="Add your first spot" />);
    expect(screen.getByText('No Spots')).toBeTruthy();
    expect(screen.getByText('Add your first spot')).toBeTruthy();
  });

  it('renders action button when provided', () => {
    render(
      <EmptyState
        title="No Spots"
        message="Add your first spot"
        actionLabel="Add Spot"
        onAction={() => {}}
      />,
    );
    expect(screen.getByText('Add Spot')).toBeTruthy();
  });
});

describe('Card', () => {
  it('renders children', () => {
    render(
      <Card>
        <CardContent>
          <CardTitle>Test Card</CardTitle>
        </CardContent>
      </Card>,
    );
    expect(screen.getByText('Test Card')).toBeTruthy();
  });
});

describe('FormInput', () => {
  it('renders label and input', () => {
    render(<FormInput label="Name" placeholder="Enter name" />);
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByPlaceholderText('Enter name')).toBeTruthy();
  });

  it('renders error message', () => {
    render(<FormInput label="Name" error="Required" />);
    expect(screen.getByText('Required')).toBeTruthy();
  });
});
