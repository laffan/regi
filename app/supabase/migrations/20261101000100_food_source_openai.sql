-- OpenAI joins USDA FoodData Central and Open Food Facts as a way to price a
-- food. It is an estimate, not a database lookup, and is recorded as its own
-- source so every calorie figure keeps saying where it came from.
--
-- Its own file: a new enum value cannot be used in the transaction that adds it.

alter type public.food_source add value if not exists 'openai';
