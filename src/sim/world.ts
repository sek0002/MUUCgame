import { mulberry32 } from "./random";

export const TILE = 32;
export const WATERLINE_Y = 266;
export const BEACH_END_X = 900;
export const WORLD_WIDTH = 50000;
const OCEAN_WIDTH = WORLD_WIDTH - BEACH_END_X;
const CORAL_WIDTH = Math.round(OCEAN_WIDTH * 0.2);
const OPEN_WIDTH = Math.round(OCEAN_WIDTH * 0.3);
const CORAL_END_X = BEACH_END_X + CORAL_WIDTH;
const OPEN_END_X = CORAL_END_X + OPEN_WIDTH;
export const DEPTH_PIXELS_PER_METER = 30;
export const SEAFLOOR_MAX_DEPTH_METERS = 500;
export const CAVE_VERTICAL_EXTENT_METERS = 50;
export const WORLD_MAX_DEPTH_METERS = SEAFLOOR_MAX_DEPTH_METERS + CAVE_VERTICAL_EXTENT_METERS;
export const WORLD_HEIGHT =
  Math.ceil((WATERLINE_Y + WORLD_MAX_DEPTH_METERS * DEPTH_PIXELS_PER_METER + TILE * 8) / TILE) * TILE;

export type OceanZoneId = "surface" | "coral" | "deep" | "cave";

export interface OceanZone {
  id: OceanZoneId;
  name: string;
  startX: number;
  endX: number;
  baseColor: number;
  waterColor: number;
  rockColor: number;
  accentColor: number;
  maxDepth: number;
}

export interface RockTile {
  x: number;
  y: number;
  zoneId: OceanZoneId;
  variant: number;
}

export interface Decoration {
  x: number;
  y: number;
  zoneId: OceanZoneId;
  kind: "vent" | "sparkle";
  tint: number;
}

export type CreatureKey =
  | "blue-devil"
  | "crayfish"
  | "nudhhi"
  | "seadragon"
  | "smooth-sting-ray";

export interface CreatureSpawn {
  x: number;
  y: number;
  assetKey: CreatureKey;
  drift: number;
  scale: number;
  zoneId: OceanZoneId;
}

export interface WorldModel {
  zones: OceanZone[];
  rocks: RockTile[];
  decorations: Decoration[];
  creatures: CreatureSpawn[];
  openTiles: Set<string>;
}

export const ZONES: OceanZone[] = [
  {
    id: "coral",
    name: "Shallow Coral Area",
    startX: BEACH_END_X,
    endX: CORAL_END_X,
    baseColor: 0x168f93,
    waterColor: 0x0c6f84,
    rockColor: 0x8f7568,
    accentColor: 0xff7f78,
    maxDepth: 35,
  },
  {
    id: "surface",
    name: "Open Ocean",
    startX: CORAL_END_X,
    endX: OPEN_END_X,
    baseColor: 0x42bbd1,
    waterColor: 0x1b8dab,
    rockColor: 0x6e8382,
    accentColor: 0xcfefff,
    maxDepth: 100,
  },
  {
    id: "deep",
    name: "Ocean Drop Off",
    startX: OPEN_END_X,
    endX: WORLD_WIDTH,
    baseColor: 0x092845,
    waterColor: 0x061b33,
    rockColor: 0x29354e,
    accentColor: 0x84f0ff,
    maxDepth: 500,
  },
];

export const CAVE_ZONE: OceanZone = {
  id: "cave",
  name: "Caves",
  startX: 0,
  endX: WORLD_WIDTH,
  baseColor: 0x071927,
  waterColor: 0x06101c,
  rockColor: 0x1d2432,
  accentColor: 0x78d7ff,
  maxDepth: WORLD_MAX_DEPTH_METERS,
};

const GRID_W = Math.ceil(WORLD_WIDTH / TILE);
const GRID_H = Math.floor(WORLD_HEIGHT / TILE);
const WATERLINE_TILE = Math.ceil(WATERLINE_Y / TILE);
const seafloorTileCache: number[] = [];
const caveBottomTileCache: number[] = [];
const TERRAIN_RELIEF_SEED = 0x5eaf11;
const BOMMIE_TERRAIN_SEED = 0xb0441e;
const CLIFF_OVERHANG_SEED = 0xc11ff;

export function tileKey(tx: number, ty: number): string {
  return `${tx},${ty}`;
}

export function zoneAtX(x: number): OceanZone {
  return ZONES.find((zone) => x >= zone.startX && x < zone.endX) ?? ZONES[0];
}

export function zoneAtPosition(x: number, y: number): OceanZone {
  void y;
  return zoneAtX(x);
}

export function seafloorYAtX(x: number): number {
  const tx = Math.floor(x / TILE);
  return seafloorTileFor(tx) * TILE;
}

export function maxDepthAtX(x: number): number {
  const baseline = baselineDepthAtX(x);
  const relief = fixedTerrainReliefAtX(x);
  return Math.round(clamp(baseline + relief, minimumDepthAtX(x), SEAFLOOR_MAX_DEPTH_METERS));
}

function baselineDepthAtX(x: number): number {
  const openStart = ZONES[1].startX;
  const deepStart = ZONES[2].startX;
  if (x < BEACH_END_X) {
    return clamp(6 + smooth01(x / BEACH_END_X) * 2, 6, 8);
  }
  if (x < openStart) {
    const t = clamp((x - BEACH_END_X) / (openStart - BEACH_END_X), 0, 1);
    const shelfT = clamp(t / 0.32, 0, 1);
    return lerp(8, 35, smooth01(shelfT));
  }
  if (x < deepStart) {
    const t = clamp((x - openStart) / (deepStart - openStart), 0, 1);
    return lerp(35, 100, smooth01(t));
  }

  const zone = ZONES[2];
  const local = clamp((x - zone.startX) / (zone.endX - zone.startX), 0, 1);
  const dropT = clamp(local / 0.2, 0, 1);
  const deepDropBottom = lerp(100, 392, smooth01(dropT));

  if (local <= 0.20) {
    return deepDropBottom;
  }
  if (local <= 0.35) {
    const settleT = smooth01(clamp((local - 0.20) / 0.15, 0, 1));
    return lerp(392, 404, settleT);
  }
  if (local <= 0.56) {
    return 404;
  }

  const mountainT = smooth01(clamp((local - 0.56) / 0.44, 0, 1));
  const trenchBase = lerp(404, 462, mountainT);
  const deepSag = smooth01(clamp((local - 0.56) / 0.44, 0, 1)) * 22;
  return trenchBase + deepSag;
}

