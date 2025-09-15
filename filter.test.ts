import { Filter } from './filter.js';

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.log(`✗ ${name}: ${error.message}`);
  }
}

function assertEqual(actual: any, expected: any) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

test('Filter should serialize single key with single value to JSON', () => {
  const filter = new Filter();
  filter.add('type', 'container');
  
  const expected = { type: { container: true } };
  assertEqual(filter.toJSON(), expected);
});

test('Filter should serialize single key with multiple values to JSON', () => {
  const filter = new Filter();
  filter.add('type', 'container');
  filter.add('type', 'image');
  
  const expected = { type: { container: true, image: true } };
  assertEqual(filter.toJSON(), expected);
});

test('Filter should serialize multiple keys to JSON', () => {
  const filter = new Filter();
  filter.add('type', 'container');
  filter.add('type', 'image');
  filter.add('status', 'running');
  filter.add('status', 'stopped');
  
  const expected = {
    type: { container: true, image: true },
    status: { running: true, stopped: true }
  };
  assertEqual(filter.toJSON(), expected);
});

test('Filter should serialize empty filter to empty object', () => {
  const filter = new Filter();
  assertEqual(filter.toJSON(), {});
});
