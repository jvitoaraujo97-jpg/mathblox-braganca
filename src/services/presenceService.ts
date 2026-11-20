import { RealtimeChannel } from '@supabase/supabase-js';
import { AvatarEmote, GradeLevel, MovementStyle, OnlinePlayerPresence } from '../types/game';
import { getSupabaseClient } from './storageService';

const CHANNEL_NAME = 'mathblox_social_plaza_v5';
const SHARED_STORAGE_KEY = 'mathblox_plaza_presence_v5';
const STALE_TIMEOUT_MS = 10000; // Auto-remove peers silent for > 10s
const BROADCAST_MIN_INTERVAL_MS = 66; // Controlled 15 Hz rate (every ~66ms)
const HEARTBEAT_INTERVAL_MS = 4000; // Keep idle players alive within 10s window

/**
 * Presence metadata payload (lightweight, only updated when profile/cosmetics change)
 */
interface PresenceProfileMeta {
  id: string;
  name: string;
  grade: GradeLevel;
  school: string;
  equippedJersey: string | null;
  equippedHat: string | null;
  equippedBack: string | null;
  equippedAura: string | null;
  equippedTitle: string | null;
  avatarColor: string;
  auraPower: number;
}

/**
 * Controlled 15 Hz Broadcast kinematic payload ('player_state')
 */
interface PlayerStateBroadcast {
  id: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  isDriving: boolean;
  vehicleType: string | null;
  drivingVehicleId: string | null;
  isFarmingAura: boolean;
  movementStyle: MovementStyle;
  emote: AvatarEmote;
  emoteTimestamp: number;
  chatMessage: string | null;
  chatTimestamp: number;
  auraPower: number;
  equippedTitle: string | null;
}

type PresenceCallback = (players: OnlinePlayerPresence[]) => void;

export class PlazaPresenceManager {
  private localPlayer: OnlinePlayerPresence;
  private onUpdate: PresenceCallback;
  private peers = new Map<string, OnlinePlayerPresence>();
  private bc: BroadcastChannel | null = null;
  private supaChannel: RealtimeChannel | null = null;
  private cleanupTimer: number | null = null;
  private onStorageBound: ((e: StorageEvent) => void) | null = null;

  private lastBroadcastAt = 0;
  private lastSentState: PlayerStateBroadcast | null = null;
  private lastMetaHash = '';
  private isSubscribed = false;

  constructor(initialPlayer: OnlinePlayerPresence, onUpdate: PresenceCallback) {
    this.localPlayer = { ...initialPlayer, updatedAt: Date.now() };
    this.onUpdate = onUpdate;
  }

  private buildProfileMeta(): PresenceProfileMeta {
    return {
      id: this.localPlayer.id,
      name: this.localPlayer.name,
      grade: this.localPlayer.grade,
      school: this.localPlayer.school,
      equippedJersey: this.localPlayer.equippedJersey ?? null,
      equippedHat: this.localPlayer.equippedHat ?? null,
      equippedBack: this.localPlayer.equippedBack ?? null,
      equippedAura: this.localPlayer.equippedAura ?? null,
      equippedTitle: this.localPlayer.equippedTitle ?? null,
      avatarColor: this.localPlayer.avatarColor,
      auraPower: this.localPlayer.auraPower ?? 0,
    };
  }

  private buildStatePayload(): PlayerStateBroadcast {
    return {
      id: this.localPlayer.id,
      x: Number(this.localPlayer.x.toFixed(3)),
      y: Number(this.localPlayer.y.toFixed(3)),
      z: Number(this.localPlayer.z.toFixed(3)),
      rotY: Number(this.localPlayer.rotY.toFixed(3)),
      isDriving: Boolean(this.localPlayer.isDriving || this.localPlayer.drivingVehicleId),
      vehicleType: this.localPlayer.vehicleType ?? null,
      drivingVehicleId: this.localPlayer.drivingVehicleId ?? null,
      isFarmingAura: Boolean(this.localPlayer.isFarmingAura),
      movementStyle: this.localPlayer.movementStyle || 'classic',
      emote: this.localPlayer.emote ?? null,
      emoteTimestamp: this.localPlayer.emoteTimestamp || 0,
      chatMessage: this.localPlayer.chatMessage ?? null,
      chatTimestamp: this.localPlayer.chatTimestamp || 0,
      auraPower: this.localPlayer.auraPower ?? 0,
      equippedTitle: this.localPlayer.equippedTitle ?? null,
    };
  }

