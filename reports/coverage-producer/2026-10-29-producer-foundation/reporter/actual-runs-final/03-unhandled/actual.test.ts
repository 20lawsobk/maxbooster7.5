import { test, expect } from 'vitest';
import './subject';
test('real assertion passes with unhandled runtime failure', async () => { expect(1).toBe(1); void Promise.reject(new Error('owned-public-reporter-control')); await new Promise(resolve => setTimeout(resolve, 25)); });
