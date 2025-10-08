import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: ['lib/index.ts'],

    format: ['cjs', 'esm'],
    dts: {
        sourcemap: true,
    },
    minify: false,
    outDir: 'dist/',
    clean: true,
    sourcemap: true,
    unbundle: false,
    treeshake: false,
    target: 'es2022',
    platform: 'node',
    tsconfig: './tsconfig.json',
    skipNodeModulesBundle: false,
});
