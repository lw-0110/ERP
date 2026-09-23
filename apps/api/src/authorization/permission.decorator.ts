import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from './permission-catalog.js';
export const PERMISSION_KEY = 'required-permission';
export const RequirePermission = (permission: PermissionKey) => SetMetadata(PERMISSION_KEY, permission);
export const RequireAnyPermission = (...permissions: PermissionKey[]) => SetMetadata(PERMISSION_KEY, permissions);
