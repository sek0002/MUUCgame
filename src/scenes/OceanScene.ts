import Phaser from "phaser";
import { CREATURES, NPC_CREATURES, assetUrl } from "../assets/manifest";
import {
  Decoration,
  CreatureKey,
  OceanZone,
  BEACH_END_X,
  CAVE_ZONE,
  DEFAULT_CAVE_SEED,
  TILE,
  WATERLINE_Y,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  WORLD_MAX_DEPTH_METERS,
  depthAtPosition,
  generateWorld,
  maxDepthAtX,
  seafloorYAtX,
  tileKey,
  zoneAtPosition,
} from "../sim/world";

type KeySet = Record<"left" | "right" | "up" | "down", Phaser.Input.Keyboard.Key>;
type DevCameraTools = {
  root: HTMLElement;
  toggle: HTMLButtonElement;
  zoomIn: HTMLButtonElement;
  zoomOut: HTMLButtonElement;
  fit: HTMLButtonElement;
  player: HTMLButtonElement;
  xRange: HTMLInputElement;
  yRange: HTMLInputElement;
  seedInput: HTMLInputElement;
  seedApply: HTMLButtonElement;
  seedRandom: HTMLButtonElement;
  readout: HTMLOutputElement;
};

const BEACH_SHELF_START_X = BEACH_END_X * 0.7;
const BEACH_SHELF_END_X = BEACH_END_X + 1500;
const SAND_VISUAL_RAISE = 24;
const SURFACE_REST_Y = WATERLINE_Y + 24;
const SURFACE_BREACH_SPEED = -260;
const SURFACE_BREACH_MAX_VELOCITY = -180;
const SURFACE_JUMP_VELOCITY = -420;
const AIR_GRAVITY = 980;
const DEPTH_GAUGE_MAX = WORLD_MAX_DEPTH_METERS;

export class OceanScene extends Phaser.Scene {
  private hero!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: KeySet;
  private rocks!: Phaser.Physics.Arcade.StaticGroup;
  private zoneLabel?: HTMLElement | null;
  private depthLabel?: HTMLElement | null;
  private depthGaugeFill?: HTMLElement | null;
  private depthGaugeMax?: HTMLElement | null;
  private depthMarker?: HTMLElement | null;
  private lightingOverlay!: Phaser.GameObjects.Graphics;
  private caveTileLayer?: Phaser.GameObjects.Graphics;
  private caveBiomeCurtain?: Phaser.GameObjects.Rectangle;
  private skyClouds: Array<{ container: Phaser.GameObjects.Container; speed: number; width: number }> = [];
  private currentZoneId = "";
  private heroDirectionX: -1 | 1 = 1;
  private isSurfaceJumping = false;
  private lastJumpPressed = false;
  private devCameraTools?: DevCameraTools;
  private devCameraEnabled = false;
  private devCameraDragging = false;
  private caveSeed = DEFAULT_CAVE_SEED;
  private caveTiles = new Set<string>();
  private devCameraDragStart?: {
    pointerX: number;
    pointerY: number;
    scrollX: number;
    scrollY: number;
  };

  constructor() {
    super("OceanScene");
  }

  init(data: { caveSeed?: number }) {
    const seed = Number(data?.caveSeed);
    this.caveSeed = Number.isFinite(seed) ? Math.max(0, Math.floor(seed)) : DEFAULT_CAVE_SEED;
  }

  preload() {
    this.load.svg(CREATURES.hero.key, CREATURES.hero.url, {
      width: 128,
      height: 64,
    });

    for (const creature of NPC_CREATURES.filter((creature) => creature.url.endsWith(".svg"))) {
      this.load.svg(creature.key, creature.url, { width: 96, height: 96 });
    }
    for (const creature of NPC_CREATURES.filter((creature) => !creature.url.endsWith(".svg"))) {
      this.load.image(creature.key, creature.url);
    }
    this.load.image("shipwreck", assetUrl("/assets/landscape/shipwreck.png"));
    this.load.image("beach-house-only", assetUrl("/assets/landscape/beach-house-only.png"));
  }

