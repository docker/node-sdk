/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

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
