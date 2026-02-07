import { test, expect } from '@playwright/test';

test('decal projection stays on wall when server hint is biased upward', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as { __afpsMapStats?: { complete?: boolean } }).__afpsMapStats?.complete === true);
  await page.waitForFunction(() => (window as { __afpsWorldSurface?: unknown }).__afpsWorldSurface !== undefined);

  const sample = await page.evaluate(() => {
    type Vec3 = { x: number; y: number; z: number };
    type SurfaceHit = { position: Vec3; normal: Vec3; distance: number } | null;
    const debug = (window as unknown as {
      __afpsWorldSurface?: {
        raycastStaticSurface: (origin: Vec3, dir: Vec3, maxDistance?: number) => SurfaceHit;
        projectTraceWorldHit: (trace: {
          dir: Vec3;
          normal: Vec3;
          hitDistance: number;
          hitPos: Vec3;
          muzzlePos: Vec3 | null;
        }) => { position: Vec3; normal: Vec3 } | null;
        getPlayerPose: () => { posX: number; posY: number; posZ: number };
      };
    }).__afpsWorldSurface;
    if (!debug) {
      return { error: 'missing_debug' as const };
    }

    const pose = debug.getPlayerPose();
    const eye: Vec3 = {
      x: pose.posX,
      y: pose.posZ + 1.6,
      z: pose.posY
    };

    const candidates = 64;
    let picked:
      | {
          dir: Vec3;
          wallHit: { position: Vec3; normal: Vec3; distance: number };
        }
      | null = null;

    for (let i = 0; i < candidates; i += 1) {
      const yaw = (i / candidates) * Math.PI * 2;
      const dirRaw = {
        x: Math.sin(yaw),
        y: -0.08,
        z: -Math.cos(yaw)
      };
      const len = Math.hypot(dirRaw.x, dirRaw.y, dirRaw.z);
      const dir: Vec3 = { x: dirRaw.x / len, y: dirRaw.y / len, z: dirRaw.z / len };
      const wallHit = debug.raycastStaticSurface(eye, dir, 60);
      if (!wallHit) {
        continue;
      }
      if (wallHit.distance < 3 || wallHit.distance > 35) {
        continue;
      }
      if (Math.abs(wallHit.normal.y) > 0.7) {
        continue;
      }
      picked = { dir, wallHit };
      break;
    }

    if (!picked) {
      return { error: 'no_wall_candidate' as const };
    }

    const biasedTrace = {
      dir: picked.dir,
      normal: { x: 0, y: 1, z: 0 },
      hitDistance: picked.wallHit.distance,
      hitPos: {
        x: picked.wallHit.position.x,
        y: picked.wallHit.position.y + 2.4,
        z: picked.wallHit.position.z
      },
      muzzlePos: eye
    };

    const projected = debug.projectTraceWorldHit(biasedTrace);
    return {
      projected,
      wallY: picked.wallHit.position.y,
      roofHintY: biasedTrace.hitPos.y
    };
  });

  expect(sample).not.toHaveProperty('error');
  expect(sample.projected).not.toBeNull();
  const projectedY = sample.projected!.position.y;
  expect(Math.abs(projectedY - sample.wallY)).toBeLessThan(0.45);
  expect(projectedY).toBeLessThan(sample.roofHintY - 1.0);
});

