import { defineConfig } from 'vitest/config';

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