function fixedTerrainReliefAtX(x: number) {
  const openStart = ZONES[1].startX;
  const deepStart = ZONES[2].startX;
  const ripple =
    Math.sin(x * 0.018 + 0.8) * 0.85 +
    Math.sin(x * 0.041 + 2.4) * 0.45 +
    layeredNoise1D(x * 0.012, 2, TERRAIN_RELIEF_SEED + 317) * 0.7;

  if (x < BEACH_END_X) {
    return ripple * 0.32;
  }

  if (x < openStart) {
    const t = clamp((x - BEACH_END_X) / (openStart - BEACH_END_X), 0, 1);
    const shelfFade = smooth01(clamp((t - 0.05) / 0.35, 0, 1));
    const ridges =
      layeredNoise1D(x * 0.00075, 4, TERRAIN_RELIEF_SEED) * 3.4 +
      layeredNoise1D(x * 0.0032, 3, TERRAIN_RELIEF_SEED + 41) * 1.7;
    const bommieRelief =
      gaussianTerrainFeature(x, BEACH_END_X + CORAL_WIDTH * 0.2, 320, -4.2) +
      gaussianTerrainFeature(x, BEACH_END_X + CORAL_WIDTH * 0.44, 520, 3.8) +
      gaussianTerrainFeature(x, BEACH_END_X + CORAL_WIDTH * 0.67, 430, -5.4) +
      gaussianTerrainFeature(x, BEACH_END_X + CORAL_WIDTH * 0.83, 680, 4.6);
    return shelfFade * (ridges + bommieRelief) + ripple;
  }

  if (x < deepStart) {
    const t = clamp((x - openStart) / (deepStart - openStart), 0, 1);
    const rollingRelief =
      layeredNoise1D(x * 0.00046, 4, TERRAIN_RELIEF_SEED + 83) * 5.8 +
      layeredNoise1D(x * 0.0021, 3, TERRAIN_RELIEF_SEED + 149) * 2.4;
    const hills =
      gaussianTerrainFeature(x, openStart + OPEN_WIDTH * 0.2, 780, -7.8) +
      gaussianTerrainFeature(x, openStart + OPEN_WIDTH * 0.43, 920, 8.8) +
      gaussianTerrainFeature(x, openStart + OPEN_WIDTH * 0.66, 1100, -9.5) +
      gaussianTerrainFeature(x, openStart + OPEN_WIDTH * 0.86, 760, 6.2);
    return rollingRelief + hills + ripple * 1.35 + Math.sin(t * Math.PI * 6) * 1.2;
  }

  const deepWidth = WORLD_WIDTH - deepStart;
  const local = clamp((x - deepStart) / deepWidth, 0, 1);
  const mountainFade = smooth01(clamp((local - 0.11) / 0.21, 0, 1));
  const trenchNoise =
    layeredNoise1D(x * 0.00022, 5, TERRAIN_RELIEF_SEED + 223) * 18 +
    layeredNoise1D(x * 0.0011, 4, TERRAIN_RELIEF_SEED + 487) * 8;
  const mountains =
    gaussianTerrainFeature(x, deepStart + deepWidth * 0.31, 1500, -74) +
    gaussianTerrainFeature(x, deepStart + deepWidth * 0.48, 2200, 24) +
    gaussianTerrainFeature(x, deepStart + deepWidth * 0.58, 1700, -112) +
    gaussianTerrainFeature(x, deepStart + deepWidth * 0.73, 1300, 32) +
    gaussianTerrainFeature(x, deepStart + deepWidth * 0.84, 1900, -86) +
    gaussianTerrainFeature(x, deepStart + deepWidth * 0.94, 900, 16);
  return mountainFade * (trenchNoise + mountains) + ripple * 1.5;
}

function gaussianTerrainFeature(x: number, center: number, radius: number, depthOffset: number) {
  const distance = (x - center) / radius;
  return depthOffset * Math.exp(-distance * distance);
}

function minimumDepthAtX(x: number) {
  if (x < BEACH_END_X) return 5;
  if (x < ZONES[1].startX) return 7;
  if (x < ZONES[2].startX) return 18;
  return 70;
}

export function depthAtPosition(x: number, y: number): number {
  return Math.round(clamp(yToDepth(y), 0, WORLD_MAX_DEPTH_METERS));
}

export function generateWorld(seed = 2871): WorldModel {
  const random = mulberry32(seed);
  const solid = Array.from({ length: GRID_H }, () =>
    Array.from({ length: GRID_W }, () => false),
  );
  const protectedSolid = Array.from({ length: GRID_H }, () =>
    Array.from({ length: GRID_W }, () => false),
  );

  carveBaselineFloor(solid);
  addConnectedBommies(solid, mulberry32(BOMMIE_TERRAIN_SEED), protectedSolid);
  addDropoffCliffOverhangs(solid, mulberry32(CLIFF_OVERHANG_SEED), protectedSolid);

  const openTiles = new Set<string>();
  const rocks: RockTile[] = [];
  for (let ty = 0; ty < GRID_H; ty += 1) {
    for (let tx = 0; tx < GRID_W; tx += 1) {
      if (solid[ty][tx]) {
        if (isExposedSolid(solid, tx, ty)) {
          rocks.push({
            x: tx * TILE,
            y: ty * TILE,
            zoneId: zoneAtX(tx * TILE).id,
            variant: Math.floor(random() * 4),
          });
        }
      }
    }
  }

  return {
    zones: ZONES,
    rocks,
    decorations: [],
    creatures: [],
    openTiles,
  };
}

function carveBaselineFloor(solid: boolean[][]) {
  for (let tx = 0; tx < GRID_W; tx += 1) {
    const floor = seafloorTileFor(tx);
    for (let ty = floor + 1; ty < GRID_H; ty += 1) {
      solid[ty][tx] = true;
    }
  }
}

function isExposedSolid(solid: boolean[][], tx: number, ty: number) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
      if (!solid[ny][nx]) return true;
    }
  }
  return false;
}

function carveCaveZone(
  solid: boolean[][],
  zone: OceanZone,
  random: () => number,
  zoneByTile: Map<string, OceanZoneId>,
) {
  const startTx = Math.floor(zone.startX / TILE);
  const endTx = Math.floor(zone.endX / TILE);
  const caveOpen = Array.from({ length: GRID_H }, () =>
    Array.from({ length: GRID_W }, () => false),
  );

  for (let x = startTx; x < endTx; x += 1) {
    const floor = seafloorTileFor(x);
    const bottom = caveBottomTileFor(x);
    for (let y = 0; y < GRID_H; y += 1) {
      const edge = y > GRID_H - 3;
      const bedrock = y > floor;
      solid[y][x] = edge || bedrock;
      zoneByTile.set(tileKey(x, y), zone.id);

      if (y <= floor + 2 || y >= bottom) continue;
      const localDepth = (y - floor) / Math.max(1, bottom - floor);
      const centeredDepth = 1 - Math.abs(localDepth - 0.48) * 1.35;
      const broadNoise = layeredNoise2D(x * 0.11, y * 0.18, 3, 0x4d2 + zone.startX);
      const fineNoise = layeredNoise2D(x * 0.34, y * 0.42, 2, 0x8bd + zone.endX);
      const caveBias = zone.id === "deep" ? 0.08 : zone.id === "surface" ? 0.03 : 0;
      const noiseScore = broadNoise * 0.72 + fineNoise * 0.28 + centeredDepth * 0.34 + caveBias;
      caveOpen[y][x] = noiseScore > 0.44 || (random() < 0.035 && centeredDepth > 0.1);
    }
  }

  for (let pass = 0; pass < 5; pass += 1) {
    const next = caveOpen.map((row) => row.slice());
    for (let y = WATERLINE_TILE + 2; y < GRID_H - 4; y += 1) {
      for (let x = startTx + 1; x < endTx - 1; x += 1) {
        if (!isWithinCaveBand(x, y)) {
          next[y][x] = false;
          continue;
        }
        const neighbors = countOpenNeighbors(caveOpen, x, y);
        next[y][x] = neighbors >= 5 || (caveOpen[y][x] && neighbors >= 4);
      }
    }
    for (let y = WATERLINE_TILE + 2; y < GRID_H - 4; y += 1) {
      for (let x = startTx + 1; x < endTx - 1; x += 1) {
        caveOpen[y][x] = next[y][x];
      }
    }
  }

  for (let x = startTx + 1; x < endTx - 1; x += 1) {
    for (let y = seafloorTileFor(x) + 3; y < caveBottomTileFor(x); y += 1) {
      if (caveOpen[y][x]) solid[y][x] = false;
    }
  }
}

