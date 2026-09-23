import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth/auth.js';
import { prisma } from '../auth/prisma.js';
import type { TenantRequest } from '../business/tenant-request.js';

@Injectable()
export class SessionGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw new UnauthorizedException('Authentication required.');
    const membership = await prisma.membership.findFirst({
      where: {
        userId: session.user.id,
        status: 'ACTIVE',
        user: { status: 'ACTIVE' },
        organization: { status: 'ACTIVE' },
      },
      select: { id: true, organizationId: true },
    });
    if (!membership) throw new UnauthorizedException('Active organization membership required.');
    request.identity = { session, membership };
    return true;
  }
}
