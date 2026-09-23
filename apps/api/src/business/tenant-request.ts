import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

export type TenantRequest = Request & {
  identity?: { session: { user: { id: string } }; membership: { organizationId: string }; permissions?: string[] };
};

export function tenantContext(request: TenantRequest) {
  if (!request.identity) {
    throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required.' });
  }

  return { organizationId: request.identity.membership.organizationId, userId: request.identity.session.user.id };
}
