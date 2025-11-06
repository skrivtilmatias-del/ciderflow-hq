import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasOrganization, setHasOrganization] = useState(false);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => {
            checkOrganization(session.user.id);
          }, 0);
        } else {
          setHasOrganization(false);
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        checkOrganization(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function checkOrganization(userId: string) {
    try {
      const { data, error } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .maybeSingle();

      setHasOrganization(!!data && !error);
    } catch (err) {
      setHasOrganization(false);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Landing />} />
            <Route path="/auth" element={user ? <Navigate to="/dashboard" /> : <Auth />} />
            
            {/* Protected routes */}
            <Route 
              path="/onboarding" 
              element={
                user 
                  ? (hasOrganization ? <Navigate to="/dashboard" /> : <Onboarding />) 
                  : <Navigate to="/auth" />
              } 
            />
            <Route 
              path="/dashboard" 
              element={
                user 
                  ? (hasOrganization ? <Dashboard /> : <Navigate to="/onboarding" />) 
                  : <Navigate to="/auth" />
              } 
            />
            <Route 
              path="/settings" 
              element={
                user 
                  ? (hasOrganization ? <Settings /> : <Navigate to="/onboarding" />) 
                  : <Navigate to="/auth" />
              } 
            />
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