  create() {
    const world = generateWorld(this.caveSeed);
    this.caveTiles = world.caveTiles;
    this.zoneLabel = document.getElementById("zone-label");
    this.depthLabel = document.getElementById("depth-label");
    this.depthGaugeFill = document.getElementById("depth-gauge-fill");
    this.depthGaugeMax = document.getElementById("depth-gauge-max");
    this.depthMarker = document.getElementById("depth-marker");

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this.createBackground(world.zones);
    this.createBeach();
    this.createWaterSurface();
    this.createRocks(world.rocks, world.caveTiles);
    this.createDecorations(world.decorations);
    this.createCreatures(world.creatures);
    this.createDeepShipwreck();
    this.createHero();
    this.createControls();
    this.createDeveloperTools();
    this.createLightingOverlay();

    this.physics.add.collider(this.hero, this.rocks);
    this.cameras.main.startFollow(this.hero, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(160, 96);
    this.cameras.main.fadeIn(450, 5, 20, 31);
  }

  update(time: number, delta: number) {
    this.updateDeveloperCamera(delta);
    this.handleInput();
    this.updateSurfacePhysics(time);
    this.updateHeroPresentation();
    this.updateParallax(delta);
    this.updateCaveVisibility();
    this.updateHud();
    this.updateLighting();
  }

  private createBackground(zones: OceanZone[]) {
    const skyBandHeight = 8;
    for (let y = 0; y < WATERLINE_Y; y += skyBandHeight) {
      const t = this.smooth01(y / WATERLINE_Y);
      const color = t < 0.62
        ? this.mixHexColor(0x45c4ef, 0xcdf7ef, t / 0.62)
        : this.mixHexColor(0xcdf7ef, 0xfff5cf, (t - 0.62) / 0.38);
      this.add
        .rectangle(0, y, WORLD_WIDTH, skyBandHeight + 1, color)
        .setOrigin(0)
        .setDepth(-80);
    }

    this.createSkyClouds();
    const bandHeight = 24;
    for (let y = WATERLINE_Y; y < WORLD_HEIGHT; y += bandHeight) {
      const color = this.depthColorAtY(y + bandHeight / 2);
      this.add
        .rectangle(0, y, WORLD_WIDTH, bandHeight + 1, color)
        .setOrigin(0)
        .setDepth(-60)
        .setAlpha(0.98);
    }

    for (let row = 0; row < 4; row += 1) {
      const y = WATERLINE_Y + 170 + row * 275;
      const bandColor = row < 2 ? 0x75eff4 : 0x075f9b;
      for (let i = 0; i < 170; i += 1) {
        const x = ((i * 73 + row * 131) % WORLD_WIDTH);
        const blockSize = 8 + ((i + row) % 3) * 6;
        if ((i + row * 3) % 4 !== 0) {
          this.add
            .rectangle(
              x,
              y + ((i * 19) % 58),
              blockSize,
              blockSize,
              bandColor,
              row < 2 ? 0.18 : 0.14,
            )
            .setDepth(-57);
        }
      }
    }

    for (let i = 0; i < 174; i += 1) {
      const x = (i * 181) % WORLD_WIDTH;
      const y = 120 + ((i * 211) % (WORLD_HEIGHT - 260));
      const size = y > WATERLINE_Y + 900 ? 2 : 3;
      this.add
        .rectangle(x, y, size, size, this.depthAccentColorAtY(y), y > WATERLINE_Y + 900 ? 0.3 : 0.2)
        .setDepth(-42);
    }

    this.createCurrentLines();
  }

  private createSkyClouds() {
    const largeSpacing = 1650;
    const largeCount = Math.ceil(WORLD_WIDTH / largeSpacing);
    for (let i = 0; i < largeCount; i += 1) {
      const segmentStart = i * largeSpacing;
      const segmentEnd = Math.min(WORLD_WIDTH, segmentStart + largeSpacing);
      const x = Phaser.Math.Clamp(
        segmentStart + largeSpacing * 0.36 + Math.sin(i * 1.73) * 230,
        segmentStart + 180,
        Math.max(segmentStart + 180, segmentEnd - 260),
      );
      const y = 32 + (i % 5) * 7 + Math.sin(i * 0.61) * 6;
      const scale = 1.05 + (i % 4) * 0.14 + ((i * 17) % 5) * 0.025;
      const container = this.drawLargePixelCloud(x, y, scale);
      this.skyClouds.push({ container, speed: 3.4 + (i % 5) * 0.75, width: 360 * scale });
    }

    const smallSpacing = 520;
    const smallCount = Math.ceil(WORLD_WIDTH / smallSpacing);
    for (let i = 0; i < smallCount; i += 1) {
      const segmentStart = i * smallSpacing;
      const segmentEnd = Math.min(WORLD_WIDTH, segmentStart + smallSpacing);
      const x = Phaser.Math.Clamp(
        segmentStart + 76 + ((i * 137) % 330),
        segmentStart + 48,
        Math.max(segmentStart + 48, segmentEnd - 88),
      );
      const y = 18 + (i % 6) * 12 + Math.sin(i * 0.94) * 4;
      const scale = 0.68 + (i % 5) * 0.12;
      const container = this.drawSmallPixelCloud(x, y, scale);
      this.skyClouds.push({ container, speed: 6.2 + (i % 7) * 0.85, width: 140 * scale });
    }
  }

  private drawLargePixelCloud(x: number, y: number, scale: number) {
    const cloud = this.add.container(x, y).setDepth(-78);
    const block = 10 * scale;
    const pieces = [
      [-10, 3, 8, 2],
      [-7, 1, 5, 2],
      [-4, -1, 5, 3],
      [-1, -3, 4, 4],
      [2, -1, 7, 3],
      [6, 1, 6, 2],
      [10, 3, 5, 2],
      [-12, 5, 27, 2],
      [-8, 7, 17, 1],
    ];
    const shadowPieces = [
      [-9, 5, 8, 1],
      [2, 3, 7, 1],
      [8, 5, 5, 1],
    ];

    for (const [px, py, w, h] of pieces) {
      cloud.add(
        this.add
          .rectangle(px * block, py * block, w * block, h * block, 0xffffff, 0.94)
          .setOrigin(0),
      );
    }
    for (const [px, py, w, h] of shadowPieces) {
      cloud.add(
        this.add
          .rectangle(px * block, py * block, w * block, h * block, 0x9fe7ed, 0.48)
          .setOrigin(0),
      );
    }
    return cloud;
  }

  private drawSmallPixelCloud(x: number, y: number, scale: number) {
    const cloud = this.add.container(x, y).setDepth(-78);
    const block = 8 * scale;
    const pieces = [
      [0, 2, 8, 1],
      [2, 0, 3, 2],
      [5, 1, 5, 2],
      [9, 2, 4, 1],
    ];
    for (const [px, py, w, h] of pieces) {
      cloud.add(
        this.add
          .rectangle(px * block, py * block, w * block, h * block, 0xffffff, 0.86)
          .setOrigin(0),
      );
    }
    cloud.add(
      this.add
        .rectangle(5 * block, 3 * block, 7 * block, block, 0xa7eaf0, 0.42)
        .setOrigin(0),
    );
    return cloud;
  }

  private depthColorAtY(y: number) {
    const t = this.smooth01((y - WATERLINE_Y) / (WORLD_HEIGHT - WATERLINE_Y));
    if (t < 0.28) return this.mixHexColor(0x78f3ef, 0x25c8ed, t / 0.28);
    if (t < 0.58) return this.mixHexColor(0x25c8ed, 0x049de3, (t - 0.28) / 0.3);
    return this.mixHexColor(0x049de3, 0x075f9b, (t - 0.58) / 0.42);
  }

  private depthAccentColorAtY(y: number) {
    const t = this.smooth01((y - WATERLINE_Y) / (WORLD_HEIGHT - WATERLINE_Y));
    if (t < 0.32) return this.mixHexColor(0xc7fff8, 0x66e3f1, t / 0.32);
    if (t < 0.66) return this.mixHexColor(0x66e3f1, 0x1598d5, (t - 0.32) / 0.34);
    return this.mixHexColor(0x1598d5, 0x073f78, (t - 0.66) / 0.34);
  }

  private depthRockColorAtY(y: number) {
    const t = this.smooth01((y - WATERLINE_Y) / (WORLD_HEIGHT - WATERLINE_Y));
    if (t < 0.45) return this.mixHexColor(0xd4b06e, 0x9a7b52, t / 0.45);
    return this.mixHexColor(0x9a7b52, 0x3d3428, (t - 0.45) / 0.55);
  }

  private terrainFillColorAtY(y: number) {
    const t = this.smooth01((y - WATERLINE_Y) / (WORLD_HEIGHT - WATERLINE_Y));
    if (t < 0.38) return this.mixHexColor(0xd9bc78, 0xa88a5a, t / 0.38);
    if (t < 0.74) return this.mixHexColor(0xa88a5a, 0x6f6048, (t - 0.38) / 0.36);
    return this.mixHexColor(0x6f6048, 0x332d25, (t - 0.74) / 0.26);
  }

  private smooth01(value: number) {
    const t = Phaser.Math.Clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }

  private mixHexColor(from: number, to: number, t: number) {
    const start = Phaser.Display.Color.ValueToColor(from);
    const end = Phaser.Display.Color.ValueToColor(to);
    return Phaser.Display.Color.GetColor(
      Phaser.Math.Linear(start.red, end.red, t),
      Phaser.Math.Linear(start.green, end.green, t),
      Phaser.Math.Linear(start.blue, end.blue, t),
    );
  }

  private drawQuadratic(
    graphics: Phaser.GameObjects.Graphics,
    fromX: number,
    fromY: number,
    controlX: number,
    controlY: number,
    toX: number,
    toY: number,
    segments = 6,
  ) {
    for (let i = 1; i <= segments; i += 1) {
      const t = i / segments;
      const inverse = 1 - t;
      graphics.lineTo(
        inverse * inverse * fromX + 2 * inverse * t * controlX + t * t * toX,
        inverse * inverse * fromY + 2 * inverse * t * controlY + t * t * toY,
      );
    }
  }

  private createBeach() {
    const sand = this.add.graphics().setDepth(-4);
    const shelfPoints = [
      new Phaser.Geom.Point(0, 42),
      new Phaser.Geom.Point(BEACH_END_X * 0.22, 70),
      new Phaser.Geom.Point(BEACH_END_X * 0.5, WATERLINE_Y + 22),
    ];
    for (let x = BEACH_SHELF_START_X; x <= BEACH_SHELF_END_X; x += 32) {
      const beachY = this.beachSandVisualYAt(x);
      shelfPoints.push(new Phaser.Geom.Point(x, beachY));
    }
    shelfPoints.push(new Phaser.Geom.Point(BEACH_SHELF_END_X + 260, WORLD_HEIGHT));
    shelfPoints.push(new Phaser.Geom.Point(0, WORLD_HEIGHT));

    sand.fillStyle(0xf4ce63, 1);
    sand.fillPoints(shelfPoints, true);
    this.drawBeachSandTexture(sand);
    this.createBeachHousePier();
    this.createBeachWaterInterface();
    this.createBeachToCoralBlend();
    this.createBeachToBrownBlend();

    sand.fillStyle(0xd8aa48, 0.45);
    for (let i = 0; i < 34; i += 1) {
      const x = 28 + ((i * 47) % (BEACH_END_X - 70));
      const y = WATERLINE_Y + 16 + ((i * 83) % 520);
      sand.fillRect(x, y, 18 + (i % 4) * 9, 3);
    }

    for (let i = 0; i < 9; i += 1) {
      const wave = this.add
        .rectangle(
          120 + i * 82,
          WATERLINE_Y + 42 + i * 13,
          82 - i * 3,
          4,
          0xe8fff8,
          0.72,
        )
        .setOrigin(0.5)
        .setDepth(-25)
        .setAngle(12 + i * 2);

      this.tweens.add({
        targets: wave,
        x: wave.x - 44,
        y: wave.y - 18,
        alpha: { from: 0.74, to: 0.08 },
        scaleX: { from: 0.76, to: 1.28 },
        duration: 1450 + i * 95,
        delay: i * 160,
        repeat: -1,
        ease: "Sine.out",
      });
    }
  }

  private createSandFloorBackdrop() {
    const sand = this.add.graphics().setDepth(-5);
    const topPoints: Phaser.Geom.Point[] = [];
    const bottomPoints: Phaser.Geom.Point[] = [];
    const step = 24;

    for (let x = BEACH_END_X; x <= WORLD_WIDTH; x += step) {
      const top = this.sandBackdropTopYAt(x);
      const depthT = this.smooth01((top - WATERLINE_Y) / (WORLD_HEIGHT - WATERLINE_Y));
      const thickness = Phaser.Math.Linear(42, 92, depthT) + Math.sin(x * 0.004) * 8;
      topPoints.push(new Phaser.Geom.Point(x, top));
      bottomPoints.unshift(new Phaser.Geom.Point(x, Math.min(top + thickness, WORLD_HEIGHT - 8)));
    }

    sand.fillStyle(0xf5d66f, 0.86);
    sand.fillPoints([...topPoints, ...bottomPoints], true);

    for (let i = 0; i < 1500; i += 1) {
      const x = BEACH_END_X + ((i * 263) % Math.max(1, WORLD_WIDTH - BEACH_END_X));
      const floorY = this.sandBackdropTopYAt(x);
      const depthT = this.smooth01((floorY - WATERLINE_Y) / (WORLD_HEIGHT - WATERLINE_Y));
      const bandHeight = Phaser.Math.Linear(38, 86, depthT);
      const y = floorY + 10 + ((i * 43) % Math.floor(bandHeight));
      if (y > WORLD_HEIGHT - 8) continue;
      const color = i % 5 === 0
        ? this.mixHexColor(0xffffff, 0xb69265, depthT)
        : i % 3 === 0
          ? this.mixHexColor(0xe8a66d, 0x756554, depthT)
          : this.mixHexColor(0xf4c777, 0x8c765a, depthT);
      sand.fillStyle(color, Phaser.Math.Linear(0.34, 0.13, depthT));
      sand.fillRect(x, y, 2 + (i % 2), 2 + ((i + 1) % 2));
    }

    for (let i = 0; i < 260; i += 1) {
      const x = BEACH_END_X + ((i * 997) % Math.max(1, WORLD_WIDTH - BEACH_END_X));
      const floorY = this.sandBackdropTopYAt(x);
      const depthT = this.smooth01((floorY - WATERLINE_Y) / (WORLD_HEIGHT - WATERLINE_Y));
      const y = floorY + 18 + ((i * 31) % Math.floor(Phaser.Math.Linear(28, 74, depthT)));
      if (y > WORLD_HEIGHT - 8) continue;
      sand.fillStyle(this.mixHexColor(0xe7a66f, 0x756554, depthT), Phaser.Math.Linear(0.18, 0.08, depthT));
      for (let dot = 0; dot < 5; dot += 1) {
        sand.fillRect(x + dot * 5, y + Math.sin(dot + i) * 4, 2, 2);
      }
    }
  }

  private drawBeachSandTexture(sand: Phaser.GameObjects.Graphics) {
    for (let i = 0; i < 620; i += 1) {
      const x = (i * 37) % Math.floor(BEACH_SHELF_END_X + 120);
      const beachY = this.beachSandVisualYAt(x);
      const y = beachY + 16 + ((i * 53) % 560);
      if (y > WORLD_HEIGHT - 10) continue;
      const color = i % 6 === 0 ? 0xfff5be : i % 3 === 0 ? 0xd69555 : 0xefbd71;
      const alpha = i % 6 === 0 ? 0.5 : 0.32;
      sand.fillStyle(color, alpha);
      sand.fillRect(x, y, 2 + (i % 3), 2 + ((i + 1) % 2));
    }

    for (let i = 0; i < 120; i += 1) {
      const x = (i * 71) % Math.floor(BEACH_SHELF_END_X + 80);
      const beachY = this.beachSandVisualYAt(x);
      const y = beachY + 38 + ((i * 29) % 360);
      if (y > WORLD_HEIGHT - 10) continue;
      sand.fillStyle(0xe6a866, 0.2);
      for (let dot = 0; dot < 4; dot += 1) {
        sand.fillRect(x + dot * 5, y + Math.sin(dot * 1.7 + i) * 3, 2, 2);
      }
    }
  }

  private sandBackdropTopYAt(x: number) {
    const mergeStart = BEACH_END_X + 180;
    const mergeEnd = BEACH_SHELF_END_X + 520;
    const seafloor = this.smoothSeafloorYAt(x) - 8 + Math.sin(x * 0.006) * 2;
    if (x <= mergeStart) return Phaser.Math.Clamp(this.beachSandVisualYAt(x), WATERLINE_Y + 34, WORLD_HEIGHT - 88);
    if (x >= mergeEnd) return Phaser.Math.Clamp(seafloor, WATERLINE_Y + 34, WORLD_HEIGHT - 88);

    const t = this.smooth01((x - mergeStart) / (mergeEnd - mergeStart));
    const beachY = this.beachSandVisualYAt(x);
    return Phaser.Math.Clamp(Phaser.Math.Linear(beachY, seafloor, t), WATERLINE_Y + 34, WORLD_HEIGHT - 88);
  }

  private beachSandVisualYAt(x: number) {
    return this.beachShelfYAt(x) - SAND_VISUAL_RAISE;
  }

  private smoothSeafloorYAt(x: number) {
    return Phaser.Math.Clamp(seafloorYAtX(x), WATERLINE_Y + TILE * 2, WORLD_HEIGHT - TILE * 4);
  }

  private createBeachHousePier() {
    this.add
      .image(BEACH_END_X * 0.72, WATERLINE_Y + 78, "beach-house-only")
      .setOrigin(0.25, 1)
      .setScale(0.725)
      .setDepth(-35)
      .setAlpha(0.95);
  }

  private createBeachWaterInterface() {
    const surf = this.add.graphics().setDepth(-24);
    const startX = 0;
    const endX = Math.min(BEACH_SHELF_END_X + 220, 2700);

    surf.fillStyle(0x77d7dc, 0.42);
    const washPoints = [new Phaser.Geom.Point(startX, WATERLINE_Y - 6)];
    for (let x = startX; x <= endX; x += 54) {
      const shelfY = this.beachShelfYAt(x);
      const edgeY = Phaser.Math.Linear(WATERLINE_Y + 8, shelfY - 18, this.smooth01(x / endX));
      washPoints.push(new Phaser.Geom.Point(x, edgeY + Math.sin(x * 0.014) * 5));
    }
    washPoints.push(new Phaser.Geom.Point(endX, WATERLINE_Y - 8));
    surf.fillPoints(washPoints, true);

    for (let i = 0; i < 44; i += 1) {
      const x = 24 + i * 54;
      if (x > endX) break;
      const edgeY = Phaser.Math.Linear(
        WATERLINE_Y + 16,
        this.beachShelfYAt(x) - 24,
        this.smooth01(x / endX),
      );
      surf.fillStyle(i % 3 === 0 ? 0xffffff : 0xcffff5, i % 3 === 0 ? 0.58 : 0.34);
      surf.fillRect(x, edgeY + Math.sin(i) * 9, 20 + (i % 4) * 10, 3);
    }
  }

  private createBeachToCoralBlend() {
    const blend = this.add.graphics().setDepth(-4);
    const endX = BEACH_SHELF_END_X + 720;
    const bandDepths = [0, 30, 68, 116, 176, 248];
    const bandColors = [0xbcefc2, 0x9ee5bd, 0x7edbc3, 0x5cd0cb, 0x35c2d4];
    const bandAlphas = [0.28, 0.24, 0.19, 0.14, 0.09];

    for (let band = 0; band < bandColors.length; band += 1) {
      const points: Phaser.Geom.Point[] = [];
      for (let x = 0; x <= endX; x += 18) {
        points.push(new Phaser.Geom.Point(x, this.sandBlendEdgeYAt(x) + bandDepths[band]));
      }
      for (let x = endX; x >= 0; x -= 18) {
        points.push(new Phaser.Geom.Point(x, this.sandBlendEdgeYAt(x) + bandDepths[band + 1]));
      }
      blend.fillStyle(bandColors[band], bandAlphas[band]);
      blend.fillPoints(points, true);
    }

    for (let i = 0; i < 170; i += 1) {
      const x = (i * 43) % endX;
      const y = this.sandBlendEdgeYAt(x) + 24 + ((i * 37) % 190);
      blend.fillStyle(i % 4 === 0 ? 0xeaf3b1 : 0x8ee6d1, i % 4 === 0 ? 0.18 : 0.12);
      blend.fillRect(x, y, 2 + (i % 2), 2);
    }
  }

  private createBeachToBrownBlend() {
    const transition = this.add.graphics().setDepth(-3);
    const startX = BEACH_END_X + 60;
    const endX = BEACH_END_X + 960;
    const bridgeHeight = 84;
    const columnWidth = 24;

    for (let x = startX; x <= endX; x += columnWidth) {
      const beachY = this.sandBackdropTopYAt(x);
      const topY = Phaser.Math.Clamp(beachY - 2, WATERLINE_Y + 36, WORLD_HEIGHT - 88);
      const baseY = Phaser.Math.Clamp(topY + bridgeHeight, topY + 20, WORLD_HEIGHT - 2);
      const depthT = this.smooth01((topY - WATERLINE_Y) / (WORLD_HEIGHT - WATERLINE_Y));
      const startColor = this.mixHexColor(0xf4ce63, 0xe2b35f, depthT);
      const endColor = this.terrainFillColorAtY(baseY);

      transition.fillGradientStyle(
        startColor,
        startColor,
        endColor,
        endColor,
        0.58,
        0.58,
        0.02,
        0.02,
      );
      transition.fillRect(x, topY, columnWidth, baseY - topY);
    }
  }

  private sandBlendEdgeYAt(x: number) {
    const beachEdge = this.beachShelfYAt(x);
    const backdropEdge = this.sandBackdropTopYAt(x);
    const t = this.smooth01((x - BEACH_END_X) / (BEACH_SHELF_END_X + 520 - BEACH_END_X));
    return Phaser.Math.Linear(beachEdge, backdropEdge, t);
  }

  private beachShelfYAt(x: number) {
    if (x < BEACH_SHELF_START_X) {
      const t = this.smooth01(x / BEACH_SHELF_START_X);
      return Phaser.Math.Linear(42, WATERLINE_Y + 80, t);
    }

    const t = this.smooth01((x - BEACH_SHELF_START_X) / (BEACH_SHELF_END_X - BEACH_SHELF_START_X));
    const wave = Math.sin(x * 0.008) * 10;
    return WATERLINE_Y + 90 + t * 960 + wave;
  }

  private createWaterSurface() {
    const surface = this.add.graphics().setDepth(-30);
    surface.fillStyle(0x2f8da0, 0.38);
    surface.fillRect(0, WATERLINE_Y - 7, WORLD_WIDTH, 22);

    this.drawWaveRibbon(surface, WATERLINE_Y - 2, 0xd5fff2, 0.9, 5, 0.019, 13);
    this.drawWaveRibbon(surface, WATERLINE_Y + 18, 0x75d2de, 0.6, 3, 0.015, 19);
    this.drawWaveRibbon(surface, WATERLINE_Y + 42, 0x1f6d8d, 0.42, 4, 0.011, 31);

    const bandColors = [0x174d73, 0x236c96, 0x2e89ac, 0x72c8d8, 0x1e5f83];
    for (let row = 0; row < 9; row += 1) {
      const y = WATERLINE_Y + 22 + row * 17;
      const color = bandColors[row % bandColors.length];
      this.drawWaveRibbon(surface, y, color, 0.22 + row * 0.018, 2, 0.006 + row * 0.0012, row * 41);
    }

    this.tweens.add({
      targets: surface,
      y: 7,
      duration: 5200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });

    for (let i = 0; i < 230; i += 1) {
      const x = 22 + i * 42;
      const y = WATERLINE_Y + 18 + ((i * 29) % 145);
      const nearHorizon = y < WATERLINE_Y + 62;
      const color = nearHorizon && i % 4 === 0 ? 0xffd597 : i % 3 === 0 ? 0xd9fff5 : 0x8fdde8;
      const glint = this.add
        .rectangle(
          x,
          y + Math.sin(i * 0.85) * 5,
          18 + ((i * 7) % 54),
          2,
          color,
          nearHorizon ? 0.34 : 0.18,
        )
        .setDepth(-29)
        .setAngle(Math.sin(i) * 3);

      this.tweens.add({
        targets: glint,
        y: glint.y + (nearHorizon ? 4 : 8) * (i % 2 === 0 ? 1 : -1),
        duration: 3600 + (i % 11) * 260,
        delay: (i % 17) * 110,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut",
      });
    }
  }

  private drawWaveRibbon(
    graphics: Phaser.GameObjects.Graphics,
    baseY: number,
    color: number,
    alpha: number,
    thickness: number,
    frequency: number,
    phase: number,
  ) {
    graphics.lineStyle(thickness, color, alpha);
    graphics.beginPath();
    for (let x = 0; x <= WORLD_WIDTH; x += 18) {
      const y =
        baseY +
        Math.sin(x * frequency + phase) * 7 +
        Math.sin(x * frequency * 0.37 + phase * 0.2) * 5;
      if (x === 0) graphics.moveTo(x, y);
      else graphics.lineTo(x, y);
    }
    graphics.strokePath();
  }

  private createCurrentLines() {
    for (let i = 0; i < 190; i += 1) {
      const x = i * 55;
      const y = WATERLINE_Y + 76 + ((i * 137) % (WORLD_HEIGHT - WATERLINE_Y - 260));
      const line = this.add
        .rectangle(
          x,
          y,
          22 + (i % 5) * 8,
          2,
          this.depthAccentColorAtY(y),
          y > WATERLINE_Y + 900 ? 0.12 : 0.18,
        )
        .setDepth(-28);

      this.tweens.add({
        targets: line,
        x: line.x + 34,
        y: line.y + 7 * (i % 2 === 0 ? 1 : -1),
        alpha: { from: line.alpha, to: Math.max(0.05, line.alpha - 0.08) },
        duration: 2600 + (i % 9) * 240,
        delay: (i % 13) * 95,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut",
      });
    }
  }

  private createRocks(rocks: { x: number; y: number; zoneId: string; variant: number }[], caveTiles: Set<string>) {
    this.rocks = this.physics.add.staticGroup();
    this.createBeachCollision();
    const visibleRocks = rocks.filter((rock) => rock.x >= BEACH_END_X + 360);
    this.createRockVisuals(visibleRocks, caveTiles);

    for (const run of this.collectRockRuns(visibleRocks)) {
      const width = (run.endTx - run.startTx + 1) * TILE;
      const tile = this.add
        .rectangle(run.startTx * TILE + width / 2, run.ty * TILE + TILE / 2, width, TILE, 0x000000, 0)
        .setVisible(false);
      this.rocks.add(tile);
    }
    this.rocks.refresh();
  }

  private createRockVisuals(rocks: { x: number; y: number; zoneId: string; variant: number }[], caveTiles: Set<string>) {
    const terrainSkin = this.add.graphics().setDepth(-5.5);
    this.drawSmoothTerrainSkin(terrainSkin, rocks);
    const surfaceRocks = this.add.graphics().setDepth(-5.25);
    this.drawSurfaceRockDecorations(surfaceRocks, rocks);
    this.caveBiomeCurtain = this.add
      .rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 0x02070c, 0.82)
      .setOrigin(0)
      .setDepth(-4.75)
      .setVisible(false);
    this.drawCaveTileOverlay(caveTiles);
  }

