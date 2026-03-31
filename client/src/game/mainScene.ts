import Phaser from "phaser";
import type { Socket } from "socket.io-client";
import { MOVE_EMIT_MS, MOVE_SPEED, WORLD_H, WORLD_W } from "./gameWorld";

const PLAYER_TEX = "playerBlob";
const FLOOR_TEX = "conferenceFloorTile";
const DESK_S_TEX = "deskSmall";
const DESK_M_TEX = "deskMedium";
const DESK_L_TEX = "deskLong";
const PERSON_TEX = "boothPerson";
const BOOTH_COUNT = 18;
const SPAWN_CLEAR_RADIUS = 150;
// Shrinks the playable movement rectangle inside the world.
const PLAY_MARGIN = 300;

const PROP_MONITOR_TEX = "propMonitor";
const PROP_PLANT_TEX = "propPlant";
const PROP_BANNER_TEX = "propBanner";
const PROP_PEDESTAL_TEX = "propPedestal";

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function spawnFromSocketId(socketId: string): { x: number; y: number } {
  let h = 0;
  for (let i = 0; i < socketId.length; i++) {
    h = (Math.imul(31, h) + socketId.charCodeAt(i)) | 0;
  }
  const pad = 120;
  const x = pad + (Math.abs(h) % (WORLD_W - pad * 2));
  const y = pad + (Math.abs(h >> 16) % (WORLD_H - pad * 2));
  return { x, y };
}

function fillForSocketId(socketId: string): number {
  let h = 0;
  for (let i = 0; i < socketId.length; i++) {
    h = (Math.imul(31, h) + socketId.charCodeAt(i)) | 0;
  }
  return (0x5a5a5a + (Math.abs(h) % 0xa0a0a0)) & 0xffffff;
}

function hexStringToPhaserColor(hex: string): number {
  const s = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/u.test(s)) {
    return Number.parseInt(s.slice(1), 16);
  }
  return 0x3498db;
}

type Wasd = {
  W: Phaser.Input.Keyboard.Key;
  S: Phaser.Input.Keyboard.Key;
  A: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
};

export class MainScene extends Phaser.Scene {
  private socket!: Socket;
  private serverId!: string;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Wasd;
  private localPlayer!: Phaser.Physics.Arcade.Sprite;
  private localBody!: Phaser.Physics.Arcade.Body;
  private remote = new Map<string, Phaser.GameObjects.Sprite>();
  private lastEmit = 0;
  private localColorHex = "#3498db";
  private hudText?: Phaser.GameObjects.Text;
  private floorLayer!: Phaser.GameObjects.TileSprite;
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private boothRng!: () => number;
  private npcs: Phaser.GameObjects.Sprite[] = [];
  private props: Phaser.GameObjects.Sprite[] = [];

  private playRect() {
    const m = Math.max(0, Math.floor(PLAY_MARGIN));
    const x = m;
    const y = m;
    const w = Math.max(200, WORLD_W - m * 2);
    const h = Math.max(200, WORLD_H - m * 2);
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  }

  private remoteTint(payload: { socketId: string; color?: string }): number {
    return payload.color ? hexStringToPhaserColor(payload.color) : fillForSocketId(payload.socketId);
  }

  private makeRemoteSprite(x: number, y: number, tint: number): Phaser.GameObjects.Sprite {
    const s = this.add.sprite(x, y, PLAYER_TEX);
    s.setTint(tint);
    s.setDepth(y);
    return s;
  }

  private onPlayerJoined = (payload: { socketId: string; color?: string }) => {
    if (payload.socketId === this.socket.id) return;
    if (this.remote.has(payload.socketId)) return;
    const { x, y } = spawnFromSocketId(payload.socketId);
    const sprite = this.makeRemoteSprite(x, y, this.remoteTint(payload));
    this.remote.set(payload.socketId, sprite);
  };

