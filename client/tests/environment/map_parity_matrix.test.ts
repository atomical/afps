import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildStaticWorldFromPlacements,
  generateProceduralRetroUrbanMap,
  type RetroMapPlacement
} from '../../src/environment/procedural_map';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, '..', '..', '..');
const serverBin = path.join(rootDir, 'server', 'build', 'afps_server');
const staticManifestPath = path.join(
  rootDir,
  'client',
  'public',
  'assets',
  'environments',
  'cc0',
  'kenney_city_kit_suburban_20',
  'map.json'
);
const advancedManifestTool = path.join(rootDir, 'tools', 'generate_advanced_map_manifest.mjs');
const simConfigPath = path.join(rootDir, 'shared', 'sim', 'config.json');
const tickRate = 60;

const FNV_OFFSET = 0x14650fb0739d0383n;
const FNV_PRIME = 0x100000001b3n;
const U64_MASK = 0xffffffffffffffffn;

const llround = (value: number) =>
  value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);

const quantizeCenti = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0n;
  }
  return BigInt(llround(value * 100));
};

const hashByte = (hash: bigint, byteValue: number) => ((hash ^ BigInt(byteValue & 0xff)) * FNV_PRIME) & U64_MASK;

const hashString = (hash: bigint, text: string) => {
  const bytes = new TextEncoder().encode(String(text));
  for (const byte of bytes) {
    hash = hashByte(hash, byte);
  }
  return hash;
};

const hashToHex = (hash: bigint) => hash.toString(16).padStart(16, '0');

const hashColliders = (colliders: Array<{
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  surfaceType: number;
}>) => {
  const rows = colliders
    .map((collider) => ({
      minX: Number(quantizeCenti(collider.minX)),
      maxX: Number(quantizeCenti(collider.maxX)),
      minY: Number(quantizeCenti(collider.minY)),
      maxY: Number(quantizeCenti(collider.maxY)),
      minZ: Number(quantizeCenti(collider.minZ)),
      maxZ: Number(quantizeCenti(collider.maxZ)),
      surfaceType: Number.isFinite(collider.surfaceType) ? Math.trunc(collider.surfaceType) : 0
    }))
    .sort((a, b) => {
      if (a.minX !== b.minX) return a.minX - b.minX;
      if (a.maxX !== b.maxX) return a.maxX - b.maxX;
      if (a.minY !== b.minY) return a.minY - b.minY;
      if (a.maxY !== b.maxY) return a.maxY - b.maxY;
      if (a.minZ !== b.minZ) return a.minZ - b.minZ;
      if (a.maxZ !== b.maxZ) return a.maxZ - b.maxZ;
      return a.surfaceType - b.surfaceType;
    });

  const canonical = rows
    .map(
      (row) =>
        `${row.minX},${row.maxX},${row.minY},${row.maxY},${row.minZ},${row.maxZ},${row.surfaceType};`
    )
    .join('');
  const hash = hashString(FNV_OFFSET, canonical);
  return hashToHex(hash);
};

const colliderRows = (colliders: Array<{
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  surfaceType: number;
}>) =>
  colliders
    .map((collider) => [
      Number(quantizeCenti(collider.minX)),
      Number(quantizeCenti(collider.maxX)),
      Number(quantizeCenti(collider.minY)),
      Number(quantizeCenti(collider.maxY)),
      Number(quantizeCenti(collider.minZ)),
      Number(quantizeCenti(collider.maxZ)),
      Number.isFinite(collider.surfaceType) ? Math.trunc(collider.surfaceType) : 0
    ])
    .sort((a, b) => {
      for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) {
          return a[i]! - b[i]!;
        }
      }
      return 0;
    });

const pickupKindToInt = (kind: string) => {
  if (kind === 'health') {
    return 1;
  }
  if (kind === 'weapon') {
    return 2;
  }
  return 0;
};

