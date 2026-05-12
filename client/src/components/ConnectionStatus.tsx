import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Database, HardDrive, Loader2 } from 'lucide-react';
import {
  refreshConnectionStatus,
  subscribeToConnectionStatus,
  type ConnectionStatus as Status,
} from '@/api/client';

export default function ConnectionStatus() {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    const unsubscribe = subscribeToConnectionStatus(setStatus);
    void refreshConnectionStatus();
    const id = window.setInterval(() => {
      void refreshConnectionStatus();
    }, 30_000);
    return () => {
      unsubscribe();
      window.clearInterval(id);
    };
  }, []);

  const Icon = status === 'online' ? Database : status === 'offline' ? HardDrive : Loader2;

  const tooltip =
    status === 'online'
      ? 'API connected — click to manage'
      : status === 'offline'
        ? 'API unreachable — click to manage'
        : 'Checking API connection';

  return (
    <Link
      to="/settings/api"
      title={tooltip}
      className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-badge border text-[11px] font-mono transition-colors no-underline ${
        status === 'online'
          ? 'text-sage-700 bg-sage-50 border-sage-200 hover:bg-sage-100'
          : status === 'offline'
            ? 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
            : 'text-ink-400 bg-paper-warm border-ink-100 hover:bg-ink-50'
      }`}
    >
      <Icon className={`w-3.5 h-3.5 ${status === 'checking' ? 'animate-spin' : ''}`} />
      <span>{status === 'online' ? 'API' : status === 'offline' ? 'Local' : '...'}</span>
    </Link>
  );
}
