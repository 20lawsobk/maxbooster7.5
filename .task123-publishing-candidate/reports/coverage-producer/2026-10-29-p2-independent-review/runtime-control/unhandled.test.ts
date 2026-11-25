import { test, expect } from 'vitest';
import './subject';
test('assertion passes but async runtime rejects', async () => { expect(1).toBe(1); void Promise.reject(new Error('independent-review-unhandled')); await new Promise(resolve => setTimeout(resolve, 25)); });
