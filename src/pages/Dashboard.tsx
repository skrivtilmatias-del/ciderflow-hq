import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Wine, Plus, LogOut, Settings, Package, Calendar, Beaker } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

type Batch = {
  id: string;
  name: string;
  variety: string;
  volume: number;
  current_stage: string;
  start_date: string;
  created_at: string;
  created_by: string;
  organization_id: string;
  updated_at: string;
};

type Organization = {
  id: string;
  name: string;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewBatchForm, setShowNewBatchForm] = useState(false);
  const [newBatch, setNewBatch] = useState({
    name: '',
    variety: '',
    volume: '',
    start_date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      const { data: memberData } = await supabase
        .from('organization_members')
        .select('organization_id, organizations(*)')
        .eq('user_id', user!.id)
        .single();

      if (memberData) {
        setOrganization(memberData.organizations as any);

        const { data: batchesData } = await supabase
          .from('batches')
          .select('*')
          .eq('organization_id', memberData.organization_id)
          .order('created_at', { ascending: false });

        setBatches(batchesData || []);
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateBatch(e: React.FormEvent) {
    e.preventDefault();
    
    try {
      const { data, error } = await supabase
        .from('batches')
        .insert([
          {
            ...newBatch,
            volume: parseFloat(newBatch.volume),
            organization_id: organization!.id,
            current_stage: 'pressing',
            created_by: user!.id
          }
        ])
        .select()
        .single();

      if (error) throw error;

      setBatches([data, ...batches]);
      
      setShowNewBatchForm(false);
      setNewBatch({
        name: '',
        variety: '',
        volume: '',
        start_date: new Date().toISOString().split('T')[0]
      });

      toast({
        title: "Batch created!",
        description: `${data.name} has been added to your production.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || 'Failed to create batch',
      });
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate('/');
  }

  const totalVolume = batches.reduce((sum, batch) => sum + Number(batch.volume), 0);
  const activeBatches = batches.filter(b => b.current_stage !== 'bottled').length;

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'pressing': return 'default';
      case 'fermenting': return 'secondary';
      case 'aging': return 'outline';
      case 'bottled': return 'default';
      default: return 'default';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Wine className="h-6 w-6 text-primary" />
                <span className="text-xl font-bold">CiderTrack</span>
              </div>
              <div className="text-muted-foreground">|</div>
              <div>
                <p className="text-sm text-muted-foreground">Organization</p>
                <p className="font-semibold">{organization?.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right mr-2">
                <p className="text-sm font-medium">{user?.user_metadata?.full_name || user?.email}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => toast({ title: "Coming soon!", description: "Settings feature is under development." })}
              >
                <Settings className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline"
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="bg-card rounded-xl border p-6">
            <div className="flex items-center gap-3 mb-2">
              <Package className="h-5 w-5 text-primary" />
              <p className="text-sm font-medium text-muted-foreground">Total Batches</p>
            </div>
            <p className="text-3xl font-bold">{batches.length}</p>
          </div>

          <div className="bg-card rounded-xl border p-6">
            <div className="flex items-center gap-3 mb-2">
              <Beaker className="h-5 w-5 text-primary" />
              <p className="text-sm font-medium text-muted-foreground">Total Volume</p>
            </div>
            <p className="text-3xl font-bold">{totalVolume.toFixed(1)} <span className="text-lg text-muted-foreground">L</span></p>
          </div>

          <div className="bg-card rounded-xl border p-6">
            <div className="flex items-center gap-3 mb-2">
              <Calendar className="h-5 w-5 text-primary" />
              <p className="text-sm font-medium text-muted-foreground">Active Batches</p>
            </div>
            <p className="text-3xl font-bold">{activeBatches}</p>
          </div>
        </div>

        {/* New Batch Button & Form */}
        <div className="mb-6">
          {!showNewBatchForm ? (
            <Button onClick={() => setShowNewBatchForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Batch
            </Button>
          ) : (
            <div className="bg-card rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Create New Batch</h3>
              <form onSubmit={handleCreateBatch} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Batch Name</Label>
                    <Input
                      id="name"
                      value={newBatch.name}
                      onChange={(e) => setNewBatch({ ...newBatch, name: e.target.value })}
                      placeholder="Fall 2024 Harvest"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="variety">Apple Variety</Label>
                    <Input
                      id="variety"
                      value={newBatch.variety}
                      onChange={(e) => setNewBatch({ ...newBatch, variety: e.target.value })}
                      placeholder="Granny Smith, Honeycrisp..."
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="volume">Volume (liters)</Label>
                    <Input
                      id="volume"
                      type="number"
                      step="0.01"
                      value={newBatch.volume}
                      onChange={(e) => setNewBatch({ ...newBatch, volume: e.target.value })}
                      placeholder="100"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="start_date">Start Date</Label>
                    <Input
                      id="start_date"
                      type="date"
                      value={newBatch.start_date}
                      onChange={(e) => setNewBatch({ ...newBatch, start_date: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button type="submit">Create Batch</Button>
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => setShowNewBatchForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Batches Table */}
        {batches.length === 0 ? (
          <div className="bg-card rounded-xl border p-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No batches yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first batch to start tracking your cider production
            </p>
            <Button onClick={() => setShowNewBatchForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Batch
            </Button>
          </div>
        ) : (
          <div className="bg-card rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-4 font-semibold">Name</th>
                    <th className="text-left p-4 font-semibold">Variety</th>
                    <th className="text-left p-4 font-semibold">Volume</th>
                    <th className="text-left p-4 font-semibold">Stage</th>
                    <th className="text-left p-4 font-semibold">Start Date</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="p-4 font-medium">{batch.name}</td>
                      <td className="p-4 text-muted-foreground">{batch.variety}</td>
                      <td className="p-4">{Number(batch.volume).toFixed(1)} L</td>
                      <td className="p-4">
                        <Badge variant={getStageColor(batch.current_stage)}>
                          {batch.current_stage}
                        </Badge>
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {format(new Date(batch.start_date), 'MMM d, yyyy')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
