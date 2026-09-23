import { describe, expect, it } from 'vitest';
import { hasPermission } from './permissions.js';
describe('hasPermission', () => { it('evaluates permission context safely', () => { expect(hasPermission({ permissions: ['role.read'] }, 'role.read')).toBe(true); expect(hasPermission({ permissions: [] }, 'role.read')).toBe(false); expect(hasPermission(undefined, 'role.read')).toBe(false); }); });
