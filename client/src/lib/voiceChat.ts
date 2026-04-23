import type { Socket } from "socket.io-client";

export type VoicePeerDescriptor = {
  socketId: string;
  username?: string;
  characterColor?: string;
};

type VoicePeersPayload = { peers?: Array<VoicePeerDescriptor | string> };
type VoicePeerPayload = { socketId?: string };
type VoiceOfferPayload = { from?: string; sdp?: RTCSessionDescriptionInit };
type VoiceAnswerPayload = { from?: string; sdp?: RTCSessionDescriptionInit };
type VoiceCandidatePayload = { from?: string; candidate?: RTCIceCandidateInit };

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export class VoiceChatManager {
  private readonly socket: Socket;
  private localStream: MediaStream | null = null;
  private readonly peerConnections = new Map<string, RTCPeerConnection>();
  private readonly remoteAudio = new Map<string, HTMLAudioElement>();
  private readonly incomingVolumes = new Map<string, number>();
  private started = false;

  private static clampUnitVolume(v: number): number {
    if (!Number.isFinite(v)) return 1;
    return Math.min(1, Math.max(0, v));
  }

  private applyIncomingVolume(peerId: string, audio: HTMLAudioElement) {
    audio.volume = VoiceChatManager.clampUnitVolume(this.incomingVolumes.get(peerId) ?? 1);
  }

  public setIncomingVolume(peerId: string, volume: number) {
    const v = VoiceChatManager.clampUnitVolume(volume);
    this.incomingVolumes.set(peerId, v);
    const audio = this.remoteAudio.get(peerId);
    if (audio) audio.volume = v;
  }

  private readonly onVoicePeers = (payload: VoicePeersPayload) => {
    for (const entry of payload.peers ?? []) {
      const peerId = typeof entry === "string" ? entry : entry.socketId;
      if (!peerId) continue;
      void this.ensurePeer(peerId, true);
    }
  };

  private readonly onVoicePeerLeft = (payload: VoicePeerPayload) => {
    const peerId = payload.socketId;
    if (!peerId) return;
    this.removePeer(peerId);
  };

  private readonly onVoiceOffer = async (payload: VoiceOfferPayload) => {
    const peerId = payload.from;
    if (!peerId || !payload.sdp) return;
    const pc = await this.ensurePeer(peerId, false);
    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.socket.emit("voice:answer", { to: peerId, sdp: answer });
  };

  private readonly onVoiceAnswer = async (payload: VoiceAnswerPayload) => {
    const peerId = payload.from;
    if (!peerId || !payload.sdp) return;
    const pc = this.peerConnections.get(peerId);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
  };

  private readonly onVoiceCandidate = async (payload: VoiceCandidatePayload) => {
    const peerId = payload.from;
    if (!peerId || !payload.candidate) return;
    const pc = this.peerConnections.get(peerId);
    if (!pc) return;
    await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
  };

  public constructor(socket: Socket) {
    this.socket = socket;
  }

  public get isStarted() {
    return this.started;
  }

  public async start() {
    if (this.started) return;
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.started = true;
    this.registerSocketHandlers();
    this.socket.emit("voice:join");
  }

  public setMuted(muted: boolean) {
    for (const track of this.localStream?.getAudioTracks() ?? []) {
      track.enabled = !muted;
    }
    this.socket.emit("voice:mute-state", { muted });
  }

  public stop() {
    if (!this.started) return;
    this.socket.emit("voice:leave");
    this.unregisterSocketHandlers();

    for (const [peerId] of this.peerConnections) {
      this.removePeer(peerId);
    }

    for (const track of this.localStream?.getTracks() ?? []) {
      track.stop();
    }
    this.localStream = null;
    this.incomingVolumes.clear();
    this.started = false;
  }

  private registerSocketHandlers() {
    this.socket.on("voice:peers", this.onVoicePeers);
    this.socket.on("voice:offer", this.onVoiceOffer);
    this.socket.on("voice:answer", this.onVoiceAnswer);
    this.socket.on("voice:ice-candidate", this.onVoiceCandidate);
    this.socket.on("voice:peer-left", this.onVoicePeerLeft);
  }

  private unregisterSocketHandlers() {
    this.socket.off("voice:peers", this.onVoicePeers);
    this.socket.off("voice:offer", this.onVoiceOffer);
    this.socket.off("voice:answer", this.onVoiceAnswer);
    this.socket.off("voice:ice-candidate", this.onVoiceCandidate);
    this.socket.off("voice:peer-left", this.onVoicePeerLeft);
  }

  private async ensurePeer(peerId: string, shouldCreateOffer: boolean) {
    const existing = this.peerConnections.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peerConnections.set(peerId, pc);

    for (const track of this.localStream?.getAudioTracks() ?? []) {
      pc.addTrack(track, this.localStream as MediaStream);
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      this.socket.emit("voice:ice-candidate", {
        to: peerId,
        candidate: event.candidate.toJSON(),
      });
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;
      const existingAudio = this.remoteAudio.get(peerId);
      if (existingAudio) {
        existingAudio.srcObject = stream;
        this.applyIncomingVolume(peerId, existingAudio);
        return;
      }
      const audio = new Audio();
      audio.autoplay = true;
      audio.srcObject = stream;
      this.applyIncomingVolume(peerId, audio);
      this.remoteAudio.set(peerId, audio);
      void audio.play().catch(() => {
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.removePeer(peerId);
      }
    };

    if (shouldCreateOffer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.socket.emit("voice:offer", { to: peerId, sdp: offer });
    }

    return pc;
  }

  private removePeer(peerId: string) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
      this.peerConnections.delete(peerId);
    }
    const audio = this.remoteAudio.get(peerId);
    if (audio) {
      audio.srcObject = null;
      this.remoteAudio.delete(peerId);
    }
    this.incomingVolumes.delete(peerId);
  }
}
