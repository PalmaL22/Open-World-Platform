import { useEffect, useRef, useState } from "react";
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

type ChatMessage = {
  id: string;
  socketId: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    username: string;
  };
};

type SystemMessage = {
  content: string;
  createdAt: string;
};

type ChatEntry =
  | (ChatMessage & { kind: "user" })
  | (SystemMessage & { kind: "system"; id: string });

export function GamePage() {
  const [searchParams] = useSearchParams();
  const serverId = searchParams.get("serverId");
  const token = useAuthStore((s) => s.token);

  const [status, setStatus] = useState<"connecting" | "joined" | "error">("connecting");
  const [joined, setJoined] = useState<JoinedPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [gameSocket, setGameSocket] = useState<Socket | null>(null);
  const [chatEntries, setChatEntries] = useState<ChatEntry[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [remotePlayers, setRemotePlayers] = useState<Array<{ socketId: string; color?: string; x?: number; y?: number }>>([]);
  const [chatBubble, setChatBubble] = useState<{ id: string; socketId: string; content: string } | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!serverId || !token) {
      return;
    }

    setStatus("connecting");
    setJoined(null);
    setMessage(null);
    setChatEntries([]);
    setChatError(null);
    setRemotePlayers([]);

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

    const onChatHistory = (history: ChatMessage[]) => {
      setChatEntries(
        history.map((entry) => ({
          ...entry,
          kind: "user",
        })),
      );
    };

    const onChatMessage = (entry: ChatMessage) => {
      setChatEntries((prev) => [...prev, { ...entry, kind: "user" }]);
      setChatBubble({ id: entry.id, socketId: entry.socketId, content: entry.content });
    };

    const onChatSystem = (entry: SystemMessage) => {
      setChatEntries((prev) => [
        ...prev,
        {
          ...entry,
          kind: "system",
          id: `system-${entry.createdAt}-${prev.length}`,
        },
      ]);
    };

    const onChatError = (payload: { message?: string }) => {
      setChatError(payload?.message ?? "Could not send chat message.");
    };

    const onPlayersSnapshot = (players: Array<{ socketId: string; color?: string; x?: number; y?: number }>) => {
      setRemotePlayers(players);
    };

    const onPlayerJoined = (player: { socketId: string; color?: string; x?: number; y?: number }) => {
      setRemotePlayers((prev) => {
        if (prev.some((p) => p.socketId === player.socketId)) return prev;
        return [...prev, player];
      });
    };

    const onPlayerMoved = (player: { socketId: string; x: number; y: number; color?: string }) => {
      setRemotePlayers((prev) => {
        const idx = prev.findIndex((p) => p.socketId === player.socketId);
        if (idx === -1) return [...prev, player];
        const next = [...prev];
        next[idx] = { ...next[idx], ...player };
        return next;
      });
    };

    const onPlayerLeft = (payload: { socketId: string }) => {
      setRemotePlayers((prev) => prev.filter((p) => p.socketId !== payload.socketId));
    };

    socket.on("connect", onConnect);
    socket.on("joined-server", onJoined);
    socket.on("join-error", onJoinError);
    socket.on("connect_error", onConnectError);
    socket.on("chat:history", onChatHistory);
    socket.on("chat:message", onChatMessage);
    socket.on("chat:system", onChatSystem);
    socket.on("chat:error", onChatError);
    socket.on("players:snapshot", onPlayersSnapshot);
    socket.on("player-joined", onPlayerJoined);
    socket.on("player-moved", onPlayerMoved);
    socket.on("player-left", onPlayerLeft);
    const syncInterval = window.setInterval(() => {
      socket.emit("players:sync");
    }, 3000);

    return () => {
      setGameSocket(null);
      socket.off("connect", onConnect);
      socket.off("joined-server", onJoined);
      socket.off("join-error", onJoinError);
      socket.off("connect_error", onConnectError);
      socket.off("chat:history", onChatHistory);
      socket.off("chat:message", onChatMessage);
      socket.off("chat:system", onChatSystem);
      socket.off("chat:error", onChatError);
      socket.off("players:snapshot", onPlayersSnapshot);
      socket.off("player-joined", onPlayerJoined);
      socket.off("player-moved", onPlayerMoved);
      socket.off("player-left", onPlayerLeft);
      window.clearInterval(syncInterval);
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

  useEffect(() => {
    const chatScroll = chatScrollRef.current;
    if (!chatScroll) return;
    chatScroll.scrollTop = chatScroll.scrollHeight;
  }, [chatEntries]);

  const sendChat = () => {
    const content = chatDraft.trim();
    if (!content || !gameSocket) return;
    setChatError(null);
    gameSocket.emit("chat:send", { content });
    setChatDraft("");
  };

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
            <span className="ml-2 text-xs text-slate-500">({joined.serverId})</span>
          </p>
          <div className="text-xs text-slate-400">
            <span className="rounded bg-slate-900/70 px-2 py-1">Remote players: {remotePlayers.length}</span>
          </div>
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <GameCanvas
              socket={gameSocket}
              serverId={joined.serverId}
              characterColor={joined.characterColor}
              remotePlayers={remotePlayers}
              chatBubble={chatBubble}
            />
            <section className="flex h-[520px] flex-col overflow-hidden rounded-lg border border-slate-700/80 bg-gradient-to-b from-slate-900/85 to-slate-950/90 shadow-lg shadow-black/30">
              <header className="border-b border-slate-700/70 bg-slate-900/70 px-4 py-3 text-sm font-semibold tracking-wide text-slate-100">
                Room chat
              </header>
              <div ref={chatScrollRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3 text-sm">
                {chatEntries.length === 0 ? (
                  <p className="text-slate-500">No messages yet.</p>
                ) : (
                  chatEntries.map((entry) =>
                    entry.kind === "system" ? (
                      <div key={entry.id} className="rounded-md border border-slate-700/70 bg-slate-800/60 px-2 py-1 text-center text-xs text-slate-400">
                        {entry.content}
                      </div>
                    ) : (
                      <div key={entry.id} className="rounded-md border border-slate-700/70 bg-slate-800/75 px-3 py-2 text-slate-100">
                        <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                          <span>{entry.user.username}</span>
                          <span>{new Date(entry.createdAt).toLocaleTimeString()}</span>
                        </div>
                        <p className="break-words text-sm">{entry.content}</p>
                      </div>
                    ),
                  )
                )}
              </div>
              <div className="border-t border-slate-700 p-3">
                {chatError && <p className="mb-2 text-xs text-red-300">{chatError}</p>}
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendChat();
                  }}
                >
                  <input
                    type="text"
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    onKeyDownCapture={(e) => {
                      // Prevent Phaser keyboard handlers from swallowing typing keys.
                      e.stopPropagation();
                    }}
                    maxLength={300}
                    placeholder="Type a message..."
                    className="flex-1 rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                  />
                  <button type="submit" className="btn-primary px-4">
                    Send
                  </button>
                </form>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
