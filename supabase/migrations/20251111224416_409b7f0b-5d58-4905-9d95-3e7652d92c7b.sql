-- Add DELETE RLS policy to organizations table
CREATE POLICY "Only owners can delete organizations"
  ON public.organizations FOR DELETE
  USING (auth.uid() = owner_id);