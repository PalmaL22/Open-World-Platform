import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import type { Socket } from "socket.io-client";
import { GameCanvas } from "../game/GameCanvas";
import { createAuthenticatedGameSocket } from "../lib/gameSocket";
import { useAuthStore } from "../store/authStore";

type JoinedPayload = {
  serverId: string;
  name: string;
  username: string;
  characterColor: string;
};

export function GamePage() {
  const [searchParams] = useSearchParams();
  const serverId = searchParams.get("serverId");
  const token = useAuthStore((s) => s.token);

  const [status, setStatus] = useState<"connecting" | "joined" | "error">("connecting");
  const [joined, setJoined] = useState<JoinedPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [gameSocket, setGameSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!serverId || !token) {
      return;
    }

    setStatus("connecting");
    setJoined(null);
    setMessage(null);

    let socket: Socket;

    try {
      socket = createAuthenticatedGameSocket();
      setGameSocket(socket);
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Could not connect");
      return;
    }

    const onConnect = () => {
      setStatus("connecting");
      socket.emit("join-server", { serverId });
    };

    const onJoined = (payload: JoinedPayload) => {
      setJoined(payload);
      setStatus("joined");
      setMessage(null);
    };

    const onJoinError = (payload: { message?: string }) => {
      setStatus("error");
      setMessage(payload?.message ?? "Could not join server");
    };

    const onConnectError = (err: Error) => {
      setStatus("error");
      setMessage(err.message || "Connection failed");
    };

    socket.on("connect", onConnect);
    socket.on("joined-server", onJoined);
    socket.on("join-error", onJoinError);
    socket.on("connect_error", onConnectError);

    return () => {
      setGameSocket(null);
      socket.off("connect", onConnect);
      socket.off("joined-server", onJoined);
      socket.off("join-error", onJoinError);
      socket.off("connect_error", onConnectError);
      if (socket.connected) {
        socket.emit("leave-server", { serverId });
      }
      socket.disconnect();
    };
  }, [serverId, token]);

  if (!serverId) {
    return <Navigate to="/" replace />;
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-white">Game</h1>
        <Link
          to="/"
          className="text-sm text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline"
        >
          Back to lobby
        </Link>
      </div>

      {status === "error" && message && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {message}
        </div>
      )}

      {status === "connecting" && !message && (
        <p className="text-slate-400">Connecting to server…</p>
      )}

      {status === "joined" && joined && gameSocket && (
        <div className="flex flex-col gap-4">
          <p className="text-slate-400">
            <span className="font-medium text-slate-200">{joined.username}</span> on{" "}
            <span className="font-medium text-slate-200">{joined.name}</span>
            <span className="text-slate-500">
              {" "}
              — WASD / arrows to move; conference hall demo
            </span>
          </p>
          <GameCanvas
            socket={gameSocket}
            serverId={joined.serverId}
            characterColor={joined.characterColor}
          />
        </div>
      )}
    </div>
  );
}