  private onPlayerMoved = (payload: { socketId: string; x: number; y: number; color?: string }) => {
    if (payload.socketId === this.socket.id) return;
    let sprite = this.remote.get(payload.socketId);
    if (!sprite) {
      sprite = this.makeRemoteSprite(payload.x, payload.y, this.remoteTint(payload));
      this.remote.set(payload.socketId, sprite);
    }
    sprite.setPosition(payload.x, payload.y);
    sprite.setDepth(payload.y);
    if (payload.color) {
      sprite.setTint(this.remoteTint(payload));
    }
  };

  constructor() {
    super("MainScene");
  }

  init(data: { socket: Socket; serverId: string; localColorHex?: string }) {
    this.socket = data.socket;
    this.serverId = data.serverId;
    if (data.localColorHex) {
      this.localColorHex = data.localColorHex;
    }
  }

  private bakeTexture(key: string, width: number, height: number, draw: (g: Phaser.GameObjects.Graphics) => void) {
    const g = this.add.graphics();
    g.setVisible(false);
    draw(g);
    g.generateTexture(key, width, height);
    g.destroy();
  }

  private createGeneratedTextures() {
    this.bakeTexture(PLAYER_TEX, 32, 40, (playerG) => {
      playerG.fillStyle(0xffffff, 1);
      playerG.fillCircle(16, 9, 7);
      playerG.fillRoundedRect(7, 16, 18, 22, 5);
      playerG.lineStyle(2, 0x000000, 0.12);
      playerG.strokeCircle(16, 9, 7);
      playerG.strokeRoundedRect(7, 16, 18, 22, 5);
    });

    this.bakeTexture(FLOOR_TEX, 64, 64, (g) => {
      // Warm wood plank tile (repeats cleanly).
      g.fillStyle(0x7a4a2a, 1);
      g.fillRect(0, 0, 64, 64);

      // Planks: 4 planks across (16px each).
      const plankW = 16;
      for (let p = 0; p < 4; p++) {
        const x = p * plankW;
        const base = p % 2 === 0 ? 0x8a5731 : 0x7f4f2d;
        g.fillStyle(base, 1);
        g.fillRect(x, 0, plankW, 64);

        // subtle grain lines
        g.fillStyle(0x55301a, 0.16);
        for (let i = 0; i < 5; i++) {
          const yy = 8 + i * 11 + ((p * 3 + i) % 4);
          g.fillRect(x + 2, yy, plankW - 4, 1);
        }

        // tiny knots
        g.fillStyle(0x3f2415, 0.18);
        const kx = x + 6 + (p % 3);
        const ky = 18 + (p * 9) % 32;
        g.fillCircle(kx, ky, 2);
        g.fillCircle(kx + 5, ky + 17, 1.6);
      }

      // Plank seams
      g.fillStyle(0x2a170c, 0.45);
      for (let x = plankW; x < 64; x += plankW) {
        g.fillRect(x - 1, 0, 2, 64);
      }
      // Light highlight on seams for depth
      g.fillStyle(0xfde68a, 0.06);
      for (let x = plankW; x < 64; x += plankW) {
        g.fillRect(x + 1, 0, 1, 64);
      }
    });

    const bakeDesk = (key: string, w: number, h: number) => {
      this.bakeTexture(key, w, h, (g) => {
        // Base desktop
        g.fillStyle(0x0f172a, 0.95);
        g.fillRoundedRect(2, 10, w - 4, h - 14, 10);
        g.fillStyle(0x1f2a44, 1);
        g.fillRoundedRect(4, 12, w - 8, h - 18, 9);

        // Front panel (where "branding" would go)
        g.fillStyle(0x334155, 1);
        g.fillRoundedRect(8, Math.floor(h * 0.52), w - 16, Math.floor(h * 0.38), 8);

        // Top strip
        g.fillStyle(0x60a5fa, 0.9);
        g.fillRoundedRect(10, 14, w - 20, 12, 6);

        // Legs
        g.fillStyle(0x0b1220, 0.7);
        g.fillRoundedRect(10, h - 10, 10, 8, 3);
        g.fillRoundedRect(w - 20, h - 10, 10, 8, 3);

        g.lineStyle(2, 0x0b1220, 0.55);
        g.strokeRoundedRect(4, 12, w - 8, h - 18, 9);
        g.fillStyle(0xffffff, 0.12);
        g.fillCircle(14, 20, 3);
      });
    };

    bakeDesk(DESK_S_TEX, 76, 58);
    bakeDesk(DESK_M_TEX, 104, 60);
    bakeDesk(DESK_L_TEX, 140, 62);

    this.bakeTexture(PERSON_TEX, 26, 36, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(13, 10, 7);
      g.fillStyle(0x94a3b8, 1);
      g.fillRoundedRect(6, 17, 14, 16, 5);
      g.fillStyle(0x0b1220, 0.22);
      g.fillEllipse(13, 34, 16, 6);
    });