  private drawCaveTileOverlay(caveTiles: Set<string>) {
    if (caveTiles.size === 0) return;
    const caveLayer = this.add.graphics().setDepth(-4.6);
    this.caveTileLayer = caveLayer;
    caveLayer.setVisible(false);
    const rows = new Map<number, number[]>();

    for (const key of caveTiles) {
      const [tx, ty] = key.split(",").map(Number);
      if (tx * TILE < BEACH_END_X + 360) continue;
      const row = rows.get(ty) ?? [];
      row.push(tx);
      rows.set(ty, row);
    }

    for (const [ty, row] of rows) {
      row.sort((a, b) => a - b);
      let startTx = row[0];
      let endTx = startTx;

      for (let i = 1; i <= row.length; i += 1) {
        const tx = row[i];
        if (tx === endTx + 1) {
          endTx = tx;
          continue;
        }

        this.drawCaveTileRun(caveLayer, startTx, endTx, ty, caveTiles);
        startTx = tx;
        endTx = tx;
      }
    }
  }

  private drawCaveTileRun(
    graphics: Phaser.GameObjects.Graphics,
    startTx: number,
    endTx: number,
    ty: number,
    caveTiles: Set<string>,
  ) {
    if (startTx === undefined || endTx === undefined) return;
    const x = startTx * TILE;
    const y = ty * TILE;
    const width = (endTx - startTx + 1) * TILE;
    const depthT = this.smooth01((y - WATERLINE_Y) / (WORLD_HEIGHT - WATERLINE_Y));
    const fill = this.mixHexColor(0x778080, 0x4f5654, depthT);

    graphics.fillStyle(fill, 1);
    graphics.fillRect(x, y, width, TILE);
  }

