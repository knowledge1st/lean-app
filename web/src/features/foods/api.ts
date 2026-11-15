import { useMutation, useQuery } from '@tanstack/react-query';
import type { Food, FoodSearchResponse, CreateFood } from '@lean/shared';
import { api } from '../../lib/api';
export const searchFoods = (q: string, signal?: AbortSignal) =>
  api.get<FoodSearchResponse>(
    `/api/foods/search?q=${encodeURIComponent(q)}&limit=20`,
    signal ? { signal } : {},
  );
export const getRecentFoods = (signal?: AbortSignal) =>
  api.get<Food[]>('/api/foods/recent?limit=10', signal ? { signal } : {});
export const getFrequentFoods = (signal?: AbortSignal) =>
  api.get<Food[]>('/api/foods/frequent?limit=10', signal ? { signal } : {});
export const importFood = (barcode: string) => api.post<Food>('/api/foods/import', { barcode });
export const createFood = (body: CreateFood) => api.post<Food>('/api/foods', body);
export const useImportFood = () => useMutation({ mutationFn: importFood });
export const useCreateFood = () => useMutation({ mutationFn: createFood });
export function useFoodSearch(q: string) {
  return useQuery({
    queryKey: ['foods', 'search', q],
    queryFn: ({ signal }) => searchFoods(q, signal),
    enabled: !!q,
  });
}
export function useFoodList(tab: 'recent' | 'frequent', enabled: boolean) {
  return useQuery({
    queryKey: ['foods', tab],
    queryFn: ({ signal }) => (tab === 'recent' ? getRecentFoods(signal) : getFrequentFoods(signal)),
    enabled,
  });
}
