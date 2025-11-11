import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';
import {
  Wine,
  Plus,
  LogOut,
  Settings,
  Package,
  Calendar,
  Beaker,
  Edit,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Search,
  Filter,
  SortAsc,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

type BatchRow = Tables<'batches'>;
type BatchStage = 'pressing' | 'fermenting' | 'aging' | 'bottled';
type Batch = Omit<BatchRow, 'current_stage'> & { current_stage: BatchStage };

type Organization = Tables<'organizations'>;

type MemberRole = 'owner' | 'admin' | 'member';

type OrganizationMembership = {
  organization_id: string;
  role: MemberRole;
  organizations: Organization;
};

type BatchFormState = {
  name: string;
  variety: string;
  volume: number | '';
  start_date: string;
};

// Zod validation schemas
const batchSchema = z.object({
  name: z.string().trim().min(1, "Batch name is required").max(100, "Batch name must be less than 100 characters"),
  variety: z.string().trim().min(1, "Apple variety is required").max(100, "Variety must be less than 100 characters"),
  volume: z.number().positive("Volume must be a positive number").max(1000000, "Volume must be less than 1,000,000 liters"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
});

export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: user,
    isLoading: userLoading,
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
        organization_id: data.organization_id,
        role: data.role as MemberRole,
        organizations: data.organizations as Organization,
      };
    },
  });

  const organization = membership?.organizations ?? null;
  const organizationId = membership?.organization_id ?? null;

  const {
    data: batches = [],
    isLoading: batchesLoading,
  } = useQuery<BatchRow[]>({
    queryKey: ['batches', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('batches')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });

  const [showNewBatchForm, setShowNewBatchForm] = useState(false);
  const [newBatch, setNewBatch] = useState<BatchFormState>({
    name: '',
    variety: '',
    volume: '',
    start_date: new Date().toISOString().split('T')[0],
  });
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<BatchFormState>({
    name: '',
    variety: '',
    volume: '',
    start_date: '',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<'all' | BatchStage>('all');
  const [sortBy, setSortBy] = useState('newest');
  const [operationLoading, setOperationLoading] = useState<string | null>(null);

  const createBatchMutation = useMutation<BatchRow, Error, TablesInsert<'batches'>>({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from('batches')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;
      return data as BatchRow;
    },
    onMutate: () => setOperationLoading('create'),
    onSuccess: (data, variables) => {
      queryClient.setQueryData<BatchRow[]>(['batches', variables.organization_id], (old) =>
        old ? [data, ...old] : [data]
      );
      setShowNewBatchForm(false);
      setNewBatch({
        name: '',
        variety: '',
        volume: '',
        start_date: new Date().toISOString().split('T')[0],
      });
      toast({
        title: 'Batch created!',
        description: `${data.name} has been added to your production.`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error creating batch',
        description: error.message || 'Failed to create batch',
      });
    },
    onSettled: () => setOperationLoading(null),
  });

  const updateBatchMutation = useMutation<BatchRow, Error, {
    batchId: string;
    organizationId: string;
    updates: TablesUpdate<'batches'>;
  }>({
    mutationFn: async ({ batchId, updates }) => {
      const { data, error } = await supabase
        .from('batches')
        .update(updates)
        .eq('id', batchId)
        .select()
        .single();

      if (error) throw error;
      return data as BatchRow;
    },
    onMutate: ({ batchId }) => setOperationLoading(batchId),
    onSuccess: (data, variables) => {
      queryClient.setQueryData<BatchRow[]>(['batches', variables.organizationId], (old) =>
        old ? old.map((batch) => (batch.id === data.id ? data : batch)) : [data]
      );
      toast({
        title: 'Batch updated!',
        description: 'Changes have been saved.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error updating batch',
        description: error.message,
      });
    },
    onSettled: () => setOperationLoading(null),
  });

  const updateStageMutation = useMutation<{ batchId: string; newStage: BatchStage }, Error, {
    batchId: string;
    newStage: BatchStage;
    organizationId: string;
  }>({
    mutationFn: async ({ batchId, newStage }) => {
      const { error } = await supabase
        .from('batches')
        .update({ current_stage: newStage })
        .eq('id', batchId);

      if (error) throw error;
      return { batchId, newStage };
    },
    onMutate: ({ batchId }) => setOperationLoading(batchId),
    onSuccess: ({ batchId, newStage }, variables) => {
      queryClient.setQueryData<BatchRow[]>(['batches', variables.organizationId], (old) =>
        old
          ? old.map((batch) =>
              batch.id === batchId
                ? { ...batch, current_stage: newStage }
                : batch
            )
          : []
      );
      toast({
        title: 'Stage updated!',
        description: `Batch moved to ${newStage}.`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error updating stage',
        description: error.message,
      });
    },
    onSettled: () => setOperationLoading(null),
  });

  const deleteBatchMutation = useMutation<string, Error, { batchId: string; organizationId: string; batchName?: string }>({
    mutationFn: async ({ batchId }) => {
      const { error } = await supabase
        .from('batches')
        .delete()
        .eq('id', batchId);

      if (error) throw error;
      return batchId;
    },
    onMutate: ({ batchId }) => setOperationLoading(batchId),
    onSuccess: (batchId, variables) => {
      queryClient.setQueryData<BatchRow[]>(['batches', variables.organizationId], (old) =>
        old ? old.filter((batch) => batch.id !== batchId) : []
      );
      setDeleteDialogOpen(false);
      setBatchDialogOpen(false);
      setSelectedBatch(null);
      toast({
        title: 'Batch deleted',
        description: `${variables.batchName || 'Batch'} has been removed.`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error deleting batch',
        description: error.message,
      });
    },
    onSettled: () => setOperationLoading(null),
  });

  function handleCreateBatch(e: React.FormEvent) {
    e.preventDefault();

    if (!user?.id || !organizationId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Organization context is missing.',
      });
      return;
    }

    // Validate input using Zod
    const validation = batchSchema.safeParse({
      name: newBatch.name,
      variety: newBatch.variety,
      volume: newBatch.volume,
      start_date: newBatch.start_date,
    });

    if (!validation.success) {
      const firstError = validation.error.errors[0];
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: firstError.message,
      });
      return;
    }

    createBatchMutation.mutate({
      name: validation.data.name,
      variety: validation.data.variety,
      volume: validation.data.volume,
      organization_id: organizationId,
      current_stage: 'pressing',
      start_date: validation.data.start_date,
      created_by: user.id,
    });
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate('/');
  }

  const isLoading = userLoading || membershipLoading || (Boolean(organizationId) && batchesLoading);

  const filteredAndSortedBatches = useMemo(() => {
    let result = [...batches];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((batch) =>
        batch.name.toLowerCase().includes(query) ||
        batch.variety.toLowerCase().includes(query)
      );
    }

    if (stageFilter !== 'all') {
      result = result.filter((batch) => batch.current_stage === stageFilter);
    }

    switch (sortBy) {
      case 'newest':
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'oldest':
        result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'name-asc':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name-desc':
        result.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'volume-high':
        result.sort((a, b) => b.volume - a.volume);
        break;
      case 'volume-low':
        result.sort((a, b) => a.volume - b.volume);
        break;
    }

    return result;
  }, [batches, searchQuery, stageFilter, sortBy]);

  const hasActiveFilters = searchQuery.trim() || stageFilter !== 'all' || sortBy !== 'newest';
  const totalVolume = batches.reduce((sum, batch) => sum + Number(batch.volume), 0);
  const activeBatches = batches.filter((batch) => batch.current_stage !== 'bottled').length;

  const getStageColor = (stage: BatchStage) => {
    switch (stage) {
      case 'pressing':
        return 'default';
      case 'fermenting':
        return 'secondary';
      case 'aging':
        return 'outline';
      case 'bottled':
      default:
        return 'default';
    }
  };

  function handleUpdateBatchStage(batchId: string, newStage: BatchStage) {
    if (!organizationId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Organization context is missing.',
      });
      return;
    }

    updateStageMutation.mutate({ batchId, newStage, organizationId });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Wine className="h-6 w-6 text-primary" />
                  <span className="text-xl font-bold">CiderTrack</span>
                </div>
                <div className="text-muted-foreground">|</div>
                <Skeleton className="h-6 w-32" />
              </div>
              <Skeleton className="h-10 w-24" />
            </div>
          </div>
        </header>

        <main className="container mx-auto px-6 py-8">
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-card rounded-xl border p-6">
                <Skeleton className="h-4 w-32 mb-4" />
                <Skeleton className="h-10 w-20" />
              </div>
            ))}
          </div>

          <div className="bg-card rounded-xl border p-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </main>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center space-y-4">
        <Wine className="h-10 w-10 text-primary" />
        <h1 className="text-2xl font-semibold">No organization found</h1>
        <p className="text-muted-foreground max-w-sm">
          We couldn't find an organization associated with your account. Create one to start tracking your cider production.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={() => navigate('/onboarding')}>
            Create organization
          </Button>
          <Button variant="outline" onClick={async () => {
            await supabase.auth.signOut();
            navigate('/');
          }}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  const stageTransitions: Record<BatchStage, { nextStage: BatchStage; label: string; description: string } | undefined> = {
    pressing: { nextStage: 'fermenting', label: 'Start Fermenting', description: 'Move batch to fermentation' },
    fermenting: { nextStage: 'aging', label: 'Begin Aging', description: 'Move batch to aging phase' },
    aging: { nextStage: 'bottled', label: 'Bottle', description: 'Mark batch as bottled' },
    bottled: undefined,
  };

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
                onClick={() => navigate('/settings')}
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

        {/* Search, Filter & Sort Bar */}
        <div className="space-y-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or variety..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setSearchQuery('')}
                >
                  ×
                </Button>
              )}
            </div>

            {/* Stage Filter */}
            <Select value={stageFilter} onValueChange={(value) => setStageFilter(value as 'all' | BatchStage)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                <SelectItem value="pressing">Pressing</SelectItem>
                <SelectItem value="fermenting">Fermenting</SelectItem>
                <SelectItem value="aging">Aging</SelectItem>
                <SelectItem value="bottled">Bottled</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <div className="flex items-center gap-2">
                  <SortAsc className="h-4 w-4" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                <SelectItem value="volume-high">Volume (High-Low)</SelectItem>
                <SelectItem value="volume-low">Volume (Low-High)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {hasActiveFilters && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Showing {filteredAndSortedBatches.length} of {batches.length} batches</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setStageFilter('all');
                  setSortBy('newest');
                }}
              >
                Clear filters
              </Button>
            </div>
          )}
        </div>

        {/* Batches Table */}
        <div className="bg-card rounded-xl border">
          <div className="p-6 border-b flex items-center justify-between">
            <h2 className="text-xl font-semibold">Cider Batches</h2>
            <Button onClick={() => setShowNewBatchForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Batch
            </Button>
          </div>

          {filteredAndSortedBatches.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {batches.length === 0 ? 'No batches yet' : 'No batches found'}
              </h3>
              <p className="text-muted-foreground mb-4">
                {batches.length === 0 
                  ? 'Create your first batch to start tracking your cider production.'
                  : 'Try adjusting your filters to find what you\'re looking for.'}
              </p>
              {batches.length === 0 && (
                <Button onClick={() => setShowNewBatchForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Batch
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="text-left p-4 font-medium">Name</th>
                    <th className="text-left p-4 font-medium">Variety</th>
                    <th className="text-left p-4 font-medium">Volume</th>
                    <th className="text-left p-4 font-medium">Stage</th>
                    <th className="text-left p-4 font-medium">Start Date</th>
                    <th className="text-left p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedBatches.map((batch) => (
                    <tr key={batch.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-4 font-medium">{batch.name}</td>
                      <td className="p-4 text-muted-foreground">{batch.variety}</td>
                      <td className="p-4">{Number(batch.volume).toFixed(1)} L</td>
                      <td className="p-4">
                        <Badge variant={getStageColor(batch.current_stage as BatchStage)}>
                          {batch.current_stage}
                        </Badge>
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {format(new Date(batch.start_date), 'MMM d, yyyy')}
                      </td>
                      <td className="p-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedBatch(batch as Batch);
                            setEditFormData({
                              name: batch.name,
                              variety: batch.variety,
                              volume: Number(batch.volume),
                              start_date: batch.start_date,
                            });
                            setBatchDialogOpen(true);
                          }}
                        >
                          View Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* New Batch Dialog */}
      <Dialog open={showNewBatchForm} onOpenChange={setShowNewBatchForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Batch</DialogTitle>
            <DialogDescription>
              Add a new cider batch to your production tracking.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateBatch} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Batch Name</Label>
              <Input
                id="name"
                value={newBatch.name}
                onChange={(e) => setNewBatch({ ...newBatch, name: e.target.value })}
                placeholder="e.g., Autumn Harvest 2024"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="variety">Apple Variety</Label>
              <Input
                id="variety"
                value={newBatch.variety}
                onChange={(e) => setNewBatch({ ...newBatch, variety: e.target.value })}
                placeholder="e.g., Granny Smith"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="volume">Volume (Liters)</Label>
              <Input
                id="volume"
                type="number"
                step="0.1"
                value={newBatch.volume}
                onChange={(e) => setNewBatch({ ...newBatch, volume: e.target.value ? parseFloat(e.target.value) : '' })}
                placeholder="e.g., 100"
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

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNewBatchForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={operationLoading === 'create'}>
                {operationLoading === 'create' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Batch
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Batch Details Dialog */}
      {selectedBatch && (
        <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedBatch.name}</DialogTitle>
              <DialogDescription>
                View and manage batch details
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="edit">Edit</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Variety</p>
                    <p className="font-medium">{selectedBatch.variety}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Volume</p>
                    <p className="font-medium">{Number(selectedBatch.volume).toFixed(1)} L</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Current Stage</p>
                    <Badge variant={getStageColor(selectedBatch.current_stage)}>
                      {selectedBatch.current_stage}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Start Date</p>
                    <p className="font-medium">{format(new Date(selectedBatch.start_date), 'PPP')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Created</p>
                    <p className="font-medium">{format(new Date(selectedBatch.created_at), 'PPP')}</p>
                  </div>
                </div>

                {/* Stage Progression */}
                <div className="space-y-3">
                  <h4 className="font-semibold">Production Stage</h4>
                  {(() => {
                    const transition = stageTransitions[selectedBatch.current_stage];
                    if (!transition) {
                      return (
                        <div className="flex items-center gap-2 p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                          <p className="text-sm font-medium text-green-900 dark:text-green-100">
                            Batch is complete! This batch has been bottled.
                          </p>
                        </div>
                      );
                    }

                    return (
                      <Button
                        onClick={() => handleUpdateBatchStage(selectedBatch.id, transition.nextStage)}
                        disabled={operationLoading === selectedBatch.id}
                        className="w-full"
                      >
                        {operationLoading === selectedBatch.id ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Updating...
                          </>
                        ) : (
                          `${transition.label} →`
                        )}
                      </Button>
                    );
                  })()}
                </div>
              </TabsContent>

              {/* Edit Tab */}
              <TabsContent value="edit" className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Batch Name</Label>
                    <Input
                      id="edit-name"
                      value={editFormData.name}
                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-variety">Apple Variety</Label>
                    <Input
                      id="edit-variety"
                      value={editFormData.variety}
                      onChange={(e) => setEditFormData({ ...editFormData, variety: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-volume">Volume (Liters)</Label>
                    <Input
                      id="edit-volume"
                      type="number"
                      step="0.1"
                      value={editFormData.volume}
                      onChange={(e) => setEditFormData({ ...editFormData, volume: e.target.value ? parseFloat(e.target.value) : '' })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-start-date">Start Date</Label>
                    <Input
                      id="edit-start-date"
                      type="date"
                      value={editFormData.start_date}
                      onChange={(e) => setEditFormData({ ...editFormData, start_date: e.target.value })}
                    />
                  </div>

                  <Button
                    onClick={async () => {
                      if (!organizationId) return;
                      
                      // Validate input using Zod
                      const validation = batchSchema.omit({ start_date: true }).safeParse({
                        name: editFormData.name,
                        variety: editFormData.variety,
                        volume: editFormData.volume,
                      });

                      if (!validation.success) {
                        const firstError = validation.error.errors[0];
                        toast({
                          variant: 'destructive',
                          title: 'Validation Error',
                          description: firstError.message,
                        });
                        return;
                      }

                      updateBatchMutation.mutate({
                        batchId: selectedBatch.id,
                        organizationId,
                        updates: {
                          name: validation.data.name,
                          variety: validation.data.variety,
                          volume: validation.data.volume,
                          start_date: editFormData.start_date,
                        },
                      });
                    }}
                    disabled={operationLoading === selectedBatch.id}
                    className="w-full"
                  >
                    {operationLoading === selectedBatch.id ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Edit className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>

                {/* Delete Section */}
                <div className="border-t pt-6">
                  <div className="flex items-start gap-3 mb-4">
                    <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-destructive">Delete Batch</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Permanently remove this batch and all its data. This action cannot be undone.
                      </p>
                    </div>
                  </div>

                  <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="w-full">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Batch
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete <strong>{selectedBatch.name}</strong> and all associated data.
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          disabled={operationLoading === selectedBatch.id}
                          onClick={() => {
                            if (!organizationId) {
                              toast({
                                variant: 'destructive',
                                title: 'Error',
                                description: 'Organization context is missing.',
                              });
                              return;
                            }
                            deleteBatchMutation.mutate({
                              batchId: selectedBatch.id,
                              organizationId,
                              batchName: selectedBatch.name,
                            });
                          }}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
