import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateEntriesBatch,
  Entry,
  ParseMealPhoto,
  ParseMealText,
  ParseMealTextResponse,
} from '@lean/shared';
import { api } from '../../lib/api';
import { deleteEntry, summaryKey } from '../diary/api';
import { useToast } from '../../components/ui/Toast';

export function useTextLogFeatures() {
  return useQuery({
    queryKey: ['me', 'features'],
    queryFn: async ({ signal }) => {
      const me = await api.get<{
        features?: { textLog: boolean; textLogAi: boolean; photoLog?: boolean };
      }>('/api/me', {
        signal,
      });
      return { textLog: false, textLogAi: false, photoLog: false, ...me.features };
    },
  });
}
export const useParseMealText = () =>
  useMutation({
    mutationFn: ({ body, signal }: { body: ParseMealText; signal: AbortSignal }) =>
      api.post<ParseMealTextResponse>('/api/entries/parse-text', body, {
        signal,
        timeoutMs: 35000,
      }),
  });
export const useParseMealPhoto = () =>
  useMutation({
    mutationFn: ({ body, signal }: { body: ParseMealPhoto; signal: AbortSignal }) =>
      api.post<ParseMealTextResponse>('/api/entries/parse-photo', body, {
        signal,
        timeoutMs: 65000,
      }),
  });
export function useCreateEntriesBatch(date: string, onClose: () => void) {
  const client = useQueryClient();
  const toast = useToast();
  const invalidate = () =>
    Promise.all([
      client.refetchQueries({ queryKey: summaryKey(date) }),
      ...[
        ['progress', 'entries'],
        ['summary', 'week'],
        ['foods', 'recent'],
        ['foods', 'frequent'],
      ].map((queryKey) => client.invalidateQueries({ queryKey })),
    ]);
  return useMutation({
    mutationFn: (body: CreateEntriesBatch) => api.post<Entry[]>('/api/entries/batch', body),
    onSuccess: async (created) => {
      await invalidate();
      onClose();
      toast(
        created.length === 1 ? 'Se cargó 1 alimento' : `Se cargaron ${created.length} alimentos`,
        {
          label: 'Deshacer',
          onAction: () => {
            void Promise.allSettled(created.map((entry) => deleteEntry(entry.id))).then(
              async (results) => {
                await invalidate();
                if (results.some((result) => result.status === 'rejected'))
                  toast('No se pudieron borrar todos los alimentos. Revisá la comida.');
              },
            );
          },
        },
      );
    },
  });
}
