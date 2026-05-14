import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { UserRole } from '../enums/user-role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

const createContext = (userRole: string | null, requiredRoles: UserRole[] | null) => {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredRoles as any);
  const guard = new RolesGuard(reflector);

  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: userRole ? { role: userRole } : null }),
    }),
  } as unknown as ExecutionContext;

  return { guard, ctx };
};

describe('RolesGuard', () => {
  it('allows access when no roles are required', () => {
    const { guard, ctx } = createContext(null, null);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows access when user has required role', () => {
    const { guard, ctx } = createContext('SUPER_ADMIN', [UserRole.SUPER_ADMIN]);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies access when user does not have required role', () => {
    const { guard, ctx } = createContext('CITIZEN', [UserRole.SUPER_ADMIN]);
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('allows access when user has one of multiple required roles', () => {
    const { guard, ctx } = createContext('LGA_ADMIN', [UserRole.STATE_ADMIN, UserRole.LGA_ADMIN]);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies access when user is null', () => {
    const { guard, ctx } = createContext(null, [UserRole.CITIZEN]);
    expect(guard.canActivate(ctx)).toBe(false);
  });
});
