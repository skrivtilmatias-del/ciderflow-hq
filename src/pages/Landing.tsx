import { useNavigate } from 'react-router-dom';
import { Wine, TrendingUp, Users, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-accent to-background">
      {/* Header */}
      <header className="container mx-auto px-6 py-6">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wine className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold">CiderTrack</span>
          </div>
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost"
              onClick={() => navigate('/auth')}
            >
              Sign In
            </Button>
            <Button 
              onClick={() => navigate('/auth')}
            >
              Start Free Trial
            </Button>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-20 text-center">
        <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
          Manage Your Cider Production
          <br />
          Like a Pro
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          Track batches, manage blending, monitor inventory, and analyze your production 
          all in one beautiful platform built for cider makers.
        </p>
        <Button 
          size="lg"
          onClick={() => navigate('/auth')}
          className="gap-2"
        >
          Get Started Free
          <ArrowRight className="h-4 w-4" />
        </Button>
        <p className="text-sm text-muted-foreground mt-4">No credit card required • 14-day free trial</p>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-6 py-20">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-card rounded-xl border p-8 hover:shadow-lg transition-shadow">
            <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <Wine className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Batch Management</h3>
            <p className="text-muted-foreground">
              Track every batch from pressing to bottling. Monitor fermentation stages, 
              aging progress, and production timelines effortlessly.
            </p>
          </div>
          
          <div className="bg-card rounded-xl border p-8 hover:shadow-lg transition-shadow">
            <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Analytics & Insights</h3>
            <p className="text-muted-foreground">
              Get real-time insights into your production. Track volumes, yields, 
              and inventory levels with beautiful, easy-to-understand dashboards.
            </p>
          </div>
          
          <div className="bg-card rounded-xl border p-8 hover:shadow-lg transition-shadow">
            <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Team Collaboration</h3>
            <p className="text-muted-foreground">
              Work together seamlessly. Invite team members, assign roles, 
              and keep everyone aligned on production goals and progress.
            </p>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="container mx-auto px-6 py-20">
        <p className="text-center text-muted-foreground mb-8">Trusted by cider makers worldwide</p>
        <div className="flex flex-wrap justify-center gap-12 opacity-50">
          <div className="text-xl font-semibold">Apple Valley Cidery</div>
          <div className="text-xl font-semibold">Orchard Craft Co.</div>
          <div className="text-xl font-semibold">Heritage Ciders</div>
          <div className="text-xl font-semibold">Artisan Ferments</div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="container mx-auto px-6 py-20 text-center">
        <div className="bg-card rounded-2xl border p-12 max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold mb-4">Ready to modernize your cidery?</h2>
          <p className="text-muted-foreground mb-8">
            Join hundreds of cider makers who've streamlined their production with CiderTrack
          </p>
          <Button 
            size="lg"
            onClick={() => navigate('/auth')}
            className="gap-2"
          >
            Start Your Free Trial
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-6 text-center text-muted-foreground">
          <p>© 2024 CiderTrack. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
