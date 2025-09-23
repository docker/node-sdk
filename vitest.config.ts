/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
    test: {
        exclude: [
            'test-integration/cjs-project',
            'test-integration/esm-project',
        ],
    },
});
