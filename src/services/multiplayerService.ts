import { RealtimeChannel } from '@supabase/supabase-js';
import {
  MultiplayerGameType,
  MultiplayerPlayerInfo,
  MultiplayerSessionConfig,
  StudentProfile,
} from '../types/game';
import { getSupabaseClient } from './storageService';

export interface KartPeerState {
  id: string;
  name: string;
  grade: string;
  avatarColor: string;
  equippedHat: string | null;
  equippedJersey: string | null;
  s: number;
  lateral: number;
  y: number;
  speed: number;
  rotY: number;
  finished: boolean;
  finishTime: number | null;
  updatedAt: number;
}

export interface DuelActionPayload {
  type: 'round_hit' | 'round_wrong' | 'rematch';
  senderId: string;
  senderName: string;
  round: number;
  timestamp: number;
}

export function generatePrivateRoomCode(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}

export function buildRoomChannelName(mode: MultiplayerGameType, roomCode: string): string {
  const cleanCode = roomCode.trim().toUpperCase() || 'PUBLIC';
  return `mathblox_mp_${mode}_${cleanCode}`;
}

export function studentToMultiplayerInfo(
  student: StudentProfile,
  ready = true
): MultiplayerPlayerInfo {
  return {
    id: student.id,
    name: student.name,
    grade: student.grade,
    worldId: student.worldId,
    school: student.school,
    avatarColor: student.avatarColor,
    equippedHat: student.equippedHat || null,
    equippedJersey: student.equippedJersey || null,
    equippedTitle: student.equippedTitle || null,
    ready,
    joinedAt: Date.now(),
  };
}

/**
 * Real-time Multiplayer Lobby Controller (Supabase Realtime Presence + Broadcast,
 * with BroadcastChannel cross-tab support for same-device multiplayer testing).
 */
export class MultiplayerLobbyClient {
  private readonly mode: MultiplayerGameType;
  private readonly roomCode: string;
  private readonly channelName: string;
  private readonly isPublic: boolean;
  private readonly localInfo: MultiplayerPlayerInfo;
  private readonly onPlayersChange: (players: MultiplayerPlayerInfo[]) => void;
  private readonly onStartSignal: (config: MultiplayerSessionConfig) => void;

  private playersMap = new Map<string, MultiplayerPlayerInfo>();
  private supaChannel: RealtimeChannel | null = null;
  private bc: BroadcastChannel | null = null;
  private started = false;
  private maxPlayers: number;

  constructor(params: {
    mode: MultiplayerGameType;
    roomCode: string;
    isPublic: boolean;
    student: StudentProfile;
    onPlayersChange: (players: MultiplayerPlayerInfo[]) => void;
    onStartSignal: (config: MultiplayerSessionConfig) => void;
  }) {
    this.mode = params.mode;
    this.roomCode = params.roomCode.toUpperCase();
    this.isPublic = params.isPublic;
    this.channelName = buildRoomChannelName(this.mode, this.roomCode);
    this.localInfo = studentToMultiplayerInfo(params.student, true);
    this.onPlayersChange = params.onPlayersChange;
    this.onStartSignal = params.onStartSignal;
    this.maxPlayers = this.mode === 'duel' ? 2 : 6;
    this.playersMap.set(this.localInfo.id, this.localInfo);
  }

  public connect(): void {
    // 1. Cross-tab BroadcastChannel for instant local/sandbox 2-tab multiplayer
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.bc = new BroadcastChannel(this.channelName);
      this.bc.onmessage = (ev) => {
        const msg = ev.data as {
          type: string;
          player?: MultiplayerPlayerInfo;
          id?: string;
          seed?: number;
          players?: MultiplayerPlayerInfo[];
        };
        if (!msg) return;
        if (msg.type === 'lobby:join' && msg.player) {
          if (this.playersMap.size < this.maxPlayers || this.playersMap.has(msg.player.id)) {
            this.playersMap.set(msg.player.id, msg.player);
            this.emitPlayers();
          }
          if (msg.player.id !== this.localInfo.id) {
            this.bc?.postMessage({ type: 'lobby:ack', player: this.localInfo });
          }
        } else if (msg.type === 'lobby:ack' && msg.player) {
          if (this.playersMap.size < this.maxPlayers || this.playersMap.has(msg.player.id)) {
            this.playersMap.set(msg.player.id, msg.player);
            this.emitPlayers();
          }
        } else if (msg.type === 'lobby:leave' && msg.id) {
          this.playersMap.delete(msg.id);
          this.emitPlayers();
        } else if (msg.type === 'lobby:start' && msg.seed) {
          this.handleIncomingStart(msg.seed, msg.players);
        }
      };
      this.bc.postMessage({ type: 'lobby:join', player: this.localInfo });
    }

