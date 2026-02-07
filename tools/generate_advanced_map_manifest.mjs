import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const clientDir = join(rootDir, 'client');
const defaultOutPath = join(
  rootDir,
  'client',
  'public',
  'assets',
  'environments',
  'generated',
  'advanced_map.json'
);

const parseInteger = (raw, fallback) => {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.floor(parsed) >>> 0;
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  let seed = 0;
  let outPath = defaultOutPath;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--seed') {
      i += 1;
      if (i >= args.length) {
        throw new Error('--seed requires a value');
      }
      seed = parseInteger(args[i], seed);
      continue;
    }
    if (arg === '--out') {
      i += 1;
      if (i >= args.length) {
        throw new Error('--out requires a value');
      }
      outPath = resolve(args[i]);
      continue;
    }
    if (arg === '-h' || arg === '--help') {
      process.stdout.write(
        'Usage: node tools/generate_advanced_map_manifest.mjs [--seed <n>] [--out <path>]\n'
      );
      process.exit(0);
    }
    throw new Error(`unknown option: ${arg}`);
  }
  return { seed, outPath };
};

const compileGenerator = (outDir) => {
  const args = [
    'tsc',
    '--pretty',
    'false',
    '--module',
    'ESNext',
    '--target',
    'ES2020',
    '--moduleResolution',
    'bundler',
    '--skipLibCheck',
    '--lib',
    'ES2020',
    '--types',
    'node',
    '--outDir',
    outDir,
    'src/environment/advanced_suburban_generator.ts'
  ];
  const result = spawnSync('npx', args, {
    cwd: clientDir,
    encoding: 'utf8'
  });
  if (result.status === 0) {
    return;
  }
  const details = [result.stdout ?? '', result.stderr ?? ''].filter((value) => value.trim().length > 0);
  throw new Error(`failed to compile advanced generator\n${details.join('\n')}`);
};

const normalizePlacement = (placement) => {
  const normalized = {
    file: placement.file,
    position: [placement.position[0], placement.position[1], placement.position[2]]
  };
  if (Array.isArray(placement.rotation) && placement.rotation.length === 3) {
    normalized.rotation = [placement.rotation[0], placement.rotation[1], placement.rotation[2]];
  }
  if (Number.isFinite(placement.scale) && placement.scale > 0 && placement.scale !== 1) {
    normalized.scale = placement.scale;
  }
  if (placement.kind === 'road' || placement.kind === 'building' || placement.kind === 'prop') {
    normalized.kind = placement.kind;
  }
  if (Number.isFinite(placement.roadMask)) {
    normalized.roadMask = placement.roadMask;
  }
  if (Number.isFinite(placement.cellX)) {
    normalized.cellX = placement.cellX;
  }
  if (Number.isFinite(placement.cellY)) {
    normalized.cellY = placement.cellY;
  }
  if (
    placement.doorSide === 'north' ||
    placement.doorSide === 'east' ||
    placement.doorSide === 'south' ||
    placement.doorSide === 'west'
  ) {
    normalized.doorSide = placement.doorSide;
  }
  return normalized;
};

const { seed, outPath } = parseArgs();
const compileOutDir = mkdtempSync(join(tmpdir(), 'afps-advanced-generator-'));

try {
  compileGenerator(compileOutDir);
  const modulePath = pathToFileURL(
    join(compileOutDir, 'client', 'src', 'environment', 'advanced_suburban_generator.js')
  ).href;
  const module = await import(modulePath);
  const config = module.mergeAdvancedSuburbanConfig(module.DEFAULT_ADVANCED_SUBURBAN_CONFIG, { seed });
  const generated = module.generateAdvancedSuburbanMap(seed, config);

  const manifest = {
    version: 2,
    generator: 'advanced',
    seed: generated.seed >>> 0,
    width: generated.width,
    height: generated.height,
    attempt: generated.stats.attempt,
    score: generated.stats.score,
    placements: generated.placements.map(normalizePlacement)
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  process.stdout.write(
    `[advanced-map] wrote ${outPath} seed=${manifest.seed} attempt=${manifest.attempt} score=${manifest.score.toFixed(2)} placements=${manifest.placements.length}\n`
  );
} finally {
  rmSync(compileOutDir, { recursive: true, force: true });
}