    this.bakeTexture(PROP_MONITOR_TEX, 28, 24, (g) => {
      g.fillStyle(0x0b1220, 0.9);
      g.fillRoundedRect(2, 2, 24, 16, 4);
      g.fillStyle(0x38bdf8, 0.35);
      g.fillRoundedRect(4, 4, 20, 12, 3);
      g.fillStyle(0x0b1220, 0.8);
      g.fillRoundedRect(11, 18, 6, 3, 1.5);
      g.fillRoundedRect(8, 21, 12, 2, 1);
    });

    this.bakeTexture(PROP_PLANT_TEX, 28, 34, (g) => {
      g.fillStyle(0x1f2937, 0.95);
      g.fillRoundedRect(6, 22, 16, 10, 4);
      g.fillStyle(0x14532d, 1);
      g.fillEllipse(14, 16, 22, 18);
      g.fillStyle(0x22c55e, 0.65);
      g.fillEllipse(11, 14, 12, 10);
      g.fillStyle(0x0b1220, 0.22);
      g.fillEllipse(14, 32, 18, 5);
    });

    this.bakeTexture(PROP_BANNER_TEX, 26, 66, (g) => {
      g.fillStyle(0x0b1220, 0.6);
      g.fillRect(12, 6, 2, 54);
      g.fillStyle(0x1d4ed8, 0.95);
      g.fillRoundedRect(3, 6, 20, 40, 6);
      g.fillStyle(0x60a5fa, 0.75);
      g.fillRoundedRect(6, 12, 14, 10, 4);
      g.fillStyle(0xf8fafc, 0.55);
      g.fillRect(6, 26, 14, 2);
      g.fillRect(6, 31, 12, 2);
      g.fillStyle(0x0b1220, 0.55);
      g.fillEllipse(13, 60, 18, 6);
    });