const hashPickups = (
  pickups: Array<{
    kind: string;
    position: [number, number, number];
    radius: number;
    weaponSlot: number;
    amount: number;
    respawnSeconds: number;
  }>,
  ticksPerSecond: number
) => {
  const rows = pickups
    .map((pickup) => ({
      kind: pickupKindToInt(pickup.kind),
      posX: Number(quantizeCenti(pickup.position[0] ?? 0)),
      posY: Number(quantizeCenti(pickup.position[1] ?? 0)),
      posZ: Number(quantizeCenti(pickup.position[2] ?? 0)),
      radius: Number(quantizeCenti(pickup.radius ?? 0)),
      weaponSlot: Number.isFinite(pickup.weaponSlot) ? Math.trunc(pickup.weaponSlot) : 0,
      amount: Number.isFinite(pickup.amount) ? Math.trunc(pickup.amount) : 0,
      respawnTicks: Math.max(1, Math.round((pickup.respawnSeconds || 0) * ticksPerSecond))
    }))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind - b.kind;
      if (a.posX !== b.posX) return a.posX - b.posX;
      if (a.posY !== b.posY) return a.posY - b.posY;
      if (a.posZ !== b.posZ) return a.posZ - b.posZ;
      if (a.radius !== b.radius) return a.radius - b.radius;
      if (a.weaponSlot !== b.weaponSlot) return a.weaponSlot - b.weaponSlot;
      if (a.amount !== b.amount) return a.amount - b.amount;
      return a.respawnTicks - b.respawnTicks;
    });

  const canonical = rows
    .map(
      (row) =>
        `${row.kind},${row.posX},${row.posY},${row.posZ},${row.radius},${row.weaponSlot},${row.amount},${row.respawnTicks};`
    )
    .join('');
  const hash = hashString(FNV_OFFSET, canonical);
  return hashToHex(hash);
};

const pickupRows = (
  pickups: Array<{
    kind: string;
    position: [number, number, number];
    radius: number;
    weaponSlot: number;
    amount: number;
    respawnSeconds: number;
  }>,
  ticksPerSecond: number
) =>
  pickups
    .map((pickup) => [
      pickupKindToInt(pickup.kind),
      Number(quantizeCenti(pickup.position[0] ?? 0)),
      Number(quantizeCenti(pickup.position[1] ?? 0)),
      Number(quantizeCenti(pickup.position[2] ?? 0)),
      Number(quantizeCenti(pickup.radius ?? 0)),
      Number.isFinite(pickup.weaponSlot) ? Math.trunc(pickup.weaponSlot) : 0,
      Number.isFinite(pickup.amount) ? Math.trunc(pickup.amount) : 0,
      Math.max(1, Math.round((pickup.respawnSeconds || 0) * ticksPerSecond))
    ])
    .sort((a, b) => {
      for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) {
          return a[i]! - b[i]!;
        }
      }
      return 0;
    });

const hashPlacements = (placements: readonly RetroMapPlacement[]) => {
  let hash = FNV_OFFSET;
  for (const placement of placements) {
    hash = hashString(hash, placement.file ?? '');
    const pos = placement.position ?? [0, 0, 0];
    hash = hashString(hash, String(quantizeCenti(pos[0] ?? 0)));
    hash = hashString(hash, String(quantizeCenti(pos[1] ?? 0)));
    hash = hashString(hash, String(quantizeCenti(pos[2] ?? 0)));
    const rot = placement.rotation ?? [0, 0, 0];
    hash = hashString(hash, String(quantizeCenti(rot[0] ?? 0)));
    hash = hashString(hash, String(quantizeCenti(rot[1] ?? 0)));
    hash = hashString(hash, String(quantizeCenti(rot[2] ?? 0)));
    hash = hashString(hash, String(quantizeCenti(placement.scale ?? 1)));
  }
  return hashToHex(hash);
};

type ServerSignature = {
  seed: number;
  mode: string;
  colliderCount: number;
  pickupCount: number;
  colliderHash: string;
  pickupHash: string;
  colliderRows?: number[][];
  pickupRows?: number[][];
};

