import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],

    format: ['cjs', 'esm'],
    dts: false, // disable dts generation for now to work through type issues
    minify: false,
    outDir: 'dist/',
    clean: true,
    sourcemap: true,
    bundle: true,
    splitting: false,
    treeshake: false,
    target: 'es2022',
    platform: 'node',
    tsconfig: './tsconfig.json',
    cjsInterop: true,
    keepNames: true,
    skipNodeModulesBundle: false,
    outExtension(ctx) {
        return {
            dts: '.d.ts',
            js: ctx.format === 'cjs' ? '.cjs' : '.mjs',
        };
    },
});
