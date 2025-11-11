import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';

// Zod validation schema
const organizationSchema = z.object({
  name: z.string().trim().min(1, "Organization name is required").max(100, "Organization name must be less than 100 characters"),
  size: z.enum(['small', 'medium', 'large', 'enterprise']),
});

export default function Onboarding() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const [orgData, setOrgData] = useState({
    name: '',
    size: 'small'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate input using Zod
    const validation = organizationSchema.safeParse(orgData);
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: firstError.message,
      });
      return;
    }
    
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Not authenticated');
      }

      // Create organization
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert([
          {
            name: validation.data.name,
            owner_id: user.id,
            team_size: validation.data.size
          }
        ])
        .select()
        .single();

      if (orgError) throw orgError;

      // Add user as organization member with 'owner' role
      const { error: memberError } = await supabase
        .from('organization_members')
        .insert([
          {
            organization_id: org.id,
            user_id: user.id,
            role: 'owner'
          }
        ]);

      if (memberError) throw memberError;

      toast({
        title: "Success!",
        description: "Your organization has been created.",
      });

      // Force a full page reload to update App.tsx state
      window.location.href = '/dashboard';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create organization';
      toast({
        variant: "destructive",
        title: "Error",
        description: message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-accent to-background flex items-center justify-center px-6">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-3xl font-bold mb-2">
            Create Your Organization
          </h2>
          <p className="text-muted-foreground">
            Set up your workspace to start tracking your cider production
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-card rounded-xl border p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input
                id="orgName"
                type="text"
                placeholder="Acme Cidery"
                value={orgData.name}
                onChange={(e) => setOrgData({ ...orgData, name: e.target.value })}
                required
              />
              <p className="text-sm text-muted-foreground">
                This is the name of your cidery or business
              </p>
            </div>

            <div className="space-y-3">
              <Label>Team Size</Label>
              <RadioGroup
                value={orgData.size}
                onValueChange={(value) => setOrgData({ ...orgData, size: value })}
              >
                <div className="flex items-center space-x-2 rounded-lg border p-4 hover:bg-accent transition-colors cursor-pointer">
                  <RadioGroupItem value="small" id="small" />
                  <Label htmlFor="small" className="flex-1 cursor-pointer">
                    <div className="font-medium">👤 Just me</div>
                    <div className="text-sm text-muted-foreground">Solo operation</div>
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2 rounded-lg border p-4 hover:bg-accent transition-colors cursor-pointer">
                  <RadioGroupItem value="medium" id="medium" />
                  <Label htmlFor="medium" className="flex-1 cursor-pointer">
                    <div className="font-medium">👥 2-10 people</div>
                    <div className="text-sm text-muted-foreground">Small team</div>
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2 rounded-lg border p-4 hover:bg-accent transition-colors cursor-pointer">
                  <RadioGroupItem value="large" id="large" />
                  <Label htmlFor="large" className="flex-1 cursor-pointer">
                    <div className="font-medium">👨‍👩‍👧‍👦 10+ people</div>
                    <div className="text-sm text-muted-foreground">Growing business</div>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating...' : 'Create Organization'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
