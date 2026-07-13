import {
  buildStayQuery,
  buildMarketplaceQuery,
  buildTourQuery,
  STAY_CATEGORIES,
  MARKETPLACE_CATEGORIES,
  TOUR_CATEGORIES,
} from '../category-config';

describe('category-config query builders', () => {
  it('buildStayQuery sets limit=48 and the types param', () => {
    const category = STAY_CATEGORIES.find((c) => c.id === 'stays')!;
    const query = buildStayQuery(category);

    expect(query).toContain('limit=48');
    expect(query).toContain(`types=${encodeURIComponent(category.types!)}`);
  });

  it('buildMarketplaceQuery sets featured=true for the featured category', () => {
    const category = MARKETPLACE_CATEGORIES.find((c) => c.id === 'featured')!;
    const query = buildMarketplaceQuery(category);

    expect(query).toContain('featured=true');
  });

  it('buildTourQuery sets category=HERITAGE for the heritage category', () => {
    const category = TOUR_CATEGORIES.find((c) => c.id === 'heritage')!;
    const query = buildTourQuery(category);

    expect(query).toContain('category=HERITAGE');
  });
});
