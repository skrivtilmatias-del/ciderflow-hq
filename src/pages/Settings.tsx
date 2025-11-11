import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  ArrowLeft, User as UserIcon, Building2, Shield, Trash2,
  Edit, Mail, Lock, Users, AlertTriangle, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, 
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter, 
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger 
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import type { Tables, TablesUpdate } from '@/integrations/supabase/types';
import { z } from 'zod';

// Zod validation schemas
const nameSchema = z.string().trim().min(1, "Name cannot be empty").max(100, "Name must be less than 100 characters");

const organizationSchema = z.object({
  name: z.string().trim().min(1, "Organization name cannot be empty").max(100, "Organization name must be less than 100 characters"),
});

const passwordSchema = z.object({
  current: z.string().min(6, "Current password must be at least 6 characters"),
  new: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  confirm: z.string(),
}).refine((data) => data.new === data.confirm, {
  message: "Passwords do not match",
  path: ["confirm"],
});

type Organization = Tables<'organizations'>;

type MemberRole = 'owner' | 'admin' | 'member';

type OrganizationMembership = {
  organization_id: string;
  role: MemberRole;
  organizations: Organization;
};

type MemberWithProfile = Tables<'organization_members'> & {
  users?: {
    email?: string;
    user_metadata?: { full_name?: string };
  } | null;
};

