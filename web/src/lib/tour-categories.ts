export type TourPackageCategory = 'HERITAGE' | 'CULTURAL' | 'ADIRE' | 'FESTIVAL' | 'FOOD' | 'FAMILY' | 'FAITH' | 'SCHOOL' | 'CORPORATE';
export type TourCategoryOption = { id: TourPackageCategory | 'ALL'; label: string };
export const TOUR_CATEGORIES: TourCategoryOption[] = [
  { id: 'ALL', label: 'All Tours' },
  { id: 'HERITAGE', label: 'Heritage' },
  { id: 'CULTURAL', label: 'Cultural' },
  { id: 'ADIRE', label: 'Adire' },
  { id: 'FESTIVAL', label: 'Festival' },
  { id: 'FOOD', label: 'Food & Cuisine' },
  { id: 'FAMILY', label: 'Family' },
  { id: 'FAITH', label: 'Faith' },
  { id: 'SCHOOL', label: 'School' },
  { id: 'CORPORATE', label: 'Corporate' },
];
