import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Wine, Plus, LogOut, Settings, Package, Calendar, Beaker, Edit, Trash2, AlertTriangle, CheckCircle2, Search, Filter, SortAsc, Loader2 } from 'lucide-react';
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
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    variety: '',
    volume: '',
    start_date: ''
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState('newest');
  const [operationLoading, setOperationLoading] = useState<string | null>(null);

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
    setOperationLoading('create');
    
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
    } finally {
      setOperationLoading(null);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate('/');
  }

  const filteredAndSortedBatches = useMemo(() => {
    let result = [...batches];
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(b => 
        b.name.toLowerCase().includes(query) ||
        b.variety.toLowerCase().includes(query)
      );
    }
    
    // Apply stage filter
    if (stageFilter !== 'all') {
      result = result.filter(b => b.current_stage === stageFilter);
    }
    
    // Apply sorting
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
        result.sort((a, b) => Number(b.volume) - Number(a.volume));
        break;
      case 'volume-low':
        result.sort((a, b) => Number(a.volume) - Number(b.volume));
        break;
    }
    
    return result;
  }, [batches, searchQuery, stageFilter, sortBy]);

  const hasActiveFilters = searchQuery.trim() || stageFilter !== 'all' || sortBy !== 'newest';
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

  async function updateBatchStage(batchId: string, newStage: string) {
    try {
      const { error } = await supabase
        .from('batches')
        .update({ current_stage: newStage })
        .eq('id', batchId)
        .eq('organization_id', organization!.id);

      if (error) throw error;

      setBatches(batches.map(b => 
        b.id === batchId ? { ...b, current_stage: newStage } : b
      ));
      setSelectedBatch(prev => prev ? { ...prev, current_stage: newStage } : null);

      toast({
        title: "Stage updated!",
        description: `Batch moved to ${newStage}.`,
      });
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
                <Skeleton className="h-6 w-32" />
              </div>
              <Skeleton className="h-10 w-24" />
            </div>
          </div>
        </header>

        <main className="container mx-auto px-6 py-8">
          {/* Stats Skeletons */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-card rounded-xl border p-6">
                <Skeleton className="h-4 w-32 mb-4" />
                <Skeleton className="h-10 w-20" />
              </div>
            ))}
          </div>

          {/* Table Skeleton */}
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
          {/* Filter Controls */}
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
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Stages" />
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
              <SelectTrigger className="w-full sm:w-[200px]">
                <SortAsc className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Sort by" />
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

          {/* Action Bar */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {hasActiveFilters ? (
                <>
                  Showing {filteredAndSortedBatches.length} of {batches.length} batches
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => {
                      setSearchQuery('');
                      setStageFilter('all');
                      setSortBy('newest');
                    }}
                    className="ml-2"
                  >
                    Clear filters
                  </Button>
                </>
              ) : (
                `${batches.length} total batches`
              )}
            </div>

            {!showNewBatchForm && (
              <Button onClick={() => setShowNewBatchForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Batch
              </Button>
            )}
          </div>
        </div>

        {/* New Batch Form */}
        {showNewBatchForm && (
          <div className="bg-card rounded-xl border p-6 mb-6">
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
                  <Button type="submit" disabled={loading || operationLoading === 'create'}>
                    {operationLoading === 'create' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Creating...
                      </>
                    ) : (
                      'Create Batch'
                    )}
                  </Button>
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

        {/* Batches Table */}
        {filteredAndSortedBatches.length === 0 ? (
          <div className="bg-card rounded-xl border p-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {hasActiveFilters ? 'No batches match your filters' : 'No batches yet'}
            </h3>
            <p className="text-muted-foreground mb-4">
              {hasActiveFilters 
                ? 'Try adjusting your search or filter criteria'
                : 'Create your first batch to start tracking your cider production'
              }
            </p>
            {hasActiveFilters ? (
              <Button 
                variant="outline"
                onClick={() => {
                  setSearchQuery('');
                  setStageFilter('all');
                  setSortBy('newest');
                }}
              >
                Clear Filters
              </Button>
            ) : (
              <Button onClick={() => setShowNewBatchForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Batch
              </Button>
            )}
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
                  {filteredAndSortedBatches.map((batch) => (
                    <tr 
                      key={batch.id} 
                      className="border-t hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => {
                        setSelectedBatch(batch);
                        setEditFormData({
                          name: batch.name,
                          variety: batch.variety,
                          volume: batch.volume.toString(),
                          start_date: batch.start_date
                        });
                        setBatchDialogOpen(true);
                      }}
                    >
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

      {/* Batch Details Dialog */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Batch Details</DialogTitle>
            <DialogDescription>
              View and manage {selectedBatch?.name}
            </DialogDescription>
          </DialogHeader>

          {selectedBatch && (
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="stage">Update Stage</TabsTrigger>
                <TabsTrigger value="danger">Danger Zone</TabsTrigger>
              </TabsList>

              {/* DETAILS TAB */}
              <TabsContent value="details" className="space-y-4">
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

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-volume">Volume (liters)</Label>
                      <Input
                        id="edit-volume"
                        type="number"
                        step="0.01"
                        value={editFormData.volume}
                        onChange={(e) => setEditFormData({ ...editFormData, volume: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-date">Start Date</Label>
                      <Input
                        id="edit-date"
                        type="date"
                        value={editFormData.start_date}
                        onChange={(e) => setEditFormData({ ...editFormData, start_date: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="bg-muted p-4 rounded-lg space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Current Stage:</span>
                      <Badge variant={getStageColor(selectedBatch.current_stage)}>
                        {selectedBatch.current_stage}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Created:</span>
                      <span className="text-sm">{format(new Date(selectedBatch.created_at), 'PPP')}</span>
                    </div>
                  </div>

                  <Button 
                    onClick={async () => {
                      setOperationLoading(selectedBatch.id);
                      try {
                        const { error } = await supabase
                          .from('batches')
                          .update({
                            name: editFormData.name,
                            variety: editFormData.variety,
                            volume: parseFloat(editFormData.volume),
                            start_date: editFormData.start_date
                          })
                          .eq('id', selectedBatch.id)
                          .eq('organization_id', organization!.id);

                        if (error) throw error;

                        setBatches(batches.map(b => 
                          b.id === selectedBatch.id 
                            ? { 
                                ...b, 
                                name: editFormData.name,
                                variety: editFormData.variety,
                                volume: parseFloat(editFormData.volume),
                                start_date: editFormData.start_date
                              } 
                            : b
                        ));

                        toast({
                          title: "Batch updated!",
                          description: "Your changes have been saved.",
                        });

                        setBatchDialogOpen(false);
                      } catch (error: any) {
                        toast({
                          variant: "destructive",
                          title: "Error",
                          description: error.message,
                        });
                      } finally {
                        setOperationLoading(null);
                      }
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
              </TabsContent>

              {/* STAGE TAB */}
              <TabsContent value="stage" className="space-y-4">
                <div className="space-y-4">
                  <div className="bg-muted p-4 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">Current Stage:</p>
                    <Badge variant={getStageColor(selectedBatch.current_stage)} className="text-base">
                      {selectedBatch.current_stage}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Progress this batch to the next stage:</p>
                    
                    {selectedBatch.current_stage === 'pressing' && (
                      <Button 
                        onClick={async () => {
                          setOperationLoading(selectedBatch.id);
                          await updateBatchStage(selectedBatch.id, 'fermenting');
                          setOperationLoading(null);
                        }}
                        disabled={operationLoading === selectedBatch.id}
                        className="w-full"
                      >
                        {operationLoading === selectedBatch.id ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Updating...
                          </>
                        ) : (
                          'Move to Fermenting →'
                        )}
                      </Button>
                    )}

                    {selectedBatch.current_stage === 'fermenting' && (
                      <Button 
                        onClick={async () => {
                          setOperationLoading(selectedBatch.id);
                          await updateBatchStage(selectedBatch.id, 'aging');
                          setOperationLoading(null);
                        }}
                        disabled={operationLoading === selectedBatch.id}
                        className="w-full"
                      >
                        {operationLoading === selectedBatch.id ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Updating...
                          </>
                        ) : (
                          'Move to Aging →'
                        )}
                      </Button>
                    )}

                    {selectedBatch.current_stage === 'aging' && (
                      <Button 
                        onClick={async () => {
                          setOperationLoading(selectedBatch.id);
                          await updateBatchStage(selectedBatch.id, 'bottled');
                          setOperationLoading(null);
                        }}
                        disabled={operationLoading === selectedBatch.id}
                        className="w-full"
                      >
                        {operationLoading === selectedBatch.id ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Updating...
                          </>
                        ) : (
                          'Move to Bottled →'
                        )}
                      </Button>
                    )}

                    {selectedBatch.current_stage === 'bottled' && (
                      <div className="flex items-center gap-2 p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                        <p className="text-sm font-medium text-green-900 dark:text-green-100">
                          This batch is complete!
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="bg-muted/50 p-4 rounded-lg space-y-1">
                    <p className="text-sm font-medium">Production Stages:</p>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>1. Pressing → Juice extraction</p>
                      <p>2. Fermenting → Primary fermentation</p>
                      <p>3. Aging → Maturation and flavor development</p>
                      <p>4. Bottled → Ready for distribution</p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* DANGER ZONE TAB */}
              <TabsContent value="danger" className="space-y-4">
                <div className="border border-destructive/50 rounded-lg p-6 space-y-4 bg-destructive/5">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-destructive">Delete Batch</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Permanently remove this batch from your production records. This action cannot be undone.
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
                          This will permanently delete <strong>{selectedBatch.name}</strong> and remove all associated data. 
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={async () => {
                            try {
                              const { error } = await supabase
                                .from('batches')
                                .delete()
                                .eq('id', selectedBatch.id)
                                .eq('organization_id', organization!.id);

                              if (error) throw error;

                              setBatches(batches.filter(b => b.id !== selectedBatch.id));

                              toast({
                                title: "Batch deleted",
                                description: `${selectedBatch.name} has been removed.`,
                              });

                              setBatchDialogOpen(false);
                              setDeleteDialogOpen(false);
                            } catch (error: any) {
                              toast({
                                variant: "destructive",
                                title: "Error",
                                description: error.message,
                              });
                            }
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
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