export default function Settings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: ''
  });
  const {
    data: user,
    isLoading: userLoading,
    error: userError,
  } = useQuery<User | null>({
    queryKey: ['auth-user'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: membership,
    isLoading: membershipLoading,
    error: membershipError,
  } = useQuery<(OrganizationMembership & { role: MemberRole }) | null>({
    queryKey: ['organization-membership', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('organization_members')
        .select('organization_id, role, organizations(*)')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        ...data,
        role: (data.role as MemberRole) ?? 'member',
        organizations: data.organizations as Organization,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const organization = membership?.organizations ?? null;
  const organizationId = organization?.id ?? null;
  const memberRole = membership?.role;

  const {
    data: membersData,
    isLoading: membersLoading,
    error: membersError,
  } = useQuery<MemberWithProfile[]>({
    queryKey: ['organization-members', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('organization_members')
        .select('*')
        .eq('organization_id', organizationId);

      if (error) throw error;
      return (data as MemberWithProfile[]) ?? [];
    },
    staleTime: 60 * 1000,
  });

  const members = membersData ?? [];
  const isLoading = userLoading || membershipLoading || (Boolean(organizationId) && membersLoading);

  useEffect(() => {
    if (user && !userLoading) {
      setFullName(user.user_metadata?.full_name ?? '');
    }
  }, [user, userLoading]);

  useEffect(() => {
    if (organization) {
      setOrgName(organization.name);
    }
  }, [organization]);

  useEffect(() => {
    const error = userError ?? membershipError ?? membersError;
    if (error) {
      const message = error instanceof Error ? error.message : 'Failed to load settings data';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: message,
      });
    }
  }, [userError, membershipError, membersError, toast]);

  const canDeleteOrganization = memberRole === 'owner' || memberRole === 'admin';
  const teamSizeLabels: Record<string, string> = {
    small: 'Small (just me)',
    medium: 'Medium (2-10 people)',
    large: 'Large (10+ people)',
  };
  const teamSizeLabel = organization
    ? teamSizeLabels[organization.team_size] ?? organization.team_size
    : 'N/A';

  const updateNameMutation = useMutation<string, Error, string>({
    mutationFn: async (name) => {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: name },
      });

      if (error) throw error;
      return name;
    },
    onSuccess: () => {
      toast({
        title: 'Name updated!',
        description: 'Your profile has been updated.',
      });
      queryClient.invalidateQueries({ queryKey: ['auth-user'] });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    },
  });

  const updateOrganizationMutation = useMutation<Organization, Error, { organizationId: string; updates: TablesUpdate<'organizations'> }>({
    mutationFn: async ({ organizationId, updates }) => {
      const { data, error } = await supabase
        .from('organizations')
        .update(updates)
        .eq('id', organizationId)
        .select()
        .single();

      if (error) throw error;
      return data as Organization;
    },
    onSuccess: (data) => {
      toast({
        title: 'Organization updated!',
        description: 'Your organization name has been changed.',
      });

      queryClient.setQueryData<(OrganizationMembership & { role: MemberRole }) | null>(
        ['organization-membership', user?.id],
        (old) => (old ? { ...old, organizations: data } : old)
      );
      queryClient.invalidateQueries({ queryKey: ['organization-members', data.id] });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    },
  });

  const changePasswordMutation = useMutation<void, Error, { currentPassword: string; newPassword: string; email: string }>({
    mutationFn: async ({ currentPassword, newPassword, email }) => {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });

      if (verifyError) {
        throw new Error('Current password is incorrect');
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Password changed!',
        description: 'Your password has been updated.',
      });
      setPasswords({ current: '', new: '', confirm: '' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    },
  });

  const deleteOrganizationMutation = useMutation<void, Error, { organizationId: string }>({
    mutationFn: async ({ organizationId }) => {
      const { error } = await supabase
        .from('organizations')
        .delete()
        .eq('id', organizationId);

      if (error) throw error;
    },
    onSuccess: async () => {
      toast({
        title: 'Organization deleted',
        description: 'Your organization and all data have been removed.',
      });

      setDeleteConfirmation('');
      await supabase.auth.signOut();
      navigate('/');
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    },
    onSettled: () => {
      setDeleteConfirmation('');
    },
  });

  function updateName() {
    // Validate name using Zod
    const validation = nameSchema.safeParse(fullName);
    
    if (!validation.success) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: validation.error.errors[0].message,
      });
      return;
    }

    setFullName(validation.data);
    updateNameMutation.mutate(validation.data);
  }

  function updateOrganization() {
    if (!organizationId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Organization context is missing.',
      });
      return;
    }

    // Validate organization data using Zod
    const validation = organizationSchema.safeParse({
      name: orgName,
    });

    if (!validation.success) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: validation.error.errors[0].message,
      });
      return;
    }

    setOrgName(validation.data.name);
    updateOrganizationMutation.mutate({
      organizationId,
      updates: { name: validation.data.name },
    });
  }

  function changePassword() {
    // Validate password data using Zod
    const validation = passwordSchema.safeParse(passwords);

    if (!validation.success) {
      const firstError = validation.error.errors[0];
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: firstError.message,
      });
      return;
    }

    if (!user?.email) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Unable to determine account email.',
      });
      return;
    }

    changePasswordMutation.mutate({
      currentPassword: validation.data.current,
      newPassword: validation.data.new,
      email: user.email,
    });
  }

  function deleteOrganization() {
    if (deleteConfirmation !== 'DELETE') {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please type DELETE to confirm",
      });
      return;
    }

    if (!organizationId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Organization context is missing.',
      });
      return;
    }

    if (!canDeleteOrganization) {
      toast({
        variant: 'destructive',
        title: 'Insufficient permissions',
        description: 'Only organization owners or admins can delete this organization.',
      });
      return;
    }

    deleteOrganizationMutation.mutate({ organizationId });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center space-y-4">
        <Building2 className="h-10 w-10 text-primary" />
        <h1 className="text-2xl font-semibold">No organization found</h1>
        <p className="text-muted-foreground max-w-sm">
          We couldn't find an organization associated with your account. Create one to manage your cidery settings.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={() => navigate('/onboarding')}>
            Create organization
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate('/');
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/dashboard')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-4xl">
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profile">
              <UserIcon className="h-4 w-4 mr-2" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="organization">
              <Building2 className="h-4 w-4 mr-2" />
              Organization
            </TabsTrigger>
            <TabsTrigger value="security">
              <Shield className="h-4 w-4 mr-2" />
              Security
            </TabsTrigger>
          </TabsList>

          {/* PROFILE TAB */}
          <TabsContent value="profile" className="space-y-6">
            <div className="bg-card rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Personal Information</h3>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <div className="flex gap-2">
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="John Doe"
                    />
                    <Button onClick={updateName} disabled={updateNameMutation.isPending}>
                      {updateNameMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Edit className="h-4 w-4 mr-2" />
                          Update
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Email</Label>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{user?.email}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Contact support to change your email address
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Change Password</h3>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={passwords.current}
                    onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                    placeholder="••••••••"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={passwords.new}
                    onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                    placeholder="••••••••"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={passwords.confirm}
                    onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                    placeholder="••••••••"
                  />
                </div>

                <Button
                  onClick={changePassword}
                  disabled={
                    changePasswordMutation.isPending ||
                    !passwords.current ||
                    !passwords.new ||
                    !passwords.confirm
                  }
                >
                  {changePasswordMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4 mr-2" />
                      Change Password
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ORGANIZATION TAB */}
          <TabsContent value="organization" className="space-y-6">
            <div className="bg-card rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Organization Details</h3>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="orgName">Organization Name</Label>
                  <div className="flex gap-2">
                    <Input
                      id="orgName"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="Acme Cidery"
                    />
                    <Button onClick={updateOrganization} disabled={updateOrganizationMutation.isPending}>
                      {updateOrganizationMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Edit className="h-4 w-4 mr-2" />
                          Update
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Created</Label>
                  <p className="text-sm text-muted-foreground">
                    {organization ? format(new Date(organization.created_at), 'PPP') : 'N/A'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Team Size</Label>
                  <p className="text-sm text-muted-foreground capitalize">{teamSizeLabel}</p>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Team Members</h3>
              
              <div className="space-y-3">
                {members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No team members yet. Invite colleagues to collaborate.
                  </p>
                ) : (
                  members.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">
                            User ID: {member.user_id?.slice(0, 8)}...
                          </p>
                        </div>
                      </div>
                      <span className="text-xs px-2 py-1 bg-background rounded-md capitalize">
                        {member.role}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <Button variant="outline" className="w-full mt-4" onClick={() => {
                toast({ title: "Coming soon!", description: "Team invitations will be available soon." });
              }}>
                <Users className="h-4 w-4 mr-2" />
                Invite Team Member
              </Button>
            </div>
          </TabsContent>

          {/* SECURITY TAB */}
          <TabsContent value="security" className="space-y-6">
            <div className="bg-card rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Account Information</h3>
              
              <div className="space-y-3">
                <div className="flex justify-between py-2">
                  <span className="text-sm text-muted-foreground">Account Created:</span>
                  <span className="text-sm font-medium">
                    {user?.created_at ? format(new Date(user.created_at), 'PPP') : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-sm text-muted-foreground">User ID:</span>
                  <span className="text-sm font-mono text-xs">{user?.id?.slice(0, 16)}...</span>
                </div>
              </div>
            </div>

            <div className="bg-destructive/10 border border-destructive/50 rounded-xl p-6">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                <div>
                  <h3 className="text-lg font-semibold text-destructive">Danger Zone</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Permanently delete your organization and all associated data. This action cannot be undone.
                  </p>
                </div>
              </div>

              <AlertDialog onOpenChange={(open) => {
                if (!open) setDeleteConfirmation('');
              }}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    className="w-full"
                    disabled={!canDeleteOrganization || deleteOrganizationMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Organization
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete <strong>{organization?.name}</strong> and all batches,
                      members, and data. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  
                  <div className="space-y-2">
                    <Label htmlFor="delete-confirm">Type DELETE to confirm:</Label>
                    <Input
                      id="delete-confirm"
                      value={deleteConfirmation}
                      onChange={(e) => setDeleteConfirmation(e.target.value)}
                      placeholder="DELETE"
                    />
                  </div>

                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setDeleteConfirmation('')}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={deleteOrganization}
                      disabled={
                        deleteConfirmation !== 'DELETE' || deleteOrganizationMutation.isPending
                      }
                    >
                      {deleteOrganizationMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Deleting...
                        </>
                      ) : (
                        'Delete Forever'
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              {!canDeleteOrganization && (
                <p className="text-xs text-muted-foreground mt-3">
                  Only organization owners or admins can delete this organization.
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
