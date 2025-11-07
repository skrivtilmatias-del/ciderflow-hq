-- Add team_size column to organizations table
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS team_size text NOT NULL DEFAULT 'small';