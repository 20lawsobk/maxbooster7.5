import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/ui/Logo";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Sparkles,
  BarChart3,
  Share2,
  Megaphone,
  DollarSign,
  Check,
  ArrowRight,
  Play,
  Star,
  Music,
  Shield,
  Menu,
  Zap,
  Brain,
  Globe,
  Cpu,
  Rocket,
  Crown,
  Activity,
} from "lucide-react";

const stats = [
  { label: "Music creation", value: "AI-assisted", icon: Brain },
  { label: "Connected workflow", value: "Cross-platform", icon: Globe },
  { label: "Refund policy", value: "90 days", icon: Shield },
  { label: "Creator tools", value: "All-in-one", icon: Cpu },
];

const features = [
  {
    icon: Sparkles,
    title: "AI Studio & Mastering",
    description:
      "Create, mix, and master your tracks with AI assistance. Professional quality results in minutes, not days.",
    color: "from-cyan-500 to-blue-600",
    glow: "rgba(6,182,212,0.3)",
  },
  {
    icon: BarChart3,
    title: "Advanced Analytics",
    description:
      "Track your performance across all platforms with AI-powered predictions and real-time revenue forecasts.",
    color: "from-violet-500 to-purple-600",
    glow: "rgba(139,92,246,0.3)",
  },
  {
    icon: Share2,
    title: "AI Social Media Manager",
    description:
      "AI-powered content creation and scheduling for every major platform with autonomous approval workflows.",
    color: "from-emerald-500 to-teal-600",
    glow: "rgba(16,185,129,0.3)",
  },
  {
    icon: Megaphone,
    title: "Organic Marketing Tools",
    description:
      "AI-assisted campaign creation and optimization through your connected social accounts — zero ad spend required.",
    color: "from-amber-500 to-orange-600",
    glow: "rgba(245,158,11,0.3)",
  },
  {
    icon: DollarSign,
    title: "Royalty Management",
    description:
      "Automated royalty collection and distribution with Stripe integration for instant, guaranteed payouts.",
    color: "from-blue-500 to-indigo-600",
    glow: "rgba(59,130,246,0.3)",
  },
  {
    icon: Music,
    title: "Beat Marketplace",
    description:
      "Buy and sell beats with integrated peer-to-peer transactions, smart licensing, and zero platform fees.",
    color: "from-pink-500 to-rose-600",
    glow: "rgba(236,72,153,0.3)",
  },
];

const plans = [
  {
    name: "Monthly",
    price: "$49",
    period: "/month",
    description: "Perfect for getting started",
    features: [
      "All AI Tools",
      "Unlimited Projects",
      "Advanced Analytics",
      "Cloud Storage",
    ],
    popular: false,
  },
  {
    name: "Yearly",
    price: "$468",
    period: "/year",
    originalPrice: "$588",
    description: "Billed annually ($39/month)",
    features: [
      "All AI Tools",
      "Unlimited Projects",
      "Advanced Analytics",
      "Cloud Storage",
    ],
    popular: true,
  },
  {
    name: "Lifetime",
    price: "$699",
    period: "once",
    description: "Pay once, access forever",
    features: [
      "All AI Tools",
      "Unlimited Projects",
      "Advanced Analytics",
      "Cloud Storage",
    ],
    popular: false,
  },
];

async function getRequiredCsrfToken(): Promise<string> {
  const existingToken = getCsrfTokenFromCookie();
  if (existingToken) {
    return existingToken;
  }

  const response = await fetch("/api/csrf-token", {
    credentials: "include",
  });
  const body = (await response.json()) as { csrfToken?: unknown };

  if (!response.ok || typeof body.csrfToken !== "string" || !body.csrfToken) {
    throw new Error(
      "Unable to establish the security token required to sign in. Please refresh the page and try again.",
    );
  }

  return body.csrfToken;
}

function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    const els = document.querySelectorAll(".reveal");
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const particles: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      opacity: number;
      hue: number;
    }[] = [];

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.6 + 0.1,
        hue: Math.random() > 0.5 ? 43 : 265,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 96%, 58%, ${p.opacity})`;
        ctx.fill();

        particles.slice(i + 1, i + 6).forEach((p2) => {
          const dx = p.x - p2.x,
            dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.strokeStyle = `hsla(${p.hue}, 80%, 58%, ${0.08 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        });
      });
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}

