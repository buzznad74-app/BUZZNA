import { db } from './db';
import { SyncQueueItem } from '../types';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

class SynchronizationEngine {
  private isSynchronizing = false;
  private networkOnline = true;
  private listeners: Set<(online: boolean, syncing: boolean) => void> = new Set();

  constructor() {
    this.detectNativeConnection();
    setInterval(() => this.triggerAutoSync(), 10000);
  }

  private detectNativeConnection() {
    this.networkOnline = navigator.onLine;
    window.addEventListener('online', () => this.setNetworkState(true));
    window.addEventListener('offline', () => this.setNetworkState(false));
  }

  public setNetworkState(isOnline: boolean) {
    this.networkOnline = isOnline;
    this.notifyListeners();
    if (isOnline) {
      this.triggerAutoSync();
    }
  }

  public isOnline(): boolean {
    return this.networkOnline;
  }

  public isSyncing(): boolean {
    return this.isSynchronizing;
  }

  public subscribe(listener: (online: boolean, syncing: boolean) => void): () => void {
    this.listeners.add(listener);
    listener(this.networkOnline, this.isSynchronizing);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.networkOnline, this.isSynchronizing));
  }

  private async triggerAutoSync() {
    if (!this.networkOnline || this.isSynchronizing) return;
    const queue = await db.getAll<SyncQueueItem>('sync_queue');
    if (queue.length === 0) return;
    this.forceSync();
  }

  public async forceSync(): Promise<{ successCount: number; failedCount: number }> {
    if (this.isSynchronizing) return { successCount: 0, failedCount: 0 };
    
    this.isSynchronizing = true;
    this.notifyListeners();

    const queue = await db.getAll<SyncQueueItem>('sync_queue');
    let successCount = 0;
    let failedCount = 0;

    for (const item of queue) {
      try {
        if (!this.networkOnline) {
          throw new Error('Network offline');
        }

        await fetch('/api/sync/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item)
        });

        await db.delete('sync_queue', item.queueId);
        successCount++;
      } catch (err) {
        failedCount++;
        console.warn(`Sync failed for ${item.queueId}:`, err);
      }
    }

    this.isSynchronizing = false;
    this.notifyListeners();

    return { successCount, failedCount };
  }
}

export const syncEngine = new SynchronizationEngine();
export default syncEngine;
