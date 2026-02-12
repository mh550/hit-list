import type { Spot, SpotFilters, GearItem, BuildItem } from '@/src/types';
import { SpotStatus } from '@/src/types';
import { getSpotDisplayName } from './spot-name';

/**
 * Two-stage filter implementing the spec's gear + build filtering.
 *
 * Stage 1: Gear Filter ("Gear I Have")
 * - For each setup option, check items where category: "gear"
 * - Spot matches if user's gear contains all gear items in any one setup option
 * - A setup with no gear items matches all users
 *
 * Stage 2: Build Filter ("Exclude Build Requirements")
 * - For each matching setup option, check items where category: "build"
 * - Spot passes if at least one matching option has no excluded build items
 */
export function filterSpots(spots: Spot[], filters: SpotFilters): Spot[] {
  return spots.filter((spot) => {
    // Status filter
    if (!filters.show_drafts && spot.status === SpotStatus.Draft) return false;

    // Search
    if (filters.search_query) {
      const query = filters.search_query.toLowerCase();
      const name = getSpotDisplayName(spot).toLowerCase();
      if (!name.includes(query)) return false;
    }

    // Type filter (OR semantics)
    if (filters.types.length > 0) {
      if (!spot.feature.type || !filters.types.includes(spot.feature.type)) return false;
    }

    // Natural speed range
    if (spot.in_run.natural_speed != null) {
      if (filters.natural_speed_min != null && spot.in_run.natural_speed < filters.natural_speed_min) return false;
      if (filters.natural_speed_max != null && spot.in_run.natural_speed > filters.natural_speed_max) return false;
    }

    // Bustability range
    if (spot.metadata.bustability != null) {
      if (filters.bustability_min != null && spot.metadata.bustability < filters.bustability_min) return false;
      if (filters.bustability_max != null && spot.metadata.bustability > filters.bustability_max) return false;
    }

    // Intensity range
    if (spot.metadata.intensity != null) {
      if (filters.intensity_min != null && spot.metadata.intensity < filters.intensity_min) return false;
      if (filters.intensity_max != null && spot.metadata.intensity > filters.intensity_max) return false;
    }

    // Two-stage gear + build filter
    if (filters.gear.length > 0 || filters.exclude_build.length > 0) {
      return matchesSetupOptions(spot, filters.gear, filters.exclude_build);
    }

    return true;
  });
}

function matchesSetupOptions(
  spot: Spot,
  userGear: GearItem[],
  excludeBuild: BuildItem[],
): boolean {
  const setupOptions = spot.in_run.setup_options;

  // No setup options = hittable with no equipment, matches everything
  if (setupOptions.length === 0) return true;

  for (const option of setupOptions) {
    // Stage 1: Gear superset check
    if (userGear.length > 0) {
      const gearRequired = option.requires
        .filter((r) => r.category === 'gear')
        .map((r) => r.item as GearItem);

      // Empty gear requirements in this option matches all users
      if (gearRequired.length > 0) {
        const hasAll = gearRequired.every((g) => userGear.includes(g));
        if (!hasAll) continue; // This option doesn't match, try next
      }
    }

    // Stage 2: Build exclusion check
    if (excludeBuild.length > 0) {
      const buildRequired = option.requires
        .filter((r) => r.category === 'build')
        .map((r) => r.item as BuildItem);

      const hasExcluded = buildRequired.some((b) => excludeBuild.includes(b));
      if (hasExcluded) continue; // This option has excluded build, try next
    }

    // This option passed both stages
    return true;
  }

  // No option matched
  return false;
}
