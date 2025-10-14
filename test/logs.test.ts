import { assert, test, describe } from 'vitest';
import { Logger } from '../lib/logs.js';

describe('Logger', () => {
    test('should call callback for each complete line', () => {
        const lines: string[] = [];
        const logger = new Logger((line) => {
            lines.push(line);
        });

        logger.write('line1\nline2\nline3\n');
        logger.end();

        assert.deepEqual(lines, ['line1', 'line2', 'line3']);
    });

    test('should handle partial lines across multiple writes', () => {
        const lines: string[] = [];
        const logger = new Logger((line) => {
            lines.push(line);
        });

        logger.write('partial');
        logger.write(' line1\nline2');
        logger.write('\nline3\n');
        logger.end();

        assert.deepEqual(lines, ['partial line1', 'line2', 'line3']);
    });

    test('should handle remaining buffer on end', () => {
        const lines: string[] = [];
        const logger = new Logger((line) => {
            lines.push(line);
        });

        logger.write('line without newline');
        logger.end();

        assert.deepEqual(lines, ['line without newline']);
    });

    test('should handle empty lines', () => {
        const lines: string[] = [];
        const logger = new Logger((line) => {
            lines.push(line);
        });

        logger.write('line1\n\nline3\n');
        logger.end();

        assert.deepEqual(lines, ['line1', '', 'line3']);
    });

    test('should handle only newlines', () => {
        const lines: string[] = [];
        const logger = new Logger((line) => {
            lines.push(line);
        });

        logger.write('\n\n\n');
        logger.end();

        assert.deepEqual(lines, ['', '', '']);
    });
});