  private hasStateChanged(next: PlayerStateBroadcast): boolean {
    const prev = this.lastSentState;
    if (!prev) return true;
    return (
      Math.abs(next.x - prev.x) > 0.015 ||
      Math.abs(next.y - prev.y) > 0.015 ||
      Math.abs(next.z - prev.z) > 0.015 ||
      Math.abs(next.rotY - prev.rotY) > 0.02 ||
      next.isDriving !== prev.isDriving ||
      next.vehicleType !== prev.vehicleType ||
      next.drivingVehicleId !== prev.drivingVehicleId ||
      next.isFarmingAura !== prev.isFarmingAura ||
      next.movementStyle !== prev.movementStyle ||
      next.emote !== prev.emote ||
      next.chatMessage !== prev.chatMessage ||
      next.chatTimestamp !== prev.chatTimestamp ||
      next.auraPower !== prev.auraPower ||
      next.equippedTitle !== prev.equippedTitle
    );
  }

  public start(): void {
    this.readSharedStorage();

    // Instant cross-tab sync for local multi-tab testing
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.bc = new BroadcastChannel(CHANNEL_NAME);
      this.bc.onmessage = (ev) => {
        const msg = ev.data as {
          type: string;
          meta?: PresenceProfileMeta;
          state?: PlayerStateBroadcast;
          player?: OnlinePlayerPresence;
          id?: string;
        };
        if (!msg) return;
        if (msg.type === 'presence:meta' && msg.meta && msg.meta.id !== this.localPlayer.id) {
          this.mergePeerMeta(msg.meta);
          this.emit();
        } else if (
          msg.type === 'player_state' &&
          msg.state &&
          msg.state.id !== this.localPlayer.id
        ) {
          this.mergePeerState(msg.state);
          this.emit();
        } else if (
          msg.type === 'presence:update' &&
          msg.player &&
          msg.player.id !== this.localPlayer.id
        ) {
          this.peers.set(msg.player.id, { ...msg.player, updatedAt: Date.now() });
          this.emit();
        } else if (msg.type === 'presence:leave' && msg.id) {
          this.peers.delete(msg.id);
          this.emit();
        } else if (msg.type === 'presence:request') {
          this.broadcastFullMetaAndState(true);
        }
      };
      this.bc.postMessage({ type: 'presence:request' });
    }

    if (typeof window !== 'undefined') {
      this.onStorageBound = (e: StorageEvent) => {
        if (e.key === SHARED_STORAGE_KEY) {
          this.readSharedStorage();
          this.emit();
        }
      };
      window.addEventListener('storage', this.onStorageBound);
    }

    // Supabase Realtime: Separate Presence (Profile Metadata) + Broadcast ('player_state' at 15 Hz)
    const supabase = getSupabaseClient();
    if (supabase) {
      this.supaChannel = supabase.channel(CHANNEL_NAME, {
        config: {
          presence: { key: this.localPlayer.id },
          broadcast: { self: false },
        },
      });

      this.supaChannel
        .on('presence', { event: 'sync' }, () => {
          if (!this.supaChannel) return;
          const state = this.supaChannel.presenceState<PresenceProfileMeta>();
          const presentIds = new Set<string>();

          Object.values(state).forEach((presences) => {
            for (const meta of presences) {
              if (meta && meta.id && meta.id !== this.localPlayer.id) {
                presentIds.add(meta.id);
                this.mergePeerMeta(meta);
              }
            }
          });

          // Remove any peer that explicitly left Presence
          for (const [id] of this.peers.entries()) {
            if (!presentIds.has(id) && Date.now() - (this.peers.get(id)?.updatedAt || 0) > 2500) {
              this.peers.delete(id);
            }
          }
          this.emit();
        })
        .on('presence', { event: 'leave' }, ({ key }) => {
          if (key && key !== this.localPlayer.id) {
            this.peers.delete(key);
            this.emit();
          }
        })
        .on('broadcast', { event: 'player_state' }, ({ payload }) => {
          const st = payload as PlayerStateBroadcast;
          if (st && st.id && st.id !== this.localPlayer.id) {
            this.mergePeerState(st);
            this.emit();
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && this.supaChannel) {
            this.isSubscribed = true;
            const meta = this.buildProfileMeta();
            this.lastMetaHash = JSON.stringify(meta);
            await this.supaChannel.track(meta);
            this.broadcastFullMetaAndState(true);
          }
        });
    }

    this.broadcastFullMetaAndState(true);
    this.emit();

