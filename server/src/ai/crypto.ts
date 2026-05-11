import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from '../db.js';

const keyPath = path.join(dataDir, 'seedbank.key');

function getKey(): Buffer {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(keyPath)) {
    const key = crypto.randomBytes(32);
    fs.writeFileSync(keyPath, key.toString('base64'), { mode: 0o600 });
    return key;
  }

  return Buffer.from(fs.readFileSync(keyPath, 'utf8'), 'base64');
}

export function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64')).join('.');
}

export function decryptSecret(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const [ivRaw, tagRaw, encryptedRaw] = value.split('.');
  if (!ivRaw || !tagRaw || !encryptedRaw) return undefined;

  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivRaw, 'base64'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
