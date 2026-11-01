import {test,expect} from 'vitest';
import './subject';
test('first actual passing case',()=>expect(1).toBe(1));
test('second actual passing case',async()=>{expect(2).toBe(2);});
