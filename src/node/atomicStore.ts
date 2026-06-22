import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class AtomicJsonStore<T> {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string, private readonly defaults: T) {}

  private async readDirect(): Promise<T> {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8')) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return structuredClone(this.defaults);
    }
  }

  private async writeDirect(value: T): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporary, this.filePath);
  }

  private enqueue<R>(operation: () => Promise<R>): Promise<R> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  read(): Promise<T> {
    return this.queue.then(() => this.readDirect());
  }

  write(value: T): Promise<void> {
    const snapshot = structuredClone(value);
    return this.enqueue(() => this.writeDirect(snapshot));
  }

  update(change: (current: T) => T | Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      const next = await change(await this.readDirect());
      await this.writeDirect(next);
      return next;
    });
  }
}
