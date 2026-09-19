import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Decorator to attach required roles to a route handler.
 * Usage: @Roles('ADMIN') or @Roles('INVESTIGATOR', 'ADMIN')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
