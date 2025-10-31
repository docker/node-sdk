import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Filter } from '../lib/filter.js';

test('Filter should serialize single key with single value to JSON', () => {
    const filter = new Filter();
    filter.add('type', 'container');

    const expected = { type: { container: true } };
    assert.deepStrictEqual(filter.toJSON(), expected);
});

test('Filter should serialize single key with multiple values to JSON', () => {
    const filter = new Filter();
    filter.add('type', 'container');
    filter.add('type', 'image');

    const expected = { type: { container: true, image: true } };
    assert.deepStrictEqual(filter.toJSON(), expected);
});

test('Filter should serialize multiple keys to JSON', () => {
    const filter = new Filter();
    filter.add('type', 'container');
    filter.add('type', 'image');
    filter.add('status', 'running');
    filter.add('status', 'stopped');

    const expected = {
        type: { container: true, image: true },
        status: { running: true, stopped: true },
    };
    assert.deepStrictEqual(filter.toJSON(), expected);
});

test('Filter should serialize empty filter to empty object', () => {
    const filter = new Filter();
    assert.deepStrictEqual(filter.toJSON(), {});
});
