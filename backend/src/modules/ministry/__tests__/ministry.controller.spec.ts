import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { MinistryController } from '../ministry.controller';

/**
 * 14-03 — MinistryController RBAC spec.
 *
 * Uses the real (non-mocked) RolesGuard + Reflector, mirroring
 * `roles.guard.spec.ts`'s existing test shape, to prove — with an
 * automated test, not manual review (MIN-01) — that the class-level
 * @Roles(MINISTRY_VIEWER, STATE_ADMIN, SUPER_ADMIN) metadata on
 * MinistryController denies every other role.
 */

const ALLOWED_ROLES = [UserRole.MINISTRY_VIEWER, UserRole.STATE_ADMIN, UserRole.SUPER_ADMIN];
const DENIED_ROLES = [
  UserRole.CITIZEN,
  UserRole.VENDOR,
  UserRole.TOUR_GUIDE,
  UserRole.TOURIST,
  UserRole.HOST,
  UserRole.DRIVER,
  UserRole.ORGANISER,
  UserRole.CREATIVE,
  UserRole.LGA_ADMIN,
];

function createContext(userRole: string | null): { guard: RolesGuard; ctx: ExecutionContext } {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  const ctx = {
    getHandler: () => MinistryController.prototype.getVisitorEntries,
    getClass: () => MinistryController,
    switchToHttp: () => ({
      getRequest: () => ({ user: userRole ? { role: userRole } : null }),
    }),
  } as unknown as ExecutionContext;

  return { guard, ctx };
}

describe('MinistryController RBAC', () => {
  it('carries the class-level @Roles metadata with exactly the 3 allowed roles', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, MinistryController);
    expect(roles).toEqual(expect.arrayContaining(ALLOWED_ROLES));
    expect(roles).toHaveLength(ALLOWED_ROLES.length);
  });

  it.each(ALLOWED_ROLES)('allows access for %s', (role) => {
    const { guard, ctx } = createContext(role);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it.each(DENIED_ROLES)('denies access for %s', (role) => {
    const { guard, ctx } = createContext(role);
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('denies access for an unauthenticated (null) caller', () => {
    const { guard, ctx } = createContext(null);
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('has zero @Patch/@Post/@Delete handlers on MinistryController', () => {
    const proto = MinistryController.prototype;
    const methodNames = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor');
    // NestJS stores the HTTP method metadata under 'method' (RequestMethod enum);
    // GET === 0. Any handler with a non-GET method metadata would violate MIN-01.
    for (const name of methodNames) {
      const httpMethod = Reflect.getMetadata(METHOD_METADATA, (proto as any)[name]);
      expect(httpMethod).toBe(0); // RequestMethod.GET
    }
  });
});
