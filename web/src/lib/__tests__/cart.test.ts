import { useCartStore } from '../cart';

describe('useCartStore', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [] });
  });

  it('adds distinct items and totals count/price correctly', () => {
    useCartStore.getState().addItem({ id: 'p1', name: 'Adire Fabric', price: 5000 });
    useCartStore.getState().addItem({ id: 'p2', name: 'Beaded Necklace', price: 2000 });

    const { items, totalCount, totalPrice } = useCartStore.getState();
    expect(items).toHaveLength(2);
    expect(totalCount()).toBe(2);
    expect(totalPrice()).toBe(7000);
  });

  it('increments quantity instead of duplicating a row on repeat add', () => {
    useCartStore.getState().addItem({ id: 'p1', name: 'Adire Fabric', price: 5000 });
    useCartStore.getState().addItem({ id: 'p1', name: 'Adire Fabric', price: 5000 });

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  it('removes an item and resets totals to zero', () => {
    useCartStore.getState().addItem({ id: 'p1', name: 'Adire Fabric', price: 5000 });
    useCartStore.getState().removeItem('p1');

    const { items, totalPrice } = useCartStore.getState();
    expect(items).toHaveLength(0);
    expect(totalPrice()).toBe(0);
  });
});