function carveCaveEntrances(solid: boolean[][]) {
  for (const zone of ZONES) {
    const startTx = Math.floor(zone.startX / TILE);
    const endTx = Math.floor(zone.endX / TILE);
    const zoneWidth = endTx - startTx;
    const entranceCount = caveEntranceCount(zone, zoneWidth);

    for (let i = 0; i < entranceCount; i += 1) {
      const ratio = (i + 1) / (entranceCount + 1);
      const tx = Math.floor(startTx + zoneWidth * ratio + Math.sin(i * 2.7 + zoneWidth) * 7);
      carveLargeCaveMouth(solid, clamp(tx, startTx + 10, endTx - 10));
    }
  }
}

function caveEntranceTxs(zone: OceanZone) {
  const startTx = Math.floor(zone.startX / TILE);
  const endTx = Math.floor(zone.endX / TILE);
  const zoneWidth = endTx - startTx;
  const entranceCount = caveEntranceCount(zone, zoneWidth);
  const entrances: number[] = [];

  for (let i = 0; i < entranceCount; i += 1) {
    const ratio = (i + 1) / (entranceCount + 1);
    const tx = Math.floor(startTx + zoneWidth * ratio + Math.sin(i * 2.7 + zoneWidth) * 7);
    entrances.push(clamp(tx, startTx + 10, endTx - 10));
  }

  return entrances;
}

function caveEntranceCount(zone: OceanZone, zoneWidthTiles: number) {
  if (zone.id === "deep") return Math.round(clamp(zoneWidthTiles / 260, 6, 18));
  if (zone.id === "surface") return Math.round(clamp(zoneWidthTiles / 92, 4, 8));
  return Math.round(clamp(zoneWidthTiles / 62, 3, 6));
}

function carveDeepCaveMazes(solid: boolean[][], random: () => number) {
  const caveExtentTiles = depthMetersToTiles(CAVE_VERTICAL_EXTENT_METERS);
  for (const zone of ZONES) {
    const startTx = Math.floor(zone.startX / TILE);
    const endTx = Math.floor(zone.endX / TILE);
    const entrances = caveEntranceTxs(zone);

    for (let index = 0; index < entrances.length; index += 1) {
      const tx = entrances[index];
      const floorTy = seafloorTileFor(tx);
      const startY = clamp(floorTy + 10, WATERLINE_TILE + 8, GRID_H - 8);
      const bottomY = clamp(
        floorTy + caveExtentTiles,
        startY + 6,
        GRID_H - 6,
      );
      const drift = index % 2 === 0 ? 1 : -1;
      const reverseDrift = drift === 1 ? -1 : 1;
      carveMazeSpine(solid, tx, startY, bottomY, startTx, endTx, drift, random);
      carveCaveChamber(solid, tx, startY + 3, 6, 4);
      carveCaveChamber(
        solid,
        tx + drift * (8 + Math.floor(random() * 7)),
        bottomY - 3,
        zone.id === "deep" ? 8 : 6,
        5,
      );

      const galleryCount = zone.id === "deep" ? 12 : 9;
      for (let branch = 0; branch < galleryCount; branch += 1) {
        const branchY = clamp(
          startY + 5 + Math.floor((bottomY - startY - 8) * ((branch + 1) / (galleryCount + 1))),
          startY + 4,
          bottomY - 2,
        );
        const branchX = clamp(
          tx + Math.round(Math.sin(branch * 1.9 + tx) * 18) + drift * branch * 3,
          startTx + 8,
          endTx - 8,
        );
        carveMazeGallery(
          solid,
          branchX,
          branchY,
          startTx,
          endTx,
          branch % 2 === 0 ? reverseDrift : drift,
          random,
          zone.id === "deep" ? 52 : 38,
          bottomY,
        );
        if (branch % 3 === 1) {
          carveVerticalMazeDrop(
            solid,
            branchX,
            branchY,
            startTx,
            endTx,
            bottomY,
            branch % 2 === 0 ? drift : reverseDrift,
            random,
          );
        }
      }
    }

    for (let loop = 0; loop < entrances.length - 1; loop += 1) {
      const left = entrances[loop];
      const right = entrances[loop + 1];
      const connectorBottomY = Math.min(
        GRID_H - 6,
        Math.max(seafloorTileFor(left), seafloorTileFor(right)) + caveExtentTiles,
      );
      const y = clamp(
        Math.max(seafloorTileFor(left), seafloorTileFor(right)) + 22 + loop * 7,
        WATERLINE_TILE + 8,
        connectorBottomY,
      );
      carveHorizontalConnector(solid, left, right, y, random);
      carveHorizontalConnector(
        solid,
        left + Math.floor((right - left) * 0.18),
        right - Math.floor((right - left) * 0.18),
        clamp(y + 8 + loop * 2, WATERLINE_TILE + 10, connectorBottomY),
        random,
      );
    }
  }
}

function smoothCaveEdges(solid: boolean[][]) {
  for (let pass = 0; pass < 2; pass += 1) {
    const next = solid.map((row) => row.slice());
    for (let y = WATERLINE_TILE + 2; y < GRID_H - 4; y += 1) {
      for (let x = 2; x < GRID_W - 2; x += 1) {
        if (!isWithinCaveBand(x, y)) continue;
        const openNeighbors = countOpenNeighborsFromSolid(solid, x, y);
        const solidNeighbors = countSolidNeighbors(solid, x, y);
        if (solid[y][x] && openNeighbors >= 5) {
          next[y][x] = false;
        } else if (!solid[y][x] && solidNeighbors >= 7) {
          next[y][x] = true;
        }
      }
    }
    for (let y = WATERLINE_TILE + 2; y < GRID_H - 4; y += 1) {
      for (let x = 2; x < GRID_W - 2; x += 1) {
        solid[y][x] = next[y][x];
      }
    }
  }
}

function validateCaveNetworksWithAStar(solid: boolean[][], protectedSolid?: boolean[][]) {
  for (const zone of ZONES) {
    const entrances = caveEntranceTxs(zone);
    const anchors = entrances.map((tx) => {
      const floorTy = seafloorTileFor(tx);
      const target = findNearestOpenCaveTile(solid, tx, floorTy + 8, protectedSolid);
      if (target) return target;
      carveCaveCircle(solid, tx, floorTy + 8, 3, protectedSolid);
      return { tx, ty: floorTy + 8 };
    });

    for (let i = 0; i < anchors.length - 1; i += 1) {
      const start = anchors[i];
      const goal = anchors[i + 1];
      const bounds = cavePathBounds(zone, start, goal);
      const existingPath = findAStarPath(solid, start, goal, bounds, false, protectedSolid);
      if (existingPath) continue;

      const repairPath = findAStarPath(solid, start, goal, bounds, true, protectedSolid);
      if (!repairPath) {
        carveHorizontalConnector(solid, start.tx, goal.tx, Math.max(start.ty, goal.ty), mulberry32(9191 + i), protectedSolid);
        continue;
      }

      for (let step = 0; step < repairPath.length; step += 1) {
        const point = repairPath[step];
        carveCaveCircle(solid, point.tx, point.ty, step % 7 === 0 ? 3 : 2, protectedSolid);
      }
    }
  }
}