    // Auto-remove stale peers (> 10s without updates)
    if (typeof window !== 'undefined') {
      this.cleanupTimer = window.setInterval(() => {
        const now = Date.now();
        let changed = false;
        for (const [id, p] of this.peers.entries()) {
          if (now - p.updatedAt > STALE_TIMEOUT_MS) {
            this.peers.delete(id);
            changed = true;
          }
        }
        this.writeSharedStorage();
        if (changed) this.emit();
      }, 1500);
    }
  }

  private mergePeerMeta(meta: PresenceProfileMeta): void {
    const existing = this.peers.get(meta.id);
    const now = Date.now();
    if (existing) {
      this.peers.set(meta.id, {
        ...existing,
        name: meta.name || existing.name,
        grade: meta.grade || existing.grade,
        school: meta.school || existing.school,
        avatarColor: meta.avatarColor || existing.avatarColor,
        equippedHat: meta.equippedHat ?? null,
        equippedJersey: meta.equippedJersey ?? null,
        equippedBack: meta.equippedBack ?? null,
        equippedAura: meta.equippedAura ?? null,
        equippedTitle: meta.equippedTitle ?? null,
        auraPower: meta.auraPower ?? existing.auraPower ?? 0,
        updatedAt: now,
      });
    } else {
      this.peers.set(meta.id, {
        id: meta.id,
        name: meta.name || 'Aluno',
        grade: meta.grade || '5º Ano',
        school: meta.school || 'Escola',
        avatarColor: meta.avatarColor || '#3B82F6',
        equippedHat: meta.equippedHat ?? null,
        equippedJersey: meta.equippedJersey ?? null,
        equippedBack: meta.equippedBack ?? null,
        equippedAura: meta.equippedAura ?? null,
        equippedTitle: meta.equippedTitle ?? null,
        auraPower: meta.auraPower ?? 0,
        movementStyle: 'classic',
        isFarmingAura: false,
        isDriving: false,
        vehicleType: null,
        drivingVehicleId: null,
        x: 0,
        y: 0,
        z: 9,
        rotY: 0,
        isMoving: false,
        emote: null,
        emoteTimestamp: 0,
        chatMessage: null,
        chatTimestamp: 0,
        updatedAt: now,
      });
    }
  }

  private mergePeerState(st: PlayerStateBroadcast): void {
    const existing = this.peers.get(st.id);
    const now = Date.now();
    if (existing) {
      const moved =
        Math.hypot(st.x - existing.x, st.z - existing.z) > 0.03;
      this.peers.set(st.id, {
        ...existing,
        x: st.x,
        y: st.y,
        z: st.z,
        rotY: st.rotY,
        isDriving: st.isDriving,
        vehicleType: st.vehicleType,
        drivingVehicleId: st.drivingVehicleId,
        isFarmingAura: st.isFarmingAura,
        movementStyle: st.movementStyle || 'classic',
        emote: st.emote,
        emoteTimestamp: st.emoteTimestamp || existing.emoteTimestamp,
        chatMessage: st.chatMessage,
        chatTimestamp: st.chatTimestamp || existing.chatTimestamp,
        auraPower: st.auraPower ?? existing.auraPower,
        equippedTitle: st.equippedTitle ?? existing.equippedTitle,
        isMoving: moved,
        updatedAt: now,
      });
    } else {
      this.peers.set(st.id, {
        id: st.id,
        name: 'Colega Online',
        grade: '5º Ano',
        school: 'Bragança-PA',
        avatarColor: '#38bdf8',
        equippedHat: null,
        equippedJersey: null,
        equippedBack: null,
        equippedAura: null,
        equippedTitle: st.equippedTitle ?? null,
        auraPower: st.auraPower ?? 0,
        movementStyle: st.movementStyle || 'classic',
        isFarmingAura: st.isFarmingAura,
        isDriving: st.isDriving,
        vehicleType: st.vehicleType,
        drivingVehicleId: st.drivingVehicleId,
        x: st.x,
        y: st.y,
        z: st.z,
        rotY: st.rotY,
        isMoving: false,
        emote: st.emote,
        emoteTimestamp: st.emoteTimestamp || 0,
        chatMessage: st.chatMessage,
        chatTimestamp: st.chatTimestamp || 0,
        updatedAt: now,
      });
    }
  }

  /**
   * Called every frame or on state change; throttles kinematic Broadcast to 15 Hz (66ms)
   * and only sends when state changed (or 4s keepalive heartbeat).
   */
  public updateLocal(patch: Partial<OnlinePlayerPresence>, forceImmediate = false): void {
    const now = Date.now();
    this.localPlayer = {
      ...this.localPlayer,
      ...patch,
      updatedAt: now,
    };

    // 1. Update Presence metadata ONLY when profile/cosmetics actually changed
    const meta = this.buildProfileMeta();
    const metaHash = JSON.stringify(meta);
    if (metaHash !== this.lastMetaHash) {
      this.lastMetaHash = metaHash;
      if (this.supaChannel && this.isSubscribed) {
        void this.supaChannel.track(meta).catch(() => {});
      }
      if (this.bc) {
        try {
          this.bc.postMessage({ type: 'presence:meta', meta });
        } catch {
          // Ignore closed channel
        }
      }
    }

    // 2. Controlled 15 Hz (66ms) Broadcast for kinematic state ('player_state')
    const elapsedSinceLast = now - this.lastBroadcastAt;
    if (!forceImmediate && elapsedSinceLast < BROADCAST_MIN_INTERVAL_MS) {
      return;
    }

    const nextState = this.buildStatePayload();
    const changed = this.hasStateChanged(nextState);
    const needsHeartbeat = elapsedSinceLast >= HEARTBEAT_INTERVAL_MS;

    if (!forceImmediate && !changed && !needsHeartbeat) {
      return;
    }

    this.lastBroadcastAt = now;
    this.lastSentState = nextState;
    this.sendStateBroadcast(nextState);
  }

  private broadcastFullMetaAndState(includeStorage: boolean): void {
    const meta = this.buildProfileMeta();
    const state = this.buildStatePayload();
    this.lastBroadcastAt = Date.now();
    this.lastSentState = state;

    if (includeStorage) {
      this.writeSharedStorage();
    }
    if (this.bc) {
      try {
        this.bc.postMessage({ type: 'presence:meta', meta });
        this.bc.postMessage({ type: 'player_state', state });
      } catch {
        // Ignore closed channel
      }
    }
    if (this.supaChannel && this.isSubscribed) {
      this.supaChannel
        .send({
          type: 'broadcast',
          event: 'player_state',
          payload: state,
        })
        .catch(() => {});
    }
  }

  private sendStateBroadcast(state: PlayerStateBroadcast): void {
    if (this.bc) {
      try {
        this.bc.postMessage({ type: 'player_state', state });
      } catch {
        // Ignore closed channel
      }
    }
    if (this.supaChannel && this.isSubscribed) {
      this.supaChannel
        .send({
          type: 'broadcast',
          event: 'player_state',
          payload: state,
        })
        .catch(() => {});
    }
  }

  private readSharedStorage(): void {
    try {
      const raw = localStorage.getItem(SHARED_STORAGE_KEY);
      if (!raw) return;
      const mapObj = JSON.parse(raw) as Record<string, OnlinePlayerPresence>;
      const now = Date.now();
      Object.values(mapObj).forEach((p) => {
        if (p && p.id && p.id !== this.localPlayer.id && now - p.updatedAt < STALE_TIMEOUT_MS) {
          this.peers.set(p.id, p);
        }
      });
    } catch {
      // Ignore parse errors
    }
  }

  private writeSharedStorage(): void {
    try {
      const raw = localStorage.getItem(SHARED_STORAGE_KEY);
      const mapObj: Record<string, OnlinePlayerPresence> = raw ? JSON.parse(raw) : {};
      const now = Date.now();
      mapObj[this.localPlayer.id] = this.localPlayer;
      for (const k of Object.keys(mapObj)) {
        if (now - mapObj[k].updatedAt > STALE_TIMEOUT_MS) {
          delete mapObj[k];
        }
      }
      localStorage.setItem(SHARED_STORAGE_KEY, JSON.stringify(mapObj));
    } catch {
      // Ignore quota errors
    }
  }

  private emit(): void {
    const list: OnlinePlayerPresence[] = [
      this.localPlayer,
      ...Array.from(this.peers.values()),
    ];
    this.onUpdate(list);
  }

  public stop(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.onStorageBound && typeof window !== 'undefined') {
      window.removeEventListener('storage', this.onStorageBound);
    }
    if (this.bc) {
      try {
        this.bc.postMessage({ type: 'presence:leave', id: this.localPlayer.id });
        this.bc.close();
      } catch {
        // Ignore
      }
      this.bc = null;
    }
    try {
      const raw = localStorage.getItem(SHARED_STORAGE_KEY);
      if (raw) {
        const mapObj = JSON.parse(raw) as Record<string, OnlinePlayerPresence>;
        delete mapObj[this.localPlayer.id];
        localStorage.setItem(SHARED_STORAGE_KEY, JSON.stringify(mapObj));
      }
    } catch {
      // Ignore
    }
    if (this.supaChannel) {
      const supabase = getSupabaseClient();
      this.supaChannel.untrack().catch(() => {});
      if (supabase) supabase.removeChannel(this.supaChannel);
      this.supaChannel = null;
    }
  }
}
