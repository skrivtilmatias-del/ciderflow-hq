-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can view members of their organizations" ON public.organization_members;
DROP POLICY IF EXISTS "Users can view organizations they are members of" ON public.organizations;
DROP POLICY IF EXISTS "Users can view batches from their organizations" ON public.batches;
DROP POLICY IF EXISTS "Users can create batches in their organizations" ON public.batches;
DROP POLICY IF EXISTS "Users can update batches in their organizations" ON public.batches;
DROP POLICY IF EXISTS "Users can delete batches in their organizations" ON public.batches;

-- Create a security definer function to check organization membership
CREATE OR REPLACE FUNCTION public.is_organization_member(org_id uuid, user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = org_id
    AND organization_members.user_id = user_id
  )
$$;

-- Recreate policies using the security definer function
-- RLS Policies for organizations
CREATE POLICY "Users can view organizations they are members of"
  ON public.organizations FOR SELECT
  USING (public.is_organization_member(id, auth.uid()));

-- RLS Policies for organization_members
CREATE POLICY "Users can view members of their organizations"
  ON public.organization_members FOR SELECT
  USING (public.is_organization_member(organization_id, auth.uid()));

-- RLS Policies for batches
CREATE POLICY "Users can view batches from their organizations"
  ON public.batches FOR SELECT
  USING (public.is_organization_member(organization_id, auth.uid()));

CREATE POLICY "Users can create batches in their organizations"
  ON public.batches FOR INSERT
  WITH CHECK (
    public.is_organization_member(organization_id, auth.uid())
    AND auth.uid() = created_by
  );

CREATE POLICY "Users can update batches in their organizations"
  ON public.batches FOR UPDATE
  USING (public.is_organization_member(organization_id, auth.uid()));

CREATE POLICY "Users can delete batches in their organizations"
  ON public.batches FOR DELETE
  USING (public.is_organization_member(organization_id, auth.uid()));