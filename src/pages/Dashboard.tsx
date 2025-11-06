import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
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
  Thermometer,
  Droplet,
  ClipboardList,
  CalendarCheck,
  FlaskConical,
  Star,
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
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

type BatchRow = Tables<'batches'>;
type BatchStage = 'pressing' | 'fermenting' | 'aging' | 'bottled';
type Batch = Omit<BatchRow, 'current_stage'> & { current_stage: BatchStage };

type Organization = Tables<'organizations'>;

type MemberRole = 'owner' | 'admin' | 'member';

type OrganizationMembership = Tables<'organization_members'> & {
  organizations: Organization;
};

type BatchFormState = {
  name: string;
  variety: string;
  volume: number | '';
  start_date: string;
};

type FermentationLog = Tables<'fermentation_logs'>;
type TastingNote = Tables<'tasting_notes'>;
type PackagingSchedule = Tables<'packaging_schedules'>;

type FermentationFormState = {
  recorded_at: string;
  temperature: number | '';
  specific_gravity: number | '';
  ph: number | '';
  notes: string;
};

type TastingFormState = {
  recorded_at: string;
  sweetness: number | '';
  acidity: number | '';
  body: number | '';
  aroma: string;
  flavor: string;
  finish: string;
  notes: string;
};

type PackagingFormState = {
  target_date: string;
  format: PackagingSchedule['format'];
  quantity: number | '';
  notes: string;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
  const organizationId = organization?.id;

  const {
    data: batchesData,
    isLoading: batchesLoading,
    error: batchesError,
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
    staleTime: 30 * 1000,
  });

  const batches: Batch[] = useMemo(
    () => (batchesData ?? []).map(batch => ({
      ...batch,
      current_stage: batch.current_stage as BatchStage,
    })),
    [batchesData]
  );

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
  const [newFermentationLog, setNewFermentationLog] = useState<FermentationFormState>({
    recorded_at: new Date().toISOString().split('T')[0],
    temperature: '',
    specific_gravity: '',
    ph: '',
    notes: '',
  });
  const [newTastingNote, setNewTastingNote] = useState<TastingFormState>({
    recorded_at: new Date().toISOString().split('T')[0],
    sweetness: 3,
    acidity: 3,
    body: 3,
    aroma: '',
    flavor: '',
    finish: '',
    notes: '',
  });
  const [newPackagingPlan, setNewPackagingPlan] = useState<PackagingFormState>({
    target_date: new Date().toISOString().split('T')[0],
    format: 'bottle',
    quantity: '',
    notes: '',
  });

  const packagingFormats: { value: PackagingSchedule['format']; label: string }[] = [
    { value: 'bottle', label: 'Bottle' },
    { value: 'can', label: 'Can' },
    { value: 'keg', label: 'Keg' },
    { value: 'bag-in-box', label: 'Bag-in-Box' },
    { value: 'growler', label: 'Growler' },
    { value: 'other', label: 'Other' },
  ];

  const sensoryScale = [1, 2, 3, 4, 5] as const;

  const selectedBatchId = selectedBatch?.id ?? null;

  const parseOptionalNumber = (value: number | '') =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

  useEffect(() => {
    if (batchDialogOpen && selectedBatchId) {
      const today = new Date().toISOString().split('T')[0];
      setNewFermentationLog({
        recorded_at: today,
        temperature: '',
        specific_gravity: '',
        ph: '',
        notes: '',
      });
      setNewTastingNote({
        recorded_at: today,
        sweetness: 3,
        acidity: 3,
        body: 3,
        aroma: '',
        flavor: '',
        finish: '',
        notes: '',
      });
      setNewPackagingPlan({
        target_date: today,
        format: 'bottle',
        quantity: '',
        notes: '',
      });
    }
  }, [batchDialogOpen, selectedBatchId]);

  const {
    data: fermentationLogs = [],
    isLoading: fermentationLogsLoading,
    error: fermentationLogsError,
  } = useQuery<FermentationLog[]>({
    queryKey: ['fermentation-logs', selectedBatchId],
    enabled: batchDialogOpen && Boolean(selectedBatchId),
    queryFn: async () => {
      if (!selectedBatchId) return [];
      const { data, error } = await supabase
        .from('fermentation_logs')
        .select('*')
        .eq('batch_id', selectedBatchId)
        .order('recorded_at', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });

  const {
    data: tastingNotes = [],
    isLoading: tastingNotesLoading,
    error: tastingNotesError,
  } = useQuery<TastingNote[]>({
    queryKey: ['tasting-notes', selectedBatchId],
    enabled: batchDialogOpen && Boolean(selectedBatchId),
    queryFn: async () => {
      if (!selectedBatchId) return [];
      const { data, error } = await supabase
        .from('tasting_notes')
        .select('*')
        .eq('batch_id', selectedBatchId)
        .order('recorded_at', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });

  const {
    data: packagingSchedules = [],
    isLoading: packagingSchedulesLoading,
    error: packagingSchedulesError,
  } = useQuery<PackagingSchedule[]>({
    queryKey: ['packaging-schedules', selectedBatchId],
    enabled: batchDialogOpen && Boolean(selectedBatchId),
    queryFn: async () => {
      if (!selectedBatchId) return [];
      const { data, error } = await supabase
        .from('packaging_schedules')
        .select('*')
        .eq('batch_id', selectedBatchId)
        .order('target_date', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });

  type PackagingWithBatch = PackagingSchedule & { batches?: { name: string } | null };
  type FermentationWithBatch = FermentationLog & { batches?: { name: string } | null };
  type TastingWithBatch = TastingNote & { batches?: { name: string } | null };

  const {
    data: upcomingPackaging = [],
    error: upcomingPackagingError,
  } = useQuery<PackagingWithBatch[]>({
    queryKey: ['upcoming-packaging', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('packaging_schedules')
        .select('*, batches!inner(name, organization_id)')
        .eq('batches.organization_id', organizationId)
        .is('completed_at', null)
        .order('target_date', { ascending: true })
        .limit(5);

      if (error) throw error;
      return (data ?? []) as PackagingWithBatch[];
    },
    staleTime: 30 * 1000,
  });

  const {
    data: recentFermentation = [],
    error: recentFermentationError,
  } = useQuery<FermentationWithBatch[]>({
    queryKey: ['recent-fermentation', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('fermentation_logs')
        .select('*, batches!inner(name, organization_id)')
        .eq('batches.organization_id', organizationId)
        .order('recorded_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return (data ?? []) as FermentationWithBatch[];
    },
    staleTime: 30 * 1000,
  });

  const {
    data: recentTastingNotes = [],
    error: recentTastingError,
  } = useQuery<TastingWithBatch[]>({
    queryKey: ['recent-tasting', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('tasting_notes')
        .select('*, batches!inner(name, organization_id)')
        .eq('batches.organization_id', organizationId)
        .order('recorded_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return (data ?? []) as TastingWithBatch[];
    },
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    const error =
      userError ??
      membershipError ??
      batchesError ??
      fermentationLogsError ??
      tastingNotesError ??
      packagingSchedulesError ??
      upcomingPackagingError ??
      recentFermentationError ??
      recentTastingError;
    if (error) {
      const message = error instanceof Error ? error.message : 'Failed to load data';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: message,
      });
    }
  }, [
    userError,
    membershipError,
    batchesError,
    fermentationLogsError,
    tastingNotesError,
    packagingSchedulesError,
    upcomingPackagingError,
    recentFermentationError,
    recentTastingError,
    toast,
  ]);

  const stageTransitions: Record<BatchStage, { nextStage: BatchStage; label: string } | null> = {
    pressing: { nextStage: 'fermenting', label: 'Move to Fermenting →' },
    fermenting: { nextStage: 'aging', label: 'Move to Aging →' },
    aging: { nextStage: 'bottled', label: 'Move to Bottled →' },
    bottled: null,
  };

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

      toast({
        title: 'Batch created!',
        description: `${data.name} has been added to your production.`,
      });

      setShowNewBatchForm(false);
      setNewBatch({
        name: '',
        variety: '',
        volume: '',
        start_date: new Date().toISOString().split('T')[0],
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to create batch',
      });
    },
    onSettled: () => setOperationLoading(null),
  });

  const updateBatchMutation = useMutation<BatchRow, Error, {
    batchId: string;
    organizationId: string;
    updates: Pick<TablesUpdate<'batches'>, 'name' | 'variety' | 'volume' | 'start_date'>;
  }>({
    mutationFn: async ({ batchId, organizationId, updates }) => {
      const { data, error } = await supabase
        .from('batches')
        .update(updates)
        .eq('id', batchId)
        .eq('organization_id', organizationId)
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

      setSelectedBatch((prev) => (prev && prev.id === data.id ? { ...prev, ...data, current_stage: data.current_stage as BatchStage } : prev));

      toast({
        title: 'Batch updated!',
        description: 'Your changes have been saved.',
      });

      setBatchDialogOpen(false);
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    },
    onSettled: () => setOperationLoading(null),
  });

  const updateStageMutation = useMutation<{ batchId: string; newStage: BatchStage }, Error, {
    batchId: string;
    organizationId: string;
    newStage: BatchStage;
  }>({
    mutationFn: async ({ batchId, organizationId, newStage }) => {
      const { error } = await supabase
        .from('batches')
        .update({ current_stage: newStage })
        .eq('id', batchId)
        .eq('organization_id', organizationId);

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
          : old
      );

      setSelectedBatch((prev) => (prev && prev.id === batchId ? { ...prev, current_stage: newStage } : prev));

      toast({
        title: 'Stage updated!',
        description: `Batch moved to ${newStage}.`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    },
    onSettled: () => setOperationLoading(null),
  });

  const deleteBatchMutation = useMutation<string, Error, { batchId: string; organizationId: string; batchName?: string }>({
    mutationFn: async ({ batchId, organizationId }) => {
      const { error } = await supabase
        .from('batches')
        .delete()
        .eq('id', batchId)
        .eq('organization_id', organizationId);

      if (error) throw error;
      return batchId;
    },
    onMutate: ({ batchId }) => setOperationLoading(batchId),
    onSuccess: (batchId, variables) => {
      queryClient.setQueryData<BatchRow[]>(['batches', variables.organizationId], (old) =>
        old ? old.filter((batch) => batch.id !== batchId) : []
      );

      toast({
        title: 'Batch deleted',
        description: `${variables.batchName ?? 'The batch'} has been removed.`,
      });

      setBatchDialogOpen(false);
      setDeleteDialogOpen(false);
      setSelectedBatch(null);
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    },
    onSettled: () => setOperationLoading(null),
  });

  const createFermentationLogMutation = useMutation<FermentationLog, Error, TablesInsert<'fermentation_logs'>>({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from('fermentation_logs')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;
      return data as FermentationLog;
    },
    onSuccess: (data) => {
      queryClient.setQueryData<FermentationLog[]>(['fermentation-logs', data.batch_id], (old) =>
        old ? [data, ...old] : [data]
      );
      if (organizationId) {
        queryClient.invalidateQueries({ queryKey: ['recent-fermentation', organizationId] });
      }
      toast({
        title: 'Fermentation log saved',
        description: 'The latest fermentation metrics have been recorded.',
      });
      setNewFermentationLog((prev) => ({ ...prev, temperature: '', specific_gravity: '', ph: '', notes: '' }));
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error recording metrics',
        description: error.message,
      });
    },
  });

  const deleteFermentationLogMutation = useMutation<string, Error, { id: string; batchId: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await supabase
        .from('fermentation_logs')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: (id, variables) => {
      queryClient.setQueryData<FermentationLog[]>(['fermentation-logs', variables.batchId], (old) =>
        old ? old.filter((log) => log.id !== id) : []
      );
      if (organizationId) {
        queryClient.invalidateQueries({ queryKey: ['recent-fermentation', organizationId] });
      }
      toast({
        title: 'Fermentation log deleted',
        description: 'The reading has been removed.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error deleting log',
        description: error.message,
      });
    },
  });

  const createTastingNoteMutation = useMutation<TastingNote, Error, TablesInsert<'tasting_notes'>>({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from('tasting_notes')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;
      return data as TastingNote;
    },
    onSuccess: (data) => {
      queryClient.setQueryData<TastingNote[]>(['tasting-notes', data.batch_id], (old) =>
        old ? [data, ...old] : [data]
      );
      if (organizationId) {
        queryClient.invalidateQueries({ queryKey: ['recent-tasting', organizationId] });
      }
      toast({
        title: 'Tasting note added',
        description: 'Your sensory evaluation has been saved.',
      });
      setNewTastingNote((prev) => ({ ...prev, aroma: '', flavor: '', finish: '', notes: '' }));
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error adding tasting note',
        description: error.message,
      });
    },
  });

  const deleteTastingNoteMutation = useMutation<string, Error, { id: string; batchId: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await supabase
        .from('tasting_notes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: (id, variables) => {
      queryClient.setQueryData<TastingNote[]>(['tasting-notes', variables.batchId], (old) =>
        old ? old.filter((note) => note.id !== id) : []
      );
      if (organizationId) {
        queryClient.invalidateQueries({ queryKey: ['recent-tasting', organizationId] });
      }
      toast({
        title: 'Tasting note removed',
        description: 'The note has been deleted.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error removing note',
        description: error.message,
      });
    },
  });

  const createPackagingScheduleMutation = useMutation<PackagingSchedule, Error, TablesInsert<'packaging_schedules'>>({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from('packaging_schedules')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;
      return data as PackagingSchedule;
    },
    onSuccess: (data) => {
      queryClient.setQueryData<PackagingSchedule[]>(['packaging-schedules', data.batch_id], (old) =>
        old ? [...old, data] : [data]
      );
      if (organizationId) {
        queryClient.invalidateQueries({ queryKey: ['upcoming-packaging', organizationId] });
      }
      toast({
        title: 'Packaging scheduled',
        description: 'Packaging plan has been added to the timeline.',
      });
      setNewPackagingPlan((prev) => ({ ...prev, quantity: '', notes: '' }));
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error scheduling packaging',
        description: error.message,
      });
    },
  });

  const updatePackagingScheduleMutation = useMutation<
    PackagingSchedule,
    Error,
    { scheduleId: string; batchId: string; updates: TablesUpdate<'packaging_schedules'> }
  >({
    mutationFn: async ({ scheduleId, updates }) => {
      const { data, error } = await supabase
        .from('packaging_schedules')
        .update(updates)
        .eq('id', scheduleId)
        .select()
        .single();

      if (error) throw error;
      return data as PackagingSchedule;
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData<PackagingSchedule[]>(['packaging-schedules', variables.batchId], (old) =>
        old
          ? old.map((schedule) => (schedule.id === data.id ? data : schedule))
          : [data]
      );
      if (organizationId) {
        queryClient.invalidateQueries({ queryKey: ['upcoming-packaging', organizationId] });
      }
      toast({
        title: 'Packaging updated',
        description: 'Packaging details have been updated.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error updating packaging',
        description: error.message,
      });
    },
  });

  const deletePackagingScheduleMutation = useMutation<string, Error, { id: string; batchId: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await supabase
        .from('packaging_schedules')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: (id, variables) => {
      queryClient.setQueryData<PackagingSchedule[]>(['packaging-schedules', variables.batchId], (old) =>
        old ? old.filter((schedule) => schedule.id !== id) : []
      );
      if (organizationId) {
        queryClient.invalidateQueries({ queryKey: ['upcoming-packaging', organizationId] });
      }
      toast({
        title: 'Packaging removed',
        description: 'The packaging plan has been deleted.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error deleting packaging',
        description: error.message,
      });
    },
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

    if (typeof newBatch.volume !== 'number' || !Number.isFinite(newBatch.volume)) {
      toast({
        variant: 'destructive',
        title: 'Invalid volume',
        description: 'Please enter a valid numeric volume for the batch.',
      });
      return;
    }

    createBatchMutation.mutate({
      name: newBatch.name,
      variety: newBatch.variety,
      volume: newBatch.volume,
      organization_id: organizationId,
      current_stage: 'pressing',
      start_date: newBatch.start_date,
      created_by: user.id,
    });
  }

  function handleAddFermentationLog(e: React.FormEvent) {
    e.preventDefault();

    if (!user?.id || !selectedBatchId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Batch context is missing.',
      });
      return;
    }

    const payload: TablesInsert<'fermentation_logs'> = {
      batch_id: selectedBatchId,
      recorded_at: newFermentationLog.recorded_at,
      temperature: parseOptionalNumber(newFermentationLog.temperature),
      specific_gravity: parseOptionalNumber(newFermentationLog.specific_gravity),
      ph: parseOptionalNumber(newFermentationLog.ph),
      notes: newFermentationLog.notes ? newFermentationLog.notes.trim() : null,
      created_by: user.id,
    };

    if (!payload.temperature && !payload.specific_gravity && !payload.ph && !payload.notes) {
      toast({
        variant: 'destructive',
        title: 'Add some data',
        description: 'Record at least one metric or note to save a fermentation log.',
      });
      return;
    }

    createFermentationLogMutation.mutate(payload);
  }

  function handleAddTastingNote(e: React.FormEvent) {
    e.preventDefault();

    if (!user?.id || !selectedBatchId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Batch context is missing.',
      });
      return;
    }

    const payload: TablesInsert<'tasting_notes'> = {
      batch_id: selectedBatchId,
      recorded_at: newTastingNote.recorded_at,
      sweetness: typeof newTastingNote.sweetness === 'number' ? newTastingNote.sweetness : null,
      acidity: typeof newTastingNote.acidity === 'number' ? newTastingNote.acidity : null,
      body: typeof newTastingNote.body === 'number' ? newTastingNote.body : null,
      aroma: newTastingNote.aroma ? newTastingNote.aroma.trim() : null,
      flavor: newTastingNote.flavor ? newTastingNote.flavor.trim() : null,
      finish: newTastingNote.finish ? newTastingNote.finish.trim() : null,
      notes: newTastingNote.notes ? newTastingNote.notes.trim() : null,
      created_by: user.id,
    };

    if (
      !payload.aroma &&
      !payload.flavor &&
      !payload.finish &&
      !payload.notes
    ) {
      toast({
        variant: 'destructive',
        title: 'Add tasting details',
        description: 'Capture some sensory notes before saving.',
      });
      return;
    }

    createTastingNoteMutation.mutate(payload);
  }

  function handleAddPackagingPlan(e: React.FormEvent) {
    e.preventDefault();

    if (!user?.id || !selectedBatchId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Batch context is missing.',
      });
      return;
    }

    const quantity =
      typeof newPackagingPlan.quantity === 'number' && Number.isFinite(newPackagingPlan.quantity)
        ? newPackagingPlan.quantity
        : null;

    if (quantity !== null && quantity < 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid quantity',
        description: 'Packaging quantity cannot be negative.',
      });
      return;
    }

    const payload: TablesInsert<'packaging_schedules'> = {
      batch_id: selectedBatchId,
      target_date: newPackagingPlan.target_date,
      format: newPackagingPlan.format,
      quantity,
      notes: newPackagingPlan.notes ? newPackagingPlan.notes.trim() : null,
      created_by: user.id,
    };

    createPackagingScheduleMutation.mutate(payload);
  }

  function handleMarkPackagingComplete(schedule: PackagingSchedule) {
    if (!selectedBatchId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Batch context is missing.',
      });
      return;
    }

    updatePackagingScheduleMutation.mutate({
      scheduleId: schedule.id,
      batchId: selectedBatchId,
      updates: { completed_at: new Date().toISOString() },
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
  const totalVolume = batches.reduce((sum, batch) => sum + batch.volume, 0);
  const activeBatches = batches.filter((batch) => batch.current_stage !== 'bottled').length;
  const nextPackaging = upcomingPackaging[0] ?? null;
  const nextPackagingSummary = nextPackaging
    ? `${format(new Date(nextPackaging.target_date), 'MMM d, yyyy')} • ${nextPackaging.batches?.name ?? 'Batch'}`
    : 'No packaging scheduled';
  const completingScheduleId =
    updatePackagingScheduleMutation.isPending && updatePackagingScheduleMutation.variables
      ? updatePackagingScheduleMutation.variables.scheduleId
      : null;
  const deletingScheduleId =
    deletePackagingScheduleMutation.isPending && deletePackagingScheduleMutation.variables
      ? deletePackagingScheduleMutation.variables.id
      : null;
  const deletingFermentationId =
    deleteFermentationLogMutation.isPending && deleteFermentationLogMutation.variables
      ? deleteFermentationLogMutation.variables.id
      : null;
  const deletingTastingId =
    deleteTastingNoteMutation.isPending && deleteTastingNoteMutation.variables
      ? deleteTastingNoteMutation.variables.id
      : null;

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

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="bg-card rounded-xl border p-6">
            <div className="flex items-center gap-3 mb-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              <p className="text-sm font-medium text-muted-foreground">Recent Fermentation Logs</p>
            </div>
            <p className="text-3xl font-bold">{recentFermentation.length}</p>
            <p className="text-xs text-muted-foreground mt-2">Last five readings recorded across your cidery.</p>
          </div>

          <div className="bg-card rounded-xl border p-6">
            <div className="flex items-center gap-3 mb-2">
              <Star className="h-5 w-5 text-primary" />
              <p className="text-sm font-medium text-muted-foreground">Recent Tasting Notes</p>
            </div>
            <p className="text-3xl font-bold">{recentTastingNotes.length}</p>
            <p className="text-xs text-muted-foreground mt-2">Sensory reviews captured by your team.</p>
          </div>

          <div className="bg-card rounded-xl border p-6">
            <div className="flex items-center gap-3 mb-2">
              <CalendarCheck className="h-5 w-5 text-primary" />
              <p className="text-sm font-medium text-muted-foreground">Upcoming Packaging</p>
            </div>
            <p className="text-3xl font-bold">{upcomingPackaging.length}</p>
            <p className="text-xs text-muted-foreground mt-2">{nextPackagingSummary}</p>
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
            <Select value={stageFilter} onValueChange={(value) => setStageFilter(value as 'all' | BatchStage)}>
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
                    value={newBatch.volume === '' ? '' : newBatch.volume}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '') {
                        setNewBatch({ ...newBatch, volume: '' });
                        return;
                      }
                      const parsed = Number(value);
                      if (Number.isFinite(parsed)) {
                        setNewBatch({ ...newBatch, volume: parsed });
                      }
                    }}
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
                  <Button type="submit" disabled={createBatchMutation.isPending}>
                    {createBatchMutation.isPending ? (
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
                            volume: batch.volume,
                            start_date: batch.start_date,
                          });
                        setBatchDialogOpen(true);
                      }}
                    >
                      <td className="p-4 font-medium">{batch.name}</td>
                      <td className="p-4 text-muted-foreground">{batch.variety}</td>
                        <td className="p-4">{batch.volume.toFixed(1)} L</td>
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

        <div className="grid lg:grid-cols-3 gap-6 mt-10">
          <div className="bg-card rounded-xl border p-6 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <Thermometer className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold">Fermentation Activity</h3>
                <p className="text-sm text-muted-foreground">Latest metrics captured from every batch.</p>
              </div>
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {recentFermentation.length === 0 ? (
                <p className="text-sm text-muted-foreground">No fermentation readings logged yet.</p>
              ) : (
                recentFermentation.map((log) => {
                  const metrics: string[] = [];
                  if (typeof log.temperature === 'number') metrics.push(`${log.temperature.toFixed(1)}°C`);
                  if (typeof log.specific_gravity === 'number') metrics.push(`SG ${log.specific_gravity.toFixed(3)}`);
                  if (typeof log.ph === 'number') metrics.push(`pH ${log.ph.toFixed(2)}`);

                  return (
                    <div key={log.id} className="border rounded-lg p-4 bg-background">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{log.batches?.name ?? 'Batch'}</p>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(log.recorded_at), 'MMM d, yyyy')}
                        </span>
                      </div>
                      {metrics.length > 0 && (
                        <p className="text-sm text-muted-foreground mt-2">{metrics.join(' • ')}</p>
                      )}
                      {log.notes && (
                        <p className="text-sm mt-2 text-foreground/90 line-clamp-3">{log.notes}</p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-card rounded-xl border p-6 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <Star className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold">Sensory Feedback</h3>
                <p className="text-sm text-muted-foreground">Capture tasting feedback as your cider matures.</p>
              </div>
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {recentTastingNotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tasting notes recorded yet.</p>
              ) : (
                recentTastingNotes.map((note) => {
                  const profile: string[] = [];
                  if (typeof note.sweetness === 'number') profile.push(`Sweetness ${note.sweetness}/5`);
                  if (typeof note.acidity === 'number') profile.push(`Acidity ${note.acidity}/5`);
                  if (typeof note.body === 'number') profile.push(`Body ${note.body}/5`);

                  return (
                    <div key={note.id} className="border rounded-lg p-4 bg-background">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{note.batches?.name ?? 'Batch'}</p>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(note.recorded_at), 'MMM d, yyyy')}
                        </span>
                      </div>
                      {profile.length > 0 && (
                        <p className="text-sm text-muted-foreground mt-2">{profile.join(' • ')}</p>
                      )}
                      <div className="mt-2 space-y-1 text-sm text-foreground/90">
                        {note.aroma && <p><span className="font-medium">Aroma:</span> {note.aroma}</p>}
                        {note.flavor && <p><span className="font-medium">Flavor:</span> {note.flavor}</p>}
                        {note.finish && <p><span className="font-medium">Finish:</span> {note.finish}</p>}
                        {note.notes && <p className="text-muted-foreground">{note.notes}</p>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-card rounded-xl border p-6 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <ClipboardList className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold">Packaging Timeline</h3>
                <p className="text-sm text-muted-foreground">Track how your cider moves into finished goods.</p>
              </div>
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {upcomingPackaging.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming packaging events scheduled.</p>
              ) : (
                upcomingPackaging.map((schedule) => (
                  <div key={schedule.id} className="border rounded-lg p-4 bg-background">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{schedule.batches?.name ?? 'Batch'}</p>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(schedule.target_date), 'MMM d, yyyy')}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 capitalize">
                      {schedule.format.replace('-', ' ')}
                      {typeof schedule.quantity === 'number' ? ` • ${schedule.quantity} units` : ''}
                    </p>
                    {schedule.notes && (
                      <p className="text-sm mt-2 text-foreground/90 line-clamp-3">{schedule.notes}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

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
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="stage">Update Stage</TabsTrigger>
                <TabsTrigger value="metrics">Fermentation</TabsTrigger>
                <TabsTrigger value="notes">Tasting Notes</TabsTrigger>
                <TabsTrigger value="packaging">Packaging</TabsTrigger>
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
                        value={editFormData.volume === '' ? '' : editFormData.volume}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === "") {
                            setEditFormData({ ...editFormData, volume: '' });
                            return;
                          }

                          const parsed = Number(value);
                          if (Number.isFinite(parsed)) {
                            setEditFormData({ ...editFormData, volume: parsed });
                          }
                        }}
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
                    onClick={() => {
                      if (!organizationId) {
                        toast({
                          variant: 'destructive',
                          title: 'Error',
                          description: 'Organization context is missing.',
                        });
                        return;
                      }

                      if (typeof editFormData.volume !== 'number' || !Number.isFinite(editFormData.volume)) {
                        toast({
                          variant: 'destructive',
                          title: 'Invalid volume',
                          description: 'Please enter a valid numeric volume for the batch.',
                        });
                        return;
                      }

                      updateBatchMutation.mutate({
                        batchId: selectedBatch.id,
                        organizationId,
                        updates: {
                          name: editFormData.name,
                          variety: editFormData.variety,
                          volume: editFormData.volume,
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
                    
                    {(() => {
                      const transition = stageTransitions[selectedBatch.current_stage];
                      if (!transition) {
                        return (
                          <div className="flex items-center gap-2 p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                            <p className="text-sm font-medium text-green-900 dark:text-green-100">
                              This batch is complete!
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
                            transition.label
                          )}
                        </Button>
                      );
                    })()}
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

              {/* FERMENTATION TAB */}
              <TabsContent value="metrics" className="space-y-6">
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Thermometer className="h-4 w-4 text-primary" />
                    Log fermentation metrics
                  </h4>
                  <form className="space-y-4" onSubmit={handleAddFermentationLog}>
                    <div className="grid md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="fermentation-date">Recorded on</Label>
                        <Input
                          id="fermentation-date"
                          type="date"
                          value={newFermentationLog.recorded_at}
                          onChange={(e) => setNewFermentationLog({ ...newFermentationLog, recorded_at: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="fermentation-temp">Temperature (°C)</Label>
                        <Input
                          id="fermentation-temp"
                          type="number"
                          step="0.1"
                          value={newFermentationLog.temperature === '' ? '' : newFermentationLog.temperature}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === '') {
                              setNewFermentationLog({ ...newFermentationLog, temperature: '' });
                              return;
                            }
                            const parsed = Number(value);
                            if (Number.isFinite(parsed)) {
                              setNewFermentationLog({ ...newFermentationLog, temperature: parsed });
                            }
                          }}
                          placeholder="18.5"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="fermentation-sg">Specific Gravity</Label>
                        <Input
                          id="fermentation-sg"
                          type="number"
                          step="0.001"
                          value={newFermentationLog.specific_gravity === '' ? '' : newFermentationLog.specific_gravity}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === '') {
                              setNewFermentationLog({ ...newFermentationLog, specific_gravity: '' });
                              return;
                            }
                            const parsed = Number(value);
                            if (Number.isFinite(parsed)) {
                              setNewFermentationLog({ ...newFermentationLog, specific_gravity: parsed });
                            }
                          }}
                          placeholder="1.012"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="fermentation-ph">pH</Label>
                        <Input
                          id="fermentation-ph"
                          type="number"
                          step="0.01"
                          value={newFermentationLog.ph === '' ? '' : newFermentationLog.ph}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === '') {
                              setNewFermentationLog({ ...newFermentationLog, ph: '' });
                              return;
                            }
                            const parsed = Number(value);
                            if (Number.isFinite(parsed)) {
                              setNewFermentationLog({ ...newFermentationLog, ph: parsed });
                            }
                          }}
                          placeholder="3.5"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fermentation-notes">Notes</Label>
                      <Textarea
                        id="fermentation-notes"
                        value={newFermentationLog.notes}
                        onChange={(e) => setNewFermentationLog({ ...newFermentationLog, notes: e.target.value })}
                        placeholder="Aromas, yeast behavior, adjustments..."
                        rows={3}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button type="submit" disabled={createFermentationLogMutation.isPending}>
                        {createFermentationLogMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Saving...
                          </>
                        ) : (
                          'Save log'
                        )}
                      </Button>
                    </div>
                  </form>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-primary" />
                    Logged readings
                  </h4>
                  {fermentationLogsLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : fermentationLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No fermentation logs recorded for this batch yet.</p>
                  ) : (
                    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                      {fermentationLogs.map((log) => {
                        const metrics: string[] = [];
                        if (typeof log.temperature === 'number') metrics.push(`${log.temperature.toFixed(1)}°C`);
                        if (typeof log.specific_gravity === 'number') metrics.push(`SG ${log.specific_gravity.toFixed(3)}`);
                        if (typeof log.ph === 'number') metrics.push(`pH ${log.ph.toFixed(2)}`);

                        return (
                          <div key={log.id} className="border rounded-lg p-4 bg-muted/40">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="font-medium">{format(new Date(log.recorded_at), 'MMM d, yyyy')}</p>
                                {metrics.length > 0 && (
                                  <p className="text-sm text-muted-foreground">{metrics.join(' • ')}</p>
                                )}
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (!selectedBatchId) return;
                                  deleteFermentationLogMutation.mutate({ id: log.id, batchId: selectedBatchId });
                                }}
                                disabled={deleteFermentationLogMutation.isPending && deletingFermentationId === log.id}
                              >
                                {deleteFermentationLogMutation.isPending && deletingFermentationId === log.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                            {log.notes && (
                              <p className="text-sm text-foreground/90 mt-2">{log.notes}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* TASTING TAB */}
              <TabsContent value="notes" className="space-y-6">
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Star className="h-4 w-4 text-primary" />
                    Capture tasting note
                  </h4>
                  <form className="space-y-4" onSubmit={handleAddTastingNote}>
                    <div className="grid md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="tasting-date">Recorded on</Label>
                        <Input
                          id="tasting-date"
                          type="date"
                          value={newTastingNote.recorded_at}
                          onChange={(e) => setNewTastingNote({ ...newTastingNote, recorded_at: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Sweetness</Label>
                        <Select
                          value={String(newTastingNote.sweetness)}
                          onValueChange={(value) => setNewTastingNote({ ...newTastingNote, sweetness: Number(value) })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sweetness" />
                          </SelectTrigger>
                          <SelectContent>
                            {sensoryScale.map((level) => (
                              <SelectItem key={level} value={String(level)}>
                                {level}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Acidity</Label>
                        <Select
                          value={String(newTastingNote.acidity)}
                          onValueChange={(value) => setNewTastingNote({ ...newTastingNote, acidity: Number(value) })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Acidity" />
                          </SelectTrigger>
                          <SelectContent>
                            {sensoryScale.map((level) => (
                              <SelectItem key={level} value={String(level)}>
                                {level}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Body</Label>
                        <Select
                          value={String(newTastingNote.body)}
                          onValueChange={(value) => setNewTastingNote({ ...newTastingNote, body: Number(value) })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Body" />
                          </SelectTrigger>
                          <SelectContent>
                            {sensoryScale.map((level) => (
                              <SelectItem key={level} value={String(level)}>
                                {level}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="tasting-aroma">Aroma</Label>
                        <Textarea
                          id="tasting-aroma"
                          value={newTastingNote.aroma}
                          onChange={(e) => setNewTastingNote({ ...newTastingNote, aroma: e.target.value })}
                          rows={2}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tasting-flavor">Flavor</Label>
                        <Textarea
                          id="tasting-flavor"
                          value={newTastingNote.flavor}
                          onChange={(e) => setNewTastingNote({ ...newTastingNote, flavor: e.target.value })}
                          rows={2}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tasting-finish">Finish</Label>
                        <Textarea
                          id="tasting-finish"
                          value={newTastingNote.finish}
                          onChange={(e) => setNewTastingNote({ ...newTastingNote, finish: e.target.value })}
                          rows={2}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tasting-notes">Additional Notes</Label>
                      <Textarea
                        id="tasting-notes"
                        value={newTastingNote.notes}
                        onChange={(e) => setNewTastingNote({ ...newTastingNote, notes: e.target.value })}
                        placeholder="Pairing ideas, stylistic comments, adjustments..."
                        rows={3}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button type="submit" disabled={createTastingNoteMutation.isPending}>
                        {createTastingNoteMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Saving...
                          </>
                        ) : (
                          'Save tasting note'
                        )}
                      </Button>
                    </div>
                  </form>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Star className="h-4 w-4 text-primary" />
                    Recorded notes
                  </h4>
                  {tastingNotesLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : tastingNotes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No tasting notes recorded for this batch yet.</p>
                  ) : (
                    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                      {tastingNotes.map((note) => {
                        const profile: string[] = [];
                        if (typeof note.sweetness === 'number') profile.push(`Sweetness ${note.sweetness}/5`);
                        if (typeof note.acidity === 'number') profile.push(`Acidity ${note.acidity}/5`);
                        if (typeof note.body === 'number') profile.push(`Body ${note.body}/5`);

                        return (
                          <div key={note.id} className="border rounded-lg p-4 bg-muted/40">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="font-medium">{format(new Date(note.recorded_at), 'MMM d, yyyy')}</p>
                                {profile.length > 0 && (
                                  <p className="text-sm text-muted-foreground">{profile.join(' • ')}</p>
                                )}
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (!selectedBatchId) return;
                                  deleteTastingNoteMutation.mutate({ id: note.id, batchId: selectedBatchId });
                                }}
                                disabled={deleteTastingNoteMutation.isPending && deletingTastingId === note.id}
                              >
                                {deleteTastingNoteMutation.isPending && deletingTastingId === note.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                            <div className="mt-2 space-y-1 text-sm">
                              {note.aroma && <p><span className="font-medium">Aroma:</span> {note.aroma}</p>}
                              {note.flavor && <p><span className="font-medium">Flavor:</span> {note.flavor}</p>}
                              {note.finish && <p><span className="font-medium">Finish:</span> {note.finish}</p>}
                              {note.notes && <p className="text-muted-foreground">{note.notes}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* PACKAGING TAB */}
              <TabsContent value="packaging" className="space-y-6">
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-primary" />
                    Schedule packaging
                  </h4>
                  <form className="space-y-4" onSubmit={handleAddPackagingPlan}>
                    <div className="grid md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="packaging-date">Target date</Label>
                        <Input
                          id="packaging-date"
                          type="date"
                          value={newPackagingPlan.target_date}
                          onChange={(e) => setNewPackagingPlan({ ...newPackagingPlan, target_date: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="packaging-format">Format</Label>
                        <Select
                          value={newPackagingPlan.format}
                          onValueChange={(value) => setNewPackagingPlan({ ...newPackagingPlan, format: value as PackagingSchedule['format'] })}
                        >
                          <SelectTrigger id="packaging-format">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {packagingFormats.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="packaging-quantity">Quantity</Label>
                        <Input
                          id="packaging-quantity"
                          type="number"
                          min="0"
                          value={newPackagingPlan.quantity === '' ? '' : newPackagingPlan.quantity}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === '') {
                              setNewPackagingPlan({ ...newPackagingPlan, quantity: '' });
                              return;
                            }
                            const parsed = Number(value);
                            if (Number.isFinite(parsed)) {
                              setNewPackagingPlan({ ...newPackagingPlan, quantity: parsed });
                            }
                          }}
                          placeholder="240"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="packaging-notes">Notes</Label>
                        <Textarea
                          id="packaging-notes"
                          value={newPackagingPlan.notes}
                          onChange={(e) => setNewPackagingPlan({ ...newPackagingPlan, notes: e.target.value })}
                          rows={2}
                          placeholder="Labeling, delivery logistics, packaging line..."
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button type="submit" disabled={createPackagingScheduleMutation.isPending}>
                        {createPackagingScheduleMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Saving...
                          </>
                        ) : (
                          'Add to schedule'
                        )}
                      </Button>
                    </div>
                  </form>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <CalendarCheck className="h-4 w-4 text-primary" />
                    Packaging roadmap
                  </h4>
                  {packagingSchedulesLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : packagingSchedules.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No packaging timeline for this batch yet.</p>
                  ) : (
                    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                      {packagingSchedules.map((schedule) => {
                        const completed = Boolean(schedule.completed_at);
                        return (
                          <div key={schedule.id} className="border rounded-lg p-4 bg-muted/40 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="font-medium">{format(new Date(schedule.target_date), 'MMM d, yyyy')}</p>
                                <p className="text-sm text-muted-foreground capitalize">
                                  {schedule.format.replace('-', ' ')}
                                  {typeof schedule.quantity === 'number' ? ` • ${schedule.quantity} units` : ''}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={completed ? 'secondary' : 'outline'}>
                                  {completed
                                    ? `Completed ${format(new Date(schedule.completed_at as string), 'MMM d, yyyy')}`
                                    : 'Scheduled'}
                                </Badge>
                                {!completed && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleMarkPackagingComplete(schedule)}
                                    disabled={updatePackagingScheduleMutation.isPending && completingScheduleId === schedule.id}
                                  >
                                    {updatePackagingScheduleMutation.isPending && completingScheduleId === schedule.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      'Mark complete'
                                    )}
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => {
                                    if (!selectedBatchId) return;
                                    deletePackagingScheduleMutation.mutate({ id: schedule.id, batchId: selectedBatchId });
                                  }}
                                  disabled={deletePackagingScheduleMutation.isPending && deletingScheduleId === schedule.id}
                                >
                                  {deletePackagingScheduleMutation.isPending && deletingScheduleId === schedule.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </div>
                            {schedule.notes && <p className="text-sm text-foreground/90">{schedule.notes}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
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
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
