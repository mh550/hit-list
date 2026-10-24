import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { createElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastHost } from '@/src/components/ToastHost';
import { clearToast, showToast, TOAST_MS, useToastStore } from '@/src/stores/toast-store';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

beforeEach(() => {
  jest.useFakeTimers();
  clearToast();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('toast store (S7-04)', () => {
  it('showToast sets the line and clears it after 3 s', () => {
    expect(TOAST_MS).toBe(3000);
    showToast('Sent to @ana');
    expect(useToastStore.getState().text).toBe('Sent to @ana');

    jest.advanceTimersByTime(2999);
    expect(useToastStore.getState().text).toBe('Sent to @ana');
    jest.advanceTimersByTime(1);
    expect(useToastStore.getState().text).toBeNull();
  });

  it('showToast announces the line once for VoiceOver, however many hosts draw it', () => {
    // React Native's jest setup already mocks it, so the spy is that mock: clear the earlier tests' calls.
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    announce.mockClear();
    const host = () =>
      createElement(SafeAreaProvider, { initialMetrics: METRICS }, createElement(ToastHost), createElement(ToastHost));
    render(host());
    act(() => showToast('Sent to @ana'));
    expect(screen.getAllByText('Sent to @ana')).toHaveLength(2);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Sent to @ana');
    announce.mockRestore();
  });

  it('clearToast takes the line down at once and its timer with it', () => {
    showToast('Sent to @ana');
    clearToast();
    expect(useToastStore.getState().text).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('a second toast replaces the first and gets its own 3 s', () => {
    showToast('Sent to @ana');
    jest.advanceTimersByTime(2000);
    showToast('Sent to @ben');
    jest.advanceTimersByTime(2000);
    expect(useToastStore.getState().text).toBe('Sent to @ben');
    jest.advanceTimersByTime(1000);
    expect(useToastStore.getState().text).toBeNull();
  });
});

describe('ToastHost (S7-04)', () => {
  const renderHost = () => render(createElement(SafeAreaProvider, { initialMetrics: METRICS }, createElement(ToastHost)));

  it('renders nothing without a toast', () => {
    renderHost();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryAllByText(/./)).toHaveLength(0);
  });

  it('shows the line, announced, until it clears', () => {
    renderHost();
    act(() => showToast('Sent to 3 friends'));
    const line = screen.getByText('Sent to 3 friends');
    expect(line).toBeOnTheScreen();
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    // showToast announces it; a live region as well would read it twice on Android.
    expect(screen.getByRole('alert').props.accessibilityLiveRegion).toBeUndefined();

    act(() => jest.advanceTimersByTime(3000));
    expect(screen.queryByText('Sent to 3 friends')).toBeNull();
  });
});
