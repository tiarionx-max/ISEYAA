import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { MinistryController } from '../ministry.controller';
import { MinistryService } from '../ministry.service';
import { CsvExportService } from '../../../common/services/csv-export.service';
import { MinistryPdfService } from '../../../common/services/ministry-pdf.service';

/**
 * 14-03 — MinistryController RBAC spec.
 *
 * Uses the real (non-mocked) RolesGuard + Reflector, mirroring
 * `roles.guard.spec.ts`'s existing test shape, to prove — with an
 * automated test, not manual review (MIN-01) — that the class-level
 * @Roles(MINISTRY_VIEWER, STATE_ADMIN, SUPER_ADMIN) metadata on
 * MinistryController denies every other role.
 *
 * 14-07 extends this spec with: (1) proof that the 6 new export routes
 * inherit the same class-level guard (no route-level @Roles() override),
 * and (2) a controller-level test proving revenue/export's CSV and PDF
 * paths both carry all 3 of getRevenueToGovernment()'s dimensions.
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

function createContext(
  userRole: string | null,
  handler: (...args: any[]) => any = MinistryController.prototype.getVisitorEntries,
): { guard: RolesGuard; ctx: ExecutionContext } {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  const ctx = {
    getHandler: () => handler,
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

  // 14-07 T-14-13: export routes carry no route-level @Roles() override —
  // getAllAndOverride() falls through to the class-level metadata for them,
  // same as the read routes, and the guard behaves identically.
  it.each([
    'exportVisitorEntries' as const,
    'exportPurposeBreakdown' as const,
    'exportRevenue' as const,
  ])('export route %s has no method-level @Roles() override and inherits the class guard', (handlerName) => {
    const methodRoles = Reflect.getMetadata(ROLES_KEY, (MinistryController.prototype as any)[handlerName]);
    expect(methodRoles).toBeUndefined();

    const { guard: allowGuard, ctx: allowCtx } = createContext(
      UserRole.MINISTRY_VIEWER,
      (MinistryController.prototype as any)[handlerName],
    );
    expect(allowGuard.canActivate(allowCtx)).toBe(true);

    const { guard: denyGuard, ctx: denyCtx } = createContext(
      UserRole.CITIZEN,
      (MinistryController.prototype as any)[handlerName],
    );
    expect(denyGuard.canActivate(denyCtx)).toBe(false);
  });
});

describe('MinistryController export routes', () => {
  function buildController() {
    const ministryService = {
      getVisitorEntriesByLgaAndMonth: jest.fn().mockResolvedValue([]),
      getPurposeBreakdown: jest.fn().mockResolvedValue([]),
      getRevenueToGovernment: jest.fn().mockResolvedValue({
        byModule: [{ module: 'stays', total: 500000 }],
        byMonth: [{ month: '2026-01', total: 500000 }],
        byModuleLga: [{ module: 'stays', lgaId: 'lga-1', lgaName: 'Abeokuta North', total: 500000 }],
      }),
    } as unknown as MinistryService;

    const csvExportService = {
      toCsv: jest.fn().mockResolvedValue('csv-output'),
    } as unknown as CsvExportService;

    const ministryPdfService = {
      renderPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-fake')),
    } as unknown as MinistryPdfService;

    const controller = new MinistryController(ministryService, csvExportService, ministryPdfService);

    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    return { controller, ministryService, csvExportService, ministryPdfService, res };
  }

  it("revenue/export's CSV row set includes rows from all 3 of byModule/byMonth/byModuleLga", async () => {
    const { controller, csvExportService, res } = buildController();

    await controller.exportRevenue({ format: 'csv' } as any, res);

    expect(csvExportService.toCsv).toHaveBeenCalledTimes(1);
    const [rows] = (csvExportService.toCsv as jest.Mock).mock.calls[0];
    const breakdowns = rows.map((r: any) => r.breakdown);
    expect(breakdowns).toEqual(expect.arrayContaining(['By Module', 'By Month', 'By LGA']));
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
  });

  it("revenue/export's PDF calls renderPdf() with exactly 3 sections (one per dimension)", async () => {
    const { controller, ministryPdfService, res } = buildController();

    await controller.exportRevenue({ format: 'pdf' } as any, res);

    expect(ministryPdfService.renderPdf).toHaveBeenCalledTimes(1);
    const [input] = (ministryPdfService.renderPdf as jest.Mock).mock.calls[0];
    expect(input.sections).toHaveLength(3);
    expect(input.sections.map((s: any) => s.heading)).toEqual([
      'By Module',
      'By Month',
      'By LGA (Stays / Marketplace / Tour)',
    ]);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
  });

  it('visitor-entries/export calls the same service method as the read route with the same filter args', async () => {
    const { controller, ministryService, res } = buildController();

    await controller.exportVisitorEntries({ from: '2026-01-01', to: '2026-12-31', lgaId: 'lga-1', format: 'csv' } as any, res);

    expect(ministryService.getVisitorEntriesByLgaAndMonth).toHaveBeenCalledWith('2026-01-01', '2026-12-31', 'lga-1');
  });
});
