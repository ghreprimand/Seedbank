/**
 * OfflineBanner — shows a sage-toned notice when the settings store is in
 * offline/local mode. Replaces per-tab red error panels (FU2).
 */
import { Wifi } from 'lucide-react';
import { useSettingsOffline, useSettingsStore } from '@/stores/settings';

export default function OfflineBanner() {
  const offline = useSettingsOffline();
  const loaded = useSettingsStore((s) => s.loaded);

  if (!loaded || !offline) return null;

  return (
    <div
      className="flex items-start gap-2.5 mb-5 px-4 py-3 bg-sage-50 border border-sage-200
                 rounded-card text-sm text-sage-800"
      role="status"
    >
      <Wifi className="w-4 h-4 mt-0.5 shrink-0 text-sage-500" />
      <span>
        <strong className="font-medium">Local mode</strong> — server is unreachable.
        Settings will use cached values until the API is back.
        Theme changes still apply and are saved locally.
      </span>
    </div>
  );
}
