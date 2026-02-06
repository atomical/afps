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
