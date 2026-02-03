You are Codex. You are working inside an existing multiplayer FPS codebase (the repo you can see). Implement a “Pre-Join” flow where players enter a nickname and select a character (from Kenney Animated Characters 1), and ensure all clients see opponents using the chosen character with the weapon correctly attached in the character’s hand.

ASSET PACK (SOURCE OF CHARACTERS)
- Use Kenney “Animated Characters 1” (CC0): https://kenney.nl/assets/animated-characters-1
- The pack is a rigged/animated 3D character with multiple skins and a small set of animations. Common pack structure: separate folders for Model(s), Animations, Skins/Textures (often FBX + PNG). Typical filenames referenced by Kenney docs include `characterMedium.fbx`, `idle.fbx`, and skin textures like `casualMaleA.png` (exact skin names may differ by pack version).
- You MUST auto-discover available skins/character options from the repo’s asset folder (do not hardcode names that might not exist). If the repo does not contain the assets yet, implement the system so it works with placeholder assets and document the expected folder structure + required files.

HIGH-LEVEL GOALS
1) Pre-Join UI
   - Before joining/spawning into a match, player must:
     a) Enter a Nickname
     b) Pick a Character (skin/variant) from the Kenney pack via a character selector
   - The Join/Continue button is disabled until nickname is valid and a character is selected.
   - Selections persist locally (so next time the UI is pre-filled).

2) Networking & Replication
   - On join (or handshake), send nickname + character selection to the server/host.
   - Server validates and stores these values per player, then replicates them to all clients.
   - When any client renders a remote opponent, it MUST use that opponent’s chosen character/skin.

3) Character Animation (“rig motion”)
   - Remote character avatars must play correct locomotion animations (idle/run) based on movement.
   - If jump state exists (or can be inferred), use jump pose/clip.
   - Use the animations included with the pack if present; otherwise, gracefully fall back (e.g., idle only).
   - Ensure each remote avatar has its own independent animation state/mixer/animator instance.

4) Weapon Attachment (weapon in hand)
   - All clients must see opponents holding the weapon in-hand (third-person representation).
   - Attach the weapon model/prefab to the character’s RIGHT hand bone/socket reliably.
   - Must work for every character/skin option (same skeleton; different skin textures).
   - Do not “float” the weapon: it should move with the hand bone during animations.
   - Provide per-character/per-skeleton offsets (local position/rotation/scale) so weapon aligns naturally. Use a config/manifest and defaults; do not bake offsets into code only.

IMPORTANT: REPO-DRIVEN IMPLEMENTATION
- First, inspect the repository to identify:
  - Engine/runtime (Unity? Godot? Unreal? Three.js/Babylon/PlayCanvas? custom WebGL?)
  - UI framework (HTML/React/Vue, Unity UI Toolkit/UGUI, Godot Control nodes, etc.)
  - Multiplayer stack (WebSocket, Colyseus, Photon, Mirror, Netcode for GameObjects, custom UDP, etc.)
- Then implement using the existing patterns and architecture in the repo.
- Do not rewrite unrelated systems. Integrate cleanly.

DELIVERABLES (WHAT TO CHANGE / ADD)
A) Pre-Join UI + Flow
- Add a “PreJoin” screen/modal/panel (whatever is consistent with the repo) that includes:
  1. Nickname input
  2. Character selector grid/list (cards with name + preview)
  3. “Join” button (disabled until valid)
- The pre-join occurs before the player is spawned into the world.
  - If the current app connects immediately, then connect but do not spawn until pre-join complete.
  - Otherwise, connect only after pre-join complete. Match existing pattern.

Nickname validation requirements:
- Trim whitespace.
- Length: 3–16 characters (adjust only if repo already defines rules; keep consistent).
- Allowed characters: letters, numbers, underscore, dash, space (reject others).
- Prevent empty or all-whitespace.
- Client-side validation + server-side validation (server is authoritative).
- If invalid, server should assign a safe default like “Player####” and replicate the final name.

Character selector requirements:
- Build a CharacterCatalog/Registry that:
  - Enumerates character options by scanning/importing available skin textures (or a manifest file).
  - Associates each option with:
    - characterId (stable string key)
    - displayName (nice name)
    - model prefab/asset reference (the rigged model)
    - skin texture/material reference
    - weapon socket/bone name (defaults + fallback heuristics)
    - weapon local offsets (pos/rot/scale)
- Provide a preview:
  - Either (preferred) real-time 3D preview of the selected character,
  - Or (fallback) a static thumbnail image generated/committed (but don’t block shipping if not available).
- Persist: save nickname + last selected characterId locally.

B) Network Data Contract
- Extend join/handshake message to include:
  - nickname: string
  - characterId: string
- Server responsibilities:
  - Validate nickname + characterId
  - Store on PlayerState
  - Replicate to all clients