function cavePathBounds(
  zone: OceanZone,
  start: { tx: number; ty: number },
  goal: { tx: number; ty: number },
) {
  const startTx = Math.max(Math.floor(zone.startX / TILE) + 3, Math.min(start.tx, goal.tx) - 18);
  const endTx = Math.min(Math.floor(zone.endX / TILE) - 3, Math.max(start.tx, goal.tx) + 18);
  let minTy = Math.min(start.ty, goal.ty) - 8;
  let maxTy = Math.max(start.ty, goal.ty) + 8;
  for (let tx = startTx; tx <= endTx; tx += 4) {
    minTy = Math.min(minTy, seafloorTileFor(tx) + 1);
    maxTy = Math.max(maxTy, caveBottomTileFor(tx) + 2);
  }
  return {
    startTx,
    endTx,
    minTy: clamp(minTy, WATERLINE_TILE + 2, GRID_H - 6),
    maxTy: clamp(maxTy, WATERLINE_TILE + 4, GRID_H - 5),
  };
}

function findNearestOpenCaveTile(
  solid: boolean[][],
  tx: number,
  ty: number,
  protectedSolid?: boolean[][],
) {
  for (let radius = 0; radius <= 14; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) > radius) continue;
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx <= 1 || nx >= GRID_W - 2 || ny <= WATERLINE_TILE + 1 || ny >= GRID_H - 2) continue;
        if (!isCavePathTile(nx, ny) || solid[ny][nx] || protectedSolid?.[ny]?.[nx]) continue;
        return { tx: nx, ty: ny };
      }
    }
  }
  return null;
}

function findAStarPath(
  solid: boolean[][],
  start: { tx: number; ty: number },
  goal: { tx: number; ty: number },
  bounds: { startTx: number; endTx: number; minTy: number; maxTy: number },
  allowSolidRepair: boolean,
  protectedSolid?: boolean[][],
) {
  const startKey = tileKey(start.tx, start.ty);
  const goalKey = tileKey(goal.tx, goal.ty);
  const open: Array<{ tx: number; ty: number; f: number }> = [
    { tx: start.tx, ty: start.ty, f: manhattan(start, goal) },
  ];
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const closed = new Set<string>();
  let iterations = 0;

  while (open.length > 0 && iterations < 120000) {
    iterations += 1;
    const current = popBestOpenNode(open);
    if (!current) break;
    const currentKey = tileKey(current.tx, current.ty);
    if (currentKey === goalKey) return reconstructPath(cameFrom, currentKey);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    const neighbors = [
      { tx: current.tx + 1, ty: current.ty },
      { tx: current.tx - 1, ty: current.ty },
      { tx: current.tx, ty: current.ty + 1 },
      { tx: current.tx, ty: current.ty - 1 },
    ];

    for (const next of neighbors) {
      if (
        next.tx < bounds.startTx ||
        next.tx > bounds.endTx ||
        next.ty < bounds.minTy ||
        next.ty > bounds.maxTy ||
        !isCavePathTile(next.tx, next.ty) ||
        protectedSolid?.[next.ty]?.[next.tx]
      ) {
        continue;
      }
      const nextKey = tileKey(next.tx, next.ty);
      if (closed.has(nextKey)) continue;
      const isSolid = Boolean(solid[next.ty]?.[next.tx]);
      if (isSolid && !allowSolidRepair) continue;

      const stepCost = isSolid ? 9 : 1;
      const tentativeG = (gScore.get(currentKey) ?? Infinity) + stepCost;
      if (tentativeG >= (gScore.get(nextKey) ?? Infinity)) continue;
      cameFrom.set(nextKey, currentKey);
      gScore.set(nextKey, tentativeG);
      pushOpenNode(open, { tx: next.tx, ty: next.ty, f: tentativeG + manhattan(next, goal) });
    }
  }

  return null;
}

function pushOpenNode(
  heap: Array<{ tx: number; ty: number; f: number }>,
  node: { tx: number; ty: number; f: number },
) {
  heap.push(node);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent].f <= heap[index].f) break;
    [heap[parent], heap[index]] = [heap[index], heap[parent]];
    index = parent;
  }
}

function popBestOpenNode(heap: Array<{ tx: number; ty: number; f: number }>) {
  if (heap.length === 0) return null;
  const best = heap[0];
  const last = heap.pop()!;
  if (heap.length > 0) {
    heap[0] = last;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < heap.length && heap[left].f < heap[smallest].f) smallest = left;
      if (right < heap.length && heap[right].f < heap[smallest].f) smallest = right;
      if (smallest === index) break;
      [heap[index], heap[smallest]] = [heap[smallest], heap[index]];
      index = smallest;
    }
  }
  return best;
}

function reconstructPath(cameFrom: Map<string, string>, currentKey: string) {
  const path: Array<{ tx: number; ty: number }> = [];
  let key: string | undefined = currentKey;
  while (key) {
    const [tx, ty] = key.split(",").map(Number);
    path.push({ tx, ty });
    key = cameFrom.get(key);
  }
  return path.reverse();
}

function manhattan(a: { tx: number; ty: number }, b: { tx: number; ty: number }) {
  return Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty);
}

function carveMazeSpine(
  solid: boolean[][],
  startX: number,
  startY: number,
  bottomY: number,
  minX: number,
  maxX: number,
  drift: -1 | 1,
  random: () => number,
) {
  let x = startX;
  for (let y = startY; y <= bottomY; y += 1) {
    x += Math.sin(y * 0.32 + startX) * 0.7 + drift * 0.14 + (random() - 0.5) * 1.1;
    x = clamp(x, minX + 6, maxX - 6);
    const radius = y % 10 === 0 || random() > 0.82 ? 4 : 3;
    carveCaveCircle(solid, Math.round(x), y, radius);
    if (y % 11 === 0) carveCaveCircle(solid, Math.round(x + drift * 4), y, 3);
    if (y % 17 === 0) {
      carveCaveChamber(solid, Math.round(x - drift * 2), y, 5, 3);
    }
  }
}

function carveMazeGallery(
  solid: boolean[][],
  startX: number,
  startY: number,
  minX: number,
  maxX: number,
  direction: -1 | 1,
  random: () => number,
  maxLength: number,
  maxY: number,
) {
  let x = startX;
  let y = startY;
  const length = 14 + Math.floor(random() * maxLength);

  for (let step = 0; step < length; step += 1) {
    carveCaveCircle(solid, Math.round(x), Math.round(y), step % 8 === 0 ? 4 : 3);
    x += direction * (0.8 + random() * 0.8);
    y += Math.sin(step * 0.55 + startX) * 0.75 + (random() - 0.5) * 0.9 + 0.08;
    x = clamp(x, minX + 5, maxX - 5);
    y = clamp(y, WATERLINE_TILE + 7, maxY);

    if (step === Math.floor(length * 0.55)) {
      const forkDirection: -1 | 1 = direction === 1 ? -1 : 1;
      for (let fork = 0; fork < 14; fork += 1) {
        carveCaveCircle(
          solid,
          Math.round(x + forkDirection * fork),
          Math.round(y + Math.sin(fork * 0.7) * 2 + fork * 0.12),
          2,
        );
      }
    }
  }
}

function carveVerticalMazeDrop(
  solid: boolean[][],
  startX: number,
  startY: number,
  minX: number,
  maxX: number,
  maxY: number,
  drift: -1 | 1,
  random: () => number,
) {
  let x = startX;
  const length = 8 + Math.floor(random() * 15);
  for (let step = 0; step < length; step += 1) {
    const y = clamp(startY + step, WATERLINE_TILE + 8, maxY);
    x += drift * 0.18 + Math.sin((startY + step) * 0.6) * 0.55 + (random() - 0.5) * 0.8;
    x = clamp(x, minX + 6, maxX - 6);
    carveCaveCircle(solid, Math.round(x), y, step % 6 === 0 ? 4 : 3);
    if (step === Math.floor(length * 0.72)) {
      carveMazeGallery(solid, Math.round(x), y, minX, maxX, drift, random, 22, maxY);
    }
  }
}

