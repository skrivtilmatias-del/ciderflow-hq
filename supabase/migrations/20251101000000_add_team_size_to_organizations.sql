ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS team_size TEXT CHECK (team_size IN ('small', 'medium', 'large')) DEFAULT 'small' NOT NULL;
