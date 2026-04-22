import Phaser from "phaser";
import type { Socket } from "socket.io-client";
import { MOVE_EMIT_MS, MOVE_SPEED, WORLD_H, WORLD_W } from "./gameWorld";

const PLAYER_TEX = "playerBlob";
const FLOOR_TEX = "conferenceFloorTile";
const DESK_S_TEX = "deskSmall";
const DESK_M_TEX = "deskMedium";
const DESK_L_TEX = "deskLong";
const PERSON_TEX = "boothPerson";
const BOOTH_COUNT = 20;
const SPAWN_CLEAR_RADIUS = 100;
const PLAY_MARGIN = 300;

const PROP_MONITOR_TEX = "propMonitor";
const PROP_BANNER_TEX = "propBanner";
const PROP_PEDESTAL_TEX = "propPedestal";
const PROP_POSTER_BOARD_TEX = "propPosterBoard";

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (t >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function fillForSocketId(socketId: string): number {
  let h = 0;
  for (let i = 0; i < socketId.length; i++) {
    h = (Math.imul(31, h) + socketId.charCodeAt(i)) | 0;
  }
  return (0x5a5a5a + (Math.abs(h) % 0xa0a0a0)) & 0xffffff;
}

function offsetFromSocketId(socketId: string): { dx: number; dy: number } {
  let h = 0;
  for (let i = 0; i < socketId.length; i++) {
    h = (Math.imul(37, h) + socketId.charCodeAt(i)) | 0;
  }
  const angle = Math.abs(h % 360) * (Math.PI / 180);
  const radius = 56 + (Math.abs(h >> 8) % 28);
  return {
    dx: Math.round(Math.cos(angle) * radius),
    dy: Math.round(Math.sin(angle) * radius),
  };
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
  private interactKey!: Phaser.Input.Keyboard.Key;
  private escKey!: Phaser.Input.Keyboard.Key;

  private localPlayer!: Phaser.Physics.Arcade.Sprite;
  private localBody!: Phaser.Physics.Arcade.Body;
  private remote = new Map<string, Phaser.GameObjects.Sprite>();
  private remoteTargets = new Map<string, { x: number; y: number }>();
  private remoteBubbles = new Map<string, { text: Phaser.GameObjects.Text; expiresAt: number }>();
  private localBubble?: { text: Phaser.GameObjects.Text; expiresAt: number };
  private lastEmit = 0;
  private localColorHex = "#3498db";

  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private boothRng!: () => number;
  private npcs: Phaser.GameObjects.Sprite[] = [];
  private props: Phaser.GameObjects.Sprite[] = [];
  private posterBoards: Phaser.GameObjects.Sprite[] = [];

  private activePopup?: Phaser.GameObjects.Container;
  private activePrompt?: Phaser.GameObjects.Text;
  private floorLayer!: Phaser.GameObjects.TileSprite;

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
    s.setScale(1);
    s.setDepth(y);
    return s;
  }

  private onPlayerJoined = (payload: { socketId: string; color?: string; x?: number; y?: number }) => {
    if (payload.socketId === this.socket.id) return;
    if (this.remote.has(payload.socketId)) return;
    const fallback = offsetFromSocketId(payload.socketId);
    const x = typeof payload.x === "number" ? payload.x : this.localPlayer.x + fallback.dx;
    const y = typeof payload.y === "number" ? payload.y : this.localPlayer.y + fallback.dy;
    const sprite = this.makeRemoteSprite(x, y, this.remoteTint(payload));
    this.remote.set(payload.socketId, sprite);
    this.remoteTargets.set(payload.socketId, { x, y });
  };

  public showChatBubble(payload: { socketId: string; content: string }) {
    const clipped = payload.content.length > 36 ? `${payload.content.slice(0, 36)}...` : payload.content;
    const expiresAt = this.time.now + 2600;
    const baseStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: "system-ui, Segoe UI, sans-serif",
      fontSize: "12px",
      color: "#e2e8f0",
      backgroundColor: "#0f172acc",
      padding: { x: 6, y: 3 },
      align: "center",
    };

    if (payload.socketId === this.socket.id) {
      this.localBubble?.text.destroy();
      const text = this.add.text(this.localPlayer.x, this.localPlayer.y - 42, clipped, baseStyle).setOrigin(0.5, 1).setDepth(3000);
      this.localBubble = { text, expiresAt };
      return;
    }

    const remote = this.remote.get(payload.socketId);
    if (!remote) return;
    const existing = this.remoteBubbles.get(payload.socketId);
    existing?.text.destroy();
    const text = this.add.text(remote.x, remote.y - 42, clipped, baseStyle).setOrigin(0.5, 1).setDepth(3000);
    this.remoteBubbles.set(payload.socketId, { text, expiresAt });
  }

  public applyRemoteSnapshot(players: Array<{ socketId: string; color?: string; x?: number; y?: number }>) {
    const liveIds = new Set(players.map((p) => p.socketId));
    for (const [socketId, sprite] of this.remote.entries()) {
      if (!liveIds.has(socketId)) {
        sprite.destroy();
        this.remote.delete(socketId);
        this.remoteTargets.delete(socketId);
        const bubble = this.remoteBubbles.get(socketId);
        bubble?.text.destroy();
        this.remoteBubbles.delete(socketId);
      }
    }

    for (const player of players) {
      if (player.socketId === this.socket.id) continue;
      const existing = this.remote.get(player.socketId);
      if (!existing) {
        this.onPlayerJoined(player);
      } else if (player.color) {
        existing.setTint(this.remoteTint(player));
      }

      if (typeof player.x === "number" && typeof player.y === "number") {
        this.remoteTargets.set(player.socketId, { x: player.x, y: player.y });
      }
    }
  }


  preload() {
    this.load.image("keanLogo", "/keanLogo.png");
    this.load.image("posterExample", "/posterExample.jpg");
  }

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

  private bakeTexture(
    key: string,
    width: number,
    height: number,
    draw: (g: Phaser.GameObjects.Graphics) => void
  ) {
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
      g.fillStyle(0x91552c, 1);
      g.fillRect(0, 0, 64, 64);

      const brickW = 32;
      const brickH = 16;

      for (let row = 0; row < 4; row++) {
        const offset = row % 2 === 0 ? 0 : 16;

        for (let col = -1; col < 3; col++) {
          const x = col * brickW + offset;
          const y = row * brickH;

          g.fillStyle(0xa86436, 1);
          g.fillRect(x, y, brickW - 1, brickH - 1);

          g.fillStyle(0xc27a45, 1);
          g.fillRect(x, y, brickW - 1, 2);

          g.fillStyle(0x6b3a1c, 1);
          g.fillRect(x, y + brickH - 3, brickW - 1, 2);

          g.fillStyle(0x6a3a1d, 1);
          g.fillRect(x + 6, y + 6, 2, 2);
          g.fillRect(x + 20, y + 9, 2, 1);
        }
      }

      g.fillStyle(0x5a321a, 1);
      for (let y = 15; y < 64; y += 16) {
        g.fillRect(0, y, 64, 1);
      }

      for (let row = 0; row < 4; row++) {
        const offset = row % 2 === 0 ? 0 : 16;
        for (let x = offset + 31; x < 64; x += 32) {
          g.fillRect(x, row * 16, 1, 16);
        }
      }
    });

    const bakeDesk = (key: string, w: number, h: number) => {
      this.bakeTexture(key, w, h, (g) => {
        const topY = Math.floor(h * 0.25);
        const topH = Math.floor(h * 0.15);
        const cornerRadius = 2;

        g.fillStyle(0xa86a3a, 1);
        g.fillRect(cornerRadius, topY, w - cornerRadius * 2, topH);
        g.fillRect(0, topY + cornerRadius, cornerRadius, topH - cornerRadius);
        g.fillRect(w - cornerRadius, topY + cornerRadius, cornerRadius, topH - cornerRadius);
        g.fillRect(0, topY + cornerRadius, cornerRadius, cornerRadius);
        g.fillRect(w - cornerRadius, topY + cornerRadius, cornerRadius, cornerRadius);

        g.fillStyle(0xc9a961, 1);
        g.fillRect(cornerRadius, topY, w - cornerRadius * 2, 1);

        g.fillStyle(0x8b5a2b, 1);
        g.fillRect(0, Math.floor(h * 0.4), w, Math.floor(h * 0.35));

        g.fillStyle(0x5c3417, 1);
        g.fillRect(0, Math.floor(h * 0.75) - 1, w, 1);

        const legW = Math.floor(w * 0.18);
        const legH = Math.floor(h * 0.25);
        g.fillStyle(0x4a2812, 1);
        g.fillRect(Math.floor(w * 0.1), Math.floor(h * 0.75), legW, legH);
        g.fillRect(w - Math.floor(w * 0.28), Math.floor(h * 0.75), legW, legH);

        g.fillStyle(0x3a1f0f, 1);
        g.fillRect(Math.floor(w * 0.1), h - 2, legW, 2);
        g.fillRect(w - Math.floor(w * 0.28), h - 2, legW, 2);
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

    this.bakeTexture(PROP_POSTER_BOARD_TEX, 50, 80, (g) => {
      g.fillStyle(0x451a03, 1);
      g.fillRoundedRect(16, 60, 18, 16, 3);

      g.fillStyle(0xfef3c7, 0.95);
      g.fillRoundedRect(8, 12, 34, 52, 4);

      g.lineStyle(2, 0x92400e, 1);
      g.strokeRoundedRect(8, 12, 34, 52, 4);

      g.fillStyle(0xfde68a, 0.7);
      g.fillRoundedRect(12, 18, 26, 20, 2);

      g.fillStyle(0x92400e, 0.6);
      g.fillRect(14, 22, 22, 2);
      g.fillRect(14, 26, 22, 1);
      g.fillRect(14, 29, 18, 1);

      g.fillStyle(0xd97706, 0.4);
      g.fillRect(10, 42, 30, 1);

      g.fillRect(14, 46, 22, 2);
      g.fillRect(14, 50, 20, 1);
    });

  }

  private setupWorldLayers() {
    this.floorLayer = this.add.tileSprite(0, 0, WORLD_W, WORLD_H, FLOOR_TEX);
    this.floorLayer.setOrigin(0, 0).setDepth(-10).setAlpha(1);
    this.socket.on("player-joined", this.onPlayerJoined);
    
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
  }

  private getNearbyPoster(maxDistance = 70): Phaser.GameObjects.Sprite | undefined {
    let nearest: Phaser.GameObjects.Sprite | undefined;
    let best = maxDistance;

    for (const poster of this.posterBoards) {
      const d = Phaser.Math.Distance.Between(
        this.localPlayer.x,
        this.localPlayer.y,
        poster.x,
        poster.y
      );

      if (d < best) {
        best = d;
        nearest = poster;
      }
    }

    return nearest;
  }

  private showPosterPopup(title: string, description: string, imageKey?: string) {
    this.closePosterPopup();

    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;

    const container = this.add.container(cx, cy).setScrollFactor(0).setDepth(100_000);

    const overlay = this.add.rectangle(0, 0, cam.width, cam.height, 0x000000, 0.45);

    const hasImage = Boolean(imageKey);
    const panelW = hasImage ? 760 : 520;
    const panelH = hasImage ? 600 : 300;
    const panel = this.add.rectangle(0, 0, panelW, panelH, 0x1e1b16, 0.96).setStrokeStyle(3, 0xc27a45, 1);

    const titleText = this.add
      .text(0, hasImage ? -258 : -108, title, {
        fontFamily: "system-ui, Segoe UI, sans-serif",
        fontSize: "22px",
        color: "#f8ead6",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: hasImage ? 440 : 340 },
      })
      .setOrigin(0.5);

    let posterImage: Phaser.GameObjects.Image | undefined;
    if (imageKey) {
  
      this.textures.get(imageKey).setFilter(Phaser.Textures.FilterMode.LINEAR);

      posterImage = this.add.image(0, -40, imageKey);
      posterImage.setOrigin(0.5);

      const tex = posterImage.texture;
      const srcW = tex.getSourceImage().width || 1;
      const srcH = tex.getSourceImage().height || 1;
      const maxW = 700;
      const maxH = 390;
      const scale = Math.min(1, maxW / srcW, maxH / srcH);
      posterImage.setScale(scale);
    }

    const bodyText = this.add
      .text(0, hasImage ? 210 : -6, description, {
        fontFamily: "system-ui, Segoe UI, sans-serif",
        fontSize: "16px",
        color: "#f3e7d5",
        align: "center",
        wordWrap: { width: hasImage ? 460 : 340 },
        lineSpacing: 4,
      })
      .setOrigin(0.5);

    const closeText = this.add
      .text(0, hasImage ? 266 : 116, "Press E or ESC to close", {
        fontFamily: "system-ui, Segoe UI, sans-serif",
        fontSize: "14px",
        color: "#d6b48a",
        align: "center",
      })
      .setOrigin(0.5);

    const parts: Phaser.GameObjects.GameObject[] = [overlay, panel, titleText];
    if (posterImage) parts.push(posterImage);
    parts.push(bodyText, closeText);
    container.add(parts);
    this.activePopup = container;
  }

  private closePosterPopup() {
    if (this.activePopup) {
      this.activePopup.destroy();
      this.activePopup = undefined;
    }
  }

  private updateInteractionPrompt() {
    const nearbyPoster = this.getNearbyPoster();

    if (!this.activePrompt) {
      this.activePrompt = this.add
        .text(0, 0, "", {
          fontFamily: "system-ui, Segoe UI, sans-serif",
          fontSize: "14px",
          color: "#fff7ed",
          backgroundColor: "#000000cc",
          padding: { x: 8, y: 4 },
        })
        .setOrigin(0.5)
        .setDepth(900);
    }

    if (this.activePopup) {
      this.activePrompt.setVisible(false);
      return;
    }

    if (nearbyPoster) {
      this.activePrompt
        .setText("Press E to view poster")
        .setPosition(nearbyPoster.x, nearbyPoster.y - 54)
        .setVisible(true);
    } else {
      this.activePrompt.setVisible(false);
    }
  }

  private spawnBooths() {
    this.obstacles = this.physics.add.staticGroup();

    for (const s of this.npcs) s.destroy();
    this.npcs = [];

    for (const p of this.props) p.destroy();
    this.props = [];

    this.posterBoards = [];

    const posterKeepOut: Phaser.Geom.Rectangle[] = [];
    const textureSize = (key: string): { w: number; h: number } => {
      switch (key) {
        case PROP_MONITOR_TEX:
          return { w: 28, h: 24 };
    
        case PROP_BANNER_TEX:
          return { w: 26, h: 66 };
        case PROP_PEDESTAL_TEX:
          return { w: 30, h: 40 };
        case PROP_POSTER_BOARD_TEX:
          return { w: 50, h: 80 };
        default:
          return { w: 32, h: 32 };
      }
    };

    const rectCentered = (x: number, y: number, w: number, h: number, pad = 0) => {
      return new Phaser.Geom.Rectangle(x - w / 2 - pad, y - h / 2 - pad, w + pad * 2, h + pad * 2);
    };

    const intersectsPoster = (x: number, y: number, w: number, h: number) => {
      const r = rectCentered(x, y, w, h, 6);
      for (const pr of posterKeepOut) {
        if (Phaser.Geom.Intersects.RectangleToRectangle(r, pr)) return true;
      }
      return false;
    };

    const nudgeAwayFromPosters = (
      x: number,
      y: number,
      w: number,
      h: number
    ): { x: number; y: number; ok: boolean } => {
      if (!intersectsPoster(x, y, w, h)) return { x, y, ok: true };

      const tries = [
        { dx: 40, dy: 0 },
        { dx: -40, dy: 0 },
        { dx: 70, dy: 0 },
        { dx: -70, dy: 0 },
        { dx: 0, dy: 36 },
        { dx: 0, dy: -36 },
      ];

      for (const t of tries) {
        const nx = x + t.dx;
        const ny = y + t.dy;
        if (!intersectsPoster(nx, ny, w, h)) return { x: nx, y: ny, ok: true };
      }

      return { x, y, ok: false };
    };

    const pr = this.playRect();
    const rnd = this.boothRng;

    const cols = 5;
    const rows = 4;
    const marginX = Math.min(120, pr.w * 0.1);
    const marginY = Math.min(100, pr.h * 0.12);
    const usableW = pr.w - marginX * 2;
    const usableH = pr.h - marginY * 2;
    const stepX = usableW / (cols - 1);
    const stepY = usableH / (rows - 1);

    const placed: Array<{ x: number; y: number }> = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        placed.push({
          x: Math.round(pr.x + marginX + c * stepX + (rnd() - 0.5) * 20),
          y: Math.round(pr.y + marginY + r * stepY + (rnd() - 0.5) * 16),
        });
      }
    }

    const booths = placed
      .sort((a, b) => Math.hypot(a.x - pr.cx, a.y - pr.cy) - Math.hypot(b.x - pr.cx, b.y - pr.cy))
      .filter((p) => Math.hypot(p.x - pr.cx, p.y - pr.cy) > SPAWN_CLEAR_RADIUS + 20)
      .slice(0, BOOTH_COUNT);


    const boothTitles = [
      "AI Resume Review",
      "Cloud Careers",
      "Cybersecurity Lab",
      "Data Science Projects",
      "Internship Opportunities",
      "Startup Demo Booth",
      "Research Showcase",
      "Software Engineering Careers",
    ];

    const boothDescriptions = [
      "Live feedback on resumes and project portfolios for students preparing for internships and entry-level roles.",
      "Overview of cloud engineering pathways, certifications, and entry-level project ideas.",
      "Hands-on walkthrough of basic security tools, threat awareness, and secure coding practices.",
      "Examples of data analytics dashboards, machine learning demos, and dataset exploration.",
      "Information about applications, deadlines, and tips for landing internships.",
      "Student founders sharing app prototypes, product concepts, and technical challenges.",
      "Faculty and student researchers presenting current research projects and poster sessions.",
      "Examples of software engineering roles, team workflows, and real-world development tools.",
    ];

    let examplePosterUsed = false;
    for (const p of booths) {
      const roll = rnd();
      const deskKey = roll < 0.4 ? DESK_S_TEX : roll < 0.78 ? DESK_M_TEX : DESK_L_TEX;

      const dx = p.x + Math.round((rnd() - 0.5) * 18);
      const dy = p.y + Math.round((rnd() - 0.5) * 10);

      const desk = this.physics.add.staticSprite(dx, dy, deskKey);
      desk.setDepth(dy + 2);
      desk.setData("kind", "desk");
      desk.setData("serverId", this.serverId);

      const palettes = [0xc27a45, 0xb86b3c, 0xd19a66, 0x9f5c32, 0xe0a15d];
      const accent = palettes[Math.floor(rnd() * palettes.length)];
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

      const npc = this.add.sprite(
        dx + Math.round((rnd() - 0.5) * 16),
        dy - 24 + Math.round((rnd() - 0.5) * 6),
        PERSON_TEX
      );
      npc.setDepth(dy + 1);
      npc.setTint((0x808080 + Math.floor(rnd() * 0x7f7f7f)) & 0xffffff);
      this.npcs.push(npc);

      let hasPosterBoard = false;
      if (rnd() < 0.55) {
        const posterSide = rnd() < 0.5 ? -1 : 1;
        const posterX = dx + posterSide * (deskKey === DESK_L_TEX ? 90 : 70);
        const posterY = dy - 8;

        const idx = Math.floor(rnd() * boothTitles.length);
        const poster = this.add.sprite(posterX, posterY, PROP_POSTER_BOARD_TEX);
        poster.setDepth(posterY - 10);

        const isExample = !examplePosterUsed;
        if (isExample) {
          examplePosterUsed = true;
          poster.setData("imageKey", "posterExample");
          poster.setData("title", "Poster Example");
          poster.setData("description", "Example of a real poster image displayed in the popup.");
        } else {
          poster.setData("title", boothTitles[idx]);
          poster.setData("description", boothDescriptions[idx]);
        }
        this.props.push(poster);
        this.posterBoards.push(poster);

        const { w, h } = textureSize(PROP_POSTER_BOARD_TEX);
        posterKeepOut.push(rectCentered(posterX, posterY, w, h, 10));
        hasPosterBoard = true;
      }

      if (rnd() < 0.8) {
        const mx = dx - 10 + Math.round((rnd() - 0.5) * 10);
        const my = dy - 18;
        const { w, h } = textureSize(PROP_MONITOR_TEX);
        const nudged = nudgeAwayFromPosters(mx, my, w, h);
        if (nudged.ok) {
          const monitor = this.add.sprite(nudged.x, nudged.y, PROP_MONITOR_TEX);
          monitor.setDepth(dy + 3);
          monitor.setTint(accent);
          this.props.push(monitor);
        }
      }



      if (!hasPosterBoard && rnd() < 0.38) {
        const side = rnd() < 0.5 ? -1 : 1;
        const bx = dx + side * (deskKey === DESK_L_TEX ? 82 : 66);
        const by = dy - 4;
        const { w, h } = textureSize(PROP_BANNER_TEX);
        const nudged = nudgeAwayFromPosters(bx, by, w, h);
        if (nudged.ok) {
          const banner = this.add.sprite(nudged.x, nudged.y, PROP_BANNER_TEX);
          banner.setDepth(dy + 1);
          banner.setTint(accent);
          this.props.push(banner);
        }
      }

      if (!hasPosterBoard && rnd() < 0.18) {
        const ex = dx + (rnd() < 0.5 ? -54 : 54);
        const ey = dy + 18;
        const { w, h } = textureSize(PROP_PEDESTAL_TEX);
        const nudged = nudgeAwayFromPosters(ex, ey, w, h);
        if (nudged.ok) {
          const pedestal = this.add.sprite(nudged.x, nudged.y, PROP_PEDESTAL_TEX);
          pedestal.setDepth(dy + 2);
          this.props.push(pedestal);
        }
      }
    }
  }
 
  create() {
    this.boothRng = mulberry32(
      889 +
        this.serverId.length * 131 +
        [...this.serverId].reduce((a, c) => a + c.charCodeAt(0), 0)
    );

    this.createGeneratedTextures();
    this.setupWorldLayers();

    const pr = this.playRect();
    this.physics.world.setBounds(pr.x, pr.y, pr.w, pr.h);

    this.spawnBooths();
    const logo = this.add.image(pr.cx, pr.cy, "keanLogo");
    logo.setScale(0.34);
    logo.setAlpha(0.55);
    logo.setDepth(pr.cy - 90);

      
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

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,S,A,D") as Wasd;
    this.interactKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.socket.off("player-joined", this.onPlayerJoined);

      for (const sprite of this.remote.values()) {
        sprite.destroy();
      }
      this.remote.clear();

      this.remoteTargets.clear();
      for (const bubble of this.remoteBubbles.values()) {
        bubble.text.destroy();
      }
      this.remoteBubbles.clear();
      this.localBubble?.text.destroy();
      this.localBubble = undefined;
      for (const npc of this.npcs) npc.destroy();
      this.npcs = [];

      for (const p of this.props) p.destroy();
      this.props = [];

      this.posterBoards = [];
      this.activePrompt?.destroy();
      this.activePrompt = undefined;
      this.closePosterPopup();
    });
  }

  update(time: number, delta: number) {
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

    for (const [socketId, sprite] of this.remote.entries()) {
      const target = this.remoteTargets.get(socketId);
      if (!target) continue;
      const lerp = 1 - Math.exp(-delta / 85);
      const nx = Phaser.Math.Linear(sprite.x, target.x, lerp);
      const ny = Phaser.Math.Linear(sprite.y, target.y, lerp);
      sprite.setPosition(nx, ny);
      sprite.setDepth(ny);
      const bubble = this.remoteBubbles.get(socketId);
      if (bubble) {
        bubble.text.setPosition(nx, ny - 42);
        if (this.time.now >= bubble.expiresAt) {
          bubble.text.destroy();
          this.remoteBubbles.delete(socketId);
        }
      }
    }

    const py = this.localPlayer.y;
    this.localPlayer.setDepth(py);
    if (this.localBubble) {
      this.localBubble.text.setPosition(this.localPlayer.x, this.localPlayer.y - 42);
      if (this.time.now >= this.localBubble.expiresAt) {
        this.localBubble.text.destroy();
        this.localBubble = undefined;
      }
    }

    const moving = vx !== 0 || vy !== 0;
    this.localPlayer.setFlipX(vx < 0);

    if (!moving) {
      this.localPlayer.setAngle(0);
    } else {
      const bob = Math.sin(time / 120) * 2.5;
      this.localPlayer.setAngle(bob * 0.08);
    }

    this.updateInteractionPrompt();

    if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
      if (this.activePopup) {
        this.closePosterPopup();
      } else {
        const nearbyPoster = this.getNearbyPoster();
        if (nearbyPoster) {
          this.showPosterPopup(
            nearbyPoster.getData("title"),
            nearbyPoster.getData("description"),
            nearbyPoster.getData("imageKey")
          );
        }
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.closePosterPopup();
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