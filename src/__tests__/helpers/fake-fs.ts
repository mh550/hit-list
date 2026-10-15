import * as fileSystem from 'expo-file-system';

/**
 * Test hooks of the in-memory expo-file-system fake (__mocks__/expo-file-system.ts). Reached
 * through the module path so it is the same instance the code under test uses (jest.requireMock
 * would return a second, unshared one).
 */
export const fakeFs = fileSystem as unknown as typeof import('../../../__mocks__/expo-file-system');
