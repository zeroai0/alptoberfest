CREATE TABLE IF NOT EXISTS alptoberfest_mga_stats (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  week_of       date        NOT NULL,
  mga_name      text        NOT NULL,
  weekly_alp    numeric     DEFAULT 0,
  weekly_hires  numeric     DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (week_of, mga_name)
);

CREATE INDEX IF NOT EXISTS idx_alptoberfest_mga_stats_week
  ON alptoberfest_mga_stats (week_of);

ALTER TABLE alptoberfest_mga_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON alptoberfest_mga_stats
  FOR ALL TO service_role USING (true) WITH CHECK (true);