  private hasCaveTileRun(caveTiles: Set<string>, startTx: number, endTx: number, ty: number) {
    for (let tx = startTx; tx <= endTx; tx += 1) {
      if (caveTiles.has(tileKey(tx, ty))) return true;
    }
    return false;
  }

  private collectRockRuns(rocks: { x: number; y: number; variant: number }[]) {
    const byRow = new Map<number, Array<{ tx: number; variant: number }>>();
    for (const rock of rocks) {
      const ty = rock.y / TILE;
      const tx = rock.x / TILE;
      const row = byRow.get(ty) ?? [];
      row.push({ tx, variant: rock.variant });
      byRow.set(ty, row);
    }

    const runs: Array<{ ty: number; startTx: number; endTx: number; variant: number }> = [];
    for (const [ty, row] of byRow) {
      row.sort((a, b) => a.tx - b.tx);
      let startTx = row[0]?.tx;
      let endTx = startTx;
      let variant = row[0]?.variant ?? 0;
      for (let i = 1; i < row.length; i += 1) {
        const cell = row[i];
        if (cell.tx === endTx + 1) {
          endTx = cell.tx;
          variant = (variant + cell.variant) % 7;
        } else {
          runs.push({ ty, startTx, endTx, variant });
          startTx = cell.tx;
          endTx = cell.tx;
          variant = cell.variant;
        }
      }
      if (startTx !== undefined && endTx !== undefined) runs.push({ ty, startTx, endTx, variant });
    }

    return runs.sort((a, b) => a.ty - b.ty || a.startTx - b.startTx);
  }

  private drawSmoothTerrainSkin(
    graphics: Phaser.GameObjects.Graphics,
    rocks: { x: number; y: number }[],
  ) {
    if (rocks.length === 0) return;

    const rawTopByTile = new Map<number, number>();
    for (const rock of rocks) {
      const tx = Math.round(rock.x / TILE);
      const current = rawTopByTile.get(tx);
      if (current === undefined || rock.y < current) rawTopByTile.set(tx, rock.y);
    }

    const tileColumns = [...rawTopByTile.keys()];
    const beachLinkEndTx = Math.floor((BEACH_END_X + BEACH_SHELF_END_X * 0.18) / TILE);
    const baseStartTx = Math.floor(BEACH_END_X / TILE);
    const firstRockTx = Math.min(...tileColumns);
    const shorelineStartTx = Math.floor(Math.max(baseStartTx, BEACH_END_X / TILE - 2));
    const startTx = Math.min(firstRockTx, shorelineStartTx);
    const endTx = Math.min(Math.ceil(WORLD_WIDTH / TILE), Math.max(...tileColumns));
    const smoothedTopByTile = new Map<number, number>();
    const fallbackTopAt = (tx: number) => {
      const x = tx * TILE;
      if (x < BEACH_END_X) {
        return this.sandBackdropTopYAt(x);
      }
      if (x <= BEACH_SHELF_END_X + 360) {
        return this.sandBackdropTopYAt(x);
      }
      return seafloorYAtX(x) + TILE;
    };
    const rawTopAt = (tx: number) => rawTopByTile.get(tx) ?? fallbackTopAt(tx);

    for (let tx = startTx; tx <= endTx; tx += 1) {
      let weightedY = 0;
      let totalWeight = 0;
      for (let offset = -5; offset <= 5; offset += 1) {
        const neighborTx = Phaser.Math.Clamp(tx + offset, startTx, endTx);
        const weight = 6 - Math.abs(offset);
        weightedY += rawTopAt(neighborTx) * weight;
        totalWeight += weight;
      }
      const rawY = rawTopAt(tx);
      const averagedY = weightedY / totalWeight;
      smoothedTopByTile.set(tx, Phaser.Math.Clamp(averagedY, rawY - 68, rawY + 68));
    }

    const surfaceYAtX = (x: number) => {
      const tile = Phaser.Math.Clamp(x / TILE, startTx, endTx);
      const leftTx = Math.floor(tile);
      const rightTx = Math.min(endTx, leftTx + 1);
      const t = this.smooth01(tile - leftTx);
      const leftY = smoothedTopByTile.get(leftTx) ?? rawTopAt(leftTx);
      const rightY = smoothedTopByTile.get(rightTx) ?? leftY;
      return Phaser.Math.Linear(leftY, rightY, t);
    };

    const startX = startTx * TILE;
    const endX = Math.min(WORLD_WIDTH, endTx * TILE);
    const capStep = 48;
    const gradientBandHeight = 24;
    const topPoints: Phaser.Geom.Point[] = [];
    for (let x = startX; x <= endX; x += capStep) {
      const surfaceY = surfaceYAtX(x);
      topPoints.push(new Phaser.Geom.Point(x, surfaceY));
    }

    const maskShape = this.add.graphics();
    maskShape.fillStyle(0xffffff, 1);
    maskShape.beginPath();
    topPoints.forEach((point, index) => {
      if (index === 0) maskShape.moveTo(point.x, point.y);
      else maskShape.lineTo(point.x, point.y);
    });
    maskShape.lineTo(endX, WORLD_HEIGHT);
    maskShape.lineTo(startX, WORLD_HEIGHT);
    maskShape.closePath();
    maskShape.fillPath();
    maskShape.setVisible(false);
    graphics.setMask(maskShape.createGeometryMask());

    for (let y = WATERLINE_Y; y < WORLD_HEIGHT; y += gradientBandHeight) {
      graphics.fillStyle(this.terrainFillColorAtY(y + gradientBandHeight / 2), 1);
      graphics.fillRect(startX, y, endX - startX, gradientBandHeight + 1);
    }

    for (let y = WATERLINE_Y + 320; y < WORLD_HEIGHT; y += 720) {
      const depthT = this.smooth01((y - WATERLINE_Y) / (WORLD_HEIGHT - WATERLINE_Y));
      const color = this.mixHexColor(0xd1ad6d, 0x4a4132, depthT);
      graphics.fillStyle(color, 0.014);
      graphics.fillRect(startX, y + Math.sin(y * 0.01) * 6, endX - startX, 2);
    }
  }

  private drawRockStrataRun(
    graphics: Phaser.GameObjects.Graphics,
    startTx: number,
    endTx: number,
    ty: number,
    variant: number,
  ) {
    const x = startTx * TILE;
    const y = ty * TILE;
    const width = (endTx - startTx + 1) * TILE;
    const face = this.rockFaceColorAt(y, variant);
    const lower = this.rockFaceColorAt(y + 96, variant + 2);
    const seam = this.rockCapColorAt(y + 20, variant + 1);
    const phase = (startTx * 13 + ty * 7 + variant * 17) * 0.1;

    graphics.fillStyle(face, 0.98);
    graphics.beginPath();
    graphics.moveTo(x - 3, y + this.rockJitter(startTx, ty, phase));
    for (let px = x; px <= x + width + TILE; px += TILE) {
      const tx = Math.round(px / TILE);
      graphics.lineTo(px, y + this.rockJitter(tx, ty, phase));
    }
    graphics.lineTo(x + width + 3, y + TILE + 7);
    graphics.lineTo(x - 3, y + TILE + 5);
    graphics.closePath();
    graphics.fillPath();

    graphics.fillStyle(lower, 0.24);
    graphics.beginPath();
    graphics.moveTo(x - 3, y + TILE * 0.58);
    for (let px = x; px <= x + width + TILE; px += TILE) {
      const tx = Math.round(px / TILE);
      graphics.lineTo(px, y + TILE * 0.58 + Math.sin(tx * 0.9 + phase) * 4);
    }
    graphics.lineTo(x + width + 3, y + TILE + 7);
    graphics.lineTo(x - 3, y + TILE + 5);
    graphics.closePath();
    graphics.fillPath();

    if ((startTx + ty + variant) % 3 === 0) {
      graphics.lineStyle(2, seam, 0.08);
      graphics.beginPath();
      graphics.moveTo(x + 8, y + 12 + Math.sin(phase) * 3);
      graphics.lineTo(x + width * 0.45, y + 15 + Math.cos(phase) * 3);
      graphics.lineTo(x + width - 8, y + 11 + Math.sin(phase * 1.7) * 4);
      graphics.strokePath();
    }
  }

