import { ReferenceService } from '../reference.service';

describe('ReferenceService', () => {
  let service: ReferenceService;

  beforeEach(() => {
    service = new ReferenceService();
  });

  it('generate("TOUR") returns ISY-TOUR-<12char uppercase hex>', () => {
    const ref = service.generate('TOUR');
    expect(ref).toMatch(/^ISY-TOUR-[A-F0-9]{12}$/);
  });

  it('generate respects FUND and ORD prefixes', () => {
    const fund = service.generate('FUND');
    const ord = service.generate('ORD');
    expect(fund).toMatch(/^ISY-FUND-[A-F0-9]{12}$/);
    expect(ord).toMatch(/^ISY-ORD-[A-F0-9]{12}$/);
  });

  it('generateEscrow returns ISY-ESC-<8char uppercase hex>', () => {
    const ref = service.generateEscrow();
    expect(ref).toMatch(/^ISY-ESC-[A-F0-9]{8}$/);
  });

  it('two consecutive calls yield distinct references (uniqueness smoke)', () => {
    const a = service.generate('TKT');
    const b = service.generate('TKT');
    expect(a).not.toBe(b);
  });
});
