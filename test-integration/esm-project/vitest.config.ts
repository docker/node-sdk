/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
    test: {
        include: ['**/*.test.ts'],
        reporters: [
            [
                'junit',
                {
                    suiteName: 'Node-SDK ESM Integration Tests',
                },
            ],
            'default',
        ],
        outputFile: {
            junit: './junit.xml',
        },
    },

});
