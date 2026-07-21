import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { validate } from 'class-validator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { MinistryExportSubscriptionController } from '../ministry-export-subscription.controller';
import { MinistryExportSubscriptionService } from '../ministry-export-subscription.service';
import { CreateExportSubscriptionDto } from '../dto/create-export-subscription.dto';

/**
 * 22-02 T-22-03 — SUPER_ADMIN-only role gating, stricter than the read-only
 * MinistryController's role set (D-10). MINISTRY_VIEWER/STATE_ADMIN, both
 * allowed on the dashboard, are explicitly denied here.
 */

const DENIED_ROLES = [
  UserRole.CITIZEN,
  UserRole.TOURIST,
  UserRole.VENDOR,
  UserRole.ORGANISER,
  UserRole.HOST,
  UserRole.DRIVER,
  UserRole.CREATIVE,
  UserRole.TOUR_GUIDE,
  UserRole.LGA_ADMIN,
  UserRole.STATE_ADMIN,
  UserRole.MINISTRY_VIEWER,
];

function createContext(userRole: string | null): { guard: RolesGuard; ctx: ExecutionContext } {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  const ctx = {
    getHandler: () => MinistryExportSubscriptionController.prototype.list,
    getClass: () => MinistryExportSubscriptionController,
    switchToHttp: () => ({
      getRequest: () => ({ user: userRole ? { role: userRole } : null }),
    }),
  } as unknown as ExecutionContext;

  return { guard, ctx };
}

describe('MinistryExportSubscriptionController RBAC', () => {
  it('carries the class-level @Roles metadata with exactly SUPER_ADMIN', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, MinistryExportSubscriptionController);
    expect(roles).toEqual([UserRole.SUPER_ADMIN]);
  });

  it('allows access for SUPER_ADMIN', () => {
    const { guard, ctx } = createContext(UserRole.SUPER_ADMIN);
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
});

describe('CreateExportSubscriptionDto validation', () => {
  it('rejects a malformed email in recipients', async () => {
    const dto = Object.assign(new CreateExportSubscriptionDto(), {
      recipients: ['not-an-email'],
      cadence: 'WEEKLY',
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'recipients')).toBe(true);
  });

  it('accepts a well-formed dto', async () => {
    const dto = Object.assign(new CreateExportSubscriptionDto(), {
      recipients: ['ok@example.com'],
      cadence: 'WEEKLY',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});

describe('MinistryExportSubscriptionController route delegation', () => {
  function buildController() {
    const service = {
      list: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({}),
    } as unknown as MinistryExportSubscriptionService;

    const controller = new MinistryExportSubscriptionController(service);
    return { controller, service };
  }

  it('list() delegates to service.list()', async () => {
    const { controller, service } = buildController();
    await controller.list();
    expect(service.list).toHaveBeenCalledWith();
  });

  it('create(dto) delegates to service.create(dto)', async () => {
    const { controller, service } = buildController();
    const dto = { recipients: ['a@b.com'], cadence: 'WEEKLY' } as any;
    await controller.create(dto);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('update(id, dto) delegates to service.update(id, dto)', async () => {
    const { controller, service } = buildController();
    const dto = { cadence: 'MONTHLY' } as any;
    await controller.update('sub-1', dto);
    expect(service.update).toHaveBeenCalledWith('sub-1', dto);
  });

  it('remove(id) delegates to service.remove(id)', async () => {
    const { controller, service } = buildController();
    await controller.remove('sub-1');
    expect(service.remove).toHaveBeenCalledWith('sub-1');
  });
});
