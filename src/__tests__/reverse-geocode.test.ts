import { reverseGeocodeAsync } from 'expo-location';
import { geocodeTown, backfillTowns } from '@/src/utils/reverse-geocode';
import { createTestSpot } from './factories';

const seattle = { latitude: 47.6, longitude: -122.3 };

describe('geocodeTown', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    [[{ city: 'Seattle', subregion: 'King County', region: 'WA' }], 'Seattle'],
    [[{ city: null, subregion: 'King County', region: 'WA' }], 'King County'],
    [[{ city: null, subregion: null, region: 'WA' }], 'WA'],
    [[], undefined],
  ])('picks city → subregion → region (%#)', async (result, town) => {
    jest.mocked(reverseGeocodeAsync).mockResolvedValueOnce(result as never);

    await expect(geocodeTown(seattle)).resolves.toBe(town);
  });

  it('swallows geocoder errors', async () => {
    jest.mocked(reverseGeocodeAsync).mockRejectedValueOnce(new Error('rate limited'));

    await expect(geocodeTown(seattle)).resolves.toBeUndefined();
  });

  it('skips the unknown location (0, 0)', async () => {
    await expect(geocodeTown({ latitude: 0, longitude: 0 })).resolves.toBeUndefined();

    expect(reverseGeocodeAsync).not.toHaveBeenCalled();
  });
});

describe('backfillTowns', () => {
  beforeEach(() => jest.clearAllMocks());

  it('names at most 10 untitled, town-less spots, one request at a time', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    jest.mocked(reverseGeocodeAsync).mockImplementation(async () => {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      await Promise.resolve();
      inFlight--;
      return [{ city: 'Seattle' }] as never;
    });
    const spots = [
      ...Array.from({ length: 12 }, () => createTestSpot()),
      createTestSpot({ name: 'named' }),
      createTestSpot({ generated_name: 'Tacoma' }),
    ];
    const update = jest.fn(async () => {});

    await backfillTowns(spots, update);

    expect(reverseGeocodeAsync).toHaveBeenCalledTimes(10);
    expect(maxInFlight).toBe(1);
    expect(update).toHaveBeenCalledTimes(10);
    expect(update).toHaveBeenCalledWith(spots[0].id, { generated_name: 'Seattle' });
  });

  it('skips spots with no location and spends no budget on them', async () => {
    jest.mocked(reverseGeocodeAsync).mockResolvedValue([{ city: 'Seattle' }] as never);
    const lost = createTestSpot({ location: { latitude: 0, longitude: 0 } });
    const update = jest.fn(async () => {});

    await backfillTowns([lost, createTestSpot()], update, 1);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalledWith(lost.id, expect.anything());
  });

  it('leaves a spot untouched when no town comes back', async () => {
    jest.mocked(reverseGeocodeAsync).mockResolvedValue([]);
    const update = jest.fn(async () => {});

    await backfillTowns([createTestSpot()], update);

    expect(update).not.toHaveBeenCalled();
  });
});
