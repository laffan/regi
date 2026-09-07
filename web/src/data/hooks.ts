// React Query wrappers. Anything that writes an entry invalidates the same set
// of keys, because a single log can move the week strip, the calendar and any
// widget subscribed to the series it publishes.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import type { Book, MealItem, ModuleSlug } from '@/lib/types';

export const keys = {
  profile: ['profile'] as const,
  modules: ['modules'] as const,
  totals: (from: string, to: string) => ['totals', from, to] as const,
  entries: (from: string, to: string) => ['entries', from, to] as const,
  series: (name: string, from: string, to: string) => ['series', name, from, to] as const,
  books: ['books'] as const,
  savedMeals: ['saved-meals'] as const,
  goals: ['goals'] as const,
  draft: ['draft'] as const,
  connections: ['connections'] as const,
};

const LOG_TOUCHED = ['totals', 'entries', 'series', 'books', 'goals', 'draft', 'saved-meals'];

export function useInvalidateAfterLog() {
  const qc = useQueryClient();
  return () => {
    for (const key of LOG_TOUCHED) qc.invalidateQueries({ queryKey: [key] });
  };
}

// ── reads ───────────────────────────────────────────────────────────────────

export const useProfile = () => useQuery({ queryKey: keys.profile, queryFn: api.getProfile });

export const useModules = () => useQuery({ queryKey: keys.modules, queryFn: api.getModules });

export const useDailyTotals = (from: string, to: string) =>
  useQuery({ queryKey: keys.totals(from, to), queryFn: () => api.getDailyTotals(from, to) });

export const useEntries = (from: string, to: string) =>
  useQuery({ queryKey: keys.entries(from, to), queryFn: () => api.getEntries(from, to) });

export const useSeries = (name: string, from: string, to: string, enabled = true) =>
  useQuery({ queryKey: keys.series(name, from, to), queryFn: () => api.getSeries(name, from, to), enabled });

export const useBooks = () => useQuery({ queryKey: keys.books, queryFn: api.getBooks });

export const useSavedMeals = () => useQuery({ queryKey: keys.savedMeals, queryFn: api.getSavedMeals });

export const useGoals = () => useQuery({ queryKey: keys.goals, queryFn: api.getGoals });

export const usePendingDraft = () => useQuery({ queryKey: keys.draft, queryFn: api.getPendingDraft });

export const useConnections = () => useQuery({ queryKey: keys.connections, queryFn: api.getConnections });

// ── writes ──────────────────────────────────────────────────────────────────

export function useLogWeight() {
  const done = useInvalidateAfterLog();
  return useMutation({
    mutationFn: ({ value, unit }: { value: number; unit: 'lb' | 'kg' }) => api.logWeight(value, unit),
    onSuccess: done,
  });
}

export function useLogPages() {
  const done = useInvalidateAfterLog();
  return useMutation({
    mutationFn: ({ pages, book, note }: { pages: number; book: Book | null; note?: string }) =>
      api.logPages(pages, book, note),
    onSuccess: done,
  });
}

export function useLogRun() {
  const done = useInvalidateAfterLog();
  return useMutation({
    mutationFn: ({ miles, unit, seconds }: { miles: number; unit: 'mi' | 'km'; seconds: number | null }) =>
      api.logRun(miles, unit, seconds),
    onSuccess: done,
  });
}

export function useLogWords() {
  const done = useInvalidateAfterLog();
  return useMutation({ mutationFn: (words: number) => api.logWords(words), onSuccess: done });
}

export function useLogSleep() {
  const done = useInvalidateAfterLog();
  return useMutation({ mutationFn: (hours: number) => api.logSleep(hours), onSuccess: done });
}

export function useLogMeal() {
  const done = useInvalidateAfterLog();
  return useMutation({
    mutationFn: ({ label, items }: { label: string; items: MealItem[] }) => api.logMeal(label, items),
    onSuccess: done,
  });
}

export function useLogSavedMeal() {
  const done = useInvalidateAfterLog();
  return useMutation({ mutationFn: (id: string) => api.logSavedMeal(id), onSuccess: done });
}

export function useSaveMealFromEntry() {
  const done = useInvalidateAfterLog();
  return useMutation({
    mutationFn: ({ entryId, name }: { entryId: string; name: string }) =>
      api.saveMealFromEntry(entryId, name),
    onSuccess: done,
  });
}

export function useDeleteEntry() {
  const done = useInvalidateAfterLog();
  return useMutation({ mutationFn: (id: string) => api.deleteEntry(id), onSuccess: done });
}

export function useParseLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api.parseLog(text),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.draft }),
  });
}

export function useApproveDraft() {
  const done = useInvalidateAfterLog();
  return useMutation({ mutationFn: (draftId: string) => api.approveDraft(draftId), onSuccess: done });
}

export function useDiscardDraft() {
  const done = useInvalidateAfterLog();
  return useMutation({ mutationFn: (draftId: string) => api.discardDraft(draftId), onSuccess: done });
}

export function useUpdateDraftRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateDraftRow>[1] }) =>
      api.updateDraftRow(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.draft }),
  });
}

export function useDeleteDraftRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteDraftRow(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.draft }),
  });
}

export function useSetModuleActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, active }: { slug: ModuleSlug; active: boolean }) =>
      api.setModuleActive(slug, active),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.modules });
      qc.invalidateQueries({ queryKey: ['totals'] });
    },
  });
}

export function useSetModuleSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, settings }: { slug: ModuleSlug; settings: Record<string, unknown> }) =>
      api.setModuleSettings(slug, settings),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.modules }),
  });
}

export function useAddBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (book: Partial<Book>) => api.addBook(book),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.books }),
  });
}

export function useAddGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.addGoal,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.goals }),
  });
}

// ── sharing ─────────────────────────────────────────────────────────────────

function useConnectionMutation<T>(fn: (input: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.connections }),
  });
}

export const useRequestConnection = () => useConnectionMutation((email: string) => api.requestConnection(email));

export const useRespondToConnection = () =>
  useConnectionMutation(({ id, accept }: { id: string; accept: boolean }) =>
    api.respondToConnection(id, accept),
  );

export const useSetModuleShare = () =>
  useConnectionMutation(({ id, slug, granted }: { id: string; slug: ModuleSlug; granted: boolean }) =>
    api.setModuleShare(id, slug, granted),
  );

export const useRemoveConnection = () => useConnectionMutation((id: string) => api.removeConnection(id));
