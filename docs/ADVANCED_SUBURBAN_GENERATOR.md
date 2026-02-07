# Advanced Suburban Generator

## Overview

`AdvancedSuburbanGenerator` is a new procedural map pipeline for dense, coherent suburban layouts using Kenney City Kit Suburban assets. It is additive and keeps the legacy generator intact.

- Legacy generator: `generator = "legacy"`
- Advanced generator: `generator = "advanced"`

Implementation entrypoints:

- `client/src/environment/advanced_suburban_generator.ts`
- `client/src/environment/procedural_map.ts`
- `client/src/environment/retro_urban_map.ts`

## Enable It

Environment flag:

```bash
VITE_PROCEDURAL_MAP=true VITE_PROCEDURAL_GENERATOR=advanced npm run dev
```

`run_dev.sh` shortcuts:

```bash
./tools/run_dev.sh --advanced-generator --map-seed 1337
```

`run_dev.sh --advanced-generator` is parity-safe: it prebuilds an advanced manifest via
`tools/generate_advanced_map_manifest.mjs`, then runs both client and server in static map mode
against that same manifest.

You can verify map parity across modes with:

```bash
node tools/check_map_parity.mjs
```

Programmatic selection:

```ts
generateProceduralRetroUrbanMap({ seed: 1337, generator: "advanced" });
```

## Pipeline

`generateAdvancedSuburbanMap(seed, config, assetRegistry)` runs this deterministic pipeline:

1. `RoadNetworkBuilder`
2. `RoadRasterizer`
3. `RoadPrefabResolver`
4. `BlockExtractor`
5. `LotPlanner`
6. `BuildingPlacer`
7. `Decorator`
8. `ValidatorScorer`
9. retry loop (`maxGenerationAttempts`, `minimumScoreToAccept`)

Returned result includes:

- road graph (`nodes`, `edges`, hierarchy, layer)
- road/land layers
- roads/buildings/prop placements
- validation + scoring metrics
- debug payload (JSON-safe)

## Config

Main config type: `MapGenConfig` in `client/src/environment/advanced_suburban_generator.ts`.

Important fields:

- Size: `width`, `height`
- Density: `targetRoadCoverage`, `targetBuildingCoverage`, `parkProbability`, `backyardFillStyle`
- Hierarchy: `enableHighwayOverpass`, `highwayCount`, `arterialSpacingRange`, `collectorSpacingRange`, `localStreetMaxLength`, `intersectionMinSpacing`, `culdesacRate`
- Blocks/Lots: `blockAreaMin`, `blockAreaMax`, `blockAspectRatioRange`, `blockSubdivisionThresholdArea`, `lotFrontageRange`, `lotDepthRange`, `cornerLotChance`
- Variety: `minUniqueHousePrefabsUsed`, `avoidSamePrefabAdjacent`, `maxRepeatsInRadius`
- Retry: `maxGenerationAttempts`, `minimumScoreToAccept`
- Seed: `seed`

Defaults live in `DEFAULT_ADVANCED_SUBURBAN_CONFIG`.

## Asset Metadata

`AssetRegistry` defines metadata for:

- Road pieces: type, adjacency compatibility, hierarchy compatibility, layer
- Building assets: footprint and allowed rotations
- Props: tags and placement constraints (`yard`, `park`, `boundary`, `roadside`)

Default registry: `DEFAULT_ASSET_REGISTRY`.

## Validation and Scoring

Hard checks:

- road connectivity (single component)
- no orphan road tiles (no degree-0 road cells)
- no overlaps (roads/buildings/buildings)
- no unassigned land cells

Score components:

- connectivity
- intersection spacing
- block quality
- density
- building variety
- weirdness penalty (stubs/slivers)

## Debugging and Replay

Replay line is printed when advanced mode is active:

```text
[afps] advanced suburban map seed=1234 attempt=3 score=0.81
```

Optional debug flags:

- `VITE_DEBUG_ROAD_GRAPH=true`: draws road graph line overlays
- `VITE_DEBUG_MAP_JSON=true`: prints debug JSON payload to the browser console

Runtime globals:

- `window.__afpsMapStats`
- `window.__afpsMapDebug`

## Tests

Generator tests:

- `client/tests/environment/advanced_suburban_generator.test.ts`
- `client/tests/environment/procedural_map.test.ts` (advanced mode integration)

They cover determinism, connectivity, no overlaps, full land assignment, prefab variety, and performance sanity for large maps.
