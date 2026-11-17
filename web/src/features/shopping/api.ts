import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { isoWeekSchema, shoppingItemSchema, type ShoppingItem } from '@lean/shared';
import { useAuth } from '../../auth/AuthProvider';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { getToken } from '../../lib/session';

export const shoppingKey = (week: string) => ['shopping', week] as const;
const storageKey = 'lean.shopping.v1';
type SavedWeek = { items: ShoppingItem[]; savedAt: number };
type Saved = { userId: string; weeks: Record<string, SavedWeek> };
function readSaved(userId: string): Saved | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (
      !value ||
      typeof value !== 'object' ||
      !('userId' in value) ||
      value.userId !== userId ||
      !('weeks' in value) ||
      !value.weeks ||
      typeof value.weeks !== 'object' ||
      Array.isArray(value.weeks)
    )
      return;
    const weeks: Record<string, SavedWeek> = {};
    for (const [week, entry] of Object.entries(value.weeks)) {
      if (
        !isoWeekSchema.safeParse(week).success ||
        !entry ||
        typeof entry !== 'object' ||
        !('items' in entry) ||
        !('savedAt' in entry) ||
        typeof entry.savedAt !== 'number' ||
        !Number.isFinite(entry.savedAt) ||
        entry.savedAt < 0
      )
        return;
      if (!Array.isArray(entry.items)) return;
      // Temporary rows use the same schema, with their UUID prefixed while saving.
      const parsed = shoppingItemSchema.array().safeParse(
        entry.items.map((item: unknown) => {
          if (
            item &&
            typeof item === 'object' &&
            'id' in item &&
            typeof item.id === 'string' &&
            item.id.startsWith('temp-')
          )
            return { ...item, id: item.id.slice(5) };
          return item;
        }),
      );
      if (!parsed.success) return;
      weeks[week] = {
        items: parsed.data.map((item, index) => {
          const original = (entry.items as { id: string }[])[index]!;
          return { ...item, id: original.id };
        }),
        savedAt: entry.savedAt,
      };
    }
    return { userId, weeks };
  } catch {
    return;
  }
}
function persist(userId: string, week: string, items: ShoppingItem[], savedAt: number) {
  try {
    const weeks = { ...readSaved(userId)?.weeks, [week]: { items, savedAt } };
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        userId,
        weeks: Object.fromEntries(
          Object.entries(weeks)
            .sort((a, b) => b[1].savedAt - a[1].savedAt)
            .slice(0, 4),
        ),
      }),
    );
  } catch {
    /* Storage is optional. */
  }
}
export const getShoppingList = (week: string, signal?: AbortSignal) =>
  api.get<ShoppingItem[]>(`/api/shopping?week=${week}`, signal ? { signal } : {});
export type ItemChanges = { checked?: boolean; label?: string; quantity?: number | null };
export const createShoppingItem = (week: string, label: string, quantity?: number) =>
  api.post<ShoppingItem>('/api/shopping', {
    week,
    label,
    ...(quantity === undefined ? {} : { quantity }),
  });
export const updateShoppingItem = (id: string, changes: ItemChanges) =>
  api.patch<ShoppingItem>(`/api/shopping/${id}`, changes);
export const deleteShoppingItem = (id: string) => api.delete<void>(`/api/shopping/${id}`);
export const deleteChecked = (week: string) =>
  api.delete<void>(`/api/shopping/checked?week=${week}`);
export const generateShopping = (week: string) =>
  api.post<ShoppingItem[]>('/api/shopping/generate', { week });
