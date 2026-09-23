import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { auth } from '../auth/auth.js';
import { prisma } from '../auth/prisma.js';

@Controller('identity')
export class IdentityController {
  @Get('me')
  async me(@Req() request: Request) {
    const result = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!result) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required.' });
    const membership = await prisma.membership.findFirst({
      where: { userId: result.user.id, status: 'ACTIVE', organization: { status: 'ACTIVE' } },
      include: { organization: true, role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!membership) throw new UnauthorizedException({ code: 'NO_ACTIVE_MEMBERSHIP', message: 'No active organization membership.' });
    const { role: assignedRole, ...activeMembership } = membership;
    const role = assignedRole?.status === 'ACTIVE' && assignedRole.organizationId === membership.organizationId ? assignedRole : null;
    const effective = role ? role.permissions.map(({ permission }) => permission.key) : [];
    return { user: result.user, activeOrganization: membership.organization, activeMembership, role, permissions: effective };
  }
}