  private drawRockCapRun(
    graphics: Phaser.GameObjects.Graphics,
    startTx: number,
    endTx: number,
    ty: number,
    variant: number,
  ) {
    const x = startTx * TILE;
    const y = ty * TILE;
    const width = (endTx - startTx + 1) * TILE;
    const cap = this.rockCapColorAt(y, variant);
    const shadow = this.rockFaceColorAt(y + 70, variant + 2);
    const phase = (startTx * 5 + ty * 11 + variant) * 0.2;

    graphics.fillStyle(shadow, 0.42);
    graphics.beginPath();
    graphics.moveTo(x - 5, y + 12);
    for (let px = x; px <= x + width + TILE; px += TILE) {
      const tx = Math.round(px / TILE);
      graphics.lineTo(px, y + 7 + this.rockJitter(tx, ty, phase) * 0.28);
    }
    graphics.lineTo(x + width + 5, y + 28);
    graphics.lineTo(x - 5, y + 24);
    graphics.closePath();
    graphics.fillPath();

    graphics.fillStyle(cap, 0.94);
    graphics.beginPath();
    graphics.moveTo(x - 4, y + 7);
    for (let px = x; px <= x + width + TILE; px += TILE) {
      const tx = Math.round(px / TILE);
      graphics.lineTo(px, y + 3 + this.rockJitter(tx, ty, phase) * 0.22);
    }
    graphics.lineTo(x + width + 4, y + 16);
    graphics.lineTo(x - 4, y + 18);
    graphics.closePath();
    graphics.fillPath();
  }

  private drawRockLayerDetails(
    graphics: Phaser.GameObjects.Graphics,
    rocks: { x: number; y: number; variant: number }[],
    rockSet: Set<string>,
  ) {
    for (const rock of rocks) {
      const tx = rock.x / TILE;
      const ty = rock.y / TILE;
      const leftOpen = !rockSet.has(`${tx - 1},${ty}`);
      const rightOpen = !rockSet.has(`${tx + 1},${ty}`);
      const topOpen = !rockSet.has(`${tx},${ty - 1}`);

      if (leftOpen) {
        graphics.fillStyle(this.rockFaceColorAt(rock.y + 70, rock.variant + 1), 0.08);
        graphics.beginPath();
        graphics.moveTo(rock.x - 2, rock.y + 7);
        graphics.lineTo(rock.x + 5, rock.y + 1);
        graphics.lineTo(rock.x + 7, rock.y + TILE - 6);
        graphics.lineTo(rock.x - 2, rock.y + TILE + 2);
        graphics.closePath();
        graphics.fillPath();
      }
      if (rightOpen) {
        graphics.fillStyle(0xffffff, 0.06);
        graphics.beginPath();
        graphics.moveTo(rock.x + TILE - 6, rock.y + 5);
        graphics.lineTo(rock.x + TILE + 2, rock.y + 10);
        graphics.lineTo(rock.x + TILE + 2, rock.y + TILE - 4);
        graphics.lineTo(rock.x + TILE - 5, rock.y + TILE + 1);
        graphics.closePath();
        graphics.fillPath();
      }
      if ((topOpen || leftOpen || rightOpen) && (tx * 3 + ty + rock.variant) % 29 === 0) {
        graphics.lineStyle(2, this.rockFaceColorAt(rock.y + 90, rock.variant + 2), 0.07);
        graphics.beginPath();
        graphics.moveTo(rock.x + 6, rock.y + 8);
        graphics.lineTo(rock.x + 18, rock.y + 15);
        graphics.lineTo(rock.x + 12, rock.y + 27);
        graphics.strokePath();
      }
    }
  }

  private drawSurfaceRockDecorations(
    graphics: Phaser.GameObjects.Graphics,
    rocks: { x: number; y: number; variant: number }[],
  ) {
    const rockSet = new Set(rocks.map((rock) => `${rock.x / TILE},${rock.y / TILE}`));
    const surfaceCandidates = rocks.filter((rock) => {
      const tx = rock.x / TILE;
      const ty = rock.y / TILE;
      const centerX = rock.x + TILE / 2;
      const zone = zoneAtPosition(centerX, rock.y + TILE / 2);
      const allowedZone = zone.id === "coral" || zone.id === "surface";
      const nearWorldFloor = rock.y <= seafloorYAtX(centerX) + TILE * 1.65;
      const exposedTop = !rockSet.has(`${tx},${ty - 1}`);
      const boundaryClear = this.hasSurfaceRockClearance(rockSet, tx, ty);
      const densityWave = (Math.sin(centerX * 0.0017) + Math.sin(centerX * 0.00043 + 1.8)) * 0.5;
      const localDensity = Phaser.Math.Clamp(0.075 + densityWave * 0.045, 0.025, 0.16);
      return allowedZone && exposedTop && nearWorldFloor && boundaryClear && this.deterministicUnit(tx, ty, rock.variant) < localDensity;
    });

    for (const rock of surfaceCandidates) {
      const tx = rock.x / TILE;
      const ty = rock.y / TILE;
      const sizeRoll = this.deterministicUnit(tx + 17, ty + 29, rock.variant + 5);
      const unit = sizeRoll > 0.78 ? 4 : 3;
      const radiusX = 3 + Math.floor(this.deterministicUnit(tx + 3, ty + 7, rock.variant) * 4);
      const radiusY = Phaser.Math.Clamp(
        Math.round(radiusX * Phaser.Math.Linear(0.5, 0.72, sizeRoll)),
        2,
        4,
      );
      const x = rock.x + TILE / 2 + Math.sin(tx * 0.9) * 5;
      const y = rock.y + TILE * 0.62;
      this.drawPixelSurfaceRock(graphics, x, y, unit, radiusX, radiusY, rock.variant);
    }
  }

  private hasSurfaceRockClearance(rockSet: Set<string>, tx: number, ty: number) {
    for (let dx = -2; dx <= 2; dx += 1) {
      if (!rockSet.has(`${tx + dx},${ty}`)) return false;
      if (rockSet.has(`${tx + dx},${ty - 1}`)) return false;
    }

    for (let dy = 0; dy <= 2; dy += 1) {
      if (!rockSet.has(`${tx - 3},${ty + dy}`) || !rockSet.has(`${tx + 3},${ty + dy}`)) {
        return false;
      }
    }

    return true;
  }

  private drawPixelSurfaceRock(
    graphics: Phaser.GameObjects.Graphics,
    centerX: number,
    centerY: number,
    unit: number,
    radiusX: number,
    radiusY: number,
    variant: number,
  ) {
    const palette = this.surfaceRockPalette(variant);
    const dark = palette.dark;
    const mid = palette.mid;
    const light = palette.light;

    for (let py = -radiusY; py <= radiusY; py += 1) {
      for (let px = -radiusX; px <= radiusX; px += 1) {
        const wobble = 1 + Math.sin((px + variant) * 1.7) * 0.08 + Math.sin((py - variant) * 1.2) * 0.06;
        const distance = Math.hypot(px / Math.max(1, radiusX), py / Math.max(1, radiusY));
        if (distance > wobble) continue;

        const topLight = py < -radiusY * 0.38 && px < radiusX * 0.35;
        const bottomShade = py > radiusY * 0.35 || px > radiusX * 0.48;
        const color = topLight ? light : bottomShade ? dark : mid;
        const x = centerX + px * unit;
        const y = centerY + py * unit;
        graphics.fillStyle(color, 0.94);
        graphics.fillRect(x, y, unit, unit);
      }
    }
  }

  private surfaceRockPalette(variant: number) {
    const palettes = [
      { light: 0xa7a98c, mid: 0x939579, dark: 0x7d8068 },
      { light: 0xb1c7d2, mid: 0x9ab4c3, dark: 0x7890a2 },
      { light: 0x8ca7b8, mid: 0x7894a7, dark: 0x657d8f },
      { light: 0xa3a585, mid: 0x8f9273, dark: 0x74775f },
      { light: 0x76585d, mid: 0x684c52, dark: 0x553d45 },
      { light: 0x735459, mid: 0x63484d, dark: 0x513a40 },
    ];
    return palettes[Math.abs(variant) % palettes.length];
  }

  private deterministicUnit(a: number, b: number, c: number) {
    const value = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
    return value - Math.floor(value);
  }

  private rockJitter(tx: number, ty: number, phase: number) {
    return Math.sin(tx * 0.42 + phase) * 1.35 + Math.sin((tx + ty) * 0.23 + phase) * 0.75;
  }