const parseServerSignature = (stdout: string): ServerSignature => {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{') && line.endsWith('}'));
  if (lines.length === 0) {
    throw new Error(`server did not output signature json\n${stdout}`);
  }
  return JSON.parse(lines[lines.length - 1]!) as ServerSignature;
};

const serverSignature = (mode: 'legacy' | 'static', seed: number, manifestPath?: string) => {
  const args = ['--dump-map-signature', '--map-mode', mode, '--map-seed', String(seed >>> 0)];
  if (mode === 'static' && manifestPath) {
    args.push('--map-manifest', manifestPath);
  }
  const result = spawnSync(serverBin, args, { cwd: rootDir, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`server signature command failed\n${result.stdout}\n${result.stderr}`);
  }
  return parseServerSignature(result.stdout);
};

const defaultYawChoices = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2] as const;

const parseSeed = (value: unknown, fallback = 0) => {
  if (Number.isFinite(value)) {
    return Math.floor(Number(value)) >>> 0;
  }
  if (typeof value !== 'string') {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.floor(parsed) >>> 0;
};

const createRng = (seed: number) => {
  let state = (seed >>> 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    if (state === 0) {
      state = 1;
    }
    return state / 0xffffffff;
  };
};

const applyRandomYaw = (
  placements: RetroMapPlacement[],
  seed: number,
  yawChoices: readonly number[]
): RetroMapPlacement[] => {
  const rand = createRng(seed);
  return placements.map((placement) => {
    if (!placement.randomYaw || placement.rotation) {
      return placement;
    }
    const idx = Math.floor(rand() * yawChoices.length);
    const yaw = yawChoices[Math.min(Math.max(idx, 0), yawChoices.length - 1)]!;
    return { ...placement, rotation: [0, yaw, 0] };
  });
};

const normalizeManifestPlacements = (value: unknown): RetroMapPlacement[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized: RetroMapPlacement[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const typed = entry as Record<string, unknown>;
    const file = typeof typed.file === 'string' ? typed.file : '';
    const position = typed.position;
    if (!file || !Array.isArray(position) || position.length !== 3) {
      continue;
    }
    const px = Number(position[0]);
    const py = Number(position[1]);
    const pz = Number(position[2]);
    if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) {
      continue;
    }
    const placement: RetroMapPlacement = {
      file,
      position: [px, py, pz]
    };
    if (Array.isArray(typed.rotation) && typed.rotation.length === 3) {
      const rx = Number(typed.rotation[0]);
      const ry = Number(typed.rotation[1]);
      const rz = Number(typed.rotation[2]);
      if (Number.isFinite(rx) && Number.isFinite(ry) && Number.isFinite(rz)) {
        placement.rotation = [rx, ry, rz];
      }
    }
    if (Number.isFinite(typed.scale) && Number(typed.scale) > 0) {
      placement.scale = Number(typed.scale);
    }
    if (typed.randomYaw === true) {
      placement.randomYaw = true;
    }
    normalized.push(placement);
  }
  return normalized;
};

const loadNormalizedManifest = (manifestPath: string) => {
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    seed?: unknown;
    yawChoices?: unknown;
    placements?: unknown;
  };
  const seed = parseSeed(raw.seed, 0);
  const yawChoices = Array.isArray(raw.yawChoices)
    ? raw.yawChoices.filter((value) => Number.isFinite(value)).map((value) => Number(value))
    : [];
  const selectedYaw = yawChoices.length > 0 ? yawChoices : [...defaultYawChoices];
  const placements = applyRandomYaw(normalizeManifestPlacements(raw.placements), seed, selectedYaw);
  return { seed, placements };
};

type ClientWorldSignatureSource = {
  colliders: Array<{
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
    surfaceType: number;
  }>;
  pickupSpawns: Array<{
    kind: string;
    position: [number, number, number];
    radius: number;
    weaponSlot: number;
    amount: number;
    respawnSeconds: number;
  }>;
};

