/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
    test: {
        include: ['**/*.test.js'],
        reporters: [
            [
                'junit',
                {
                    suiteName: 'Node-SDK CJS Integration Tests',
                },
            ],
            'default',
        ],
        outputFile: {
            junit: './junit.xml',
        },
    },
});
