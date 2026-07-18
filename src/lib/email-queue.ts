/**
 * Email Queue Engine
 * Handles queuing, retrying, and logging email delivery
 */

export interface QueuedEmail {
  id: string;
  to: string;
  subject: string;
  htmlContent: string;
  retries: number;
  maxRetries: number;
  nextRetryAt: number;
  createdAt: number;
  sentAt?: number;
  error?: string;
}

class EmailQueue {
  private queue: Map<string, QueuedEmail> = new Map();
  private processing = false;

  public async enqueue(email: Omit<QueuedEmail, 'id' | 'retries' | 'nextRetryAt' | 'createdAt'>): Promise<string> {
    const id = 'em-' + Date.now() + Math.random().toString(36).substr(2, 9);
    const queuedEmail: QueuedEmail = {
      ...email,
      id,
      retries: 0,
      maxRetries: 3,
      nextRetryAt: Date.now(),
      createdAt: Date.now()
    };
    this.queue.set(id, queuedEmail);
    this.process();
    return id;
  }

  public async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      for (const [id, email] of this.queue.entries()) {
        if (email.nextRetryAt > Date.now()) continue;
        if (email.sentAt) continue;
        if (email.retries >= email.maxRetries) continue;

        try {
          await fetch('/api/emails/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: email.to, subject: email.subject, htmlContent: email.htmlContent })
          });
          email.sentAt = Date.now();
          email.error = undefined;
        } catch (err: any) {
          email.retries++;
          email.nextRetryAt = Date.now() + (1000 * Math.pow(2, email.retries));
          email.error = err.message;
        }
      }
    } finally {
      this.processing = false;
    }
  }

  public getQueue(): QueuedEmail[] {
    return Array.from(this.queue.values());
  }
}

export const emailQueue = new EmailQueue();
export default emailQueue;
