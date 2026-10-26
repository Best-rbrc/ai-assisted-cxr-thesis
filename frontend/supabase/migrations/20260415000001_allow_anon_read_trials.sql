-- Allow anon (public) users to read all study_trials and study_block_surveys.
-- This is needed for the admin panel to fetch and join all trial/survey data
-- across sessions. The admin panel is protected by a client-side password gate.

create policy "anon can read all study_trials"
  on study_trials for select
  to anon
  using (true);

create policy "anon can read all study_block_surveys"
  on study_block_surveys for select
  to anon
  using (true);
