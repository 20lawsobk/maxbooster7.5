import { test, expect } from 'vitest';
import './subject';
test('real failed assertion', () => { expect(1).toBe(2); });