    // 2. Supabase Realtime Presence + Broadcast
    const supabase = getSupabaseClient();
    if (supabase) {
      this.supaChannel = supabase.channel(this.channelName, {
        config: {
          presence: { key: this.localInfo.id },
          broadcast: { self: false },
        },
      });

      this.supaChannel
        .on('presence', { event: 'sync' }, () => {
          if (!this.supaChannel) return;
          const state = this.supaChannel.presenceState<MultiplayerPlayerInfo>();
          const nextMap = new Map<string, MultiplayerPlayerInfo>();
          nextMap.set(this.localInfo.id, this.localInfo);

          const allEntries: MultiplayerPlayerInfo[] = [];
          Object.values(state).forEach((list) => {
            for (const p of list) {
              if (p && p.id && p.id !== this.localInfo.id) {
                allEntries.push(p);
              }
            }
          });

          allEntries
            .sort((a, b) => a.joinedAt - b.joinedAt)
            .slice(0, this.maxPlayers - 1)
            .forEach((p) => nextMap.set(p.id, p));

          this.playersMap = nextMap;
          this.emitPlayers();
        })
        .on('broadcast', { event: 'match_start' }, ({ payload }) => {
          const p = payload as { seed: number; players?: MultiplayerPlayerInfo[] };
          if (p && p.seed) {
            this.handleIncomingStart(p.seed, p.players);
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && this.supaChannel) {
            await this.supaChannel.track(this.localInfo);
          }
        });
    }

    this.emitPlayers();
  }

  public triggerStartMatch(): void {
    if (this.started) return;
    const players = this.getSortedPlayers();
    const seed = Date.now();

    if (this.bc) {
      try {
        this.bc.postMessage({ type: 'lobby:start', seed, players });
      } catch {
        // Ignore
      }
    }
    if (this.supaChannel) {
      this.supaChannel
        .send({
          type: 'broadcast',
          event: 'match_start',
          payload: { seed, players },
        })
        .catch(() => {});
    }
    this.handleIncomingStart(seed, players);
  }

  private handleIncomingStart(seed: number, playersFromPayload?: MultiplayerPlayerInfo[]): void {
    if (this.started) return;
    this.started = true;
    const players =
      playersFromPayload && playersFromPayload.length >= 2
        ? playersFromPayload
        : this.getSortedPlayers();

    this.onStartSignal({
      mode: this.mode,
      roomCode: this.roomCode,
      channelName: this.channelName,
      isPublic: this.isPublic,
      players,
      seed,
    });
  }

  public getSortedPlayers(): MultiplayerPlayerInfo[] {
    return Array.from(this.playersMap.values())
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .slice(0, this.maxPlayers);
  }

  private emitPlayers(): void {
    this.onPlayersChange(this.getSortedPlayers());
  }

  public disconnect(): void {
    if (this.bc) {
      try {
        this.bc.postMessage({ type: 'lobby:leave', id: this.localInfo.id });
        this.bc.close();
      } catch {
        // Ignore
      }
      this.bc = null;
    }
    if (this.supaChannel) {
      const supabase = getSupabaseClient();
      this.supaChannel.untrack().catch(() => {});
      if (supabase) supabase.removeChannel(this.supaChannel);
      this.supaChannel = null;
    }
  }
}

/**
 * High-frequency (15 Hz) Match State Broadcaster for Kart Multiplayer & 1v1 Duel.
 */
export class MultiplayerMatchChannel<TPayload extends object> {
  private readonly channelName: string;
  private readonly eventName: string;
  private readonly onMessage: (payload: TPayload) => void;
  private supaChannel: RealtimeChannel | null = null;
  private bc: BroadcastChannel | null = null;
  private subscribed = false;

  constructor(
    channelName: string,
    eventName: string,
    onMessage: (payload: TPayload) => void
  ) {
    this.channelName = `${channelName}_live`;
    this.eventName = eventName;
    this.onMessage = onMessage;
  }

  public connect(): void {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.bc = new BroadcastChannel(this.channelName);
      this.bc.onmessage = (ev) => {
        const data = ev.data as { event?: string; payload?: TPayload };
        if (data && data.event === this.eventName && data.payload) {
          this.onMessage(data.payload);
        }
      };
    }

    const supabase = getSupabaseClient();
    if (supabase) {
      this.supaChannel = supabase.channel(this.channelName, {
        config: { broadcast: { self: false } },
      });
      this.supaChannel
        .on('broadcast', { event: this.eventName }, ({ payload }) => {
          if (payload) {
            this.onMessage(payload as TPayload);
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.subscribed = true;
          }
        });
    }
  }

  public send(payload: TPayload): void {
    if (this.bc) {
      try {
        this.bc.postMessage({ event: this.eventName, payload });
      } catch {
        // Ignore
      }
    }
    if (this.supaChannel && this.subscribed) {
      this.supaChannel
        .send({
          type: 'broadcast',
          event: this.eventName,
          payload: payload as Record<string, unknown>,
        })
        .catch(() => {});
    }
  }

  public disconnect(): void {
    if (this.bc) {
      try {
        this.bc.close();
      } catch {
        // Ignore
      }
      this.bc = null;
    }
    if (this.supaChannel) {
      const supabase = getSupabaseClient();
      if (supabase) supabase.removeChannel(this.supaChannel);
      this.supaChannel = null;
    }
  }
}
