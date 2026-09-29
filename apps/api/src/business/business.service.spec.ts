import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
process.env.DATABASE_URL = 'postgresql://platform:platform@localhost:5432/platform?schema=public';
const { prisma } = await import('../auth/prisma.js');
const { CustomerService } = await import('./customer.service.js');
const { StaffService } = await import('./staff.service.js');
const { ServiceService } = await import('./service.service.js');
let organizationA = ''; let organizationB = ''; let resourceTypeA = ''; let resourceTypeB = ''; let serviceA = '';
const customers = new CustomerService(); const staff = new StaffService(); const services = new ServiceService();
const tag = `m4-${randomUUID()}`;
beforeAll(async () => { const [a, b] = await Promise.all([prisma.organization.create({ data: { name: `${tag}-a`, slug: `${tag}-a` } }), prisma.organization.create({ data: { name: `${tag}-b`, slug: `${tag}-b` } })]); organizationA = a.id; organizationB = b.id; resourceTypeA = (await services.createResourceType(organizationA, { name: `${tag}-type` })).id; resourceTypeB = (await services.createResourceType(organizationB, { name: `${tag}-type` })).id; });
afterAll(async () => { await prisma.service.deleteMany({ where: { organizationId: { in: [organizationA, organizationB] } } }); await prisma.staffProfile.deleteMany({ where: { organizationId: { in: [organizationA, organizationB] } } }); await prisma.customerProfile.deleteMany({ where: { organizationId: { in: [organizationA, organizationB] } } }); await prisma.skill.deleteMany({ where: { organizationId: { in: [organizationA, organizationB] } } }); await prisma.resourceType.deleteMany({ where: { organizationId: { in: [organizationA, organizationB] } } }); await prisma.serviceCategory.deleteMany({ where: { organizationId: { in: [organizationA, organizationB] } } }); await prisma.organization.deleteMany({ where: { id: { in: [organizationA, organizationB] } } }); await prisma.$disconnect(); });
describe('Milestone 4 tenant-scoped services', () => {
  it('persists a decimal commission percentage and preserves it when an update omits it', async () => {
    const input = { name: `${tag}-commission`, durationMinutes: 30, priceMinor: 10000, currency: 'MYR', requiredStaffCount: 1, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, commissionPercentage: 30.25 };
    const created = await services.create(organizationA, input);
    expect(Number(created.commissionPercentage)).toBe(30.25);
    const withoutRate = { ...input, commissionPercentage: undefined };
    const updated = await services.update(organizationA, created.id, { ...withoutRate, priceMinor: 12000 });
    expect(Number(updated.commissionPercentage)).toBe(30.25);
    expect(Number((await services.update(organizationA, created.id, { ...input, commissionPercentage: 0 })).commissionPercentage)).toBe(0);
  });

  it('rejects invalid commission percentages on create and update', async () => {
    const input = { name: `${tag}-invalid-rate`, durationMinutes: 30, priceMinor: 10000, currency: 'MYR', requiredStaffCount: 1, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 };
    const created = await services.create(organizationA, input);
    for (const commissionPercentage of [-1, 100.01, 12.345, NaN, Infinity, null]) {
      await expect(services.create(organizationA, { ...input, name: `${tag}-${commissionPercentage}`, commissionPercentage } as never)).rejects.toThrow();
      await expect(services.update(organizationA, created.id, { ...input, commissionPercentage } as never)).rejects.toThrow();
    }
  });
  it('creates, updates, and tenant-scopes customers and staff', async () => { const customer = await customers.create(organizationA, { firstName: 'A', lastName: 'Customer', displayName: `${tag} customer`, email: `${tag}@example.test`, phone: '1' }); await customers.update(organizationA, customer.id, { firstName: 'B', lastName: 'Customer', displayName: `${tag} customer`, email: `${tag}@example.test`, phone: '2' }); expect((await customers.get(organizationA, customer.id)).firstName).toBe('B'); await expect(customers.get(organizationB, customer.id)).rejects.toThrow(); const memberless = await staff.create(organizationA, { employeeCode: `${tag}-001`, displayName: `${tag} staff`, email: `${tag}-staff@example.test`, phone: '3' }); expect(memberless.userId).toBeNull(); await expect(staff.get(organizationB, memberless.id)).rejects.toThrow(); });
  it('allows same-name resource types across organizations but not within one organization', async () => { await expect(services.createResourceType(organizationA, { name: `${tag}-type` })).rejects.toThrow(); expect(resourceTypeA).not.toBe(resourceTypeB); const updated = await services.updateResourceType(organizationA, resourceTypeA, { name: `${tag}-type-updated`, description: 'updated' }); expect(updated.description).toBe('updated'); expect((await services.setResourceTypeStatus(organizationA, resourceTypeA, 'INACTIVE')).status).toBe('INACTIVE'); });
  it('stores integer minor money and rejects invalid or cross-tenant resource requirements', async () => { const activeType = await services.createResourceType(organizationA, { name: `${tag}-active-type` }); serviceA = (await services.create(organizationA, { name: `${tag} service`, durationMinutes: 60, priceMinor: 12500, currency: 'MYR', requiredStaffCount: 1, bufferBeforeMinutes: 0, bufferAfterMinutes: 10, requiredResourceTypes: [{ id: activeType.id, requiredCount: 2 }] })).id; expect((await services.get(organizationA, serviceA)).priceMinor).toBe(12500); await expect(services.create(organizationA, { name: `${tag} invalid`, durationMinutes: 0, priceMinor: 1, currency: 'MYR', requiredStaffCount: 1, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 })).rejects.toThrow(); await expect(services.create(organizationA, { name: `${tag} cross`, durationMinutes: 30, priceMinor: 1, currency: 'MYR', requiredStaffCount: 1, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, requiredResourceTypes: [{ id: resourceTypeB, requiredCount: 1 }] })).rejects.toThrow(); await expect(services.create(organizationA, { name: `${tag} count`, durationMinutes: 30, priceMinor: 1, currency: 'MYR', requiredStaffCount: 1, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, requiredResourceTypes: [{ id: activeType.id, requiredCount: 0 }] })).rejects.toThrow(); await expect(services.get(organizationB, serviceA)).rejects.toThrow(); });
});
