-- Run this in Supabase SQL Editor to create the weekly stats table
-- for ALPtoberfest manual stat entry (Weekly Net, PR Hires, Ref Sales)

CREATE TABLE IF NOT EXISTS alptoberfest_weekly_stats (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  week_of     date        NOT NULL,
  agent_name  text        NOT NULL,
  weekly_net  numeric     DEFAULT 0,
  pr_hires    integer     DEFAULT 0,
  ref_sales   integer     DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (week_of, agent_name)
);

-- Index for fast weekly lookups
CREATE INDEX IF NOT EXISTS idx_alptoberfest_weekly_stats_week
  ON alptoberfest_weekly_stats (week_of);

-- Optional: enable RLS and allow service role full access
ALTER TABLE alptoberfest_weekly_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON alptoberfest_weekly_stats
  FOR ALL TO service_role USING (true) WITH CHECK (true);