const assertClientMatchesServer = (
  label: string,
  client: ClientWorldSignatureSource,
  server: ServerSignature
) => {
  expect(client.colliders.length, `${label}: collider count`).toBe(server.colliderCount);
  expect(client.pickupSpawns.length, `${label}: pickup count`).toBe(server.pickupCount);
  expect(colliderRows(client.colliders), `${label}: collider rows`).toEqual(server.colliderRows ?? []);
  expect(pickupRows(client.pickupSpawns, tickRate), `${label}: pickup rows`).toEqual(server.pickupRows ?? []);
  expect(hashColliders(client.colliders), `${label}: collider hash`).toBe(server.colliderHash);
  expect(hashPickups(client.pickupSpawns, tickRate), `${label}: pickup hash`).toBe(server.pickupHash);
};

const BUILDING_FILES = Array.from({ length: 21 }, (_value, idx) => {
  const letter = String.fromCharCode('a'.charCodeAt(0) + idx);
  return `building-type-${letter}.glb`;
});

const toGridPosition = (index: number, cols = 10, spacing = 4.8): [number, number, number] => {
  const safeCols = Math.max(1, Math.floor(cols));
  const col = index % safeCols;
  const row = Math.floor(index / safeCols);
  const halfW = ((safeCols - 1) * spacing) / 2;
  return [col * spacing - halfW, 0, row * spacing];
};

const writeManifestFile = (
  dir: string,
  name: string,
  seed: number,
  placements: RetroMapPlacement[],
  yawChoices?: number[]
) => {
  const manifestPath = path.join(dir, `${name}.json`);
  const payload = {
    seed: seed >>> 0,
    yawChoices: yawChoices && yawChoices.length > 0 ? yawChoices : undefined,
    placements
  };
  writeFileSync(manifestPath, JSON.stringify(payload, null, 2));
  return manifestPath;
};

const buildAllProfileRotationPlacements = () => {
  const placements: RetroMapPlacement[] = [];
  let index = 0;
  for (const file of BUILDING_FILES) {
    for (const yaw of defaultYawChoices) {
      placements.push({
        file,
        position: toGridPosition(index, 12, 4.6),
        rotation: [0, yaw, 0]
      });
      index += 1;
    }
  }
  return placements;
};

const buildScaleAndYawOptionPlacements = () => {
  const scales = [0.7, 0.85, 1.0, 1.2, 1.45];
  const explicitYaws = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  const placements: RetroMapPlacement[] = [];
  let index = 0;
  for (let i = 0; i < BUILDING_FILES.length; i += 1) {
    const file = BUILDING_FILES[i]!;
    placements.push({
      file,
      position: toGridPosition(index, 9, 5.1),
      scale: scales[i % scales.length],
      randomYaw: true
    });
    index += 1;
    if (i % 3 === 0) {
      placements.push({
        file,
        position: toGridPosition(index, 9, 5.1),
        scale: scales[(i + 2) % scales.length],
        randomYaw: true,
        rotation: [0, explicitYaws[i % explicitYaws.length]!, 0]
      });
      index += 1;
    }
  }

  // Non-building entries should be ignored by both parsers.
  placements.push({ file: 'tree-large.glb', position: [0, 0, 0], randomYaw: true, scale: 1.1 });
  placements.push({ file: 'roads/road-straight.glb', position: [6, 0, -6], rotation: [0, Math.PI / 2, 0] });
  return placements;
};

const buildSingleVsCompoundPlacements = () => {
  const files = ['building-type-a.glb', 'building-type-b.glb', 'building-type-g.glb'] as const;
  const placements: RetroMapPlacement[] = [];
  let index = 0;
  for (const file of files) {
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      placements.push({
        file,
        position: toGridPosition(index, 6, 6.0),
        rotation: [0, yaw, 0],
        scale: index % 2 === 0 ? 1 : 1.25
      });
      index += 1;
    }
  }
  return placements;
};

const maybeSkip = !existsSync(serverBin);

const arenaHalfSize = (() => {
  const raw = JSON.parse(readFileSync(simConfigPath, 'utf8')) as { arenaHalfSize?: number };
  return Number.isFinite(raw.arenaHalfSize) ? Number(raw.arenaHalfSize) : 50;
})();

