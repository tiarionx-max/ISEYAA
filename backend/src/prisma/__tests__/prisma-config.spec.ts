// Config-presence guard for POOL-01 (Phase 16): production DATABASE_URL must use Neon's
// -pooler endpoint with an explicit connection_limit, not Prisma's silent default pool
// size of 10. No TestingModule/class mock — this is a bare process.env assertion (no
// analog exists elsewhere in this codebase; see 16-PATTERNS.md's "No Analog Found" entry).
describe('DATABASE_URL pooled-connection config presence', () => {
  it('uses the Neon -pooler endpoint with an explicit connection_limit outside local dev', () => {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl || databaseUrl.includes('localhost')) {
      // Local docker-compose dev has no pooler — nothing to assert.
      return;
    }

    expect(databaseUrl).toContain('-pooler');
    expect(databaseUrl).toMatch(/connection_limit=\d+/);
  });
});
