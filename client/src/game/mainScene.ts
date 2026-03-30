import Phaser from "phaser";
import type { Socket } from "socket.io-client";

const WORLD_W = 800;
const WORLD_H = 600;
const SPEED = 220;
const MOVE_EMIT_MS = 70;

function spawnFromSocketId(socketId: string): { x: number; y: number } {
  let h = 0;
  for (let i = 0; i < socketId.length; i++) {
    h = (Math.imul(31, h) + socketId.charCodeAt(i)) | 0;
  }
  const x = 80 + (Math.abs(h) % (WORLD_W - 160));
  const y = 80 + (Math.abs(h >> 16) % (WORLD_H - 160));
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
  private localPlayer!: Phaser.GameObjects.Rectangle;
  private localBody!: Phaser.Physics.Arcade.Body;
  private remote = new Map<string, Phaser.GameObjects.Rectangle>();
  private lastEmit = 0;
  private localColorHex = "#3498db";

  private remoteFill(payload: { socketId: string; color?: string }): number {
    return payload.color ? hexStringToPhaserColor(payload.color) : fillForSocketId(payload.socketId);
  }

  private onPlayerJoined = (payload: { socketId: string; color?: string }) => {
    if (payload.socketId === this.socket.id) return;
    if (this.remote.has(payload.socketId)) return;
    const { x, y } = spawnFromSocketId(payload.socketId);
    const rect = this.add.rectangle(x, y, 26, 26, this.remoteFill(payload));
    this.remote.set(payload.socketId, rect);
  };

  private onPlayerMoved = (payload: { socketId: string; x: number; y: number; color?: string }) => {
    if (payload.socketId === this.socket.id) return;
    let rect = this.remote.get(payload.socketId);
    if (!rect) {
      rect = this.add.rectangle(payload.x, payload.y, 26, 26, this.remoteFill(payload));
      this.remote.set(payload.socketId, rect);
    }
    rect.setPosition(payload.x, payload.y);
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

  create() {
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    const localFill = hexStringToPhaserColor(this.localColorHex);
    const localRect = this.add.rectangle(WORLD_W / 2, WORLD_H / 2, 28, 28, localFill);
    this.physics.add.existing(localRect);
    const body = localRect.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    this.localPlayer = localRect;
    this.localBody = body;

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,S,A,D") as Wasd;

    this.socket.on("player-joined", this.onPlayerJoined);
    this.socket.on("player-moved", this.onPlayerMoved);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.socket.off("player-joined", this.onPlayerJoined);
      this.socket.off("player-moved", this.onPlayerMoved);
      for (const rect of this.remote.values()) {
        rect.destroy();
      }
      this.remote.clear();
    });
  }

  update(time: number) {
    let vx = 0;
    let vy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) vx = -SPEED;
    else if (this.cursors.right.isDown || this.wasd.D.isDown) vx = SPEED;
    if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -SPEED;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) vy = SPEED;

    this.localBody.setVelocity(vx, vy);

    if (time - this.lastEmit < MOVE_EMIT_MS) return;
    this.socket.emit("player-move", {
      serverId: this.serverId,
      x: this.localPlayer.x,
      y: this.localPlayer.y,
    });
    this.lastEmit = time;
  }
}
