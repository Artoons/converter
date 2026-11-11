import { useCallback, useEffect, useMemo, useState } from 'react';
import { isDesktopApp } from '../utils/env';
import { errorMessage } from '../utils/format';
import { native, subscribe, type ModuleProgress, type ModuleStatus } from '../lib/native';
import type { ModuleId } from '../core/routes';

export interface ModulesApi {
  desktop: boolean;
  status: Partial<Record<ModuleId, ModuleStatus>>;
  progress: Partial<Record<ModuleId, ModuleProgress>>;
  errors: Partial<Record<ModuleId, string>>;
  installed: Set<string>;
  platform: string;
  enginesDir: string;
  install: (id: ModuleId) => Promise<boolean>;
  uninstall: (id: ModuleId) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useModules(): ModulesApi {
  const desktop = isDesktopApp();
  const [status, setStatus] = useState<Partial<Record<ModuleId, ModuleStatus>>>({});
  const [progress, setProgress] = useState<Partial<Record<ModuleId, ModuleProgress>>>({});
  const [errors, setErrors] = useState<Partial<Record<ModuleId, string>>>({});
  const [platform, setPlatform] = useState('');
  const [enginesDir, setEnginesDir] = useState('');

  const refresh = useCallback(async () => {
    if (!desktop) return;
    try {
      const list = await native.getModulesStatus();
      setStatus(Object.fromEntries(list.map((m) => [m.id, m])));
    } catch (e) {
      console.error('get_modules_status failed', e);
    }
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    void refresh();
    native.platform().then(setPlatform).catch(() => {});
    native.enginesDir().then(setEnginesDir).catch(() => {});
    return subscribe(() =>
      native.onModuleProgress((p) => {
        if (p.stage === 'done' || p.stage === 'error') return; // handled by install()
        setProgress((s) => ({ ...s, [p.moduleId]: p }));
      }),
    );
  }, [desktop, refresh]);

  const install = useCallback(
    async (id: ModuleId) => {
      if (!desktop) return false;
      setErrors((e) => ({ ...e, [id]: undefined }));
      setProgress((s) => ({
        ...s,
        [id]: { moduleId: id, stage: 'starting', artifactIndex: 0, artifactCount: 1, downloaded: 0, total: null, percent: 0, message: null },
      }));
      try {
        const st = await native.installModule(id);
        setStatus((s) => ({ ...s, [id]: st }));
        return true;
      } catch (e) {
        setErrors((s) => ({ ...s, [id]: errorMessage(e) }));
        return false;
      } finally {
        setProgress((s) => {
          const n = { ...s };
          delete n[id];
          return n;
        });
      }
    },
    [desktop],
  );

  const uninstall = useCallback(
    async (id: ModuleId) => {
      if (!desktop) return;
      try {
        const st = await native.uninstallModule(id);
        setStatus((s) => ({ ...s, [id]: st }));
      } catch (e) {
        setErrors((s) => ({ ...s, [id]: errorMessage(e) }));
      }
    },
    [desktop],
  );

  const installed = useMemo(() => {
    const set = new Set<string>(['core']);
    for (const m of Object.values(status)) if (m?.installed) set.add(m.id);
    return set;
  }, [status]);

  return { desktop, status, progress, errors, installed, platform, enginesDir, install, uninstall, refresh };
}