test('authoritative world-hit projection prefers wall normal over roof-biased hint', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as { __afpsMapStats?: { complete?: boolean } }).__afpsMapStats?.complete === true);
  await page.waitForFunction(() => (window as { __afpsWorldSurface?: unknown }).__afpsWorldSurface !== undefined);

  const sample = await page.evaluate(() => {
    type Vec3 = { x: number; y: number; z: number };
    type SurfaceHit = { position: Vec3; normal: Vec3; distance: number } | null;
    const debug = (window as unknown as {
      __afpsWorldSurface?: {
        raycastStaticSurface: (origin: Vec3, dir: Vec3, maxDistance?: number) => SurfaceHit;
        projectTraceWorldHit: (trace: {
          dir: Vec3;
          normal: Vec3;
          hitKind?: number;
          hitDistance: number;
          hitPos: Vec3;
          muzzlePos: Vec3 | null;
        }) => { position: Vec3; normal: Vec3 } | null;
        getPlayerPose: () => { posX: number; posY: number; posZ: number };
      };
    }).__afpsWorldSurface;
    if (!debug) {
      return { error: 'missing_debug' as const };
    }

    const pose = debug.getPlayerPose();
    const eye: Vec3 = {
      x: pose.posX,
      y: pose.posZ + 1.6,
      z: pose.posY
    };

    const candidates = 64;
    let picked:
      | {
          dir: Vec3;
          wallHit: { position: Vec3; normal: Vec3; distance: number };
        }
      | null = null;

    for (let i = 0; i < candidates; i += 1) {
      const yaw = (i / candidates) * Math.PI * 2;
      const dirRaw = {
        x: Math.sin(yaw),
        y: -0.06,
        z: -Math.cos(yaw)
      };
      const len = Math.hypot(dirRaw.x, dirRaw.y, dirRaw.z);
      const dir: Vec3 = { x: dirRaw.x / len, y: dirRaw.y / len, z: dirRaw.z / len };
      const wallHit = debug.raycastStaticSurface(eye, dir, 60);
      if (!wallHit) {
        continue;
      }
      if (wallHit.distance < 2.5 || wallHit.distance > 30) {
        continue;
      }
      if (Math.abs(wallHit.normal.y) > 0.35) {
        continue;
      }
      picked = { dir, wallHit };
      break;
    }

    if (!picked) {
      return { error: 'no_wall_candidate' as const };
    }

    const authoritativeTrace = {
      dir: picked.dir,
      normal: picked.wallHit.normal,
      hitKind: 1,
      hitDistance: picked.wallHit.distance,
      hitPos: {
        x: picked.wallHit.position.x,
        y: picked.wallHit.position.y + 2.2,
        z: picked.wallHit.position.z
      },
      muzzlePos: eye
    };

    const projected = debug.projectTraceWorldHit(authoritativeTrace);
    return {
      projected,
      wallY: picked.wallHit.position.y,
      wallNormalY: picked.wallHit.normal.y,
      roofHintY: authoritativeTrace.hitPos.y
    };
  });

  expect(sample).not.toHaveProperty('error');
  expect(sample.projected).not.toBeNull();
  const projectedY = sample.projected!.position.y;
  expect(Math.abs(projectedY - sample.wallY)).toBeLessThan(0.45);
  expect(projectedY).toBeLessThan(sample.roofHintY - 1.0);
  expect(Math.abs(sample.projected!.normal.y)).toBeLessThan(0.65);
});

test('projectile impact projection avoids roof-biased placement', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as { __afpsMapStats?: { complete?: boolean } }).__afpsMapStats?.complete === true);
  await page.waitForFunction(() => (window as { __afpsWorldSurface?: unknown }).__afpsWorldSurface !== undefined);

  const sample = await page.evaluate(() => {
    type Vec3 = { x: number; y: number; z: number };
    type SurfaceHit = { position: Vec3; normal: Vec3; distance: number } | null;
    const debug = (window as unknown as {
      __afpsWorldSurface?: {
        raycastStaticSurface: (origin: Vec3, dir: Vec3, maxDistance?: number) => SurfaceHit;
        projectImpactWorldHit: (impact: {
          position: Vec3;
          normal: Vec3;
        }) => { position: Vec3; normal: Vec3 } | null;
        getPlayerPose: () => { posX: number; posY: number; posZ: number };
      };
    }).__afpsWorldSurface;
    if (!debug) {
      return { error: 'missing_debug' as const };
    }

    const pose = debug.getPlayerPose();
    const eye: Vec3 = {
      x: pose.posX,
      y: pose.posZ + 1.6,
      z: pose.posY
    };

    const candidates = 96;
    const pitchSamples = [-0.02, -0.06, -0.1, -0.14, -0.2];
    let picked:
      | {
          wallHit: { position: Vec3; normal: Vec3; distance: number };
          score: number;
        }
      | null = null;

    for (const pitch of pitchSamples) {
      for (let i = 0; i < candidates; i += 1) {
        const yaw = (i / candidates) * Math.PI * 2;
        const dirRaw = {
          x: Math.sin(yaw),
          y: pitch,
          z: -Math.cos(yaw)
        };
        const len = Math.hypot(dirRaw.x, dirRaw.y, dirRaw.z);
        const dir: Vec3 = { x: dirRaw.x / len, y: dirRaw.y / len, z: dirRaw.z / len };
        const wallHit = debug.raycastStaticSurface(eye, dir, 60);
        if (!wallHit) {
          continue;
        }
        if (wallHit.distance < 2.5 || wallHit.distance > 30) {
          continue;
        }
        const normalY = Math.abs(wallHit.normal.y);
        if (normalY > 0.55) {
          continue;
        }
        if (wallHit.position.y < 0.8 || wallHit.position.y > eye.y - 0.45) {
          continue;
        }
        const score = normalY + wallHit.distance * 0.001;
        if (!picked || score < picked.score) {
          picked = { wallHit, score };
        }
      }
    }

    if (!picked) {
      return { error: 'no_wall_candidate' as const };
    }

    const projected = debug.projectImpactWorldHit({
      position: {
        x: picked.wallHit.position.x,
        y: picked.wallHit.position.y + 2.2,
        z: picked.wallHit.position.z
      },
      normal: picked.wallHit.normal
    });

    return {
      projected,
      wallY: picked.wallHit.position.y,
      roofHintY: picked.wallHit.position.y + 2.2
    };
  });

  expect(sample).not.toHaveProperty('error');
  expect(sample.projected).not.toBeNull();
  const projectedY = sample.projected!.position.y;
  expect(projectedY).toBeLessThan(sample.roofHintY - 0.6);
});
