// React Query wrappers. Anything that writes an entry invalidates the same set
// of keys, because a single log can move the week strip, the calendar and any
// widget subscribed to the series it publishes.

import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import type { Book, MealItem, ModuleSlug, Profile, ShareLevel, WritingMeasure, WritingProject } from '@/lib/types';

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
  writingProjects: ['writing-projects'] as const,
  connections: ['connections'] as const,
  shared: (from: string, to: string) => ['shared', from, to] as const,
  closures: (from: string, to: string) => ['closures', from, to] as const,
};

const LOG_TOUCHED = [
  'totals', 'entries', 'series', 'books', 'goals', 'draft', 'saved-meals', 'writing-projects', 'closures',
];

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

export const useWritingProjects = () =>
  useQuery({ queryKey: keys.writingProjects, queryFn: api.getWritingProjects });

export const usePendingDrafts = () => useQuery({ queryKey: keys.draft, queryFn: api.getPendingDrafts });

export const useConnections = () => useQuery({ queryKey: keys.connections, queryFn: api.getConnections });

export const useSharedTotals = (from: string, to: string, enabled = true) =>
  useQuery({ queryKey: keys.shared(from, to), queryFn: () => api.getSharedTotals(from, to), enabled });

export const useDayClosures = (from: string, to: string) =>
  useQuery({ queryKey: keys.closures(from, to), queryFn: () => api.getDayClosures(from, to) });

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

export function useLogWritingSession() {
  const done = useInvalidateAfterLog();
  return useMutation({
    mutationFn: ({
      project,
      amount,
      measure,
      note,
    }: {
      project: WritingProject | null;
      amount: number;
      measure: WritingMeasure;
      note?: string;
    }) => api.logWritingSession(project, amount, measure, note),
    onSuccess: done,
  });
}

export function useAddWritingProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (project: Partial<WritingProject>) => api.addWritingProject(project),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.writingProjects }),
  });
}

export function useUpdateWritingProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<WritingProject> }) =>
      api.updateWritingProject(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.writingProjects }),
  });
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

export function useUpdateEntry() {
  const done = useInvalidateAfterLog();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: api.EntryPatch }) => api.updateEntry(id, patch),
    onSuccess: done,
  });
}

export function useUpdateMeal() {
  const done = useInvalidateAfterLog();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof api.updateMeal>[1] }) =>
      api.updateMeal(id, input),
    onSuccess: done,
  });
}

export function useSetDayClosed() {
  const done = useInvalidateAfterLog();
  return useMutation({
    mutationFn: ({ slug, date, closed }: { slug: ModuleSlug; date: string; closed: boolean }) =>
      api.setDayClosed(slug, date, closed),
    onSuccess: done,
  });
}

export function useSetActivityDone() {
  const done = useInvalidateAfterLog();
  return useMutation({
    mutationFn: ({ slug, name, date, done: did }: { slug: string; name: string; date: string; done: boolean }) =>
      api.setActivityDone(slug, name, date, did),
    onSuccess: done,
  });
}

function useCatalogMutation<T>(fn: (input: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.modules });
      for (const key of LOG_TOUCHED) qc.invalidateQueries({ queryKey: [key] });
    },
  });
}

export const useCreateActivity = () => useCatalogMutation((input: api.TrackerInput) => api.createActivity(input));
export const useUpdateActivity = () =>
  useCatalogMutation(({ slug, input }: { slug: string; input: api.TrackerInput }) => api.updateActivity(slug, input));
export const useDeleteActivity = () => useCatalogMutation((slug: string) => api.deleteActivity(slug));

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Profile>) => api.updateProfile(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.profile }),
  });
}

export function useDeleteEntry() {
  const done = useInvalidateAfterLog();
  return useMutation({ mutationFn: (id: string) => api.deleteEntry(id), onSuccess: done });
}

const PARSE_KEY = ['parse-log'] as const;

/**
 * Sending a line for parsing. It is fire-and-forget from the caller's side —
 * a widget sends and moves straight to the Log — so the result is picked up
 * from the draft query when it lands, not from this hook's callbacks.
 */
export function useParseLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: PARSE_KEY,
    mutationFn: (text: string) => api.parseLog(text),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.draft }),
  });
}

/** Lines sent and still being read and priced — the review column's placeholders. */
export function useParsing(): { pending: string[]; failed: { text: string; error: string }[] } {
  const pending = useMutationState({
    filters: { mutationKey: PARSE_KEY, status: 'pending' },
    select: (m) => String(m.state.variables ?? ''),
  });
  const failed = useMutationState({
    filters: { mutationKey: PARSE_KEY, status: 'error' },
    select: (m) => ({
      text: String(m.state.variables ?? ''),
      error: (m.state.error as Error | null)?.message ?? 'could not read that line',
      at: m.state.submittedAt,
    }),
  });
  // Only the most recent failures are worth showing.
  const recent = failed.filter((f) => Date.now() - f.at < 5 * 60_000).slice(-2);
  return { pending, failed: recent.map(({ text, error }) => ({ text, error })) };
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

export const useSetShareLevel = () =>
  useConnectionMutation(({ id, slug, level }: { id: string; slug: ModuleSlug; level: ShareLevel }) =>
    api.setShareLevel(id, slug, level),
  );

export const useSetReceive = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, slug, show }: { id: string; slug: ModuleSlug; show: boolean }) => api.setReceive(id, slug, show),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.connections });
      qc.invalidateQueries({ queryKey: ['shared'] });
    },
  });
};

export const useRemoveConnection = () => useConnectionMutation((id: string) => api.removeConnection(id));