describe('map parity matrix', () => {
  it.skipIf(maybeSkip)(
    'keeps legacy procedural mode in strict parity across seed matrix',
    () => {
      const legacySeeds = [0, 1, 1337, 2026];
      for (const seed of legacySeeds) {
        const clientMap = generateProceduralRetroUrbanMap({
          seed,
          generator: 'legacy',
          arenaHalfSize,
          tickRate
        });
        const server = serverSignature('legacy', seed);
        assertClientMatchesServer(`legacy seed=${seed}`, clientMap, server);
        expect(hashPlacements(clientMap.placements)).toMatch(/[0-9a-f]{16}/);
      }
    }
  );

  it.skipIf(maybeSkip)(
    'keeps static manifests in strict parity across rectangle-collider option matrix',
    () => {
      const tempDir = mkdtempSync(path.join(tmpdir(), 'afps-static-parity-matrix-'));
      try {
        const optionYawChoices = [0, Math.PI / 4, Math.PI / 2, Math.PI, (Math.PI * 3) / 2];
        const allProfilesManifest = writeManifestFile(
          tempDir,
          'all-profiles-rotations',
          41,
          buildAllProfileRotationPlacements()
        );
        const scaleYawManifest = writeManifestFile(
          tempDir,
          'scaled-random-yaw',
          2026,
          buildScaleAndYawOptionPlacements(),
          optionYawChoices
        );
        const singleVsCompoundManifest = writeManifestFile(
          tempDir,
          'single-vs-compound',
          99,
          buildSingleVsCompoundPlacements()
        );

        const cases: Array<{ name: string; path: string; serverSeeds: number[] }> = [
          { name: 'builtin', path: staticManifestPath, serverSeeds: [0, 1337] },
          { name: 'all-profiles-rotations', path: allProfilesManifest, serverSeeds: [0, 11] },
          { name: 'scaled-random-yaw', path: scaleYawManifest, serverSeeds: [0, 77] },
          { name: 'single-vs-compound', path: singleVsCompoundManifest, serverSeeds: [0, 1234] }
        ];

        for (const testCase of cases) {
          const normalized = loadNormalizedManifest(testCase.path);
          const clientStatic = buildStaticWorldFromPlacements(normalized.placements, tickRate);
          expect(clientStatic.colliders.length, `${testCase.name}: has colliders`).toBeGreaterThan(0);
          expect(clientStatic.pickupSpawns.length, `${testCase.name}: has pickups`).toBeGreaterThan(0);
          expect(hashPlacements(normalized.placements)).toMatch(/[0-9a-f]{16}/);
          for (const seed of testCase.serverSeeds) {
            const server = serverSignature('static', seed, testCase.path);
            assertClientMatchesServer(`${testCase.name} serverSeed=${seed}`, clientStatic, server);
          }
        }
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  );

  it.skipIf(maybeSkip)(
    'keeps advanced-generator output in strict parity across seed matrix',
    () => {
      const tempDir = mkdtempSync(path.join(tmpdir(), 'afps-advanced-manifest-'));
      try {
        const advancedSeeds = [1337, 2026];
        for (const advancedSeed of advancedSeeds) {
          const generatedManifest = path.join(tempDir, `advanced_map_${advancedSeed}.json`);
          const generateResult = spawnSync(
            'node',
            [advancedManifestTool, '--seed', String(advancedSeed), '--out', generatedManifest],
            {
              cwd: rootDir,
              encoding: 'utf8'
            }
          );
          expect(generateResult.status, `advanced seed ${advancedSeed}`).toBe(0);
          const normalized = loadNormalizedManifest(generatedManifest);
          const clientStatic = buildStaticWorldFromPlacements(normalized.placements, tickRate);
          const server = serverSignature('static', advancedSeed, generatedManifest);
          assertClientMatchesServer(`advanced seed=${advancedSeed}`, clientStatic, server);
          expect(hashPlacements(normalized.placements)).toMatch(/[0-9a-f]{16}/);
        }
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  );
});
