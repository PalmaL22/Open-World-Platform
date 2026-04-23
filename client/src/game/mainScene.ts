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
const VITA_COCO_TEX = "vitaCoco";
const CAHSI_TEX = "cahsi";
const LINKEDIN_TEX = "linkedIn";
const SPONSOR_BOOTH_INDEX = 2;
const CAHSI_BOOTH_INDEX = 1;
const LINKEDIN_BOOTH_INDEX = 3;
const SPECIAL_POSTER_COUNT = 3;

const CHAT_STACK_MAX = 2;
const BUBBLE_BASE_OFF = 48;
const BUBBLE_STACK_GAP = 8;
const BUBBLE_FADE_MS = 6000;
const CHAT_BUBBLE_TTL_MS = 7000;

function shuffleIndices(n: number, rnd: () => number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
  return arr;
}

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

type ChatBubbleEntry = {
  text: Phaser.GameObjects.Text;
  expiresAt: number;
  fadeTween?: Phaser.Tweens.Tween;
};

export class MainScene extends Phaser.Scene {
  private socket!: Socket;
  private serverId!: string;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Wasd;
  private interactKey!: Phaser.Input.Keyboard.Key;
  private escKey!: Phaser.Input.Keyboard.Key;

  private floorLayer!: Phaser.GameObjects.TileSprite;
  private localPlayer!: Phaser.Physics.Arcade.Sprite;
  private localBody!: Phaser.Physics.Arcade.Body;
  private remote = new Map<string, Phaser.GameObjects.Sprite>();
  private remoteTargets = new Map<string, { x: number; y: number }>();
  private remoteBubbles = new Map<string, ChatBubbleEntry[]>();
  private localBubbleStack: ChatBubbleEntry[] = [];
  private pendingRemoteSnapshot: Array<{ socketId: string; color?: string; x?: number; y?: number }> | null = null;
  private pendingRemoteJoins: Array<{ socketId: string; color?: string; x?: number; y?: number }> = [];
  private lastEmit = 0;
  private localColorHex = "#3498db";

  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private boothRng!: () => number;
  private npcs: Phaser.GameObjects.Sprite[] = [];
  private props: Phaser.GameObjects.Sprite[] = [];
  private posterBoards: Phaser.GameObjects.Sprite[] = [];

  private activePopup?: Phaser.GameObjects.Container;
  private activePrompt?: Phaser.GameObjects.Text;
  private boothLayoutFromServer: unknown = null;

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

  
    if (!this.textures.exists(PLAYER_TEX)) {
      this.pendingRemoteJoins.push(payload);
      return;
    }

