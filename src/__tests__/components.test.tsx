import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { Button } from '@/src/components/Button';
import { SegmentedControl } from '@/src/components/SegmentedControl';
import { Chip } from '@/src/components/Chip';
import { EmptyState } from '@/src/components/EmptyState';
import { Card, CardContent, CardTitle } from '@/src/components/Card';
import { FormInput } from '@/src/components/FormField';
import { SpotListItem } from '@/src/components/SpotListItem';
import { HeaderTextButton } from '@/src/components/HeaderTextButton';

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

  it('gives every segment a 44-pt touch target (M5-05 review 4)', () => {
    render(
      <SegmentedControl segments={segments} selectedValue="map" onValueChange={() => {}} />,
    );
    for (const tab of screen.getAllByRole('tab')) {
      expect(StyleSheet.flatten(tab.props.style).minHeight).toBe(44);
    }
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

describe('SpotListItem', () => {
  const base = { id: 's1', displayName: 'Pier rail', stopped: false, onPress: () => {} };

  it('is a plain button with no checkbox outside select mode', () => {
    render(<SpotListItem {...base} />);
    const row = screen.getByLabelText('Pier rail');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityState?.checked).toBeUndefined();
    expect(screen.queryByTestId('spot-check-s1')).toBeNull();
  });

  it('is an unchecked checkbox when selectable and not selected', () => {
    render(<SpotListItem {...base} selectable selected={false} />);
    const row = screen.getByLabelText('Pier rail');
    expect(row.props.accessibilityRole).toBe('checkbox');
    expect(row.props.accessibilityState).toEqual({ checked: false });
    expect(screen.getByTestId('spot-check-s1')).toBeTruthy();
  });

  it('is a checked checkbox when selectable and selected, and a tap still reports the id', () => {
    const onPress = jest.fn();
    render(<SpotListItem {...base} onPress={onPress} selectable selected />);
    const row = screen.getByLabelText('Pier rail');
    expect(row.props.accessibilityRole).toBe('checkbox');
    expect(row.props.accessibilityState).toEqual({ checked: true });
    fireEvent.press(row);
    expect(onPress).toHaveBeenCalledWith('s1');
  });
});

describe('HeaderTextButton', () => {
  it('is a button with its label and text, and calls onPress', () => {
    const onPress = jest.fn();
    render(<HeaderTextButton accessibilityLabel="Rename list" onPress={onPress}>
        Rename
      </HeaderTextButton>);
    const button = screen.getByRole('button', { name: 'Rename list' });
    expect(screen.getByText('Rename')).toBeTruthy();
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('uses the text as the label when none is given, and bolds the text when emphasized', () => {
    render(<HeaderTextButton emphasized onPress={jest.fn()}>
        Filter (2)
      </HeaderTextButton>);
    screen.getByRole('button', { name: 'Filter (2)' });
    expect(StyleSheet.flatten(screen.getByText('Filter (2)').props.style).fontWeight).toBe('700');
  });

  it('keeps the regular weight by default', () => {
    render(<HeaderTextButton onPress={jest.fn()}>Select</HeaderTextButton>);
    expect(StyleSheet.flatten(screen.getByText('Select').props.style).fontWeight).toBe('500');
  });
});
