export type PermissionContext = { permissions: string[] };
export const hasPermission = (context: PermissionContext | undefined, key: string) => Boolean(context?.permissions.includes(key));
