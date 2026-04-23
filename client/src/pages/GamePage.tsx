import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import type { Socket } from "socket.io-client";
import { GameCanvas } from "../game/GameCanvas";
import { createAuthenticatedGameSocket } from "../lib/gameSocket";
import { VoiceChatManager, type VoicePeerDescriptor } from "../lib/voiceChat";
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
  characterColor?: string;
  user: {
    id: string;
    username: string;
  };
};

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(52, 152, 219, ${alpha})`;
  const n = Number.parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

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
  const [boothLayout, setBoothLayout] = useState<unknown>(null);
  const [boothLayoutLoaded, setBoothLayoutLoaded] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceParticipants, setVoiceParticipants] = useState<VoicePeerDescriptor[]>([]);
  const [incomingVoiceVolumes, setIncomingVoiceVolumes] = useState<Record<string, number>>({});
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const voiceManagerRef = useRef<VoiceChatManager | null>(null);
  const voiceFlyoutRef = useRef<HTMLDivElement | null>(null);
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);

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
    setVoiceEnabled(false);
    setVoiceMuted(false);
    setVoiceError(null);
    setVoiceParticipants([]);
    setIncomingVoiceVolumes({});
    setBoothLayout(null);
    setBoothLayoutLoaded(false);

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

      socket.emit("booths:layout:get", { serverId: payload.serverId });
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

    const onBoothsLayout = (payload: { serverId?: string; layout?: unknown }) => {
      if (!payload?.serverId || payload.serverId !== serverId) return;
      setBoothLayout(payload.layout ?? null);
      setBoothLayoutLoaded(true);
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

    const onVoicePeers = (payload: { peers?: VoicePeerDescriptor[] }) => {
      if (!voiceManagerRef.current?.isStarted) return;
      const peers = (payload.peers ?? []).filter((p) => p.socketId);
      setVoiceParticipants(peers);
    };

    const onVoicePeerJoined = (payload: VoicePeerDescriptor) => {
      if (!voiceManagerRef.current?.isStarted) return;
      const peerId = payload.socketId;
      if (!peerId) return;
      setVoiceParticipants((prev) => {
        if (prev.some((p) => p.socketId === peerId)) return prev;
        return [
          ...prev,
          {
            socketId: peerId,
            username: payload.username,
            characterColor: payload.characterColor,
          },
        ];
      });
    };

    const onVoicePeerLeft = (payload: { socketId?: string }) => {
      if (!voiceManagerRef.current?.isStarted) return;
      const peerId = payload.socketId;
      if (!peerId) return;
      setVoiceParticipants((prev) => prev.filter((p) => p.socketId !== peerId));
      setIncomingVoiceVolumes((prev) => {
        if (!(peerId in prev)) return prev;
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    };

    const onVoiceError = (payload: { message?: string }) => {
      setVoiceError(payload.message ?? "Voice connection failed.");
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
    socket.on("booths:layout", onBoothsLayout);
    socket.on("voice:peers", onVoicePeers);
    socket.on("voice:peer-joined", onVoicePeerJoined);
    socket.on("voice:peer-left", onVoicePeerLeft);
    socket.on("voice:error", onVoiceError);
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
      socket.off("booths:layout", onBoothsLayout);
      socket.off("voice:peers", onVoicePeers);
      socket.off("voice:peer-joined", onVoicePeerJoined);
      socket.off("voice:peer-left", onVoicePeerLeft);
      socket.off("voice:error", onVoiceError);
      window.clearInterval(syncInterval);
      voiceManagerRef.current?.stop();
      voiceManagerRef.current = null;
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

  const enableVoice = async () => {
    if (!gameSocket) return;
    setVoiceError(null);
    const manager = voiceManagerRef.current ?? new VoiceChatManager(gameSocket);
    voiceManagerRef.current = manager;
    try {
      await manager.start();
      setVoiceEnabled(true);
      setVoiceMuted(false);
    } catch (e) {
      setVoiceError(e instanceof Error ? e.message : "Could not access microphone.");
      setVoiceEnabled(false);
    }
  };

  const disableVoice = () => {
    voiceManagerRef.current?.stop();
    setVoiceEnabled(false);
    setVoiceMuted(false);
    setVoiceParticipants([]);
    setIncomingVoiceVolumes({});
    setVoicePanelOpen(false);
  };

  useEffect(() => {
    if (!voicePanelOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (voiceFlyoutRef.current?.contains(e.target as Node)) return;
      setVoicePanelOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVoicePanelOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [voicePanelOpen]);

  const toggleMute = () => {
    const manager = voiceManagerRef.current;
    if (!manager || !voiceEnabled) return;
    const nextMuted = !voiceMuted;
    manager.setMuted(nextMuted);
    setVoiceMuted(nextMuted);
  };

  const sendChat = () => {
    const content = chatDraft.trim();
    if (!content || !gameSocket) return;
    setChatError(null);
    gameSocket.emit("chat:send", { content });
    setChatDraft("");
  };

  return (
    <div className="flex w-full flex-col gap-4">
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
  
      {status === "joined" && joined && gameSocket && boothLayoutLoaded && (
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
            <span className="rounded bg-slate-900/70 px-2 py-1">
              Players online: {remotePlayers.length + 1}
            </span>
          </div>

          <div className="grid w-full items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_360px] min-h-0 h-[min(85vh,900px)]">
            <div className="relative min-h-0 min-w-0">
              <GameCanvas
                socket={gameSocket}
                serverId={joined.serverId}
                characterColor={joined.characterColor}
                remotePlayers={remotePlayers}
                chatBubble={chatBubble}
                boothLayout={boothLayout}
              />
              <div
                ref={voiceFlyoutRef}
                className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col-reverse items-start gap-2"
              >
                {voicePanelOpen && (
                  <div
                    className="w-[min(100%,22rem)] max-h-[min(50vh,340px)] overflow-y-auto rounded-lg border border-slate-600/90 bg-slate-900/95 px-3 py-3 text-xs text-slate-300 shadow-xl shadow-black/40 backdrop-blur-sm"
                    role="dialog"
                    aria-label="Voice chat"
                  >
                    <h2 className="mb-2 text-sm font-semibold text-slate-100">Voice chat</h2>
                    <div className="flex flex-wrap gap-2">
                      {!voiceEnabled ? (
                        <button
                          type="button"
                          onClick={() => void enableVoice()}
                          className="btn-primary px-3 py-1.5 text-xs"
                        >
                          Join voice chat
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={toggleMute}
                            className="rounded-md border border-slate-500 bg-slate-800 px-3 py-1.5 text-xs text-slate-100 transition hover:bg-slate-700"
                          >
                            {voiceMuted ? "Unmute" : "Mute"}
                          </button>
                          <button
                            type="button"
                            onClick={disableVoice}
                            className="rounded-md border border-red-700/70 bg-red-950/50 px-3 py-1.5 text-xs text-red-200 transition hover:bg-red-900/50"
                          >
                            Leave voice chat
                          </button>
                        </>
                      )}
                    </div>
                    {voiceEnabled && gameSocket && (
                      <ul className="mt-3 space-y-2.5 border-t border-slate-700/60 pt-3">
                        <li className="rounded-md border border-slate-700/50 bg-slate-950/50 px-2 py-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-3 w-3 shrink-0 rounded shadow-inner ring-1 ring-slate-600/60"
                              style={{ backgroundColor: joined.characterColor || "#64748b" }}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">You</span>
                              <div
                                className="truncate font-semibold leading-tight"
                                style={{ color: joined.characterColor || "#e2e8f0" }}
                              >
                                {joined.username}
                              </div>
                            </div>
                            {voiceMuted && (
                              <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                Muted
                              </span>
                            )}
                          </div>
                        </li>
                        {voiceParticipants.map((peer) => {
                          const color = peer.characterColor || "#64748b";
                          const name = peer.username ?? "Unknown";
                          const vol = incomingVoiceVolumes[peer.socketId] ?? 1;
                          const pct = Math.round(vol * 100);
                          return (
                            <li
                              key={peer.socketId}
                              className="rounded-md border border-slate-700/50 bg-slate-950/50 px-2 py-2"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span
                                  className="h-3 w-3 shrink-0 rounded shadow-inner ring-1 ring-slate-600/60"
                                  style={{ backgroundColor: color }}
                                  aria-hidden
                                />
                                <span className="min-w-0 truncate font-semibold leading-tight" style={{ color }}>
                                  {name}
                                </span>
                              </div>
                              <div className="mt-2 flex min-w-0 items-center gap-2 pl-5">
                                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                                  Vol
                                </span>
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  step={1}
                                  value={pct}
                                  onInput={(e) => {
                                    const n = Number((e.target as HTMLInputElement).value) / 100;
                                    setIncomingVoiceVolumes((p) => ({ ...p, [peer.socketId]: n }));
                                    voiceManagerRef.current?.setIncomingVolume(peer.socketId, n);
                                  }}
                                  className="h-1.5 min-w-0 flex-1 cursor-pointer accent-sky-500"
                                  aria-label={`Incoming volume for ${name}`}
                                />
                                <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-slate-400">{pct}%</span>
                              </div>
                            </li>
                          );
                        })}
                        {voiceParticipants.length === 0 && (
                          <li className="text-slate-500">No one else in voice yet.</li>
                        )}
                      </ul>
                    )}
                    {voiceError && <p className="mt-2 text-red-300">{voiceError}</p>}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setVoicePanelOpen((o) => !o)}
                  aria-expanded={voicePanelOpen}
                  className="flex items-center gap-2 rounded-lg border border-slate-600/90 bg-slate-900/90 px-3 py-2 text-xs font-medium text-slate-100 shadow-lg shadow-black/30 backdrop-blur-sm transition hover:border-slate-500 hover:bg-slate-800/95"
                >
                  <span>Voice chat</span>
                  {voiceEnabled ? (
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" title="In voice" aria-hidden />
                      <span className="tabular-nums">{1 + voiceParticipants.length}</span>
                    </span>
                  ) : null}
                </button>
              </div>
            </div>
  
            <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-slate-700/80 bg-gradient-to-b from-slate-900/85 to-slate-950/90 shadow-lg shadow-black/30">
              <header className="border-b border-slate-700/70 bg-slate-900/70 px-4 py-3 text-sm font-semibold tracking-wide text-slate-100">
                Room chat
              </header>
              <div ref={chatScrollRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3 text-sm">
                {chatEntries.length === 0 ? (
                  <p className="text-slate-500">No messages yet.</p>
                ) : (
                  chatEntries.map((entry) =>
                    entry.kind === "system" ? (
                      <div
                        key={entry.id}
                        className="rounded-md border border-slate-700/70 bg-slate-800/60 px-2 py-1 text-center text-xs text-slate-400"
                      >
                        {entry.content}
                      </div>
                    ) : (
                      <div
                        key={entry.id}
                        className="rounded-md border-2 px-3 py-2 text-slate-100"
                        style={{
                          borderColor: entry.characterColor ?? "#64748b",
                          backgroundColor: hexToRgba(entry.characterColor ?? "#64748b", 0.16),
                        }}
                      >
                        <div
                          className="mb-1 flex items-center justify-between text-xs"
                          style={{
                            color: hexToRgba(entry.characterColor ?? "#94a3b8", 0.95),
                          }}
                        >
                          <span className="font-medium">{entry.user.username}</span>
                          <span className="opacity-80">
                            {new Date(entry.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="break-words text-sm text-slate-100">{entry.content}</p>
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