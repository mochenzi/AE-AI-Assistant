import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'node16',
    outDir: 'dist/node',
    emptyOutDir: false,
    lib: { entry: 'src/node/cepRuntime.ts', formats: ['cjs'], fileName: () => 'runtime.cjs' },
    rollupOptions: { external: [...builtinModules, ...builtinModules.map((name) => `node:${name}`)] },
  },
});
