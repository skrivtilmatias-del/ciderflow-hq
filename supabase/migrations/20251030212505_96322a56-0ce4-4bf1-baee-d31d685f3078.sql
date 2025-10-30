-- Drop and recreate the INSERT policy for organizations to ensure it's properly permissive
DROP POLICY IF EXISTS "Users can create organizations" ON public.organizations;

-- Recreate as explicitly permissive policy
CREATE POLICY "Users can create organizations"
  ON public.organizations
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);