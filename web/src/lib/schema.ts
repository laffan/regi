// The schema this build of the client was written against. A hosted database
// that has not had `supabase db push` since will answer with an older value —
// or not know the function at all — and the app says so rather than failing
// quietly (approving a draft on an old database drops its macros, for one).

export const EXPECTED_SCHEMA = '20261103000100';

/** Migrations the client relies on, newest last, for the on-screen hint. */
export const REQUIRED_MIGRATIONS = [
  '20261101000100_food_source_openai.sql',
  '20261101000200_feedback_round.sql',
  '20261102000100_time_zone.sql',
  '20261103000100_schema_version.sql',
];
