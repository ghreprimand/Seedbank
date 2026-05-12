import type { NextFunction, Request, Response } from 'express';
import { ApiTokenStore, type TokenRecord, hashApiToken, type TokenScope } from '../tokens.js';

export interface AuthToken {
  id: string;
  name: string;
  scopes: string[];
}

export interface AuthState {
  implicitLocal: boolean;
  token: AuthToken | null;
}

export type RequestWithAuth = Request & { auth?: AuthState };

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function isLocalIp(ip: string | undefined): boolean {
  return Boolean(ip && LOOPBACK_IPS.has(ip));
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return null;
  return match[1].trim();
}

function normalizeToken(record: TokenRecord): AuthToken {
  return {
    id: record.id,
    name: record.name,
    scopes: record.scopes,
  };
}

export function authMiddleware(tokenStore: ApiTokenStore) {
  return (req: RequestWithAuth, res: Response, next: NextFunction): void => {
    if (req.path === '/health' || req.path === '/openapi.json') {
      next();
      return;
    }

    const bearer = extractBearerToken(req.header('authorization'));
    const local = isLocalIp(req.ip || req.socket.remoteAddress || undefined);

    if (!bearer) {
      if (!local) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      req.auth = {
        implicitLocal: true,
        token: null,
      };
      next();
      return;
    }

    const hash = hashApiToken(bearer);
    const token = tokenStore.getByHash(hash);
    if (!token) {
      res.status(401).json({ error: 'Invalid token.' });
      return;
    }

    tokenStore.touchLastUsed(token.id);
    req.auth = {
      implicitLocal: false,
      token: normalizeToken(token),
    };
    next();
  };
}

export function requireScope(scope: TokenScope) {
  return (req: RequestWithAuth, res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (auth?.implicitLocal) {
      next();
      return;
    }

    const scopes = auth?.token?.scopes ?? [];
    if (!scopes.includes(scope)) {
      res.status(403).json({ error: `Missing required scope: ${scope}` });
      return;
    }

    next();
  };
}

export function requireImplicitLocal(req: RequestWithAuth, res: Response, next: NextFunction): void {
  if (!req.auth?.implicitLocal) {
    res.status(403).json({ error: 'Token creation is only allowed from a local session.' });
    return;
  }
  next();
}