function carveCaveChamber(
  solid: boolean[][],
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number,
) {
  for (let y = cy - radiusY; y <= cy + radiusY; y += 1) {
    for (let x = cx - radiusX; x <= cx + radiusX; x += 1) {
      if (x <= 1 || x >= GRID_W - 2 || y <= WATERLINE_TILE + 1 || y >= GRID_H - 5) continue;
      const distance = Math.hypot((x - cx) / radiusX, (y - cy) / radiusY);
      if (distance <= 1 && isCavePathTile(x, y)) solid[y][x] = false;
    }
  }
}

function carveHorizontalConnector(
  solid: boolean[][],
  leftTx: number,
  rightTx: number,
  y: number,
  random: () => number,
  protectedSolid?: boolean[][],
) {
  let caveY = y;
  for (let x = leftTx; x <= rightTx; x += 1) {
    const floor = seafloorTileFor(x);
    const bottom = caveBottomTileFor(x);
    const targetY = clamp(
      floor + 15 + Math.sin(x * 0.08) * 7 + Math.sin(x * 0.021) * 10,
      floor + 5,
      bottom - 3,
    );
    caveY = lerp(caveY + (random() - 0.5) * 1.3, targetY, 0.18);
    caveY = clamp(caveY, floor + 4, bottom - 2);
    carveCaveCircle(solid, x, Math.round(caveY + Math.sin(x * 0.16) * 2), x % 13 === 0 ? 4 : 3, protectedSolid);
  }
}

function carveCaveCircle(
  solid: boolean[][],
  cx: number,
  cy: number,
  radius: number,
  protectedSolid?: boolean[][],
) {
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      const distance = Math.hypot(x - cx, y - cy);
      if (
        distance <= radius &&
        x > 1 &&
        x < GRID_W - 2 &&
        y > WATERLINE_TILE + 1 &&
        y < GRID_H - 5 &&
        isCavePathTile(x, y) &&
        !protectedSolid?.[y]?.[x] &&
        solid[y]?.[x] !== undefined
      ) {
        solid[y][x] = false;
      }
    }
  }
}

function carveLargeCaveMouth(solid: boolean[][], tx: number) {
  const floorTy = seafloorTileFor(tx);
  const shaftBottom = clamp(floorTy + 13, floorTy + 8, GRID_H - 7);
  const mouthHalfWidth = 4;
  const shaftHalfWidth = 3;

  for (let ty = floorTy - 3; ty <= shaftBottom; ty += 1) {
    const entranceT = clamp((ty - (floorTy - 3)) / 8, 0, 1);
    const halfWidth = Math.round(lerp(mouthHalfWidth + 2, shaftHalfWidth, entranceT));
    for (let dx = -halfWidth; dx <= halfWidth; dx += 1) {
      const x = tx + dx;
      if (x <= 1 || x >= GRID_W - 2 || ty <= WATERLINE_TILE + 1 || ty >= GRID_H - 2) continue;
      solid[ty][x] = false;
    }
  }

  for (let y = shaftBottom - 3; y <= shaftBottom + 4; y += 1) {
    for (let x = tx - 7; x <= tx + 7; x += 1) {
      if (x <= 1 || x >= GRID_W - 2 || y <= WATERLINE_TILE + 1 || y >= GRID_H - 2) continue;
      const distance = Math.hypot((x - tx) / 1.6, y - shaftBottom);
      if (distance <= 5) solid[y][x] = false;
    }
  }
}

function addConnectedBommies(
  solid: boolean[][],
  random: () => number,
  protectedSolid: boolean[][],
) {
  const coral = ZONES[0];
  const open = ZONES[1];

  createBommiesInZone(
    solid,
    protectedSolid,
    random,
    Math.floor((coral.startX + 760) / TILE),
    Math.floor((coral.endX - 260) / TILE),
    3,
    () => 12 + random() * 14,
    16,
  );

  createBommiesInZone(
    solid,
    protectedSolid,
    random,
    Math.floor((open.startX + 260) / TILE),
    Math.floor((open.endX - 320) / TILE),
    2,
    () => 24 + random() * 28,
    15,
  );
}

function addDropoffCliffOverhangs(
  solid: boolean[][],
  random: () => number,
  protectedSolid: boolean[][],
) {
  const deep = ZONES[2];
  const deepStartTx = Math.floor(deep.startX / TILE);
  const deepWidthTiles = Math.floor((deep.endX - deep.startX) / TILE);
  const dropWidthTiles = Math.floor(deepWidthTiles * 0.24);
  const anchors = [0.16, 0.35, 0.54, 0.76];
  const protrudingLedgeIndex = 2;

  for (let i = 0; i < anchors.length; i += 1) {
    const offset = Math.round(randomNormal(random, 0, 3.2));
    const tx = clamp(
      deepStartTx + Math.round(dropWidthTiles * anchors[i]) + offset,
      deepStartTx + 8,
      deepStartTx + dropWidthTiles - 8,
    );
    const floorTy = seafloorTileFor(tx);
    const isBottomLedge = i >= anchors.length - 1;
    const rootLift = Math.round(clamp(randomNormal(random, isBottomLedge ? 10 : 7.5, 1.8), 4, 15));
    const topTy = clamp(floorTy - rootLift, WATERLINE_TILE + 6, GRID_H - 20);
    const length = Math.round(
      clamp(randomNormal(random, isBottomLedge ? 31 : 24, isBottomLedge ? 8 : 6), 12, 40),
    );
    const thickness = Math.round(clamp(randomNormal(random, isBottomLedge ? 6.2 : 5.2, 1.4), 4, 8));
    const sag = Math.round(clamp(randomNormal(random, 6.2, 2), 3, 10));
    const rootWidth = 2 + Math.floor(random() * 4);

    addCliffFaceOverhang(
      solid,
      protectedSolid,
      tx,
      topTy,
      floorTy,
      length,
      thickness,
      sag,
      rootWidth,
      i,
    );

    if (i === protrudingLedgeIndex) {
      addCliffFaceOverhang(
        solid,
        protectedSolid,
        tx + Math.round(length * 0.36),
        topTy + Math.round(sag * 0.3),
        floorTy + 1,
        Math.round(length * 0.9),
        thickness + 2,
        Math.max(2, Math.round(sag * 1.8)),
        rootWidth,
        i + 45,
        -1,
      );
    }

    const createCounterOverhang = random() > 0.4 || isBottomLedge;
    if (createCounterOverhang) {
      const overhangLength = Math.max(8, Math.round(length * 0.58));
      const overhangThickness = Math.max(3, thickness - 1);
      const overhangSag = Math.max(1, Math.round(sag * 0.55));
      addCliffFaceOverhang(
        solid,
        protectedSolid,
        tx + Math.round(length * 0.4),
        topTy + thickness + 3 + Math.floor(random() * 3),
        floorTy + 4,
        overhangLength,
        overhangThickness,
        overhangSag,
        2,
        i + 11,
      );
    }

    if (isBottomLedge) {
      const taperTx = tx + Math.round(length * 0.3);
      const taperTop = Math.min(
        topTy + Math.floor(length * 0.32),
        floorTy + Math.max(3, Math.floor(random() * 5)),
      );
      const taperLength = Math.round(clamp(randomNormal(random, 42, 9), 22, 64));
      const taperThickness = Math.max(3, Math.round(thickness * 0.86));
      addCliffFaceOverhang(
        solid,
        protectedSolid,
        taperTx,
        taperTop,
        floorTy + 2,
        taperLength,
        taperThickness,
        1,
        2,
        i + 31,
      );
    }
  }
}

