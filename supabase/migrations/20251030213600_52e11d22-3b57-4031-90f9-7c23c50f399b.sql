-- Allow org owners to SELECT their organizations so INSERT ... RETURNING works before membership is created
DROP POLICY IF EXISTS "Owners can view their own organizations" ON public.organizations;

CREATE POLICY "Owners can view their own organizations"
  ON public.organizations
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);