# CONTROLS

All input is handled in `src/main.ts` (keyboard) and `src/entities/player.ts`
(movement rules).

## Keyboard

| Key | Action |
| --- | --- |
| W / A / S / D | Walk (relative to look direction) |
| Space | Jump; swim up; fly up while creative flying |
| Left Ctrl | Sprint (drains hunger faster) |
| Left Shift | Sneak (slow, careful); fly down while creative flying |
| 1 ... 9 | Select hotbar slot |
| E | Open inventory (2x2 crafting); at a crafting table opens 3x3 |
| F | Eat held food |
| F3 | Toggle debug overlay (coords, biome, fps, time, seed) |
| Esc | Pause menu (autosaves); closes inventory |

## Mouse

| Input | Action |
| --- | --- |
| Move | Look (pointer lock, sensitivity in Options) |
| Left click | Attack mob in reach (0.55 s cooldown) |
| Left click hold | Mine the targeted block (crack stages 0-9) |
| Right click | Place held block on the targeted face |
| Right click on crafting table | Open 3x3 crafting |
| Right click on TNT | Prime it (4 s fuse) |
| Middle click | Pick block into hotbar |
| Wheel | Cycle hotbar slots |

## Movement constants (vanilla-faithful)

- Eye height 1.62, collision box 0.6 x 1.8, auto step 0.55
- Walk 4.317 b/s, sprint 5.612 b/s, sneak 1.3 b/s, creative fly 10.5 b/s
- Gravity 32 b/s^2, jump velocity 8.4 (1.25 block jump)
- Reach: 5 blocks mining/placing, ~4 blocks melee
- Fall damage: 1 heart per block fallen beyond 3
- Drowning: 15 s of air, then 1 heart per 2 s

## Options menu

Render distance 2-10 chunks, mouse sensitivity, master volume (0-10),
invert Y.
