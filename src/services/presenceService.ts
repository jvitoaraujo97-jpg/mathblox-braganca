import { RealtimeChannel } from '@supabase/supabase-js';
import { OnlinePlayerPresence } from '../types/game';
import { getSupabaseClient } from './storageService';

const CHANNEL_NAME = 'mathblox_social_plaza_v4';
const SHARED_STORAGE_KEY = 'mathblox_plaza_presence_v4';
const STALE_TIMEOUT_MS = 14000;

type PresenceCallback = (players: OnlinePlayerPresence[]) => void;

export class PlazaPresenceManager {
  private localPlayer: OnlinePlayerPresence;
  private onUpdate: PresenceCallback;
  private peers = new Map<string, OnlinePlayerPresence>();
  private bc: BroadcastChannel | null = null;
  private supaChannel: RealtimeChannel | null = null;
  private cleanupTimer: number | null = null;
  private onStorageBound: ((e: StorageEvent) => void) | null = null;

  constructor(initialPlayer: OnlinePlayerPresence, onUpdate: PresenceCallback) {
    this.localPlayer = { ...initialPlayer, updatedAt: Date.now() };
    this.onUpdate = onUpdate;
  }

  public start(): void {
    // 1. Read any active peers from shared localStorage (across tabs on same browser)
    this.readSharedStorage();

    // 2. Setup BroadcastChannel for instant low-latency cross-tab / same-device sync
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.bc = new BroadcastChannel(CHANNEL_NAME);
      this.bc.onmessage = (ev) => {
        const msg = ev.data as { type: string; player?: OnlinePlayerPresence; id?: string };
        if (!msg) return;
        if (msg.type === 'presence:update' && msg.player) {
          if (msg.player.id !== this.localPlayer.id) {
            this.peers.set(msg.player.id, { ...msg.player, updatedAt: Date.now() });
            this.emit();
          }
        } else if (msg.type === 'presence:leave' && msg.id) {
          this.peers.delete(msg.id);
          this.emit();
        } else if (msg.type === 'presence:request') {
          this.broadcastLocal();
        }
      };
      this.bc.postMessage({ type: 'presence:request' });
    }

    // Listen to storage events as additional cross-tab fallback
    if (typeof window !== 'undefined') {
      this.onStorageBound = (e: StorageEvent) => {
        if (e.key === SHARED_STORAGE_KEY) {
          this.readSharedStorage();
          this.emit();
        }
      };
      window.addEventListener('storage', this.onStorageBound);
    }

    // 3. Setup Supabase Realtime Presence & Broadcast if configured
    const supabase = getSupabaseClient();
    if (supabase) {
      this.supaChannel = supabase.channel(CHANNEL_NAME, {
        config: { presence: { key: this.localPlayer.id } },
      });

      this.supaChannel
        .on('presence', { event: 'sync' }, () => {
          if (!this.supaChannel) return;
          const state = this.supaChannel.presenceState<OnlinePlayerPresence>();
          Object.values(state).forEach((presences) => {
            for (const p of presences) {
              if (p.id && p.id !== this.localPlayer.id) {
                this.peers.set(p.id, { ...p, updatedAt: Date.now() });
              }
            }
          });
          this.emit();
        })
        .on('broadcast', { event: 'player_move' }, ({ payload }) => {
          const p = payload as OnlinePlayerPresence;
          if (p && p.id && p.id !== this.localPlayer.id) {
            this.peers.set(p.id, { ...p, updatedAt: Date.now() });
            this.emit();
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && this.supaChannel) {
            await this.supaChannel.track(this.localPlayer);
          }
        });
    }

    this.broadcastLocal();
    this.emit();

    // Prune stale peer states periodically
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
      }, 2500);
    }
  }

  public updateLocal(patch: Partial<OnlinePlayerPresence>): void {
    this.localPlayer = {
      ...this.localPlayer,
      ...patch,
      updatedAt: Date.now(),
    };
    this.broadcastLocal();
    this.emit();
  }

  private broadcastLocal(): void {
    this.writeSharedStorage();
    if (this.bc) {
      try {
        this.bc.postMessage({ type: 'presence:update', player: this.localPlayer });
      } catch {
        // Ignore closed channel
      }
    }
    if (this.supaChannel) {
      this.supaChannel
        .send({
          type: 'broadcast',
          event: 'player_move',
          payload: this.localPlayer,
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
