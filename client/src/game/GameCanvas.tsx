import Phaser from "phaser";
import { useEffect, useRef } from "react";
import type { Socket } from "socket.io-client";
import { VIEW_H, VIEW_W } from "./gameWorld";
import { MainScene } from "./mainScene";

type GameCanvasProps = {
  socket: Socket;
  serverId: string;
  characterColor: string;
  remotePlayers: Array<{ socketId: string; color?: string; x?: number; y?: number }>;
  chatBubble?: { id: string; socketId: string; content: string } | null;
};

export function GameCanvas({ socket, serverId, characterColor, remotePlayers, chatBubble }: GameCanvasProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;

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
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      render: {
        pixelArt: false,
        antialias: true,
      },
    });

    game.scene.add("MainScene", MainScene, true, {
      socket,
      serverId,
      localColorHex: characterColor,
    });
    gameRef.current = game;

    return () => {
      gameRef.current = null;
      game.destroy(true);
    };
  }, [socket, serverId, characterColor]);

  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    const scene = game.scene.getScene("MainScene") as MainScene;
    if (!scene) return;
    scene.applyRemoteSnapshot(remotePlayers);
  }, [remotePlayers]);

  useEffect(() => {
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
      className="mx-auto aspect-[4/3] w-full max-w-[840px] overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-lg"
    />
  );
}
