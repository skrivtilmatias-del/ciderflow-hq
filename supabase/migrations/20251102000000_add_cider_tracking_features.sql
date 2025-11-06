-- Create tables for comprehensive cider production tracking
CREATE TABLE IF NOT EXISTS public.fermentation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  recorded_at DATE NOT NULL DEFAULT CURRENT_DATE,
  temperature NUMERIC(5,2),
  specific_gravity NUMERIC(6,3),
  ph NUMERIC(4,2),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tasting_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  recorded_at DATE NOT NULL DEFAULT CURRENT_DATE,
  sweetness INTEGER CHECK (sweetness BETWEEN 1 AND 5),
  acidity INTEGER CHECK (acidity BETWEEN 1 AND 5),
  body INTEGER CHECK (body BETWEEN 1 AND 5),
  aroma TEXT,
  flavor TEXT,
  finish TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.packaging_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  target_date DATE NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('bottle', 'can', 'keg', 'bag-in-box', 'growler', 'other')),
  quantity INTEGER CHECK (quantity >= 0),
  notes TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes to speed up lookups
CREATE INDEX IF NOT EXISTS idx_fermentation_logs_batch_id ON public.fermentation_logs(batch_id);
CREATE INDEX IF NOT EXISTS idx_tasting_notes_batch_id ON public.tasting_notes(batch_id);
CREATE INDEX IF NOT EXISTS idx_packaging_schedules_batch_id ON public.packaging_schedules(batch_id);
CREATE INDEX IF NOT EXISTS idx_packaging_schedules_target_date ON public.packaging_schedules(target_date);

-- Enable RLS
ALTER TABLE public.fermentation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasting_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packaging_schedules ENABLE ROW LEVEL SECURITY;

-- Policies for fermentation logs
CREATE POLICY IF NOT EXISTS "Members can view fermentation logs"
  ON public.fermentation_logs FOR SELECT
  USING (
    public.is_organization_member(
      (SELECT organization_id FROM public.batches WHERE batches.id = fermentation_logs.batch_id),
      auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "Members can insert fermentation logs"
  ON public.fermentation_logs FOR INSERT
  WITH CHECK (
    public.is_organization_member(
      (SELECT organization_id FROM public.batches WHERE batches.id = fermentation_logs.batch_id),
      auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "Members can update fermentation logs"
  ON public.fermentation_logs FOR UPDATE
  USING (
    public.is_organization_member(
      (SELECT organization_id FROM public.batches WHERE batches.id = fermentation_logs.batch_id),
      auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "Members can delete fermentation logs"
  ON public.fermentation_logs FOR DELETE
  USING (
    public.is_organization_member(
      (SELECT organization_id FROM public.batches WHERE batches.id = fermentation_logs.batch_id),
      auth.uid()
    )
  );

-- Policies for tasting notes
CREATE POLICY IF NOT EXISTS "Members can view tasting notes"
  ON public.tasting_notes FOR SELECT
  USING (
    public.is_organization_member(
      (SELECT organization_id FROM public.batches WHERE batches.id = tasting_notes.batch_id),
      auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "Members can insert tasting notes"
  ON public.tasting_notes FOR INSERT
  WITH CHECK (
    public.is_organization_member(
      (SELECT organization_id FROM public.batches WHERE batches.id = tasting_notes.batch_id),
      auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "Members can update tasting notes"
  ON public.tasting_notes FOR UPDATE
  USING (
    public.is_organization_member(
      (SELECT organization_id FROM public.batches WHERE batches.id = tasting_notes.batch_id),
      auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "Members can delete tasting notes"
  ON public.tasting_notes FOR DELETE
  USING (
    public.is_organization_member(
      (SELECT organization_id FROM public.batches WHERE batches.id = tasting_notes.batch_id),
      auth.uid()
    )
  );

-- Policies for packaging schedules
CREATE POLICY IF NOT EXISTS "Members can view packaging schedules"
  ON public.packaging_schedules FOR SELECT
  USING (
    public.is_organization_member(
      (SELECT organization_id FROM public.batches WHERE batches.id = packaging_schedules.batch_id),
      auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "Members can insert packaging schedules"
  ON public.packaging_schedules FOR INSERT
  WITH CHECK (
    public.is_organization_member(
      (SELECT organization_id FROM public.batches WHERE batches.id = packaging_schedules.batch_id),
      auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "Members can update packaging schedules"
  ON public.packaging_schedules FOR UPDATE
  USING (
    public.is_organization_member(
      (SELECT organization_id FROM public.batches WHERE batches.id = packaging_schedules.batch_id),
      auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "Members can delete packaging schedules"
  ON public.packaging_schedules FOR DELETE
  USING (
    public.is_organization_member(
      (SELECT organization_id FROM public.batches WHERE batches.id = packaging_schedules.batch_id),
      auth.uid()
    )
  );
