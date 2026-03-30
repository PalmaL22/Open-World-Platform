import Phaser from "phaser";
import { useEffect, useRef } from "react";
import type { Socket } from "socket.io-client";
import { MainScene } from "./mainScene";

type GameCanvasProps = {
  socket: Socket;
  serverId: string;
};

export function GameCanvas({ socket, serverId }: GameCanvasProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: 800,
      height: 600,
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

    game.scene.add("MainScene", MainScene, true, { socket, serverId });

    return () => {
      game.destroy(true);
    };
  }, [socket, serverId]);

  return (
    <div
      ref={parentRef}
      className="mx-auto aspect-[4/3] w-full max-w-[800px] overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-lg"
    />
  );
}
