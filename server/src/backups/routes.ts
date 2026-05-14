import type { Express, Request, Response, NextFunction } from 'express';
import { requireScope } from '../middleware/auth.js';
import { BackupRequestError, type BackupService } from './service.js';
import type { BackupConfig } from '../../../shared/types.js';

function asyncRoute<T>(handler: (req: Request, res: Response) => T | Promise<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

function handleBackupRequestError(err: unknown, res: Response): boolean {
  if (!(err instanceof BackupRequestError)) return false;
  res.status(err.statusCode).json({ error: err.message });
  return true;
}

export function registerBackupRoutes(app: Express, backupService: BackupService): void {
  app.get('/api/backups', requireScope('read:ideas'), asyncRoute((_req, res) => {
    res.json(backupService.status());
  }));

  app.patch('/api/backups/config', requireScope('write:ideas'), asyncRoute((req, res) => {
    const body = req.body as Partial<BackupConfig>;
    backupService.configure(body);
    res.json(backupService.status());
  }));

  app.post('/api/backups/run', requireScope('write:ideas'), asyncRoute((_req, res) => {
    const run = backupService.run('manual');
    res.json({
      run: backupService.redactedBackupRunRecord(run),
      status: backupService.status(),
    });
  }));

  app.post('/api/backups/destinations/test', requireScope('write:ideas'), asyncRoute((req, res) => {
    try {
      res.json(backupService.testDestination(req.body ?? {}));
    } catch (err) {
      if (!handleBackupRequestError(err, res)) throw err;
    }
  }));

  app.post('/api/backups/test-restore', requireScope('write:ideas'), asyncRoute((req, res) => {
    try {
      res.json(backupService.testRestore(req.body ?? {}));
    } catch (err) {
      if (!handleBackupRequestError(err, res)) throw err;
    }
  }));
}
