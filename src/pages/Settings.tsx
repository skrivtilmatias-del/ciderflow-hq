import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { 
  ArrowLeft, User, Building2, Shield, Trash2, 
  Edit, Mail, Lock, Users, AlertTriangle 
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

type Organization = {
  id: string;
  name: string;
  created_at: string;
};

type OrganizationMember = {
  id: string;
  role: string;
  user_id: string;
  users: {
    email: string;
    user_metadata: { full_name?: string };
  };
};

export default function Settings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: ''
  });

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setFullName(user?.user_metadata?.full_name || '');

      const { data: memberData } = await supabase
        .from('organization_members')
        .select('organization_id, organizations(*)')
        .eq('user_id', user!.id)
        .single();

      if (memberData) {
        setOrganization(memberData.organizations as any);
        setOrgName((memberData.organizations as any).name);

        // Load all members
        const { data: membersData } = await supabase
          .from('organization_members')
          .select(`
            id,
            role,
            user_id,
            users:user_id (email, user_metadata)
          `)
          .eq('organization_id', memberData.organization_id);

        setMembers(membersData as any || []);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateName() {
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: fullName }
      });

      if (error) throw error;

      toast({
        title: "Name updated!",
        description: "Your profile has been updated.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  }

  async function updateOrganization() {
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ name: orgName })
        .eq('id', organization!.id);

      if (error) throw error;

      setOrganization(prev => prev ? { ...prev, name: orgName } : null);

      toast({
        title: "Organization updated!",
        description: "Your organization name has been changed.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  }

  async function changePassword() {
    if (passwords.new !== passwords.confirm) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "New passwords don't match",
      });
      return;
    }

    if (passwords.new.length < 6) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Password must be at least 6 characters",
      });
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: passwords.new
      });

      if (error) throw error;

      toast({
        title: "Password changed!",
        description: "Your password has been updated.",
      });

      setPasswords({ current: '', new: '', confirm: '' });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  }

  async function deleteOrganization() {
    if (deleteConfirmation !== 'DELETE') {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please type DELETE to confirm",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('organizations')
        .delete()
        .eq('id', organization!.id);

      if (error) throw error;

      toast({
        title: "Organization deleted",
        description: "Your organization and all data have been removed.",
      });

      await supabase.auth.signOut();
      navigate('/');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
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
              <User className="h-4 w-4 mr-2" />
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
                    <Button onClick={updateName}>
                      <Edit className="h-4 w-4 mr-2" />
                      Update
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

                <Button onClick={changePassword} disabled={!passwords.new || !passwords.confirm}>
                  <Lock className="h-4 w-4 mr-2" />
                  Change Password
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
                    <Button onClick={updateOrganization}>
                      <Edit className="h-4 w-4 mr-2" />
                      Update
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Created</Label>
                  <p className="text-sm text-muted-foreground">
                    {organization ? format(new Date(organization.created_at), 'PPP') : 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Team Members</h3>
              
              <div className="space-y-3">
                {members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-3">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">
                          {member.users?.user_metadata?.full_name || 'Unknown'}
                        </p>
                        <p className="text-xs text-muted-foreground">{member.users?.email}</p>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-1 bg-background rounded-md capitalize">
                      {member.role}
                    </span>
                  </div>
                ))}
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

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full">
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
                      disabled={deleteConfirmation !== 'DELETE'}
                    >
                      Delete Forever
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
