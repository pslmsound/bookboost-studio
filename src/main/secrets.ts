// API key storage. Keys are encrypted with the operating system's
// credential protection (DPAPI on Windows) through Electron safeStorage and
// kept in a separate file, outside the database, so they are never included
// in backups or exports. The renderer can never read a key back.
import { safeStorage } from 'electron';
import fs from 'node:fs';
import type { AiProvider } from '@shared/schema';

export class SecretStore {
  private memory = new Map<string, string>();

  constructor(private readonly filePath: string) {}

  get encryptionAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  private read(): Record<string, string> {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private write(data: Record<string, string>) {
    fs.writeFileSync(this.filePath, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 });
  }

  /** Returns true when the key was stored encrypted on disk, false when held for this session only. */
  set(provider: AiProvider, key: string): boolean {
    const trimmed = key.trim();
    if (!this.encryptionAvailable) {
      this.memory.set(provider, trimmed);
      return false;
    }
    const data = this.read();
    data[provider] = safeStorage.encryptString(trimmed).toString('base64');
    this.write(data);
    this.memory.delete(provider);
    return true;
  }

  get(provider: AiProvider): string {
    const inMemory = this.memory.get(provider);
    if (inMemory) return inMemory;
    const stored = this.read()[provider];
    if (!stored || !this.encryptionAvailable) return '';
    try {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'));
    } catch {
      return '';
    }
  }

  has(provider: AiProvider): boolean {
    return this.get(provider) !== '';
  }

  isPersisted(provider: AiProvider): boolean {
    return !this.memory.has(provider) && !!this.read()[provider];
  }

  clear(provider: AiProvider): void {
    this.memory.delete(provider);
    const data = this.read();
    if (provider in data) {
      delete data[provider];
      this.write(data);
    }
  }
}
