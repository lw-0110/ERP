import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth/auth.js';
import { prisma } from '../auth/prisma.js';
import { PERMISSION_KEY } from './permission.decorator.js';
@Injectable()
export class PermissionGuard implements CanActivate { async canActivate(context: ExecutionContext) { const key=Reflect.getMetadata(PERMISSION_KEY,context.getHandler()) ?? Reflect.getMetadata(PERMISSION_KEY,context.getClass()); if(!key)return true; const required = Array.isArray(key) ? key as string[] : [key as string]; const request=context.switchToHttp().getRequest(); const session=await auth.api.getSession({headers:fromNodeHeaders(request.headers)}); if(!session)throw new UnauthorizedException(); const membership=await prisma.membership.findFirst({where:{userId:session.user.id,status:'ACTIVE',organization:{status:'ACTIVE'},role:{is:{status:'ACTIVE'}}},include:{role:{include:{permissions:{include:{permission:true}}}}}}); if(!membership?.role || membership.role.organizationId !== membership.organizationId || !membership.role.permissions.some(({permission})=>required.includes(permission.key)))throw new ForbiddenException(); request.identity={session,membership,permissions:membership.role.permissions.map(({permission})=>permission.key)}; return true; } }
