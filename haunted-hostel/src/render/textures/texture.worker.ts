/// <reference lib="webworker" />
import { generateTextureSet } from './recipes';

self.onmessage = (e: MessageEvent<{ id: number; name: string; size: number }>) => {
  const { id, name, size } = e.data;
  try {
    const set = generateTextureSet(name, size);
    (self as unknown as Worker).postMessage({ id, set }, [set.albedo.buffer, set.normal.buffer, set.orm.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