export default function Landing() {
  const { toast } = useToast();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useScrollReveal();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const startDemo = async () => {
    setIsDemoLoading(true);
    try {
      const csrfToken = await getRequiredCsrfToken();
      const response = await fetch("/api/auth/demo", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
      });
      if (response.ok) {
        window.location.href = "/dashboard";
      } else if (response.status === 429) {
        toast({
          title: "Too many requests",
          description: "Please try again later.",
          variant: "destructive",
        });
      } else {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
          error?: string;
        } | null;
        toast({
          title: "Unable to start demo",
          description:
            payload?.message ??
            payload?.error ??
            "The demo account could not be started. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Unable to start demo",
        description:
          error instanceof Error
            ? error.message
            : "A network error prevented the demo from starting. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen landing-dark-bg text-white overflow-x-hidden page-enter">
      {/* Navigation */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? "landing-nav-scrolled" : "bg-transparent"}`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <Logo size="md" className="landing-logo-glow" />
            </div>

            <div className="hidden sm:flex items-center space-x-1 md:space-x-2">
              <Link href="/features">
                <Button variant="ghost" size="sm" className="landing-nav-link">
                  Features
                </Button>
              </Link>
              <Link href="/pricing">
                <Button variant="ghost" size="sm" className="landing-nav-link">
                  Pricing
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="ghost" size="sm" className="landing-nav-link">
                  Sign In
                </Button>
              </Link>
              <Link href="/pricing">
                <Button size="sm" className="landing-cta-btn">
                  Get Started
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>

            <div className="flex sm:hidden items-center gap-2">
              <Link href="/pricing">
                <Button size="sm" className="landing-cta-btn text-xs px-3">
                  Get Started
                </Button>
              </Link>
              <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white/80 hover:text-white"
                  >
                    <Menu className="h-6 w-6" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="right"
                  className="w-64 landing-mobile-sheet"
                >
                  <SheetHeader>
                    <SheetTitle className="text-white">Menu</SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col space-y-4 mt-8">
                    <Link href="/features">
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-white/80 hover:text-white"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        Features
                      </Button>
                    </Link>
                    <Link href="/pricing">
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-white/80 hover:text-white"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        Pricing
                      </Button>
                    </Link>
                    <Link href="/login">
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-white/80 hover:text-white"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        Sign In
                      </Button>
                    </Link>
                    <Link href="/pricing">
                      <Button
                        className="w-full landing-cta-btn"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        Get Started
                      </Button>
                    </Link>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-4 pt-16 pb-20 sm:px-6 lg:px-8 overflow-hidden">
        <ParticleField />

        {/* Ambient orbs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="landing-orb-gold" />
          <div className="landing-orb-purple" />
          <div className="landing-grid-overlay" />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto text-center">
          {/* Status badge */}
          <div className="flex justify-center mb-8">
            <span className="landing-status-badge">
              <span className="landing-status-dot" />
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <span>AI-powered tools — 90-Day Money-Back Guarantee</span>
              <Shield className="h-3.5 w-3.5 text-emerald-400" />
            </span>
          </div>

          {/* Main heading */}
          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight mb-6 leading-none">
            <span className="block text-white hero-text-animate hero-text-animate-1">
              Music Career
            </span>
            <span className="block landing-hero-gradient hero-text-animate hero-text-animate-2">
              Management
            </span>
            <span className="block text-white/90 text-4xl sm:text-5xl lg:text-6xl font-bold mt-2 hero-text-animate hero-text-animate-3">
              Powered by <span className="landing-ai-text">AI</span>
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-white/70 mb-10 max-w-3xl mx-auto leading-relaxed hero-text-animate hero-text-animate-4">
            The most advanced music career platform ever built — AI Studio,
            Social Media Autopilot, Beat Marketplace, Analytics, and
            Distribution all in one place.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link href="/pricing">
              <Button size="lg" className="landing-primary-btn group">
                <Rocket className="mr-2 h-5 w-5 group-hover:animate-bounce" />
                Get Started — 90-Day Guarantee
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Button
              size="lg"
              className="landing-secondary-btn"
              onClick={startDemo}
              disabled={isDemoLoading}
              data-testid="button-watch-demo"
            >
              {isDemoLoading ? (
                <>
                  <div className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Starting Demo…
                </>
              ) : (
                <>
                  <Play className="mr-2 h-5 w-5" />
                  Try Live Demo
                </>
              )}
            </Button>
          </div>

          {/* Floating stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {stats.map((stat, index) => (
              <div key={index} className="landing-stat-card">
                <div className="landing-stat-icon">
                  <stat.icon className="h-5 w-5" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-white">
                  {stat.value}
                </div>
                <div className="text-xs text-white/50 mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 landing-scroll-indicator">
          <div className="landing-scroll-dot" />
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 relative overflow-hidden landing-section-divider">
        <div className="absolute inset-0 landing-features-bg pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-16 reveal">
            <Badge className="landing-section-badge mb-4">
              <Cpu className="h-3.5 w-3.5 mr-1.5" />
              Cutting-Edge Technology
            </Badge>
            <h2 className="text-4xl sm:text-5xl font-black text-white mb-4">
              Everything You Need to{" "}
              <span className="landing-hero-gradient">Succeed</span>
            </h2>
            <p className="text-xl text-white/60 max-w-2xl mx-auto">
              From creation to monetization — Max Booster is the unfair
              advantage every independent artist deserves.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className={`landing-feature-card group reveal reveal-delay-${(index % 3) + 1}`}
              >
                <div
                  className="landing-feature-glow"
                  style={
                    { "--glow-color": feature.glow } as React.CSSProperties
                  }
                />
                <div
                  className={`landing-feature-icon bg-gradient-to-br ${feature.color}`}
                >
                  <feature.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2 group-hover:text-amber-300 transition-colors">
                  {feature.title}
                </h3>
                <p className="text-white/60 text-sm leading-relaxed">
                  {feature.description}
                </p>
                <div className="landing-feature-border" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 landing-pricing-bg pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="reveal">
            <Badge className="landing-section-badge mb-4">
              <Crown className="h-3.5 w-3.5 mr-1.5" />
              Simple Pricing
            </Badge>
            <h2 className="text-4xl sm:text-5xl font-black text-white mb-4">
              Choose Your <span className="landing-hero-gradient">Level</span>
            </h2>
            <p className="text-xl text-white/60 mb-16 max-w-2xl mx-auto">
              All plans include every AI feature. No hidden fees, no paywalled
              tools.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {plans.map((plan, index) => (
              <div
                key={index}
                className={`landing-pricing-card reveal reveal-delay-${index + 1} ${plan.popular ? "landing-pricing-popular" : ""}`}
              >
                {plan.popular && (
                  <div className="landing-popular-badge">
                    <Star className="h-3.5 w-3.5 mr-1" />
                    Most Popular
                  </div>
                )}
                <div className="p-6">
                  <h3 className="text-lg font-bold text-white/80 mb-1">
                    {plan.name}
                  </h3>
                  <div className="mb-2">
                    <span className="text-5xl font-black text-white">
                      {plan.price}
                    </span>
                    <span className="text-white/40 ml-1">{plan.period}</span>
                  </div>
                  {plan.originalPrice && (
                    <div className="text-xs text-white/30 line-through mb-1">
                      {plan.originalPrice}
                    </div>
                  )}
                  <p className="text-white/50 text-sm mb-6">
                    {plan.description}
                  </p>
                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature, idx) => (
                      <li
                        key={idx}
                        className="flex items-center gap-2 text-sm text-white/70"
                      >
                        <div className="h-4 w-4 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                          <Check className="h-2.5 w-2.5 text-emerald-400" />
                        </div>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link href={`/register/payment/${plan.name.toLowerCase()}`}>
                    <Button
                      className={`w-full ${plan.popular ? "landing-cta-btn" : "landing-pricing-outline-btn"}`}
                    >
                      Get Started
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10">
            <Link href="/pricing">
              <Button
                variant="ghost"
                size="lg"
                className="text-white/50 hover:text-white"
              >
                View Detailed Pricing
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* What's Included */}
      <section className="py-24 landing-section-divider">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 reveal">
            <h2 className="text-4xl sm:text-5xl font-black text-white mb-4">
              What's <span className="landing-hero-gradient">Included</span>
            </h2>
            <p className="text-xl text-white/60">
              Everything to create, promote, and monetize your music
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Sparkles,
                title: "AI-Powered Studio",
                content:
                  "Professional DAW with AI mixing and mastering tools, multi-track editing, effects, and cloud storage for all your projects.",
                color: "from-cyan-500 to-blue-600",
              },
              {
                icon: Share2,
                title: "Social Media Manager",
                content:
                  "Connect Facebook, Instagram, X, TikTok, LinkedIn, Threads, and YouTube. AI-assisted content creation with approval workflows.",
                color: "from-violet-500 to-purple-600",
              },
              {
                icon: BarChart3,
                title: "Advanced Analytics",
                content:
                  "Track performance across all platforms with AI-powered predictions, churn detection, revenue forecasts, and detailed insights.",
                color: "from-amber-500 to-orange-600",
              },
            ].map((item, index) => (
              <div
                key={index}
                className={`landing-include-card reveal reveal-delay-${index + 1}`}
              >
                <div
                  className={`landing-include-icon bg-gradient-to-br ${item.color}`}
                >
                  <item.icon className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">
                  {item.title}
                </h3>
                <p className="text-white/50 text-sm leading-relaxed">
                  {item.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="landing-cta-bg" />
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8 relative z-10 reveal">
          <div className="flex justify-center mb-6">
            <span className="landing-status-badge">
              <Shield className="h-4 w-4 text-emerald-400" />
              90-Day Money Back Guarantee
            </span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-black text-white mb-4">
            Ready to <span className="landing-hero-gradient">Dominate</span>?
          </h2>
          <p className="text-xl text-white/65 mb-10">
            Bring your creation, promotion, analytics, and monetization workflow
            together. Protected by our 90-day money-back guarantee.
          </p>
          <Link href="/pricing">
            <Button
              size="lg"
              className="landing-primary-btn group px-10 py-6 text-lg"
            >
              <Rocket className="mr-2 h-5 w-5 group-hover:animate-bounce" />
              Get Started — 90-Day Guarantee
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          <p className="text-sm mt-6 text-white/30">
            Secure payment • Cancel anytime • 100% money back within 90 days
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="md:col-span-1">
              <Logo size="md" className="mb-4" />
              <p className="text-white/40 text-sm leading-relaxed">
                The most advanced AI-powered music career management platform.
              </p>
            </div>
            <div>
              <h4 className="text-white/70 font-semibold text-sm uppercase tracking-wider mb-4">
                Product
              </h4>
              <ul className="space-y-2">
                {[
                  { label: "Features", href: "/features" },
                  { label: "Pricing", href: "/pricing" },
                  { label: "Documentation", href: "/documentation" },
                ].map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>
                      <span className="text-white/40 hover:text-white text-sm transition-colors cursor-pointer">
                        {link.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-white/70 font-semibold text-sm uppercase tracking-wider mb-4">
                Company
              </h4>
              <ul className="space-y-2">
                {[
                  { label: "About", href: "/about" },
                  { label: "Blog", href: "/blog" },
                  { label: "API", href: "/api" },
                ].map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>
                      <span className="text-white/40 hover:text-white text-sm transition-colors cursor-pointer">
                        {link.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-white/70 font-semibold text-sm uppercase tracking-wider mb-4">
                Legal
              </h4>
              <ul className="space-y-2">
                {[
                  { label: "Privacy Policy", href: "/privacy" },
                  { label: "Terms of Service", href: "/terms" },
                  { label: "DMCA", href: "/dmca" },
                ].map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>
                      <span className="text-white/40 hover:text-white text-sm transition-colors cursor-pointer">
                        {link.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-white/30 text-sm">
              © {new Date().getFullYear()} Max Booster by B-Lawz Music. All
              rights reserved.
            </p>
            <div className="flex items-center gap-2 text-white/30 text-sm">
              <Activity className="h-3.5 w-3.5 text-emerald-400" />
              Explore Max Booster
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
