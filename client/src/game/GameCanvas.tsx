import Phaser from "phaser";
import { useLayoutEffect, useRef } from "react";
import type { Socket } from "socket.io-client";
import { VIEW_H, VIEW_W } from "./gameWorld";
import { MainScene } from "./mainScene";

type GameCanvasProps = {
  socket: Socket;
  serverId: string;
  characterColor: string;
  remotePlayers: Array<{ socketId: string; color?: string; x?: number; y?: number }>;
  chatBubble?: { id: string; socketId: string; content: string } | null;
  boothLayout?: unknown;
};

export function GameCanvas({ socket, serverId, characterColor, remotePlayers, chatBubble, boothLayout }: GameCanvasProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useLayoutEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;

    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w <= 0 || h <= 0) {
      return;
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: VIEW_W,
      height: VIEW_H,
      backgroundColor: "#0f172a",
      physics: {
        default: "arcade",
        arcade: {
          gravity: { x: 0, y: 0 },
        },
      },
      scene: [],
      scale: {
        mode: Phaser.Scale.FIT,
       
        autoCenter: Phaser.Scale.NO_CENTER,
        parent,
        width: w,
        height: h,
      },
      render: {
        pixelArt: true,
        antialias: false,
      },
    });

    game.scene.add("MainScene", MainScene, true, {
      socket,
      serverId,
      localColorHex: characterColor,
      boothLayout,
    });
    gameRef.current = game;

    return () => {
      gameRef.current = null;
      game.destroy(true);
    };
  }, [socket, serverId, characterColor, boothLayout]);

  useLayoutEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    const scene = game.scene.getScene("MainScene") as MainScene;
    if (!scene) return;
    scene.applyRemoteSnapshot(remotePlayers);
  }, [remotePlayers]);

  useLayoutEffect(() => {
    if (!chatBubble) return;
    const game = gameRef.current;
    if (!game) return;
    const scene = game.scene.getScene("MainScene") as MainScene;
    if (!scene) return;
    scene.showChatBubble({ socketId: chatBubble.socketId, content: chatBubble.content });
  }, [chatBubble]);

  return (
    <div
      ref={parentRef}
      onPointerDown={() => {
        const active = document.activeElement;
        if (active instanceof HTMLElement) {
          active.blur();
        }
      }}
      className="h-full min-h-0 w-full min-w-0 overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-lg"
    />
  );
}
