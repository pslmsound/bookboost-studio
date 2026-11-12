// Preload bridge. This is the only surface the renderer can reach. It
// exposes one validated invoke function and one event subscription.
import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type ApiResult, type BookBoostBridge, type IpcChannel } from '@shared/api';

const allowed = new Set<string>(IPC_CHANNELS);

const closeTasks = new Set<() => Promise<unknown>>();

const bridge: BookBoostBridge = {
  onBeforeClose(callback: () => Promise<unknown>) {
    closeTasks.add(callback);
    return () => closeTasks.delete(callback);
  },
  invoke(channel: IpcChannel, payload?: unknown): Promise<ApiResult<unknown>> {
    if (!allowed.has(channel)) {
      return Promise.resolve({ ok: false, error: { code: 'forbidden', message: 'This request was blocked.' } });
    }
    return ipcRenderer.invoke('bookboost', channel, payload);
  },
  onDataReplaced(callback: () => void) {
    const listener = () => callback();
    ipcRenderer.on('bookboost:data-replaced', listener);
    return () => ipcRenderer.removeListener('bookboost:data-replaced', listener);
  },
};

// When the window is asked to close, pending saves run first and the main
// process is told when they are done. It does not wait longer than two seconds.
ipcRenderer.on('bookboost:flush', () => {
  void Promise.allSettled(Array.from(closeTasks).map((task) => task())).finally(() => ipcRenderer.send('bookboost:flushed'));
});

contextBridge.exposeInMainWorld('bookboost', bridge);