  private drawCaveInteriorBackdrop(graphics: Phaser.GameObjects.Graphics, rockSet: Set<string>) {
    const caveCells = new Set<string>();
    for (const key of rockSet) {
      const [tx, ty] = key.split(",").map(Number);
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const nx = tx + dx;
          const ny = ty + dy;
          const cellKey = `${nx},${ny}`;
          if (rockSet.has(cellKey) || !this.isCaveVisualCell(nx, ny)) continue;
          if (this.countRockNeighbors(rockSet, nx, ny) >= 2) caveCells.add(cellKey);
        }
      }
    }

    const rows = new Map<number, number[]>();
    for (const key of caveCells) {
      const [tx, ty] = key.split(",").map(Number);
      const row = rows.get(ty) ?? [];
      row.push(tx);
      rows.set(ty, row);
    }

    for (const [ty, row] of rows) {
      row.sort((a, b) => a - b);
      let start = row[0];
      let end = start;
      for (let i = 1; i <= row.length; i += 1) {
        const tx = row[i];
        if (tx === end + 1) {
          end = tx;
          continue;
        }
        this.drawRoundedCaveBand(graphics, start, end, ty);
        start = tx;
        end = tx;
      }
    }
  }

  private drawRoundedCaveBand(
    graphics: Phaser.GameObjects.Graphics,
    startTx: number,
    endTx: number,
    ty: number,
  ) {
    if (startTx === undefined || endTx === undefined) return;
    const x = startTx * TILE - 4;
    const y = ty * TILE - 3;
    const width = (endTx - startTx + 1) * TILE + 8;
    const height = TILE + 8;
    const shade = this.mixHexColor(0x06101b, 0x0e2936, this.smooth01((y - WATERLINE_Y) / (WORLD_HEIGHT - WATERLINE_Y)));
    const radius = Math.min(18, Math.max(8, width * 0.18));

    graphics.fillStyle(shade, 0.62);
    graphics.beginPath();
    graphics.moveTo(x + radius, y);
    graphics.lineTo(x + width - radius, y);
    this.drawQuadratic(graphics, x + width - radius, y, x + width, y, x + width, y + radius);
    graphics.lineTo(x + width, y + height - radius);
    this.drawQuadratic(graphics, x + width, y + height - radius, x + width, y + height, x + width - radius, y + height);
    graphics.lineTo(x + radius, y + height);
    this.drawQuadratic(graphics, x + radius, y + height, x, y + height, x, y + height - radius);
    graphics.lineTo(x, y + radius);
    this.drawQuadratic(graphics, x, y + radius, x, y, x + radius, y);
    graphics.closePath();
    graphics.fillPath();

    if ((startTx + ty) % 4 === 0) {
      graphics.fillStyle(0x020813, 0.18);
      graphics.fillRoundedRect(x + 8, y + 8, Math.max(12, width - 16), Math.max(8, height - 16), 10);
    }
  }

  private drawCaveShadows(graphics: Phaser.GameObjects.Graphics, rockSet: Set<string>) {
    const candidates = new Set<string>();
    for (const key of rockSet) {
      const [tx, ty] = key.split(",").map(Number);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = tx + dx;
          const ny = ty + dy;
          const neighborKey = `${nx},${ny}`;
          if (!rockSet.has(neighborKey) && this.isCaveVisualCell(nx, ny)) {
            candidates.add(neighborKey);
          }
        }
      }
    }

    for (const key of candidates) {
      const [tx, ty] = key.split(",").map(Number);
      const neighborCount = this.countRockNeighbors(rockSet, tx, ty);
      const hasRoof = rockSet.has(`${tx},${ty - 1}`);
      const hasLeftWall = rockSet.has(`${tx - 1},${ty}`);
      const hasRightWall = rockSet.has(`${tx + 1},${ty}`);
      const hasFloor = rockSet.has(`${tx},${ty + 1}`);
      const caveLike = neighborCount >= 3 && hasRoof && (hasLeftWall || hasRightWall || hasFloor);
      if (!caveLike) continue;

      const x = tx * TILE;
      const y = ty * TILE;
      const enclosed = neighborCount >= 5;

      if (hasRoof) {
        this.drawCaveRoofLip(graphics, x, y, tx, ty, enclosed);
      }
      if (hasLeftWall) {
        this.drawCaveSideWall(graphics, x, y, -1, tx, ty, enclosed);
      }
      if (hasRightWall) {
        this.drawCaveSideWall(graphics, x + TILE, y, 1, tx, ty, enclosed);
      }
      if (hasFloor && enclosed) {
        graphics.fillStyle(0x13455a, 0.15);
        graphics.beginPath();
        graphics.moveTo(x + 3, y + TILE - 9);
        graphics.lineTo(x + TILE - 6, y + TILE - 6 + Math.sin(tx * 0.7) * 2);
        graphics.lineTo(x + TILE - 3, y + TILE + 2);
        graphics.lineTo(x + 6, y + TILE + 1);
        graphics.closePath();
        graphics.fillPath();
      }

      if (enclosed && (tx + ty) % 3 === 0) {
        graphics.fillStyle(0x05131f, 0.15);
        graphics.fillRect(x + 8, y + 9, TILE - 12, TILE - 12);
      }
    }
  }

  private isCaveVisualCell(tx: number, ty: number) {
    if (tx < 0 || ty < 0) return false;
    const x = tx * TILE + TILE / 2;
    const y = ty * TILE + TILE / 2;
    return y >= seafloorYAtX(x) + TILE;
  }

  private drawCaveRoofLip(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    tx: number,
    ty: number,
    enclosed: boolean,
  ) {
    const wobble = Math.sin(tx * 0.9 + ty * 0.4) * 5;
    graphics.fillStyle(0x03111d, enclosed ? 0.58 : 0.42);
    graphics.beginPath();
    graphics.moveTo(x - 8, y + 6);
    this.drawQuadratic(graphics, x - 8, y + 6, x + 4, y - 4 + wobble * 0.2, x + 18, y + 3 + wobble);
    this.drawQuadratic(graphics, x + 18, y + 3 + wobble, x + TILE * 0.54, y + 12 - wobble, x + TILE + 8, y + 5 + wobble * 0.4);
    this.drawQuadratic(graphics, x + TILE + 8, y + 5 + wobble * 0.4, x + TILE + 12, y + 18, x + TILE - 2, y + 27);
    this.drawQuadratic(graphics, x + TILE - 2, y + 27, x + TILE * 0.48, y + 20 + wobble * 0.3, x - 7, y + 25);
    this.drawQuadratic(graphics, x - 7, y + 25, x - 13, y + 15, x - 8, y + 6);
    graphics.closePath();
    graphics.fillPath();

    graphics.fillStyle(0x176077, enclosed ? 0.16 : 0.11);
    graphics.beginPath();
    graphics.moveTo(x + 4, y + 16);
    this.drawQuadratic(graphics, x + 4, y + 16, x + TILE * 0.5, y + 11 + wobble * 0.2, x + TILE - 4, y + 16);
    this.drawQuadratic(graphics, x + TILE - 4, y + 16, x + TILE - 7, y + 24, x + 8, y + 23);
    graphics.closePath();
    graphics.fillPath();
  }

  private drawCaveSideWall(
    graphics: Phaser.GameObjects.Graphics,
    edgeX: number,
    y: number,
    direction: -1 | 1,
    tx: number,
    ty: number,
    enclosed: boolean,
  ) {
    const inset = direction < 0 ? 1 : -1;
    const wobble = Math.sin(tx * 0.5 + ty) * 5;
    graphics.fillStyle(0x041522, enclosed ? 0.44 : 0.32);
    graphics.beginPath();
    graphics.moveTo(edgeX + inset * 2, y - 4);
    this.drawQuadratic(
      graphics,
      edgeX + inset * 2,
      y - 4,
      edgeX + inset * (18 + wobble),
      y + TILE * 0.3,
      edgeX + inset * (11 - wobble * 0.3),
      y + TILE * 0.62,
    );
    this.drawQuadratic(
      graphics,
      edgeX + inset * (11 - wobble * 0.3),
      y + TILE * 0.62,
      edgeX + inset * (20 + wobble * 0.4),
      y + TILE + 1,
      edgeX + inset * 2,
      y + TILE + 6,
    );
    graphics.closePath();
    graphics.fillPath();
  }

  private countRockNeighbors(rockSet: Set<string>, tx: number, ty: number) {
    let count = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        if (rockSet.has(`${tx + dx},${ty + dy}`)) count += 1;
      }
    }
    return count;
  }

  private drawRockOutcrop(
    graphics: Phaser.GameObjects.Graphics,
    centerX: number,
    baseY: number,
    width: number,
    height: number,
    variant: number,
  ) {
    const left = centerX - width / 2;
    const right = centerX + width / 2;
    const peakX = centerX + ((variant % 5) - 2) * 7;
    const color = this.rockCapColorAt(baseY, variant);
    const shadow = this.rockFaceColorAt(baseY + 80, variant + 1);

    graphics.fillStyle(shadow, 0.74);
    graphics.beginPath();
    graphics.moveTo(left, baseY - 3);
    this.drawQuadratic(graphics, left, baseY - 3, left + width * 0.1, baseY - height * 0.38, peakX - width * 0.15, baseY - height * 0.72);
    this.drawQuadratic(graphics, peakX - width * 0.15, baseY - height * 0.72, peakX, baseY - height * 1.04, peakX + width * 0.18, baseY - height * 0.74);
    this.drawQuadratic(graphics, peakX + width * 0.18, baseY - height * 0.74, right - width * 0.08, baseY - height * 0.3, right, baseY - 4);
    this.drawQuadratic(graphics, right, baseY - 4, centerX, baseY + 10, left, baseY - 3);
    graphics.closePath();
    graphics.fillPath();

    graphics.fillStyle(color, 0.72);
    graphics.beginPath();
    graphics.moveTo(left + 6, baseY - 4);
    this.drawQuadratic(graphics, left + 6, baseY - 4, left + width * 0.25, baseY - height * 0.5, peakX - width * 0.08, baseY - height * 0.8);
    this.drawQuadratic(graphics, peakX - width * 0.08, baseY - height * 0.8, centerX, baseY - height * 0.42, right - width * 0.22, baseY - height * 0.24);
    this.drawQuadratic(graphics, right - width * 0.22, baseY - height * 0.24, right - width * 0.12, baseY - height * 0.08, right - 6, baseY - 4);
    this.drawQuadratic(graphics, right - 6, baseY - 4, centerX, baseY + 5, left + 6, baseY - 4);
    graphics.closePath();
    graphics.fillPath();

    graphics.lineStyle(3, 0x2a1f22, 0.18);
    graphics.beginPath();
    graphics.moveTo(left + width * 0.22, baseY - height * 0.32);
    graphics.lineTo(centerX, baseY - height * 0.46);
    graphics.lineTo(right - width * 0.18, baseY - height * 0.2);
    graphics.strokePath();
  }

  private rockFaceColorAt(y: number, variant: number) {
    const shade = Phaser.Display.Color.ValueToColor(this.depthRockColorAtY(y));
    const warm = Phaser.Math.Clamp(1 - (y - WATERLINE_Y) / (WORLD_HEIGHT - WATERLINE_Y), 0, 1);
    const delta = variant * 7 - 10;
    return Phaser.Display.Color.GetColor(
      Phaser.Math.Clamp(shade.red + delta + warm * 22, 0, 255),
      Phaser.Math.Clamp(shade.green + delta + warm * 14, 0, 255),
      Phaser.Math.Clamp(shade.blue + delta - warm * 10, 0, 255),
    );
  }

  private rockCapColorAt(y: number, variant: number) {
    const shade = Phaser.Display.Color.ValueToColor(this.rockFaceColorAt(y, variant));
    return Phaser.Display.Color.GetColor(
      Phaser.Math.Clamp(shade.red + 24, 0, 255),
      Phaser.Math.Clamp(shade.green + 18, 0, 255),
      Phaser.Math.Clamp(shade.blue + 10, 0, 255),
    );
  }

  private createBeachCollision() {
    const segmentWidth = 64;
    for (let x = segmentWidth / 2; x <= BEACH_SHELF_END_X + 260; x += segmentWidth) {
      const top = Math.max(WATERLINE_Y, this.beachShelfYAt(x) - 10);
      const height = WORLD_HEIGHT - top;
      const blocker = this.add
        .rectangle(x, top + height / 2, segmentWidth + 4, height, 0x000000, 0)
        .setDepth(1000);
      this.rocks.add(blocker);
    }
  }

  private createDecorations(decorations: Decoration[]) {
    for (const decoration of decorations) {
      const g = this.add.graphics().setDepth(-2);
      g.fillStyle(decoration.tint, 0.85);
      g.lineStyle(2, 0x051019, 0.25);

      if (decoration.kind === "vent") {
        g.fillStyle(0x2d3342, 0.9);
        g.fillRect(decoration.x - 10, decoration.y - 20, 20, 20);
        g.fillStyle(0x7ff7ff, 0.25);
        g.fillRect(decoration.x - 3, decoration.y - 46, 6, 26);
      } else {
        g.fillRect(decoration.x - 2, decoration.y - 2, 4, 4);
      }
    }
  }

  private createCreatures(
    creatures: { x: number; y: number; assetKey: CreatureKey; drift: number; scale: number }[],
  ) {
    for (const spawn of creatures) {
      const asset = NPC_CREATURES.find((creature) => creature.key === spawn.assetKey);
      if (!asset) continue;
      const sprite = this.add
        .image(spawn.x, spawn.y, asset.key)
        .setOrigin(0.5, this.creatureOriginY(spawn.assetKey))
        .setScale(spawn.scale)
        .setDepth(4)
        .setAlpha(0.94);

      this.faceSprite(sprite, spawn.assetKey, 1);

      this.tweens.add({
        targets: sprite,
        x: spawn.x + spawn.drift,
        y: spawn.y + Math.sin(spawn.x) * 16,
        duration: 2600 + spawn.drift * 45,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut",
        onYoyo: () => this.faceSprite(sprite, spawn.assetKey, -1),
        onRepeat: () => this.faceSprite(sprite, spawn.assetKey, 1),
      });
    }
  }

  private creatureOriginY(assetKey: CreatureKey) {
    if (assetKey === "crayfish" || assetKey === "nudhhi" || assetKey === "smooth-sting-ray") return 1;
    if (assetKey === "blue-devil") return 0.72;
    return 0.5;
  }

  private createDeepShipwreck() {
    const candidates: number[] = [];
    for (let x = 6900; x < WORLD_WIDTH - 420; x += 80) {
      if (maxDepthAtX(x) >= 480) candidates.push(x);
    }
    const x = candidates.length > 0 ? candidates[17 % candidates.length] : WORLD_WIDTH - 1200;
    const floorY = seafloorYAtX(x);
    this.add
      .image(x, floorY + 2, "shipwreck")
      .setScale(0.34)
      .setDepth(-1)
      .setAlpha(0.82)
      .setOrigin(0.5, 1);
  }

  private faceSprite(
    sprite: Phaser.GameObjects.Components.Flip,
    assetKey: CreatureKey | "port-jackson",
    directionX: -1 | 1,
  ) {
    const nativeFacesLeft = assetKey !== "blue-devil";
    sprite.setFlipX(nativeFacesLeft ? directionX > 0 : directionX < 0);
  }

  private createHero() {
    const spawnX = BEACH_END_X + 420;
    const spawnY = Math.max(WATERLINE_Y + 74, this.beachShelfYAt(spawnX) - 150);
    this.hero = this.physics.add
      .sprite(spawnX, spawnY, CREATURES.hero.key)
      .setScale(0.72)
      .setDepth(20)
      .setDamping(true)
      .setDrag(0.9, 0.9)
      .setMaxVelocity(360, 640)
      .setCollideWorldBounds(true);

    this.hero.body?.setSize(92, 36, true);
    this.faceSprite(this.hero, "port-jackson", this.heroDirectionX);
  }

  private createControls() {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
    }) as KeySet;
  }

  private createDeveloperTools() {
    const root = document.getElementById("dev-tools");
    const toggle = document.getElementById("dev-toggle");
    const zoomIn = document.getElementById("dev-zoom-in");
    const zoomOut = document.getElementById("dev-zoom-out");
    const fit = document.getElementById("dev-fit");
    const player = document.getElementById("dev-player");
    const xRange = document.getElementById("dev-x-range");
    const yRange = document.getElementById("dev-y-range");
    const seedInput = document.getElementById("cave-seed-input");
    const seedApply = document.getElementById("cave-seed-apply");
    const seedRandom = document.getElementById("cave-seed-random");
    const readout = document.getElementById("dev-camera-readout");

    if (
      !(root instanceof HTMLElement) ||
      !(toggle instanceof HTMLButtonElement) ||
      !(zoomIn instanceof HTMLButtonElement) ||
      !(zoomOut instanceof HTMLButtonElement) ||
      !(fit instanceof HTMLButtonElement) ||
      !(player instanceof HTMLButtonElement) ||
      !(xRange instanceof HTMLInputElement) ||
      !(yRange instanceof HTMLInputElement) ||
      !(seedInput instanceof HTMLInputElement) ||
      !(seedApply instanceof HTMLButtonElement) ||
      !(seedRandom instanceof HTMLButtonElement) ||
      !(readout instanceof HTMLOutputElement)
    ) {
      return;
    }

    xRange.max = String(WORLD_WIDTH);
    yRange.max = String(WORLD_HEIGHT);
    seedInput.value = String(this.caveSeed);
    this.devCameraTools = { root, toggle, zoomIn, zoomOut, fit, player, xRange, yRange, seedInput, seedApply, seedRandom, readout };

    toggle.onclick = () => this.setDeveloperCameraEnabled(!this.devCameraEnabled);
    zoomIn.onclick = () => {
      this.setDeveloperCameraEnabled(true);
      this.zoomDeveloperCamera(1.25);
    };
    zoomOut.onclick = () => {
      this.setDeveloperCameraEnabled(true);
      this.zoomDeveloperCamera(0.8);
    };
    fit.onclick = () => {
      this.setDeveloperCameraEnabled(true);
      this.fitDeveloperCameraToWorld();
    };
    player.onclick = () => this.setDeveloperCameraEnabled(false);
    xRange.oninput = () => {
      this.setDeveloperCameraEnabled(true);
      this.centerDeveloperCamera(Number(xRange.value), this.getDeveloperCameraCenter().y);
    };
    yRange.oninput = () => {
      this.setDeveloperCameraEnabled(true);
      this.centerDeveloperCamera(this.getDeveloperCameraCenter().x, Number(yRange.value));
    };
    seedApply.onclick = () => this.restartWithCaveSeed(Number(seedInput.value));
    seedRandom.onclick = () => {
      const seed = Math.floor(Math.random() * 999999999);
      seedInput.value = String(seed);
      this.restartWithCaveSeed(seed);
    };

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.devCameraEnabled || !pointer.leftButtonDown()) return;
      const camera = this.cameras.main;
      this.devCameraDragging = true;
      this.devCameraDragStart = {
        pointerX: pointer.x,
        pointerY: pointer.y,
        scrollX: camera.scrollX,
        scrollY: camera.scrollY,
      };
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.devCameraEnabled || !this.devCameraDragging || !this.devCameraDragStart) return;
      const camera = this.cameras.main;
      camera.scrollX = this.devCameraDragStart.scrollX - (pointer.x - this.devCameraDragStart.pointerX) / camera.zoom;
      camera.scrollY = this.devCameraDragStart.scrollY - (pointer.y - this.devCameraDragStart.pointerY) / camera.zoom;
      this.clampDeveloperCamera();
      this.updateDeveloperToolReadout();
    });

    this.input.on("pointerup", () => {
      this.devCameraDragging = false;
      this.devCameraDragStart = undefined;
    });

    this.input.on(
      "wheel",
      (pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
        if (!this.devCameraEnabled) return;
        (pointer.event as Event | undefined)?.preventDefault();
        this.zoomDeveloperCameraAt(pointer, deltaY < 0 ? 1.12 : 0.88);
      },
    );

    this.updateDeveloperToolState();
    this.updateDeveloperToolReadout();
  }

  private setDeveloperCameraEnabled(enabled: boolean) {
    if (this.devCameraEnabled === enabled) {
      this.updateDeveloperToolState();
      return;
    }

    const camera = this.cameras.main;
    this.devCameraEnabled = enabled;
    this.devCameraDragging = false;
    this.devCameraDragStart = undefined;

    if (enabled) {
      camera.stopFollow();
      camera.useBounds = false;
      camera.setDeadzone(0, 0);
    } else {
      camera.useBounds = true;
      camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      camera.setZoom(1);
      camera.centerOn(this.hero.x, this.hero.y);
      camera.startFollow(this.hero, true, 0.08, 0.08);
      camera.setDeadzone(160, 96);
    }

    this.updateDeveloperToolState();
    this.updateDeveloperToolReadout();
  }

  private restartWithCaveSeed(seed: number) {
    const nextSeed = Number.isFinite(seed) ? Math.max(0, Math.floor(seed)) : DEFAULT_CAVE_SEED;
    this.scene.restart({ caveSeed: nextSeed });
  }

  private updateDeveloperCamera(delta: number) {
    if (!this.devCameraEnabled) {
      this.updateDeveloperToolReadout();
      return;
    }

    const left = this.cursors.left.isDown || this.keys.left.isDown;
    const right = this.cursors.right.isDown || this.keys.right.isDown;
    const up = this.cursors.up.isDown || this.keys.up.isDown;
    const down = this.cursors.down.isDown || this.keys.down.isDown;
    const panX = Number(right) - Number(left);
    const panY = Number(down) - Number(up);

    if (panX !== 0 || panY !== 0) {
      const camera = this.cameras.main;
      const seconds = delta / 1000;
      const length = Math.max(1, Math.hypot(panX, panY));
      const speed = 940 / camera.zoom;
      camera.scrollX += (panX / length) * speed * seconds;
      camera.scrollY += (panY / length) * speed * seconds;
      this.clampDeveloperCamera();
    }

    this.updateDeveloperToolReadout();
  }

  private updateDeveloperToolState() {
    if (!this.devCameraTools) return;
    this.devCameraTools.root.classList.toggle("is-active", this.devCameraEnabled);
    this.devCameraTools.toggle.setAttribute("aria-pressed", String(this.devCameraEnabled));
    this.updateCaveVisibility();
  }

  private updateDeveloperToolReadout() {
    if (!this.devCameraTools) return;
    const center = this.getDeveloperCameraCenter();
    const camera = this.cameras.main;
    const centerX = Math.round(Phaser.Math.Clamp(center.x, 0, WORLD_WIDTH));
    const centerY = Math.round(Phaser.Math.Clamp(center.y, 0, WORLD_HEIGHT));
    this.devCameraTools.xRange.value = String(centerX);
    this.devCameraTools.yRange.value = String(centerY);
    this.devCameraTools.readout.textContent = `x ${centerX} y ${centerY} z ${camera.zoom.toFixed(2)}`;
  }

  private zoomDeveloperCamera(multiplier: number) {
    const center = this.getDeveloperCameraCenter();
    this.setDeveloperZoom(this.cameras.main.zoom * multiplier);
    this.centerDeveloperCamera(center.x, center.y);
  }

  private zoomDeveloperCameraAt(pointer: Phaser.Input.Pointer, multiplier: number) {
    const camera = this.cameras.main;
    const before = camera.getWorldPoint(pointer.x, pointer.y);
    this.setDeveloperZoom(camera.zoom * multiplier);
    this.centerDeveloperCamera(
      before.x - (pointer.x - camera.width / 2) / camera.zoom,
      before.y - (pointer.y - camera.height / 2) / camera.zoom,
    );
  }

  private setDeveloperZoom(zoom: number) {
    const camera = this.cameras.main;
    camera.setZoom(Phaser.Math.Clamp(zoom, this.minDeveloperZoom(), 2.4));
  }

  private fitDeveloperCameraToWorld() {
    const camera = this.cameras.main;
    const fitZoom = Math.min(camera.width / WORLD_WIDTH, camera.height / WORLD_HEIGHT);
    camera.setZoom(Phaser.Math.Clamp(fitZoom, this.minDeveloperZoom(), 2.4));
    this.centerDeveloperCamera(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
  }

  private centerDeveloperCamera(x: number, y: number) {
    const camera = this.cameras.main;
    const center = this.clampDeveloperCenter(x, y);
    camera.scrollX = center.x - camera.width / 2;
    camera.scrollY = center.y - camera.height / 2;
    this.clampDeveloperCamera();
    this.updateDeveloperToolReadout();
  }

  private getDeveloperCameraCenter() {
    const camera = this.cameras.main;
    return new Phaser.Math.Vector2(
      camera.scrollX + camera.width / 2,
      camera.scrollY + camera.height / 2,
    );
  }

  private clampDeveloperCamera() {
    const camera = this.cameras.main;
    const center = this.clampDeveloperCenter(camera.scrollX + camera.width / 2, camera.scrollY + camera.height / 2);
    camera.scrollX = center.x - camera.width / 2;
    camera.scrollY = center.y - camera.height / 2;
  }

  private clampDeveloperCenter(x: number, y: number) {
    const camera = this.cameras.main;
    const visibleWidth = camera.width / camera.zoom;
    const visibleHeight = camera.height / camera.zoom;
    const halfVisibleWidth = visibleWidth / 2;
    const halfVisibleHeight = visibleHeight / 2;
    const centerX =
      visibleWidth >= WORLD_WIDTH
        ? WORLD_WIDTH / 2
        : Phaser.Math.Clamp(x, halfVisibleWidth, WORLD_WIDTH - halfVisibleWidth);
    const centerY =
      visibleHeight >= WORLD_HEIGHT
        ? WORLD_HEIGHT / 2
        : Phaser.Math.Clamp(y, halfVisibleHeight, WORLD_HEIGHT - halfVisibleHeight);

    return new Phaser.Math.Vector2(centerX, centerY);
  }

  private minDeveloperZoom() {
    const camera = this.cameras.main;
    return Math.max(0.006, Math.min(camera.width / WORLD_WIDTH, camera.height / WORLD_HEIGHT) * 0.8);
  }

  private createLightingOverlay() {
    this.lightingOverlay = this.add.graphics().setDepth(5000).setScrollFactor(0);
  }

  private handleInput() {
    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    if (this.devCameraEnabled) {
      body.setAcceleration(0);
      this.lastJumpPressed = false;
      return;
    }

    const left = this.cursors.left.isDown || this.keys.left.isDown;
    const right = this.cursors.right.isDown || this.keys.right.isDown;
    const up = this.cursors.up.isDown || this.keys.up.isDown;
    const down = this.cursors.down.isDown || this.keys.down.isDown;
    const acceleration = 760;
    const inWater = this.hero.y >= WATERLINE_Y;
    const nearSurface = this.hero.y <= WATERLINE_Y + 64;
    const jumpPressed = up && !this.lastJumpPressed;
    const hasUpwardMomentum = inWater && body.velocity.y < SURFACE_BREACH_SPEED;
    this.lastJumpPressed = up;

    body.setAcceleration(0);
    if (left) body.setAccelerationX(inWater ? -acceleration : -acceleration * 0.24);
    if (right) body.setAccelerationX(inWater ? acceleration : acceleration * 0.24);
    if ((jumpPressed || hasUpwardMomentum) && nearSurface && !this.isSurfaceJumping) {
      body.setVelocityY(SURFACE_JUMP_VELOCITY);
      body.setAccelerationY(0);
      this.isSurfaceJumping = true;
    }
    if (inWater && up) body.setAccelerationY(-acceleration * 0.72);
    if (inWater && down) body.setAccelerationY(acceleration * 0.72);
  }

  private updateSurfacePhysics(time: number) {
    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    const nearSurface = this.hero.y < WATERLINE_Y + 64;
    const airborne = this.hero.y < WATERLINE_Y - 2;

    if (this.isSurfaceJumping) {
      body.setDrag(0.04, 0);
      body.setGravityY(AIR_GRAVITY);

      if (this.hero.y >= WATERLINE_Y && body.velocity.y >= 0) {
        this.isSurfaceJumping = false;
      }

      return;
    }

    body.setGravityY(airborne ? AIR_GRAVITY : 0);

    if (airborne) {
      body.setDrag(0.04, 0);
      return;
    }

    body.setDrag(0.9, 0.9);
    if (!nearSurface) return;

    const bob = Math.sin(time * 0.0016 + this.hero.x * 0.006) * 3;
    const targetY = SURFACE_REST_Y + bob;
    const canBreach = body.velocity.y < SURFACE_BREACH_SPEED;
    if (canBreach) {
      body.setVelocityY(Math.max(body.velocity.y, SURFACE_BREACH_MAX_VELOCITY));
      return;
    }

    const displacement = targetY - this.hero.y;
    const spring = Phaser.Math.Clamp(displacement * 10 - body.velocity.y * 0.22, -220, 220);
    body.setAccelerationY(body.acceleration.y + spring);

    if (this.hero.y < WATERLINE_Y + 4 && body.velocity.y < 0) {
      body.setVelocityY(body.velocity.y * 0.22);
    }
  }

  private updateHeroPresentation() {
    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    if (Math.abs(body.velocity.x) > 12) {
      this.heroDirectionX = body.velocity.x > 0 ? 1 : -1;
      this.faceSprite(this.hero, "port-jackson", this.heroDirectionX);
    }

    const verticalPitch = Phaser.Math.Clamp(body.velocity.y / 760, -0.32, 0.32);
    this.hero.setRotation(verticalPitch * this.heroDirectionX);
  }

  private updateParallax(delta: number) {
    this.cameras.main.setRoundPixels(true);
    const seconds = delta / 1000;
    for (const cloud of this.skyClouds) {
      cloud.container.x += cloud.speed * seconds;
      if (cloud.container.x > WORLD_WIDTH + cloud.width) {
        cloud.container.x = -cloud.width;
      }
    }
  }

  private updateLighting() {
    this.lightingOverlay.clear();
    if (this.devCameraEnabled) return;

    const depth = depthAtPosition(this.hero.x, this.hero.y);
    const inCave = this.isHeroInCave();
    const dimFactor = Phaser.Math.Clamp((depth - 50) / 150, 0, 1);
    const blackoutFactor = Phaser.Math.Clamp((depth - 200) / 100, 0, 1);
    const camera = this.cameras.main;
    const width = camera.width;
    const height = camera.height;

    const colorWashAlpha = Phaser.Math.Linear(0, 0.34, dimFactor);
    const ambientDarkAlpha = Phaser.Math.Linear(0, 0.38, dimFactor) + blackoutFactor * 0.57 + (inCave ? 0.14 : 0);

    if (depth <= 50 && !inCave) return;

    this.lightingOverlay.fillStyle(0x1b3447, colorWashAlpha);
    this.lightingOverlay.fillRect(0, 0, width, height);

    this.lightingOverlay.fillStyle(
      0x000711,
      Phaser.Math.Clamp(ambientDarkAlpha, 0, 0.9),
    );
    this.lightingOverlay.fillRect(0, 0, width, height);
  }

  private updateHud() {
    const zone = this.isHeroInCave() ? CAVE_ZONE : zoneAtPosition(this.hero.x, this.hero.y);
    if (zone.id !== this.currentZoneId) {
      this.currentZoneId = zone.id;
      if (this.zoneLabel) this.zoneLabel.textContent = zone.name;
    }
    if (this.depthLabel) {
      const depth = depthAtPosition(this.hero.x, this.hero.y);
      const depthPercent = Phaser.Math.Clamp(depth / DEPTH_GAUGE_MAX, 0, 1) * 100;
      this.depthLabel.textContent = `${depth}m`;
      if (this.depthGaugeFill) {
        this.depthGaugeFill.style.height = `${depthPercent}%`;
      }
      if (this.depthMarker) {
        this.depthMarker.style.top = `${depthPercent}%`;
      }
      if (this.depthGaugeMax) {
        this.depthGaugeMax.textContent = `${DEPTH_GAUGE_MAX}m`;
      }
    }
  }

  private updateCaveVisibility() {
    const inCave = this.isHeroInCave();
    if (this.caveTileLayer) {
      this.caveTileLayer.setVisible(this.devCameraEnabled || inCave);
      this.caveTileLayer.setAlpha(this.devCameraEnabled && !inCave ? 0.74 : 0.95);
    }
    if (this.caveBiomeCurtain) {
      this.caveBiomeCurtain.setVisible(inCave && !this.devCameraEnabled);
    }
  }

  private isHeroInCave() {
    const tx = Math.floor(this.hero.x / TILE);
    const ty = Math.floor(this.hero.y / TILE);
    return this.caveTiles.has(tileKey(tx, ty));
  }
}