function addCliffFaceOverhang(
  solid: boolean[][],
  protectedSolid: boolean[][],
  anchorTx: number,
  topTy: number,
  floorTy: number,
  length: number,
  thickness: number,
  sag: number,
  rootWidth: number,
  variant: number,
  direction: -1 | 1 = 1,
) {
  const safeAnchor = clamp(anchorTx, 2, GRID_W - 3);
  const rootTop = clamp(topTy - 1, WATERLINE_TILE + 4, floorTy - 2);

  for (let x = safeAnchor - rootWidth; x <= safeAnchor + 1; x += 1) {
    if (x <= 1 || x >= GRID_W - 2) continue;
    const localFloor = seafloorTileFor(x);
    for (let y = rootTop; y <= localFloor + 1; y += 1) {
      if (y <= WATERLINE_TILE + 1 || y >= GRID_H - 2) continue;
      solid[y][x] = true;
      protectedSolid[y][x] = true;
    }
  }

  for (let step = 0; step < length; step += 1) {
    const x = safeAnchor + direction * step;
    if (x <= 1 || x >= GRID_W - 2) continue;
    const t = step / Math.max(1, length - 1);
    const lipTaper = Math.sin(t * Math.PI);
    const top =
      topTy +
      Math.round(sag * smooth01(t)) +
      Math.round(Math.sin(step * 0.56 + variant * 1.7) * 1.2);
    const localThickness = Math.max(
      2,
      Math.round(thickness + lipTaper * 2 - smooth01(t) * 1.5),
    );
    const maxVisibleBottom = seafloorTileFor(x) - 1;
    for (let y = top; y < top + localThickness; y += 1) {
      if (y <= WATERLINE_TILE + 1 || y >= GRID_H - 2 || y > maxVisibleBottom) continue;
      solid[y][x] = true;
      protectedSolid[y][x] = true;
    }

    if (step > length * 0.2 && step < length * 0.86 && step % 3 !== 0) {
      const lipY = top + localThickness;
      if (lipY > WATERLINE_TILE + 1 && lipY < GRID_H - 2 && lipY <= maxVisibleBottom) {
        solid[lipY][x] = true;
        protectedSolid[lipY][x] = true;
      }
    }
  }

  const buttressX = safeAnchor + Math.max(2, Math.floor(length * 0.18)) * direction;
  for (let y = topTy + thickness - 1; y <= topTy + thickness + 5; y += 1) {
    for (let x = buttressX - 1; x <= buttressX + 1; x += 1) {
      if (x <= 1 || x >= GRID_W - 2 || y <= WATERLINE_TILE + 1 || y >= GRID_H - 2) continue;
      if (y >= seafloorTileFor(x)) continue;
      solid[y][x] = true;
      protectedSolid[y][x] = true;
    }
  }
}

function createBommiesInZone(
  solid: boolean[][],
  protectedSolid: boolean[][],
  random: () => number,
  usableStart: number,
  usableEnd: number,
  count: number,
  targetDepth: () => number,
  baseHalfWidth: number,
) {
  const bommies: Array<{ tx: number; floorTy: number; topTy: number; halfWidth: number }> = [];

  for (let i = 0; i < count; i += 1) {
    const section = (usableEnd - usableStart) / count;
    const tx = Math.floor(usableStart + section * (i + 0.42 + random() * 0.22));
    const floorTy = seafloorTileFor(tx);
    const targetY = depthToY(targetDepth());
    const topTy = clamp(Math.floor(targetY / TILE), WATERLINE_TILE + 3, floorTy - 4);
    const halfWidth = Math.round(clamp(
      randomNormal(random, baseHalfWidth, baseHalfWidth * 0.32),
      baseHalfWidth * 0.68,
      baseHalfWidth * 1.85,
    ));
    const crownHalfWidth = Math.max(4, Math.round(halfWidth * clamp(randomNormal(random, 0.4, 0.08), 0.26, 0.56)));
    const shoulderHalfWidth = Math.round(clamp(
      randomNormal(random, halfWidth * 1.72, halfWidth * 0.18),
      halfWidth + 6,
      halfWidth * 2.35,
    ));
    const footingHeight = 4 + Math.floor(random() * 5);

    for (let dx = -shoulderHalfWidth; dx <= shoulderHalfWidth; dx += 1) {
      const columnTx = tx + dx;
      if (columnTx <= 0 || columnTx >= GRID_W - 1) continue;
      const absDx = Math.abs(dx);
      const columnNoise = layeredNoise1D((columnTx + i * 17) * 0.19, 2, BOMMIE_TERRAIN_SEED + tx) * 1.4;
      let columnTop: number;

      if (absDx <= crownHalfWidth) {
        const crownT = absDx / Math.max(1, crownHalfWidth);
        columnTop = Math.round(topTy + smooth01(crownT) * 3 + columnNoise);
      } else if (absDx <= halfWidth) {
        const wallT = (absDx - crownHalfWidth) / Math.max(1, halfWidth - crownHalfWidth);
        columnTop = Math.round(lerp(topTy + 2, floorTy - footingHeight, smooth01(wallT)) + columnNoise);
      } else {
        const shoulderT = (absDx - halfWidth) / Math.max(1, shoulderHalfWidth - halfWidth);
        const shoulderHeight = lerp(footingHeight, 1, smooth01(shoulderT));
        columnTop = Math.round(floorTy - shoulderHeight + columnNoise);
      }

      columnTop = clamp(columnTop, WATERLINE_TILE + 3, floorTy - 1);
      for (let ty = columnTop; ty < GRID_H; ty += 1) {
        solid[ty][columnTx] = true;
        protectedSolid[ty][columnTx] = true;
      }
    }

    const capRadiusX = Math.max(5, Math.floor(crownHalfWidth * 1.25));
    const capRadiusY = Math.max(3, Math.floor(crownHalfWidth * 0.52));
    const capCenterX = tx + Math.floor((random() - 0.5) * halfWidth);
    for (let y = topTy - capRadiusY; y <= topTy + capRadiusY; y += 1) {
      for (let x = capCenterX - capRadiusX; x <= capCenterX + capRadiusX; x += 1) {
        if (x < 0 || x >= GRID_W || y < WATERLINE_TILE + 2 || y >= GRID_H) continue;
        const distance = Math.hypot((x - capCenterX) / capRadiusX, (y - topTy) / capRadiusY);
        if (distance <= 1) {
          solid[y][x] = true;
          protectedSolid[y][x] = true;
        }
      }
    }

    addBommieOverhang(
      solid,
      protectedSolid,
      capCenterX,
      topTy + 1,
      Math.round(halfWidth * 0.86),
      random() > 0.5 ? -1 : 1,
      1.32 + random() * 0.45,
      1 + Math.floor(random() * 2),
    );
    if (halfWidth > 8 && random() > 0.18) {
      addBommieOverhang(
        solid,
        protectedSolid,
        tx,
        topTy + 4 + Math.floor(random() * 5),
        Math.round(halfWidth * 0.78),
        random() > 0.5 ? -1 : 1,
        1.05 + random() * 0.34,
        Math.floor(random() * 2),
      );
    }

    bommies.push({ tx, floorTy, topTy, halfWidth });
  }

  return bommies;
}

