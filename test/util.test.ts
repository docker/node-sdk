import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getErrorMessage } from '../lib/util.js';

describe('utils', () => {
    describe('getErrorMessage', () => {
        test('should return undefined for null', () => {
            const result = getErrorMessage(null);
            assert.strictEqual(result, undefined);
        });

        test('should return undefined for undefined', () => {
            const result = getErrorMessage(undefined);
            assert.strictEqual(result, undefined);
        });

        test('should return undefined for false', () => {
            const result = getErrorMessage(false);
            assert.strictEqual(result, undefined);
        });

        test('should return undefined for 0', () => {
            const result = getErrorMessage(0);
            assert.strictEqual(result, undefined);
        });

        test('should return undefined for empty string', () => {
            const result = getErrorMessage('');
            assert.strictEqual(result, undefined);
        });

        test('should return string when input is a string', () => {
            const result = getErrorMessage('error message');
            assert.strictEqual(result, 'error message');
        });

        test('should return Error message property', () => {
            const error = new Error('test error');
            const result = getErrorMessage(error);
            assert.strictEqual(result, 'test error');
        });

        test('should handle TypeError', () => {
            const error = new TypeError('type error message');
            const result = getErrorMessage(error);
            assert.strictEqual(result, 'type error message');
        });

        test('should handle custom Error subclass', () => {
            class CustomError extends Error {
                constructor(message: string) {
                    super(message);
                    this.name = 'CustomError';
                }
            }

            const error = new CustomError('custom error message');
            const result = getErrorMessage(error);
            assert.strictEqual(result, 'custom error message');
        });

        test('should extract message from object with message property', () => {
            const errorObj = { message: 'nested error message' };
            const result = getErrorMessage(errorObj);
            assert.strictEqual(result, 'nested error message');
        });

        test('should handle deeply nested message property', () => {
            const errorObj = { message: { message: 'deeply nested error' } };
            const result = getErrorMessage(errorObj);
            assert.strictEqual(result, undefined);
        });

        test('should handle object with message property containing Error', () => {
            const errorObj = {
                message: new Error('error in message property'),
            };
            const result = getErrorMessage(errorObj);
            assert.strictEqual(result, undefined);
        });

        test('should return undefined for object without message property', () => {
            const obj = { code: 'ENOENT', path: '/some/path' };
            const result = getErrorMessage(obj);
            assert.strictEqual(result, undefined);
        });

        test('should return undefined for number', () => {
            const result = getErrorMessage(42);
            assert.strictEqual(result, undefined);
        });

        test('should return undefined for boolean true', () => {
            const result = getErrorMessage(true);
            assert.strictEqual(result, undefined);
        });

        test('should return undefined for array', () => {
            const result = getErrorMessage(['error', 'array']);
            assert.strictEqual(result, undefined);
        });

        test('should handle circular reference in nested messages', () => {
            const errorObj: any = { message: null };
            errorObj.message = errorObj;
            const result = getErrorMessage(errorObj);
            assert.strictEqual(result, undefined);
        });

        test('should handle null message property', () => {
            const errorObj = { message: null };
            const result = getErrorMessage(errorObj);
            assert.strictEqual(result, undefined);
        });

        test('should handle undefined message property', () => {
            const errorObj = { message: undefined };
            const result = getErrorMessage(errorObj);
            assert.strictEqual(result, undefined);
        });

        test('should handle empty string message property', () => {
            const errorObj = { message: '' };
            const result = getErrorMessage(errorObj);
            assert.strictEqual(result, '');
        });

        test('should handle complex circular reference chain', () => {
            const obj1: any = { message: null };
            const obj2: any = { message: null };
            obj1.message = obj2;
            obj2.message = obj1;
            const result = getErrorMessage(obj1);
            assert.strictEqual(result, undefined);
        });

        test('should handle self-referencing object with other properties', () => {
            const errorObj: any = {
                code: 'ERROR',
                timestamp: Date.now(),
                message: null,
            };
            errorObj.message = errorObj;
            const result = getErrorMessage(errorObj);
            assert.strictEqual(result, undefined);
        });
    });
});
