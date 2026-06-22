import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class AtomicJsonStore<T> {
  constructor(private readonly filePath: string, private readonly defaults: T) {}

  async read(): Promise<T> {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8')) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return structuredClone(this.defaults);
    }
  }

  async write(value: T): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporary, this.filePath);
  }

  async update(change: (current: T) => T | Promise<T>): Promise<T> {
    const next = await change(await this.read());
    await this.write(next);
    return next;
  }
}
