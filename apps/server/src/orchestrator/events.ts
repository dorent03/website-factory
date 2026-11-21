import { EventEmitter } from 'node:events';
import type { ServerEvent } from '@wf/shared';

const bus = new EventEmitter();
bus.setMaxListeners(200);

export function emit(event: ServerEvent): void {
  bus.emit('event', event);
}

export function subscribe(fn: (e: ServerEvent) => void): () => void {
  bus.on('event', fn);
  return () => bus.off('event', fn);
}
