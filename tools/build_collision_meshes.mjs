#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const kMapScale = 2.5;
const kSurfaceTypeBuilding = 1;
const kSourceAssetPack = 'kenney_city_kit_suburban_20';
const kObjDir = path.resolve(
  process.cwd(),
  'assets/environments/cc0/kenney_city_kit_suburban_20/Models/OBJ format'
);
const kDefaultOutputPath = path.resolve(process.cwd(), 'shared/data/collision_meshes_v1.json');

function resolveOutputPath(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--out') {
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      throw new Error('missing value for --out');
    }
    return path.resolve(process.cwd(), next);
  }
  return kDefaultOutputPath;
}

function roundCoord(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function toSimCoord(objX, objY, objZ) {
  // OBJ assets are authored with Y-up and Z-forward. Simulation is Z-up.
  return [
    roundCoord(objX * kMapScale),
    roundCoord(objZ * kMapScale),
    roundCoord(objY * kMapScale),
  ];
}

function parseFaceIndexToken(token, vertexCount) {
  if (!token) {
    return -1;
  }
  const slash = token.indexOf('/');
  const raw = slash >= 0 ? token.slice(0, slash) : token;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed === 0) {
    return -1;
  }
  if (parsed > 0) {
    const index = parsed - 1;
    return index >= 0 && index < vertexCount ? index : -1;
  }
  const index = vertexCount + parsed;
  return index >= 0 && index < vertexCount ? index : -1;
}

function parseObj(objPath) {
  const raw = fs.readFileSync(objPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const vertices = [];
  const triangles = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    if (trimmed.startsWith('v ')) {
      const parts = trimmed.split(/\s+/);
      if (parts.length < 4) {
        continue;
      }
      const x = Number.parseFloat(parts[1]);
      const y = Number.parseFloat(parts[2]);
      const z = Number.parseFloat(parts[3]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        continue;
      }
      vertices.push([x, y, z]);
      continue;
    }

    if (!trimmed.startsWith('f ')) {
      continue;
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length < 4) {
      continue;
    }

    const face = [];
    for (let i = 1; i < parts.length; i += 1) {
      const index = parseFaceIndexToken(parts[i], vertices.length);
      if (index >= 0) {
        face.push(index);
      }
    }
    if (face.length < 3) {
      continue;
    }

    for (let i = 1; i + 1 < face.length; i += 1) {
      const a = vertices[face[0]];
      const b = vertices[face[i]];
      const c = vertices[face[i + 1]];
      if (!a || !b || !c) {
        continue;
      }
      const va = toSimCoord(a[0], a[1], a[2]);
      const vb = toSimCoord(b[0], b[1], b[2]);
      const vc = toSimCoord(c[0], c[1], c[2]);

      const ux = vb[0] - va[0];
      const uy = vb[1] - va[1];
      const uz = vb[2] - va[2];
      const vx = vc[0] - va[0];
      const vy = vc[1] - va[1];
      const vz = vc[2] - va[2];
      const area2 =
        (uy * vz - uz * vy) * (uy * vz - uz * vy) +
        (uz * vx - ux * vz) * (uz * vx - ux * vz) +
        (ux * vy - uy * vx) * (ux * vy - uy * vx);
      if (!Number.isFinite(area2) || area2 <= 1e-12) {
        continue;
      }

      triangles.push([va, vb, vc]);
    }
  }

  if (triangles.length === 0) {
    throw new Error(`no triangles parsed from ${objPath}`);
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const tri of triangles) {
    for (const vertex of tri) {
      minX = Math.min(minX, vertex[0]);
      minY = Math.min(minY, vertex[1]);
      minZ = Math.min(minZ, vertex[2]);
      maxX = Math.max(maxX, vertex[0]);
      maxY = Math.max(maxY, vertex[1]);
      maxZ = Math.max(maxZ, vertex[2]);
    }
  }

  return {
    triangles,
    bounds: {
      min: [roundCoord(minX), roundCoord(minY), roundCoord(minZ)],
      max: [roundCoord(maxX), roundCoord(maxY), roundCoord(maxZ)],
    },
  };
}

function prefabsList() {
  const out = [];
  for (let code = 'a'.charCodeAt(0); code <= 'u'.charCodeAt(0); code += 1) {
    const suffix = String.fromCharCode(code);
    out.push({
      id: `building-type-${suffix}.glb`,
      objFile: `building-type-${suffix}.obj`,
    });
  }
  return out;
}

function main() {
  const outputPath = resolveOutputPath(process.argv.slice(2));
  const prefabs = [];
  for (const entry of prefabsList()) {
    const objPath = path.join(kObjDir, entry.objFile);
    if (!fs.existsSync(objPath)) {
      throw new Error(`missing OBJ: ${objPath}`);
    }
    const parsed = parseObj(objPath);
    prefabs.push({
      id: entry.id,
      triangleCount: parsed.triangles.length,
      surfaceType: kSurfaceTypeBuilding,
      bounds: parsed.bounds,
      triangles: parsed.triangles,
    });
  }

  const output = {
    version: 1,
    sourceAssetPack: kSourceAssetPack,
    mapScale: kMapScale,
    coordConvention: {
      obj: 'x-right,y-up,z-forward',
      sim: 'x-right,y-forward,z-up',
      transform: 'sim=(obj.x*scale,obj.z*scale,obj.y*scale)',
    },
    prefabs,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output)}\n`, 'utf8');

  const totalTriangles = prefabs.reduce((acc, prefab) => acc + prefab.triangleCount, 0);
  console.log(
    `collision mesh registry generated: prefabs=${prefabs.length} triangles=${totalTriangles} path=${path.relative(process.cwd(), outputPath)}`
  );
}

main();
