# Weapons System

This project uses a shared, data-driven weapon configuration that is loaded by both the server and the client from `shared/weapons/config.json`. The server is authoritative for firing cadence, ammo, and casing replication, while the client handles visuals and audio playback.

## Adding or Updating a Weapon

1. **Add a new entry** to `shared/weapons/config.json`:
   - Required fields: `id`, `displayName`, `maxAmmoInMag`, `cooldownSeconds`, `fireMode`, `ejectShellsWhileFiring`, `reloadSeconds`, `sfxProfile`, `casingEject`, `sounds`.
2. **Add the weapon to `slots`** if it should be selectable by players.
3. **Client viewmodel/worldmodel mapping**:
   - Update `client/src/environment/weapon_viewmodel.ts` and `client/src/players/remote_avatars.ts` to point the new `id` to a weapon model.
   - The default project models come from Kenney Blaster Kit under `client/public/assets/weapons/cc0/kenney_blaster_kit/`.
   - Remote avatars attach the worldmodel to the character `handBone` (from the character catalog) and apply `weaponOffset` as a local delta.
4. **SFX profile**:
   - Pick an existing `sfxProfile` from `client/src/weapons/sfx.ts` or add a new profile there.
5. **Run tests** to ensure validation passes.

## Casing Replication

When a shot is accepted by the server:
- The server decrements ammo, applies gameplay effects (hitscan or projectile), and emits a `WeaponFiredEvent`.
- That event includes a deterministic casing spawn payload (position, rotation, velocity, angular velocity, and seed).
- Clients spawn a local casing instance from a pool using `client/src/weapons/casing_pool.ts` so every player sees the same ejection timing.

## Corner Handling (Hitscan)

Hitscan world blocking is resolved on the server using a dual-trace path:

1. Eye-origin intent trace picks the intended world distance.
2. Muzzle-origin obstruction trace validates whether the shot is truly blocked.
3. A near-muzzle grace retrace can ignore the first immediate collider hit once to reduce false corner self-blocking.

Details and constants: `docs/SHOOTING_AROUND_CORNERS.md`.

### Casing Model Asset

The casing pool uses Kenney Blaster Kit’s `bullet-foam.glb` model.

To keep the runtime client assets minimal, the file is copied from the source asset archive into `client/public/` by `tools/sync_weapon_assets.sh` (run automatically by `client`’s `predev`/`pretest`/`prebuild` npm scripts).

## Procedural SFX Generation

Audio is generated at runtime and cached:
- `client/src/weapons/sfx.ts` synthesizes fire, dry-fire, reload, equip, and casing impact sounds using deterministic parameters per weapon profile.
- `generateWeaponSfx()` registers buffers with the audio manager before gameplay begins.
- Fire/reload sounds are triggered by server-authoritative events (`WeaponFiredEvent`, `WeaponReloadEvent`) so nearby players hear them consistently.

## Debug Utilities

In dev builds you can inspect weapons in the console:

```
window.afpsDebug.listWeapons()
window.afpsDebug.printWeapons()
```

These helpers list the active weapon definitions and key tuning values.
