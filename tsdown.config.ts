import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: ['lib/index.ts'],
    format: ['cjs', 'esm'],
    fixedExtension: true,
    dts: {
        sourcemap: true,
    },
    minify: false,
    outDir: 'dist/',
    clean: true,
    sourcemap: true,
    unbundle: false,
    treeshake: false,
    target: ['es2022', 'node18'],
    platform: 'node',
    tsconfig: './tsconfig.json',
    nodeProtocol: true,
    skipNodeModulesBundle: false,
});