function addBommieOverhang(
  solid: boolean[][],
  protectedSolid: boolean[][],
  anchorTx: number,
  anchorTy: number,
  halfWidth: number,
  direction: -1 | 1,
  lengthScale = 1,
  thicknessBonus = 0,
) {
  const length = Math.max(6, Math.floor(halfWidth * lengthScale));
  const thickness = 3 + (halfWidth % 3) + thicknessBonus;
  const startX = anchorTx + direction * Math.max(3, Math.floor(halfWidth * 0.24));

  for (let step = 0; step < length; step += 1) {
    const x = startX + direction * step;
    const top = anchorTy + Math.floor(step / 4) + Math.round(Math.sin(step * 0.55 + anchorTx) * 0.75);
    for (let y = top; y < top + thickness; y += 1) {
      if (x <= 1 || x >= GRID_W - 2 || y <= WATERLINE_TILE + 1 || y >= GRID_H - 2) continue;
      solid[y][x] = true;
      protectedSolid[y][x] = true;
    }
    if (step > length * 0.22 && step < length * 0.88 && step % 3 !== 0) {
      const lipY = top + thickness;
      if (x > 1 && x < GRID_W - 2 && lipY > WATERLINE_TILE + 1 && lipY < GRID_H - 2) {
        solid[lipY][x] = true;
        protectedSolid[lipY][x] = true;
      }
    }
  }

  const supportX = startX - direction;
  for (let sx = supportX - 1; sx <= supportX + 1; sx += 1) {
    for (let y = anchorTy; y < anchorTy + thickness + 4; y += 1) {
      if (sx <= 1 || sx >= GRID_W - 2 || y <= WATERLINE_TILE + 1 || y >= GRID_H - 2) continue;
      solid[y][sx] = true;
      protectedSolid[y][sx] = true;
    }
  }
}

function removeDisconnectedSolids(solid: boolean[][]) {
  const connected = Array.from({ length: GRID_H }, () =>
    Array.from({ length: GRID_W }, () => false),
  );
  const stack: Array<[number, number]> = [];

  for (let x = 0; x < GRID_W; x += 1) {
    for (let y = GRID_H - 1; y >= GRID_H - 4; y -= 1) {
      if (solid[y][x]) {
        connected[y][x] = true;
        stack.push([x, y]);
      }
    }
  }

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    const neighbors: Array<[number, number]> = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
      if (!solid[ny][nx] || connected[ny][nx]) continue;
      connected[ny][nx] = true;
      stack.push([nx, ny]);
    }
  }

  for (let y = 0; y < GRID_H; y += 1) {
    for (let x = 0; x < GRID_W; x += 1) {
      solid[y][x] = solid[y][x] && connected[y][x];
    }
  }
}

function seafloorTileFor(tx: number) {
  const column = Math.round(clamp(tx, 0, GRID_W - 1));
  const cached = seafloorTileCache[column];
  if (cached !== undefined) return cached;
  const x = column * TILE;
  const floorY = depthToY(maxDepthAtX(x));
  const maxFloorTile = GRID_H - depthMetersToTiles(CAVE_VERTICAL_EXTENT_METERS) - 6;
  const floorTile = Math.round(clamp(floorY / TILE, WATERLINE_TILE + 2, maxFloorTile));
  seafloorTileCache[column] = floorTile;
  return floorTile;
}

function caveBottomTileFor(tx: number) {
  const column = Math.round(clamp(tx, 0, GRID_W - 1));
  const cached = caveBottomTileCache[column];
  if (cached !== undefined) return cached;
  const bottomTile = clamp(
    seafloorTileFor(column) + depthMetersToTiles(CAVE_VERTICAL_EXTENT_METERS),
    WATERLINE_TILE + 5,
    GRID_H - 6,
  );
  caveBottomTileCache[column] = bottomTile;
  return bottomTile;
}

function isWithinCaveBand(tx: number, ty: number) {
  return ty >= seafloorTileFor(tx) + 2 && ty <= caveBottomTileFor(tx);
}

function isCavePathTile(tx: number, ty: number) {
  return (
    tx > 1 &&
    tx < GRID_W - 2 &&
    ty >= seafloorTileFor(tx) + 2 &&
    ty <= caveBottomTileFor(tx) + 2
  );
}

function depthToY(depthMeters: number) {
  return WATERLINE_Y + depthMeters * DEPTH_PIXELS_PER_METER;
}

function yToDepth(y: number) {
  return (y - WATERLINE_Y) / DEPTH_PIXELS_PER_METER;
}

function depthMetersToTiles(depthMeters: number) {
  return Math.round((depthMeters * DEPTH_PIXELS_PER_METER) / TILE);
}

function countSolidNeighbors(solid: boolean[][], x: number, y: number) {
  let count = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      if (solid[y + dy]?.[x + dx]) count += 1;
    }
  }
  return count;
}

function countOpenNeighbors(open: boolean[][], x: number, y: number) {
  let count = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      if (open[y + dy]?.[x + dx]) count += 1;
    }
  }
  return count;
}

function countOpenNeighborsFromSolid(solid: boolean[][], x: number, y: number) {
  let count = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      if (solid[y + dy]?.[x + dx] === false) count += 1;
    }
  }
  return count;
}

function carveWorm(
  solid: boolean[][],
  startTx: number,
  endTx: number,
  startTy: number,
  random: () => number,
  radius: number,
  wander: number,
) {
  let y = startTy;
  for (let x = startTx; x <= endTx; x += 1) {
    y += (random() - 0.5) * wander;
    const wave = Math.sin(x * 0.18) * 2.5;
    carveCircle(solid, x, Math.round(y + wave), radius);
  }
}

function carveCircle(solid: boolean[][], cx: number, cy: number, radius: number) {
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      const distance = Math.hypot(x - cx, y - cy);
      if (distance <= radius && solid[y]?.[x] !== undefined) {
        solid[y][x] = false;
      }
    }
  }
}

function generateDecorations(solid: boolean[][], random: () => number) {
  const decorations: Decoration[] = [];
  const deep = ZONES[2];
  const startTx = Math.floor(deep.startX / TILE) + 4;
  const endTx = GRID_W - 4;
  const targetCount = 220;

  for (let attempt = 0; attempt < 1800 && decorations.length < targetCount; attempt += 1) {
    const tx = startTx + Math.floor(random() * Math.max(1, endTx - startTx));
    const floorTy = seafloorTileFor(tx);
    const ty = clamp(floorTy, WATERLINE_TILE + 2, GRID_H - 4);
    if (solid[ty][tx] || !solid[ty + 1]?.[tx]) continue;
    const zone = zoneAtX(tx * TILE);
    const kind = random() > 0.5 ? "vent" : "sparkle";
    decorations.push({
      x: tx * TILE + 16,
      y: ty * TILE + 22,
      zoneId: zone.id,
      kind,
      tint: pickTint(zone, kind, random),
    });
  }
  return decorations;
}

function generateCreatures(solid: boolean[][], random: () => number) {
  const creatures: CreatureSpawn[] = [];
  addHabitatCreatures(creatures, solid, random, "smooth-sting-ray", 3, beachAreaBounds(), (tx, ty) => {
    return isOpenWaterTile(solid, tx, ty) && ty < seafloorTileFor(tx) - 4;
  });
  addHabitatCreatures(creatures, solid, random, "seadragon", 3, coralGardenBounds(), (tx, ty) => {
    return isOpenWaterTile(solid, tx, ty) && ty < seafloorTileFor(tx) - 3;
  });
  addHabitatCreatures(creatures, solid, random, "nudhhi", 3, coralGardenBounds(), (tx, ty) => {
    return isFloorTile(solid, tx, ty);
  });
  addHabitatCreatures(creatures, solid, random, "crayfish", 3, fullOceanBounds(), (tx, ty) => {
    return !solid[ty][tx] && isCaveTile(solid, tx, ty);
  });
  addHabitatCreatures(creatures, solid, random, "blue-devil", 3, bommieAndLedgeBounds(), (tx, ty) => {
    return !solid[ty][tx] && (isUnderLedgeTile(solid, tx, ty) || isBommieTopTile(solid, tx, ty));
  });
  return creatures;
}

