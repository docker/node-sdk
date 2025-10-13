/// <reference types="vitest" />
import { defineConfig, type UserConfig } from 'vitest/config';

export default defineConfig({
    test: {
        exclude: [
            'test-integration/cjs-project',
            'test-integration/esm-project',
        ],
        coverage: {
            include: ['lib/**/*.ts'],
            reporter: ['text', 'json', 'html'],
            reportsDirectory: './out/test/coverage',
        },
        reporters: [
            [
                'junit',
                {
                    suiteName: 'node-sdk tests',
                },
            ],
            'default',
        ],
        outputFile: {
            junit: './out/test/junit.xml',
        },
    },
}) as UserConfig;
