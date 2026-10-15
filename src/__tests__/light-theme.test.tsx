import appConfig from '../../app.json';

describe('light-only appearance', () => {
  it('app.json forces light mode', () => {
    // Screens set no backgrounds and use light-theme text colours, so the OS dark mode makes headings near-invisible.
    expect(appConfig.expo.userInterfaceStyle).toBe('light');
  });
});