function addHabitatCreatures(
  creatures: CreatureSpawn[],
  solid: boolean[][],
  random: () => number,
  assetKey: CreatureKey,
  count: number,
  bounds: { startTx: number; endTx: number; minTy: number; maxTy: number },
  predicate: (tx: number, ty: number) => boolean,
) {
  const used = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    const spawn = findSpawnTile(solid, random, bounds, (tx, ty) => {
      return !used.has(tileKey(tx, ty)) && predicate(tx, ty);
    });
    if (!spawn) continue;
    used.add(tileKey(spawn.tx, spawn.ty));
    creatures.push(makeCreatureSpawn(spawn.tx, spawn.ty, zoneAtX(spawn.tx * TILE), assetKey, random));
  }
}

function beachAreaBounds() {
  return {
    startTx: Math.floor((BEACH_END_X + 140) / TILE),
    endTx: Math.floor((BEACH_END_X + 1360) / TILE),
    minTy: WATERLINE_TILE + 2,
    maxTy: Math.floor(GRID_H * 0.52),
  };
}

function coralGardenBounds() {
  return {
    startTx: Math.floor((BEACH_END_X + 540) / TILE),
    endTx: Math.floor((ZONES[0].endX - 160) / TILE),
    minTy: WATERLINE_TILE + 3,
    maxTy: Math.floor(GRID_H * 0.72),
  };
}

function fullOceanBounds() {
  return {
    startTx: Math.floor((BEACH_END_X + 360) / TILE),
    endTx: GRID_W - 8,
    minTy: WATERLINE_TILE + 4,
    maxTy: GRID_H - 6,
  };
}

function bommieAndLedgeBounds() {
  return {
    startTx: Math.floor((BEACH_END_X + 1700) / TILE),
    endTx: GRID_W - 12,
    minTy: WATERLINE_TILE + 3,
    maxTy: GRID_H - 6,
  };
}

function findSpawnTile(
  solid: boolean[][],
  random: () => number,
  bounds: { startTx: number; endTx: number; minTy: number; maxTy: number },
  predicate: (tx: number, ty: number) => boolean,
) {
  const startTx = clamp(bounds.startTx, 1, GRID_W - 2);
  const endTx = clamp(bounds.endTx, startTx + 1, GRID_W - 1);
  const minTy = clamp(bounds.minTy, WATERLINE_TILE + 1, GRID_H - 3);
  const maxTy = clamp(bounds.maxTy, minTy + 1, GRID_H - 2);

  for (let attempt = 0; attempt < 420; attempt += 1) {
    const tx = startTx + Math.floor(random() * (endTx - startTx));
    const ty = minTy + Math.floor(random() * (maxTy - minTy));
    if (predicate(tx, ty)) return { tx, ty };
  }

  for (let tx = startTx; tx < endTx; tx += 1) {
    for (let ty = minTy; ty < maxTy; ty += 1) {
      if (predicate(tx, ty)) return { tx, ty };
    }
  }

  return null;
}

function makeCreatureSpawn(
  tx: number,
  ty: number,
  zone: OceanZone,
  assetKey: CreatureKey,
  random: () => number,
): CreatureSpawn {
  return {
    x: tx * TILE + 16,
    y: ty * TILE + 16,
    assetKey,
    drift: 12 + random() * 34,
    scale:
      assetKey === "crayfish" || assetKey === "nudhhi"
        ? 0.36 + random() * 0.32
        : 0.42 + random() * 0.5,
    zoneId: zone.id,
  };
}

function isCaveTile(solid: boolean[][], tx: number, ty: number) {
  return ty > seafloorTileFor(tx) + 2 && countSolidNeighbors(solid, tx, ty) >= 3;
}

function isOpenWaterTile(solid: boolean[][], tx: number, ty: number) {
  return !solid[ty][tx] && !isCaveTile(solid, tx, ty) && !isFloorTile(solid, tx, ty);
}

function isFloorTile(solid: boolean[][], tx: number, ty: number) {
  return Boolean(!solid[ty][tx] && solid[ty + 1]?.[tx]);
}

function isUnderLedgeTile(solid: boolean[][], tx: number, ty: number) {
  return Boolean(!solid[ty][tx] && solid[ty - 1]?.[tx] && !solid[ty + 1]?.[tx]);
}

function isBommieTopTile(solid: boolean[][], tx: number, ty: number) {
  const floorTy = seafloorTileFor(tx);
  return isFloorTile(solid, tx, ty) && ty < floorTy - 4;
}

function pickTint(
  zone: OceanZone,
  kind: Decoration["kind"],
  random: () => number,
) {
  if (kind === "vent") return 0x425067;
  return zone.accentColor;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

function smooth01(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function randomNormal(random: () => number, mean: number, standardDeviation: number) {
  let u = random();
  let v = random();
  if (u <= 0) u = 0.000001;
  if (v <= 0) v = 0.000001;
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * standardDeviation;
}

function layeredNoise1D(value: number, octaves: number, seed: number) {
  let frequency = 1;
  let amplitude = 1;
  let sum = 0;
  let normalization = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += valueNoise1D(value * frequency, seed + octave * 1013) * amplitude;
    normalization += amplitude;
    frequency *= 2;
    amplitude *= 0.5;
  }
  return normalization === 0 ? 0 : sum / normalization;
}

function layeredNoise2D(x: number, y: number, octaves: number, seed: number) {
  let frequency = 1;
  let amplitude = 1;
  let sum = 0;
  let normalization = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += valueNoise2D(x * frequency, y * frequency, seed + octave * 1307) * amplitude;
    normalization += amplitude;
    frequency *= 2;
    amplitude *= 0.52;
  }
  return normalization === 0 ? 0 : sum / normalization;
}

function valueNoise1D(value: number, seed: number) {
  const x0 = Math.floor(value);
  const x1 = x0 + 1;
  const t = smooth01(value - x0);
  return lerp(hashNoise1D(x0, seed), hashNoise1D(x1, seed), t) * 2 - 1;
}

function valueNoise2D(x: number, y: number, seed: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const tx = smooth01(x - x0);
  const ty = smooth01(y - y0);
  const top = lerp(hashNoise2D(x0, y0, seed), hashNoise2D(x1, y0, seed), tx);
  const bottom = lerp(hashNoise2D(x0, y1, seed), hashNoise2D(x1, y1, seed), tx);
  return lerp(top, bottom, ty) * 2 - 1;
}

function hashNoise1D(x: number, seed: number) {
  let n = Math.imul(x ^ seed, 0x27d4eb2d);
  n ^= n >>> 15;
  n = Math.imul(n, 0x85ebca6b);
  n ^= n >>> 13;
  return ((n >>> 0) % 10000) / 9999;
}

function hashNoise2D(x: number, y: number, seed: number) {
  let n = Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x9e3779b1) ^ seed;
  n ^= n >>> 16;
  n = Math.imul(n, 0x7feb352d);
  n ^= n >>> 15;
  n = Math.imul(n, 0x846ca68b);
  n ^= n >>> 16;
  return ((n >>> 0) % 10000) / 9999;
}