export function formatQuantity(grams: number | null): string {
  if (grams === null) return '';
  return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: grams < 1000 ? 1 : 2 }).format(grams < 1000 ? grams : grams / 1000)} ${grams < 1000 ? 'g' : 'kg'}`;
}
export function validateItem(label: string, quantity: string): string | null {
  if (!label.trim() || label.trim().length > 120) return 'Ingresá un nombre de 1 a 120 caracteres.';
  if (
    quantity.trim() &&
    (!/^\d+(?:[.,]\d)?$/.test(quantity.trim()) ||
      Number(quantity.replace(',', '.')) <= 0 ||
      Number(quantity.replace(',', '.')) > 100000)
  )
    return 'Ingresá una cantidad mayor a 0 y hasta 100000 g, con hasta un decimal.';
  return null;
}
type Action =
  | { kind: 'add'; item: ShoppingItem }
  | { kind: 'toggle' | 'edit'; id: string; changes: ItemChanges }
  | { kind: 'delete'; id: string };
type Pending = { action: Action };
type WeekState = { base: ShoppingItem[]; pending: Pending[] };
type Session = {
  token: string | null;
  weeks: Map<string, WeekState>;
  requests: Map<string, Promise<ShoppingItem | void>>;
};
const sessions = new WeakMap<QueryClient, Session>();
function sessionFor(client: QueryClient): Session {
  let session = sessions.get(client);
  if (!session || session.token !== getToken()) {
    session = { token: getToken(), weeks: new Map(), requests: new Map() };
    sessions.set(client, session);
  }
  return session;
}
function apply(items: ShoppingItem[], action: Action): ShoppingItem[] {
  if (action.kind === 'add') return [...items, action.item];
  if (action.kind === 'delete') return items.filter((item) => item.id !== action.id);
  return items.map((item) =>
    item.id === action.id
      ? {
          ...item,
          ...action.changes,
          totalGrams:
            action.changes.quantity === undefined ? item.totalGrams : action.changes.quantity,
        }
      : item,
  );
}
function publish(client: QueryClient, week: string, state: WeekState, userId: string | undefined) {
  client.setQueryData(
    shoppingKey(week),
    state.pending.reduce((items, pending) => apply(items, pending.action), state.base),
  );
  if (userId)
    persist(userId, week, client.getQueryData<ShoppingItem[]>(shoppingKey(week))!, Date.now());
}
export function useShoppingList(week: string) {
  const client = useQueryClient();
  const { user } = useAuth();
  const saved = user ? readSaved(user.id)?.weeks[week] : undefined;
  useEffect(() => {
    if (!user) return;
    const token = getToken();
    const save = (savedWeek: string) => {
      if (getToken() !== token) return;
      const query = client.getQueryState<ShoppingItem[]>(shoppingKey(savedWeek));
      if (query?.data) persist(user.id, savedWeek, query.data, query.dataUpdatedAt);
    };
    save(week);
    return client.getQueryCache().subscribe((event) => {
      if (
        event.type === 'updated' &&
        event.action.type === 'success' &&
        event.query.queryKey[0] === 'shopping' &&
        typeof event.query.queryKey[1] === 'string'
      )
        save(event.query.queryKey[1] as string);
    });
  }, [client, user, week]);
  return useQuery({
    queryKey: shoppingKey(week),
    ...(saved ? { initialData: saved.items, initialDataUpdatedAt: saved.savedAt } : {}),
    queryFn: async ({ signal }) => {
      const current = () => client.getQueryData<ShoppingItem[]>(shoppingKey(week));
      const pending = () =>
        sessionFor(client).weeks.size > 0 ||
        client.isMutating({ mutationKey: ['shopping', 'bulk'] }) > 0;
      if (pending() && current()) return current()!;
      const items = await getShoppingList(week, signal);
      return pending() && current() ? current()! : items;
    },
  });
}
export function waitForShoppingIdle(client: QueryClient): Promise<void> {
  if (!client.isMutating({ mutationKey: ['shopping'] })) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = client.getMutationCache().subscribe(() => {
      if (!client.isMutating({ mutationKey: ['shopping'] })) {
        stop();
        resolve();
      }
    });
  });
}
export function useShoppingMutation(week: string, kind: Action['kind']) {
  const { user } = useAuth();
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationKey: ['shopping', kind],
    networkMode: 'always',
    mutationFn: async (action: Action) => {
      if (action.kind === 'add')
        return createShoppingItem(week, action.item.label, action.item.totalGrams ?? undefined);
      const session = sessionFor(client);
      const request = (session.requests.get(action.id) ?? Promise.resolve())
        .catch(() => {})
        .then<ShoppingItem | void>(() =>
          action.kind === 'delete'
            ? deleteShoppingItem(action.id)
            : updateShoppingItem(action.id, action.changes),
        );
      session.requests.set(action.id, request);
      try {
        return await request;
      } finally {
        if (session.requests.get(action.id) === request) session.requests.delete(action.id);
      }
    },
    onMutate: async (action) => {
      const session = sessionFor(client);
      const cancellation = client.cancelQueries({ queryKey: shoppingKey(week) });
      let state = session.weeks.get(week);
      if (!state) {
        state = { base: client.getQueryData<ShoppingItem[]>(shoppingKey(week)) ?? [], pending: [] };
        session.weeks.set(week, state);
      }
      const pending = { action };
      state.pending.push(pending);
      publish(client, week, state, user?.id);
      await cancellation;
      return { session, state, pending };
    },
    onSuccess: (item, action, context) => {
      if (sessionFor(client) !== context.session) return;
      const state = context.state;
      if (action.kind === 'delete') state.base = apply(state.base, action);
      else if (item)
        state.base =
          action.kind === 'add'
            ? [...state.base, item]
            : state.base.map((old) => (old.id === item.id ? item : old));
    },
    onError: (error, _action, context) => {
      if (context && sessionFor(client) === context.session)
        toast(
          kind === 'toggle'
            ? 'No se pudo marcar. Revisá tu conexión.'
            : `No se pudo guardar. ${error.message}`,
        );
    },
    onSettled: async (_item, _error, _action, context) => {
      if (!context || sessionFor(client) !== context.session) return;
      context.state.pending = context.state.pending.filter(
        (pending) => pending !== context.pending,
      );
      publish(client, week, context.state, user?.id);
      if (!context.state.pending.length) context.session.weeks.delete(week);
      if (client.isMutating({ mutationKey: ['shopping'] }) === 1)
        await client.invalidateQueries({ queryKey: ['shopping'] });
    },
  });
}
export function useShoppingBulk(week: string) {
  const { user } = useAuth();
  const client = useQueryClient();
  const toast = useToast();
  const mutation = useMutation({
    mutationKey: ['shopping', 'bulk'],
    networkMode: 'always',
    mutationFn: async (kind: 'generate' | 'clear') => {
      await client.cancelQueries({ queryKey: shoppingKey(week) });
      if (kind === 'generate') return generateShopping(week);
      await deleteChecked(week);
      return (client.getQueryData<ShoppingItem[]>(shoppingKey(week)) ?? []).filter(
        (item) => !item.checked,
      );
    },
    onMutate: () => ({ session: sessionFor(client) }),
    onSuccess: (items, kind, context) => {
      if (sessionFor(client) !== context.session) return;
      client.setQueryData(shoppingKey(week), items);
      if (user) persist(user.id, week, items, Date.now());
      if (kind === 'generate') toast('Lista actualizada');
    },
    onError: (error) => toast(`No se pudo actualizar la lista. ${error.message}`),
  });
  return {
    ...mutation,
    run: async (kind: 'generate' | 'clear') => {
      const session = sessionFor(client);
      while (client.isMutating({ mutationKey: ['shopping'] })) await waitForShoppingIdle(client);
      if (sessionFor(client) !== session) throw new Error('La sesión cambió.');
      return mutation.mutateAsync(kind);
    },
  };
}