    const fallback = offsetFromSocketId(payload.socketId);
    const x = typeof payload.x === "number" ? payload.x : this.localPlayer.x + fallback.dx;
    const y = typeof payload.y === "number" ? payload.y : this.localPlayer.y + fallback.dy;
    const sprite = this.makeRemoteSprite(x, y, this.remoteTint(payload));
    this.remote.set(payload.socketId, sprite);
    this.remoteTargets.set(payload.socketId, { x, y });
  };

  private destroyChatEntry(entry: ChatBubbleEntry) {
    entry.fadeTween?.stop();
    entry.fadeTween = undefined;
    if (entry.text?.active) {
      entry.text.destroy();
    }
  }

  private clearChatStack(stack: ChatBubbleEntry[]) {
    for (const e of stack) {
      this.destroyChatEntry(e);
    }
    stack.length = 0;
  }

  private removeChatEntryIfPresent(stack: ChatBubbleEntry[], entry: ChatBubbleEntry) {
    const i = stack.indexOf(entry);
    if (i < 0) return;
    this.destroyChatEntry(entry);
    stack.splice(i, 1);
  }

  private applyChatStackLayout(
    stack: ChatBubbleEntry[],
    getNewestBottom: () => { x: number; y: number },
  ) {
    if (stack.length === 0) return;
    if (stack.length === 1) {
      const p = getNewestBottom();
      stack[0].text.setPosition(p.x, p.y);
      return;
    }
    const oldest = stack[0].text;
    const newest = stack[1].text;
    const p = getNewestBottom();
    newest.setPosition(p.x, p.y);
    oldest.setPosition(p.x, p.y - newest.height - BUBBLE_STACK_GAP);
  }

  private pushMessageOntoStack(
    stack: ChatBubbleEntry[],
    displayText: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    getNewestBottom: () => { x: number; y: number },
  ) {
    if (stack.length >= CHAT_STACK_MAX) {
      const evicted = stack.shift()!;
      this.destroyChatEntry(evicted);
    }

    if (stack.length === 1) {
      const prev = stack[0];
      prev.fadeTween?.stop();
      prev.text.setAlpha(1);
      const tw = this.tweens.add({
        targets: prev.text,
        alpha: 0,
        duration: BUBBLE_FADE_MS,
        onComplete: () => {
          this.removeChatEntryIfPresent(stack, prev);
        },
      });
      prev.fadeTween = tw;
    }

    const p = getNewestBottom();
    const text = this.add
      .text(p.x, p.y, displayText, style)
      .setOrigin(0.5, 1)
      .setDepth(3000)
      .setAlpha(1);
    const expiresAt =
      stack.length > 0
        ? stack[0]!.expiresAt
        : this.time.now + CHAT_BUBBLE_TTL_MS;
    stack.push({ text, expiresAt });
    this.applyChatStackLayout(stack, getNewestBottom);
  }

  public showChatBubble(payload: { socketId: string; content: string }) {
    const displayText = payload.content;
    const maxBubbleWidth = 240;
    const baseStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: "system-ui, Segoe UI, sans-serif",
      fontSize: "14px",
      color: "#e2e8f0",
      backgroundColor: "#0f172acc",
      padding: { x: 8, y: 5 },
      align: "center",
      wordWrap: { width: maxBubbleWidth, useAdvancedWrap: true },
    };

    if (payload.socketId === this.socket.id) {
      this.pushMessageOntoStack(this.localBubbleStack, displayText, baseStyle, () => ({
        x: this.localPlayer.x,
        y: this.localPlayer.y - BUBBLE_BASE_OFF,
      }));
      return;
    }

    const remote = this.remote.get(payload.socketId);
    if (!remote) return;
    const stack = this.remoteBubbles.get(payload.socketId) ?? [];
    this.pushMessageOntoStack(stack, displayText, baseStyle, () => ({
      x: remote.x,
      y: remote.y - BUBBLE_BASE_OFF,
    }));
    this.remoteBubbles.set(payload.socketId, stack);
  }

  public applyRemoteSnapshot(players: Array<{ socketId: string; color?: string; x?: number; y?: number }>) {
    if (!this.textures.exists(PLAYER_TEX)) {
      this.pendingRemoteSnapshot = players;
      return;
    }

    const liveIds = new Set(players.map((p) => p.socketId));
    for (const [socketId, sprite] of this.remote.entries()) {
      if (!liveIds.has(socketId)) {
        sprite.destroy();
        this.remote.delete(socketId);
        this.remoteTargets.delete(socketId);
        const st = this.remoteBubbles.get(socketId);
        if (st) this.clearChatStack(st);
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
    this.load.image("posterExample", "/posterExample.PNG");
    this.load.image(VITA_COCO_TEX, "/vitaCoco.png");
    this.load.image(CAHSI_TEX, "/cahsi.png");
    this.load.image(LINKEDIN_TEX, "/linkedIn.png");
  }

  constructor() {
    super("MainScene");
  }

  init(data: { socket: Socket; serverId: string; localColorHex?: string; boothLayout?: unknown }) {
    this.socket = data.socket;
    this.serverId = data.serverId;
    if (data.localColorHex) {
      this.localColorHex = data.localColorHex;
    }
    this.boothLayoutFromServer = data.boothLayout ?? null;
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

  private showPosterPopup(
    title: string,
    description: string,
    imageKey?: string,
    actions?: Array<{ label: string; url: string }>
  ) {
    this.closePosterPopup();

    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;

    const container = this.add.container(cx, cy).setScrollFactor(0).setDepth(100_000);
    const sf0 = <T extends Phaser.GameObjects.GameObject>(obj: T): T => {
      (obj as unknown as { setScrollFactor?: (x: number, y?: number) => void }).setScrollFactor?.(0);
      return obj;
    };

    const overlay = sf0(this.add.rectangle(0, 0, cam.width, cam.height, 0x000000, 0.45));

    const posterMode = Boolean(imageKey);
    const safeActions = posterMode ? [] : (actions ?? []).filter((a) => a?.url).slice(0, 3);
    const panelW = posterMode ? 960 : 560;
    const maxPanelH = Math.max(260, cam.height - 120);
    const measureTextHeight = (txt: string, style: Phaser.Types.GameObjects.Text.TextStyle) => {
      const t = this.add.text(-10_000, -10_000, txt, style).setVisible(false);
      const h = t.height;
      t.destroy();
      return h;
    };

    const isMultiActionLayout = !posterMode && safeActions.length >= 2;
    const titleStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: "system-ui, Segoe UI, sans-serif",
      fontSize: "22px",
      color: "#e2e8f0",
      fontStyle: "bold",
      align: "center",
      wordWrap: { width: panelW - 120 },
    };
    const bodyStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: "system-ui, Segoe UI, sans-serif",
      fontSize: "16px",
      color: "#cbd5e1",
      align: "center",
      wordWrap: { width: panelW - 140 },
      lineSpacing: 6,
    };

    const baseTextPanelH = 320;
    const titleH = posterMode || isMultiActionLayout ? 0 : measureTextHeight(title, titleStyle);
    const bodyH = posterMode || isMultiActionLayout ? 0 : measureTextHeight(description, bodyStyle);
    const hasSingleAction = !posterMode && safeActions.length === 1;
    const singleActionH = hasSingleAction ? 42 + 34 : 0; 
    const dynamicTextPanelH = Math.ceil(32 + titleH + 18 + bodyH + singleActionH + 56);

    const panelH = posterMode
      ? 720
      : isMultiActionLayout
        ? safeActions.length >= 3
          ? 320
          : 310
        : Math.min(maxPanelH, Math.max(280, dynamicTextPanelH, baseTextPanelH));
    const borderThickness = 3;
    const panel = sf0(
      this.add
        .rectangle(0, 0, panelW, panelH, 0x0b1220, 0.965)
        .setStrokeStyle(borderThickness, 0x60a5fa, 0.9)
    );

    const innerW = panelW - borderThickness * 2;
    const innerH = panelH - borderThickness * 2;

    const parts: Phaser.GameObjects.GameObject[] = [overlay, panel];

    if (posterMode && imageKey) {
      this.textures.get(imageKey).setFilter(Phaser.Textures.FilterMode.LINEAR);

      const posterImage = sf0(this.add.image(0, 0, imageKey).setOrigin(0.5));
      const tex = posterImage.texture;
      const srcW = tex.getSourceImage().width || 1;
      const srcH = tex.getSourceImage().height || 1;
      const scale = Math.min(innerW / srcW, innerH / srcH);
      posterImage.setScale(scale);
      parts.push(posterImage);

      const closeText = sf0(
        this.add
          .text(0, panelH / 2 + 24, "Press E or ESC to close", {
            fontFamily: "system-ui, Segoe UI, sans-serif",
            fontSize: "14px",
            color: "#d6b48a",
            align: "center",
          })
          .setOrigin(0.5)
      );
      parts.push(closeText);
    } else {
      const titleY = -panelH / 2 + 32;
      const titleText = sf0(this.add.text(0, titleY, title, titleStyle).setOrigin(0.5, 0));

      const bodyY = titleY + titleText.height + 18;
      const bodyText = sf0(this.add.text(0, bodyY, description, bodyStyle).setOrigin(0.5, 0));

      if (safeActions.length) {
        if (safeActions.length >= 2) {
          bodyText.setVisible(false);

          const cols = safeActions.length;
          const contentW = panelW - 120;
          const colW = contentW / cols;
          const startX = -contentW / 2 + colW / 2;

          const titleY = -panelH / 2 + 34;
          const namesY = titleY + 80;
          const buttonsY = namesY + 64;
          const btnW = Math.min(160, colW - 16);
          const btnH = 40;

          for (let i = 0; i < cols; i++) {
            const a = safeActions[i]!;
            const x = startX + i * colW;

            const nameText = sf0(
              this.add
                .text(x, namesY, a.label, {
                  fontFamily: "system-ui, Segoe UI, sans-serif",
                  fontSize: "16px",
                  color: "#e2e8f0",
                  fontStyle: "bold",
                  align: "center",
                  wordWrap: { width: colW - 18 },
                })
                .setOrigin(0.5)
            );

            const btnBg = sf0(
              this.add
                .rectangle(x, buttonsY, btnW, btnH, 0x2563eb, 0.98)
                .setStrokeStyle(2, 0x93c5fd, 0.9)
                .setInteractive({ useHandCursor: true })
            );

            const btnText = sf0(
              this.add
                .text(x, buttonsY, "Connect", {
                  fontFamily: "system-ui, Segoe UI, sans-serif",
                  fontSize: "15px",
                  color: "#f8fafc",
                  fontStyle: "bold",
                  align: "center",
                })
                .setOrigin(0.5)
            );

            const open = () => window.open(a.url, "_blank", "noopener,noreferrer");
            btnBg.on("pointerdown", open);
            btnText.setInteractive({ useHandCursor: true }).on("pointerdown", open);

            btnBg.on("pointerover", () => {
              btnBg.setFillStyle(0x1d4ed8, 1);
              btnBg.setStrokeStyle(2, 0xbfdbfe, 1);
            });
            btnBg.on("pointerout", () => {
              btnBg.setFillStyle(0x2563eb, 0.98);
              btnBg.setStrokeStyle(2, 0x93c5fd, 0.9);
            });

            parts.push(nameText, btnBg, btnText);
          }
        } else {
          const a = safeActions[0]!;
          const btnW = Math.min(360, panelW - 120);
          const btnH = 42;
          const y = bodyY + bodyText.height + 28 + btnH / 2;

          const btnBg = sf0(
            this.add
              .rectangle(0, y, btnW, btnH, 0x2563eb, 0.98)
              .setStrokeStyle(2, 0x93c5fd, 0.9)
              .setInteractive({ useHandCursor: true })
          );

          const btnText = sf0(
            this.add
              .text(0, y, a.label, {
                fontFamily: "system-ui, Segoe UI, sans-serif",
                fontSize: "15px",
                color: "#f8fafc",
                fontStyle: "bold",
                align: "center",
              })
              .setOrigin(0.5)
          );

          const open = () => window.open(a.url, "_blank", "noopener,noreferrer");
          btnBg.on("pointerdown", open);
          btnText.setInteractive({ useHandCursor: true }).on("pointerdown", open);

          btnBg.on("pointerover", () => {
            btnBg.setFillStyle(0x1d4ed8, 1);
            btnBg.setStrokeStyle(2, 0xbfdbfe, 1);
          });
          btnBg.on("pointerout", () => {
            btnBg.setFillStyle(0x2563eb, 0.98);
            btnBg.setStrokeStyle(2, 0x93c5fd, 0.9);
          });

          parts.push(btnBg, btnText);
        }
      }

      const closeText = sf0(
        this.add
          .text(0, panelH / 2 - 26, "Press E or ESC to close", {
            fontFamily: "system-ui, Segoe UI, sans-serif",
            fontSize: "14px",
            color: "#94a3b8",
            align: "center",
          })
          .setOrigin(0.5)
      );

      parts.push(titleText, bodyText, closeText);
    }

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

    type SavedPosterData =
      | { kind: "image"; imageKey: string; title: string; description: string }
      | { kind: "text"; title: string; description: string; actionLabel?: string; actionUrl?: string }
      | { kind: "actions"; title: string; actions: Array<{ label: string; url: string }> };

    type SavedBoothLayoutV1 = {
      v: 1;
      serverId: string;
      playRect: { x: number; y: number; w: number; h: number };
      booths: Array<{
        deskKey: string;
        dx: number;
        dy: number;
        accent: number;
        npc: { x: number; y: number; tint: number };
        poster?: { x: number; y: number; data: SavedPosterData };
        monitor?: { x: number; y: number; tint: number };
        banner?: { x: number; y: number; tint: number };
        pedestal?: { x: number; y: number };
        floorLogos?: Array<{
          texKey: string;
          x: number;
          y: number;
          originX: number;
          originY: number;
          depth: number;
          scale: number;
          alpha: number;
          tint?: number;
        }>;
      }>;
    };

    const pr = this.playRect();
    const storageKey = `owp:boothLayout:v1:${this.serverId}`;
    const loadSavedLayout = (): SavedBoothLayoutV1 | null => {
      try {
        if (this.boothLayoutFromServer && typeof this.boothLayoutFromServer === "object") {
          const parsed = this.boothLayoutFromServer as SavedBoothLayoutV1;
          if (parsed?.v === 1 && parsed.serverId === this.serverId && parsed.playRect?.w === pr.w && parsed.playRect?.h === pr.h) {
            return parsed;
          }
        }

        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as SavedBoothLayoutV1;
        if (!parsed || parsed.v !== 1) return null;
        if (parsed.serverId !== this.serverId) return null;
        const r = parsed.playRect;
        if (!r || r.w !== pr.w || r.h !== pr.h || r.x !== pr.x || r.y !== pr.y) return null;
        if (!Array.isArray(parsed.booths) || parsed.booths.length === 0) return null;
        return parsed;
      } catch {
        return null;
      }
    };

    const applySavedLayout = (layout: SavedBoothLayoutV1) => {
      for (const b of layout.booths) {
        const desk = this.physics.add.staticSprite(b.dx, b.dy, b.deskKey);
        desk.setDepth(b.dy + 2);
        desk.setData("kind", "desk");
        desk.setData("serverId", this.serverId);
        desk.setData("accent", b.accent);
        desk.refreshBody();
        const body = desk.body as Phaser.Physics.Arcade.StaticBody;
        if (b.deskKey === DESK_S_TEX) {
          body.setSize(68, 28);
          body.setOffset(4, 24);
        } else if (b.deskKey === DESK_M_TEX) {
          body.setSize(96, 28);
          body.setOffset(4, 26);
        } else {
          body.setSize(132, 28);
          body.setOffset(4, 28);
        }
        desk.refreshBody();
        this.obstacles.add(desk);

        const npc = this.add.sprite(b.npc.x, b.npc.y, PERSON_TEX);
        npc.setDepth(b.dy + 1);
        npc.setTint(b.npc.tint);
        this.npcs.push(npc);

        if (b.poster) {
          const poster = this.add.sprite(b.poster.x, b.poster.y, PROP_POSTER_BOARD_TEX);
          poster.setDepth(b.poster.y - 10);
          const d = b.poster.data;
          if (d.kind === "image") {
            poster.setData("imageKey", d.imageKey);
            poster.setData("title", d.title);
            poster.setData("description", d.description);
          } else if (d.kind === "actions") {
            poster.setData("title", d.title);
            poster.setData("actions", d.actions);
          } else {
            poster.setData("title", d.title);
            poster.setData("description", d.description);
            if (d.actionUrl) {
              poster.setData("actionUrl", d.actionUrl);
              poster.setData("actionLabel", d.actionLabel ?? "More info");
            }
          }
          this.props.push(poster);
          this.posterBoards.push(poster);
        }

        if (b.monitor) {
          const monitor = this.add.sprite(b.monitor.x, b.monitor.y, PROP_MONITOR_TEX);
          monitor.setDepth(b.dy + 3);
          monitor.setTint(b.monitor.tint);
          this.props.push(monitor);
        }
        if (b.banner) {
          const banner = this.add.sprite(b.banner.x, b.banner.y, PROP_BANNER_TEX);
          banner.setDepth(b.dy + 1);
          banner.setTint(b.banner.tint);
          this.props.push(banner);
        }
        if (b.pedestal) {
          const pedestal = this.add.sprite(b.pedestal.x, b.pedestal.y, PROP_PEDESTAL_TEX);
          pedestal.setDepth(b.dy + 2);
          this.props.push(pedestal);
        }

        if (b.floorLogos?.length) {
          for (const fl of b.floorLogos) {
            const s = this.add.sprite(fl.x, fl.y, fl.texKey);
            s.setOrigin(fl.originX, fl.originY);
            s.setDepth(fl.depth);
            s.setScale(fl.scale);
            s.setAlpha(fl.alpha);
            s.setAngle(0);
            if (typeof fl.tint === "number") s.setTint(fl.tint);
            this.props.push(s);
          }
        }
      }
    };

    const saved = loadSavedLayout();
    if (saved) {
      applySavedLayout(saved);
      return;
    }

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

    const themeCount = boothTitles.length;
    const themeOrder = shuffleIndices(themeCount, rnd);
    const uniquePosterSlots = Math.min(1 + themeCount + SPECIAL_POSTER_COUNT, booths.length);

    const layoutToSave: SavedBoothLayoutV1 = {
      v: 1,
      serverId: this.serverId,
      playRect: { x: pr.x, y: pr.y, w: pr.w, h: pr.h },
      booths: [],
    };

    for (let bi = 0; bi < booths.length; bi++) {
      const p = booths[bi]!;
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
      const npcTint = (0x808080 + Math.floor(rnd() * 0x7f7f7f)) & 0xffffff;
      npc.setTint(npcTint);
      this.npcs.push(npc);

      const boothSave: SavedBoothLayoutV1["booths"][number] = {
        deskKey,
        dx,
        dy,
        accent,
        npc: { x: npc.x, y: npc.y, tint: npcTint },
      };

      let hasPosterBoard = false;
      let posterSideForBooth: number | undefined;
      if (bi < uniquePosterSlots) {
        posterSideForBooth = rnd() < 0.5 ? -1 : 1;
        const posterX = dx + posterSideForBooth * (deskKey === DESK_L_TEX ? 90 : 70);
        const posterY = dy - 8;

        const poster = this.add.sprite(posterX, posterY, PROP_POSTER_BOARD_TEX);
        poster.setDepth(posterY - 10);

        if (bi === 0) {
          poster.setData("imageKey", "posterExample");
          poster.setData("title", "Poster Example");
          poster.setData("description", "Example of a real poster image displayed in the popup.");
          boothSave.poster = {
            x: posterX,
            y: posterY,
            data: {
              kind: "image",
              imageKey: "posterExample",
              title: "Poster Example",
              description: "Example of a real poster image displayed in the popup.",
            },
          };
        } else if (bi === SPONSOR_BOOTH_INDEX) {
          const t = "Vita Coco — sponsor information";
          const d =
            "Vita Coco coconut water is one of our conference hydration sponsors. " +
            "It is naturally a source of electrolytes like potassium, which supports everyday hydration. " +
            "Attendees often reach for it when they want to feel refreshed—and for that post-coffee, post-catering reset people half-jokingly call their “deblotating” drink.";
          poster.setData("title", t);
          poster.setData("description", d);
          boothSave.poster = { x: posterX, y: posterY, data: { kind: "text", title: t, description: d } };
        } else if (bi === CAHSI_BOOTH_INDEX) {
          const t = "Join the CAHSI Alliance";
          const d =
            "The Computing Alliance of Hispanic-Serving Institutions (CAHSI) is a national network dedicated to helping students succeed in computer science and technology fields. " +
            "By joining, you gain access to research opportunities, internships with top companies, mentorship from experienced professionals, and resources to prepare for graduate school.\n\n";
          const actionLabel = "More info";
          const actionUrl = "https://cahsi.utep.edu/";
          poster.setData("title", t);
          poster.setData("description", d);
          poster.setData("actionLabel", actionLabel);
          poster.setData("actionUrl", actionUrl);
          boothSave.poster = {
            x: posterX,
            y: posterY,
            data: { kind: "text", title: t, description: d, actionLabel, actionUrl },
          };
        } else if (bi === LINKEDIN_BOOTH_INDEX) {
          poster.setData("title", "Connect with us on LinkedIn!");
          
          const acts = [
            { label: "Jonathan Conde", url: "https://www.linkedin.com/in/condejonathan/" },
            { label: "Felipe Monsalvo", url: "https://www.linkedin.com/in/felipe-monsalvo/" },
            { label: "Luis Palma", url: "https://www.linkedin.com/in/palmaluis/" },
          ];
          poster.setData("actions", acts);
          boothSave.poster = {
            x: posterX,
            y: posterY,
            data: { kind: "actions", title: "Connect with us on LinkedIn!", actions: acts },
          };
        } else {
          const specialsBefore =
            (SPONSOR_BOOTH_INDEX > 0 && SPONSOR_BOOTH_INDEX < bi ? 1 : 0) +
            (CAHSI_BOOTH_INDEX > 0 && CAHSI_BOOTH_INDEX < bi ? 1 : 0) +
            (LINKEDIN_BOOTH_INDEX > 0 && LINKEDIN_BOOTH_INDEX < bi ? 1 : 0);
          const themeSlot = bi - 1 - specialsBefore;
          const themeIdx = themeOrder[themeSlot]!;
          const t = boothTitles[themeIdx]!;
          const d = boothDescriptions[themeIdx]!;
          poster.setData("title", t);
          poster.setData("description", d);
          boothSave.poster = { x: posterX, y: posterY, data: { kind: "text", title: t, description: d } };
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
          boothSave.monitor = { x: nudged.x, y: nudged.y, tint: accent };
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
          boothSave.banner = { x: nudged.x, y: nudged.y, tint: accent };
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
          boothSave.pedestal = { x: nudged.x, y: nudged.y };
        }
      }

      layoutToSave.booths.push(boothSave);

      if (bi === SPONSOR_BOOTH_INDEX && this.textures.exists(VITA_COCO_TEX)) {
        const vy = dy + 44;
        const floorLogoShadow = this.add.sprite(dx + 3, vy + 3, VITA_COCO_TEX);
        floorLogoShadow.setOrigin(0.5, 0.25);
        floorLogoShadow.setDepth(dy - 0.1);
        floorLogoShadow.setScale(0.205);
        floorLogoShadow.setTint(0x000000);
        floorLogoShadow.setAlpha(0.28);
        floorLogoShadow.setAngle(0);
        this.props.push(floorLogoShadow);

        const floorLogo = this.add.sprite(dx, vy, VITA_COCO_TEX);
        floorLogo.setOrigin(0.5, 0.25);
        floorLogo.setDepth(dy);
        floorLogo.setScale(0.19);
        floorLogo.setAlpha(0.82);
        floorLogo.setAngle(0);
        this.props.push(floorLogo);

        boothSave.floorLogos ??= [];
        boothSave.floorLogos.push(
          {
            texKey: VITA_COCO_TEX,
            x: dx + 3,
            y: vy + 3,
            originX: 0.5,
            originY: 0.25,
            depth: dy - 0.1,
            scale: 0.205,
            alpha: 0.28,
            tint: 0x000000,
          },
          {
            texKey: VITA_COCO_TEX,
            x: dx,
            y: vy,
            originX: 0.5,
            originY: 0.25,
            depth: dy,
            scale: 0.19,
            alpha: 0.82,
          }
        );
      }

      if (bi === CAHSI_BOOTH_INDEX && this.textures.exists(CAHSI_TEX)) {
        const vy = dy + 44;
        const floorLogoShadow = this.add.sprite(dx + 3, vy + 3, CAHSI_TEX);
        floorLogoShadow.setOrigin(0.5, 0.25);
        floorLogoShadow.setDepth(dy - 0.1);
        floorLogoShadow.setScale(0.054);
        floorLogoShadow.setTint(0x000000);
        floorLogoShadow.setAlpha(0.28);
        floorLogoShadow.setAngle(0);
        this.props.push(floorLogoShadow);

        const floorLogo = this.add.sprite(dx, vy, CAHSI_TEX);
        floorLogo.setOrigin(0.5, 0.25);
        floorLogo.setDepth(dy);
        floorLogo.setScale(0.05);
        floorLogo.setAlpha(0.82);
        floorLogo.setAngle(0);
        this.props.push(floorLogo);

        boothSave.floorLogos ??= [];
        boothSave.floorLogos.push(
          {
            texKey: CAHSI_TEX,
            x: dx + 3,
            y: vy + 3,
            originX: 0.5,
            originY: 0.25,
            depth: dy - 0.1,
            scale: 0.054,
            alpha: 0.28,
            tint: 0x000000,
          },
          {
            texKey: CAHSI_TEX,
            x: dx,
            y: vy,
            originX: 0.5,
            originY: 0.25,
            depth: dy,
            scale: 0.05,
            alpha: 0.82,
          }
        );
      }

      if (bi === LINKEDIN_BOOTH_INDEX && this.textures.exists(LINKEDIN_TEX)) {
        const vy = dy + 44;
        const floorLogoShadow = this.add.sprite(dx, vy, LINKEDIN_TEX);
        floorLogoShadow.setOrigin(0.44, 0.43);
        floorLogoShadow.setDepth(dy - 0.1);
        floorLogoShadow.setScale(0.08);
        floorLogoShadow.setTint(0x000000);
        floorLogoShadow.setAlpha(0.22);
        floorLogoShadow.setAngle(0);
        this.props.push(floorLogoShadow);

        const floorLogo = this.add.sprite(dx, vy, LINKEDIN_TEX);
        floorLogo.setOrigin(0.44, 0.43);
        floorLogo.setDepth(dy);
        floorLogo.setScale(0.08);
        floorLogo.setAlpha(0.92);
        floorLogo.setAngle(0);
        this.props.push(floorLogo);

        boothSave.floorLogos ??= [];
        boothSave.floorLogos.push(
          {
            texKey: LINKEDIN_TEX,
            x: dx,
            y: vy,
            originX: 0.44,
            originY: 0.43,
            depth: dy - 0.1,
            scale: 0.08,
            alpha: 0.22,
            tint: 0x000000,
          },
          {
            texKey: LINKEDIN_TEX,
            x: dx,
            y: vy,
            originX: 0.44,
            originY: 0.43,
            depth: dy,
            scale: 0.08,
            alpha: 0.92,
          }
        );
      }
    }

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(layoutToSave));
    } catch {
    }

    try {
      this.socket.emit("booths:layout:set", { serverId: this.serverId, layout: layoutToSave });
    } catch {
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

    if (this.pendingRemoteJoins.length) {
      const queued = this.pendingRemoteJoins.slice();
      this.pendingRemoteJoins.length = 0;
      for (const p of queued) this.onPlayerJoined(p);
    }
    if (this.pendingRemoteSnapshot) {
      const snap = this.pendingRemoteSnapshot;
      this.pendingRemoteSnapshot = null;
      this.applyRemoteSnapshot(snap);
    }

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
      for (const st of this.remoteBubbles.values()) {
        this.clearChatStack(st);
      }
      this.remoteBubbles.clear();
      this.clearChatStack(this.localBubbleStack);
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
      const stack = this.remoteBubbles.get(socketId);
      if (stack && stack.length) {
        this.applyChatStackLayout(stack, () => ({ x: nx, y: ny - BUBBLE_BASE_OFF }));
        const newest = stack[stack.length - 1]!;
        if (this.time.now >= newest.expiresAt) {
          this.destroyChatEntry(newest);
          stack.pop();
          this.applyChatStackLayout(stack, () => ({ x: nx, y: ny - BUBBLE_BASE_OFF }));
        }
        if (stack.length === 0) {
          this.remoteBubbles.delete(socketId);
        }
      }
    }

    const py = this.localPlayer.y;
    this.localPlayer.setDepth(py);
    if (this.localBubbleStack.length) {
      this.applyChatStackLayout(this.localBubbleStack, () => ({
        x: this.localPlayer.x,
        y: this.localPlayer.y - BUBBLE_BASE_OFF,
      }));
      const newest = this.localBubbleStack[this.localBubbleStack.length - 1]!;
      if (this.time.now >= newest.expiresAt) {
        this.destroyChatEntry(newest);
        this.localBubbleStack.pop();
        this.applyChatStackLayout(this.localBubbleStack, () => ({
          x: this.localPlayer.x,
          y: this.localPlayer.y - BUBBLE_BASE_OFF,
        }));
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
            nearbyPoster.getData("imageKey"),
            (nearbyPoster.getData("actions") as Array<{ label: string; url: string }> | undefined) ??
              (nearbyPoster.getData("actionUrl")
                ? [
                    {
                      label: nearbyPoster.getData("actionLabel") || "More info",
                      url: nearbyPoster.getData("actionUrl"),
                    },
                  ]
                : undefined)
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