import { assert, test } from 'vitest';
import { Filter } from './filter.js';

test('Filter should serialize single key with single value to JSON', () => {
  const filter = new Filter();
  filter.add('type', 'container');

  const expected = { type: { container: true } };
  assert.deepEqual(filter.toJSON(), expected);
});

test('Filter should serialize single key with multiple values to JSON', () => {
  const filter = new Filter();
  filter.add('type', 'container');
  filter.add('type', 'image');

  const expected = { type: { container: true, image: true } };
  assert.deepEqual(filter.toJSON(), expected);
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
  assert.deepEqual(filter.toJSON(), expected);
});

test('Filter should serialize empty filter to empty object', () => {
  const filter = new Filter();
  assert.deepEqual(filter.toJSON(), {});
});