    this.bakeTexture(PROP_PEDESTAL_TEX, 30, 40, (g) => {
      g.fillStyle(0x0f172a, 0.95);
      g.fillRoundedRect(6, 10, 18, 24, 6);
      g.fillStyle(0x334155, 1);
      g.fillRoundedRect(8, 12, 14, 20, 5);
      g.fillStyle(0xf59e0b, 0.85);
      g.fillCircle(15, 8, 6);
      g.fillStyle(0x0b1220, 0.22);
      g.fillEllipse(15, 36, 20, 6);
    });
  }

  private setupWorldLayers() {
    this.floorLayer = this.add
      .tileSprite(0, 0, WORLD_W, WORLD_H, FLOOR_TEX)
      .setOrigin(0, 0)
      .setDepth(-10)
      .setAlpha(1);

    const g = this.add.graphics().setDepth(-9);
    g.fillStyle(0x050914, 0.6);
    const border = 16;
    g.fillRect(0, 0, WORLD_W, border);
    g.fillRect(0, WORLD_H - border, WORLD_W, border);
    g.fillRect(0, 0, border, WORLD_H);
    g.fillRect(WORLD_W - border, 0, border, WORLD_H);

    g.fillStyle(0x0f172a, 0.7);
    const inset = 56;
    g.fillRect(inset, inset, WORLD_W - inset * 2, WORLD_H - inset * 2);

    g.lineStyle(2, 0x1f2a44, 0.85);
    for (let x = inset + 60; x < WORLD_W - (inset + 60); x += 220) {
      g.beginPath();
      g.moveTo(x, inset + 40);
      g.lineTo(x, WORLD_H - (inset + 40));
      g.strokePath();
    }
  }

  private spawnBooths() {
    this.obstacles = this.physics.add.staticGroup();
    for (const s of this.npcs) s.destroy();
    this.npcs = [];
    for (const p of this.props) p.destroy();
    this.props = [];

    const pr = this.playRect();
    const rnd = this.boothRng;
    const cols = 6;
    const rows = 3;
    const marginX = Math.min(220, pr.w * 0.18);
    const marginY = Math.min(220, pr.h * 0.22);
    const usableW = pr.w - marginX * 2;
    const usableH = pr.h - marginY * 2;
    const stepX = usableW / (cols - 1);
    const stepY = usableH / (rows - 1);

    const placed: Array<{ x: number; y: number }> = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        placed.push({
          x: Math.round(pr.x + marginX + c * stepX + (rnd() - 0.5) * 32),
          y: Math.round(pr.y + marginY + r * stepY + (rnd() - 0.5) * 28),
        });
      }
    }

    const booths = placed
      .sort((a, b) => Math.hypot(a.x - pr.cx, a.y - pr.cy) - Math.hypot(b.x - pr.cx, b.y - pr.cy))
      .filter((p) => Math.hypot(p.x - pr.cx, p.y - pr.cy) > SPAWN_CLEAR_RADIUS + 70)
      .slice(0, BOOTH_COUNT);

    for (const p of booths) {
      const roll = rnd();
      const deskKey = roll < 0.4 ? DESK_S_TEX : roll < 0.78 ? DESK_M_TEX : DESK_L_TEX;
      const desk = this.physics.add.staticSprite(p.x, p.y, deskKey);
      desk.setDepth(p.y + 2);
      desk.setData("kind", "desk");
      desk.setData("serverId", this.serverId);

      // Color variation (brand vibe).
      const palettes = [0x60a5fa, 0xa78bfa, 0x34d399, 0xfbbf24, 0xf472b6];
      const accent = palettes[Math.floor(rnd() * palettes.length)];
      desk.setTint((0xcbd5e1 + Math.floor(rnd() * 0x1a1a1a)) & 0xffffff);
      desk.setData("accent", accent);

      desk.refreshBody();
      const body = desk.body as Phaser.Physics.Arcade.StaticBody;
      if (deskKey === DESK_S_TEX) {
        body.setSize(68, 28);
        body.setOffset(4, 24);
      } else if (deskKey === DESK_M_TEX) {
        body.setSize(96, 28);
        body.setOffset(4, 26);
      } else {
        body.setSize(132, 28);
        body.setOffset(4, 28);
      }
      desk.refreshBody();
      this.obstacles.add(desk);

      const npc = this.add.sprite(p.x, p.y - 26, PERSON_TEX);
      npc.setDepth(p.y + 1);
      npc.setTint((0x808080 + Math.floor(rnd() * 0x7f7f7f)) & 0xffffff);
      this.npcs.push(npc);

      // Conference props: monitor/laptop, banner, plant, pedestal.
      if (rnd() < 0.8) {
        const monitor = this.add.sprite(p.x - 10 + (rnd() - 0.5) * 10, p.y - 18, PROP_MONITOR_TEX);
        monitor.setDepth(p.y + 3);
        monitor.setTint(accent);
        this.props.push(monitor);
      }
      if (rnd() < 0.5) {
        const plant = this.add.sprite(p.x + (deskKey === DESK_L_TEX ? 60 : 42), p.y - 10, PROP_PLANT_TEX);
        plant.setDepth(p.y + 2);
        this.props.push(plant);
      }
      if (rnd() < 0.45) {
        const side = rnd() < 0.5 ? -1 : 1;
        const banner = this.add.sprite(p.x + side * (deskKey === DESK_L_TEX ? 82 : 66), p.y - 4, PROP_BANNER_TEX);
        banner.setDepth(p.y + 1);
        banner.setTint(accent);
        this.props.push(banner);
      }
      if (rnd() < 0.22) {
        const pedestal = this.add.sprite(p.x + (rnd() < 0.5 ? -54 : 54), p.y + 18, PROP_PEDESTAL_TEX);
        pedestal.setDepth(p.y + 2);
        this.props.push(pedestal);
      }
    }
  };

  create() {
    this.boothRng = mulberry32(889 + this.serverId.length * 131 + [...this.serverId].reduce((a, c) => a + c.charCodeAt(0), 0));

    this.createGeneratedTextures();
    this.setupWorldLayers();

    const pr = this.playRect();
    this.physics.world.setBounds(pr.x, pr.y, pr.w, pr.h);

    this.spawnBooths();

    const localTint = hexStringToPhaserColor(this.localColorHex);
    const localSprite = this.physics.add.sprite(pr.cx, pr.cy, PLAYER_TEX);
    localSprite.setTint(localTint);
    localSprite.setCollideWorldBounds(true);
    localSprite.setDepth(10);
    const body = localSprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(24, 30);
    body.setOffset(4, 6);
    this.localPlayer = localSprite;
    this.localBody = body;

    this.physics.add.collider(this.localPlayer, this.obstacles);

    this.cameras.main.setBounds(pr.x, pr.y, pr.w, pr.h);
    this.cameras.main.startFollow(this.localPlayer, true, 0.09, 0.09);
    this.cameras.main.setDeadzone(90, 70);

    this.hudText?.destroy();
    this.hudText = this.add
      .text(12, 10, "Conference hall — move with WASD/arrow keys. Interactions coming soon.", {
        fontFamily: "system-ui, Segoe UI, sans-serif",
        fontSize: "15px",
        color: "#e2e8f0",
        backgroundColor: "#0f172acc",
        padding: { x: 10, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(200);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,S,A,D") as Wasd;

    this.socket.on("player-joined", this.onPlayerJoined);
    this.socket.on("player-moved", this.onPlayerMoved);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.socket.off("player-joined", this.onPlayerJoined);
      this.socket.off("player-moved", this.onPlayerMoved);
      for (const sprite of this.remote.values()) {
        sprite.destroy();
      }
      this.remote.clear();
      for (const npc of this.npcs) npc.destroy();
      this.npcs = [];
      for (const p of this.props) p.destroy();
      this.props = [];
    });
  }

  update(time: number, _delta: number) {
    const cam = this.cameras.main;
    this.floorLayer.tilePositionX = cam.scrollX * 0.15;
    this.floorLayer.tilePositionY = cam.scrollY * 0.12;

    let vx = 0;
    let vy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) vx = -MOVE_SPEED;
    else if (this.cursors.right.isDown || this.wasd.D.isDown) vx = MOVE_SPEED;
    if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -MOVE_SPEED;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) vy = MOVE_SPEED;

    if (vx !== 0 && vy !== 0) {
      const f = MOVE_SPEED / Math.sqrt(vx * vx + vy * vy);
      vx *= f;
      vy *= f;
    }

    this.localBody.setVelocity(vx, vy);

    const py = this.localPlayer.y;
    this.localPlayer.setDepth(py);

    const moving = vx !== 0 || vy !== 0;
    this.localPlayer.setFlipX(vx < 0);
    if (!moving) {
      this.localPlayer.setAngle(0);
    } else {
      const bob = Math.sin(time / 120) * 2.5;
      this.localPlayer.setAngle(bob * 0.08);
    }

    if (time - this.lastEmit < MOVE_EMIT_MS) return;
    this.socket.emit("player-move", {
      serverId: this.serverId,
      x: this.localPlayer.x,
      y: this.localPlayer.y,
    });
    this.lastEmit = time;
  }
}