- Client responsibilities:
  - Show nameplates (if the game already has them; otherwise implement a minimal name label above remote avatar head).
  - Spawn remote avatar using characterId and display nickname.

C) Avatar Rendering + Animation System
- Create/extend an Avatar/CharacterView component/class responsible for:
  - Loading/cloning rigged model per player
  - Applying skin texture/material
  - Setting up animation controller/mixer per instance
  - Switching/blending between idle/run/jump based on movement state
- Movement state inputs:
  - Use existing replicated velocity/speed if available.
  - If only positions are replicated, compute speed from delta positions as fallback.

D) Weapon Attachment System
- Requirements:
  - Determine the right-hand bone in a robust way:
    1) Try known names (case-insensitive): "RightHand", "HandR", "hand_r", "hand.R", "mixamorigRightHand", etc.
    2) If not found, search skeleton for a node containing "hand" + ("r" or "right")
    3) If still not found, fall back to a configured path in the CharacterCatalog and log a warning.
  - Attach weapon object as a child of the bone/socket transform.
  - Apply per-character offsets (pos/rot/scale) from the config/manifest.
  - Ensure this runs for remote avatars on every client.
  - If your networking stack supports authoritative parenting (e.g., networked objects), do so correctly to avoid jitter.
    - If weapon is not networked (purely visual for remote avatars), instantiate locally and keep it purely client-side but deterministic based on replicated weaponId/state.
- If the game supports weapon switching:
  - Include weaponId in replicated player state and update attachments on change.
- If there is already a weapon model for third-person opponents, reuse it. If only first-person weapon exists, create a lightweight third-person weapon model instance for remote avatars.

E) Config / Manifest
- Add a single source of truth for character options, e.g.:
  - `characters.json` (or TS/CS ScriptableObject/etc.) containing entries:
    - characterId
    - displayName
    - skin asset path
    - optional bone override
    - weapon offsets
- Auto-generate this file at build/dev time if repo style supports it, OR keep it hand-edited but ensure the selector list is derived from it.
- Must be easy to add new skins later.

QUALITY BAR / ACCEPTANCE CRITERIA
1) Pre-Join:
- Launch game → pre-join screen appears (or is reachable in the current flow).
- Join disabled until nickname + character selected.
- After join: player spawns/enters match.
- Relaunch: nickname and last character are remembered.

2) Multiplayer:
- Player A chooses Character X and nickname “Alice”
- Player B joins and sees Player A’s avatar using Character X skin AND nameplate “Alice”
- Player A sees Player B’s chosen avatar and name.

3) Weapon:
- Both A and B see each other holding the weapon in the right hand.
- Weapon stays attached during movement/animation (no drifting).

4) Animation:
- Remote avatars idle when stationary, run when moving.
- If jump state exists: plays jump pose/clip; otherwise doesn’t break.

5) Resilience:
- If characterId invalid/missing: server assigns default.
- If a skin asset missing: fallback to default skin.
- If bone not found: weapon attaches to a sensible fallback and logs a clear warning (not a crash).

IMPLEMENTATION STEPS (DO THESE IN ORDER)
- [x] 1) Repo reconnaissance:
   - Identify engine/runtime, UI system, networking stack, asset loading pipeline, and where join/spawn occurs.
   - Briefly summarize your findings in comments in the PR description (or in a `docs/prejoin.md`).

- [x] 2) Add/extend Player Profile data model:
   - PlayerProfile: { nickname, characterId, weaponId? }
   - Ensure server authoritative validation and replication.

- [x] 3) Implement PreJoin UI:
   - Add new UI component/screen.
   - Add CharacterSelector component with preview.
   - Add local persistence.

- [x] 4) CharacterCatalog:
   - Implement discovery/loading of skin options.
   - Add manifest/config for offsets.

- [x] 5) Avatar system:
   - Ensure per-player model instantiation is properly cloned (skinned meshes must not share skeleton state between instances).
   - Apply skin/material.
   - Setup animation per instance.

- [x] 6) Weapon attachment:
   - Implement bone lookup + attach + offsets.
   - Ensure remote avatars always attach on spawn and on character changes.

- [ ] 7) Testing (manual test plan still needed):
   - Add at least minimal automated tests for nickname validation + characterId validation if the repo has a test harness.
   - Provide a “Manual Test Plan” section in docs or PR notes with exact steps.

CODING CONSTRAINTS
- Match existing code style (TypeScript vs JavaScript, C# conventions, etc.).
- Keep changes small and well-scoped.
- Add comments only where needed (bone lookup heuristics, networking contract).
- Avoid adding heavy new dependencies unless the repo already uses them (if you must, justify and keep minimal).

OUTPUT FORMAT
- Implement the feature in code.
- At the end, provide:
  1) A concise summary of files changed and why.
  2) Any new config/manifest format and an example entry.
  3) Manual testing steps for two clients (host + client) to verify nickname, character selection, animation, and weapon attachment.
