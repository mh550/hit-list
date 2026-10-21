import { reverseGeocodeAsync } from 'expo-location';
import { geocodeTown, backfillTowns } from '@/src/utils/reverse-geocode';
import { createTestSpot } from './factories';
import { NO_LOCATION } from '@/src/utils/geo';

const seattle = { latitude: 47.6, longitude: -122.3 };

beforeEach(() => jest.clearAllMocks());

describe('geocodeTown', () => {
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

  it('queues lookups from every caller, so Apple never sees a burst', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    jest.mocked(reverseGeocodeAsync).mockImplementation(async () => {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return [{ city: 'Seattle' }] as never;
    });

    const towns = await Promise.all([geocodeTown(seattle), geocodeTown(seattle), geocodeTown(seattle)]);

    expect(towns).toEqual(['Seattle', 'Seattle', 'Seattle']);
    expect(maxInFlight).toBe(1);
  });

  it('keeps the queue moving after a failed lookup', async () => {
    jest.mocked(reverseGeocodeAsync).mockRejectedValueOnce(new Error('rate limited')).mockResolvedValueOnce([{ city: 'Tacoma' }] as never);

    const towns = await Promise.all([geocodeTown(seattle), geocodeTown(seattle)]);

    expect(towns).toEqual([undefined, 'Tacoma']);
  });

  it('skips the unknown location (0, 0)', async () => {
    await expect(geocodeTown(NO_LOCATION)).resolves.toBeUndefined();

    expect(reverseGeocodeAsync).not.toHaveBeenCalled();
  });
});

describe('backfillTowns', () => {
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

  it('keeps naming the other spots when one update fails', async () => {
    // updateSpot rejects on a failed write (and has logged it); that spot is retried next launch.
    jest.mocked(reverseGeocodeAsync).mockResolvedValue([{ city: 'Seattle' }] as never);
    const update = jest.fn(async () => {});
    update.mockRejectedValueOnce(new Error('disk I/O error'));

    await expect(backfillTowns([createTestSpot(), createTestSpot()], update)).resolves.toBeUndefined();

    expect(update).toHaveBeenCalledTimes(2);
  });

  it('skips spots with no location and spends no budget on them', async () => {
    jest.mocked(reverseGeocodeAsync).mockResolvedValue([{ city: 'Seattle' }] as never);
    const lost = createTestSpot({ location: NO_LOCATION });
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
