import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { DBInitializer } from '@/src/components/DBInitializer';

const mockUseDbInit = jest.fn();
jest.mock('@/src/hooks/use-db-init', () => ({
  useDbInit: () => mockUseDbInit(),
}));

describe('DBInitializer', () => {
  it('shows the app once the database is ready', () => {
    mockUseDbInit.mockReturnValue({ isReady: true, upgradeFailed: false });
    render(
      <DBInitializer>
        <Text>the app</Text>
      </DBInitializer>,
    );
    expect(screen.getByText('the app')).toBeTruthy();
  });

  it('blocks the app with a retry hint when the upgrade failed (D28)', () => {
    // Writes against an old schema fail; a Quick Add would copy photos and then lose the spot.
    mockUseDbInit.mockReturnValue({ isReady: true, upgradeFailed: true });
    render(
      <DBInitializer>
        <Text>the app</Text>
      </DBInitializer>,
    );
    expect(screen.queryByText('the app')).toBeNull();
    expect(screen.getByText("Couldn't upgrade your spots")).toBeTruthy();
    expect(screen.getByText(/Nothing was lost/)).toBeTruthy();
  });
});
