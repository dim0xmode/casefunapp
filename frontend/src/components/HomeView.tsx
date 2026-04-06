import React, { useEffect, useState, useRef } from 'react';
import { ArrowRight, Sparkles, Zap, Shield, TrendingUp, Rocket, Clock3, ShieldCheck, XCircle, X } from 'lucide-react';

type EarlyAccessRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
type EarlyAccessBlockReason =
  | 'PENDING_REVIEW'
  | 'ALREADY_APPROVED'
  | 'ALREADY_EARLY_ACCESS'
  | 'ADMIN_ACCOUNT'
  | 'SUPPORT_ACCOUNT'
  | 'REFERRAL_SIGNUP'
  | null;

interface EarlyAccessStatusPayload {
  canSubmit: boolean;
  blockReason: EarlyAccessBlockReason;
  request: {
    id: string;
    status: EarlyAccessRequestStatus;
    reviewedAt: string | null;
  } | null;
}

const getEarlyAccessBlockMessage = (reason: EarlyAccessBlockReason) => {
  switch (reason) {
    case 'PENDING_REVIEW':
      return 'Your request is currently under review.';
    case 'ALREADY_APPROVED':
      return 'Your request has already been approved.';
    case 'ALREADY_EARLY_ACCESS':
      return 'You already have early access.';
    case 'ADMIN_ACCOUNT':
      return 'Administrators cannot submit early access requests.';
    case 'SUPPORT_ACCOUNT':
      return 'Support accounts cannot submit early access requests.';
    case 'REFERRAL_SIGNUP':
      return 'Referral signups get early access automatically after the first confirmed on-chain deposit. No application is required.';
    default:
      return 'Early access request is currently unavailable.';
  }
};

interface HomeViewProps {
  onCreateCase: () => void;
  isAuthenticated: boolean;
  onOpenWalletConnect: () => void;
  onSubmitEarlyAccess: (payload: { contact: string; message: string }) => Promise<void>;
  earlyAccessSubmitting: boolean;
  earlyAccessStatus: EarlyAccessStatusPayload | null;
}

// Animated Counter Component
const AnimatedCounter: React.FC<{ end: number; suffix?: string; duration?: number }> = ({ 
  end, 
  suffix = '', 
  duration = 2000 
}) => {
  const [count, setCount] = useState(0);
  const countRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          let start = 0;
          const increment = end / (duration / 16);
          const timer = setInterval(() => {
            start += increment;
            if (start >= end) {
              setCount(end);
              clearInterval(timer);
            } else {
              setCount(Math.floor(start));
            }
          }, 16);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    if (countRef.current) observer.observe(countRef.current);
    return () => observer.disconnect();
  }, [end, duration]);

  return <span ref={countRef}>{count}{suffix}</span>;
};

export const HomeView: React.FC<HomeViewProps> = ({
  onCreateCase,
  isAuthenticated,
  onOpenWalletConnect,
  onSubmitEarlyAccess,
  earlyAccessSubmitting,
  earlyAccessStatus,
}) => {
  const [isVisible, setIsVisible] = useState<{ [key: string]: boolean }>({});
  const [isEarlyAccessOpen, setIsEarlyAccessOpen] = useState(false);
  const [earlyAccessContact, setEarlyAccessContact] = useState('');
  const [earlyAccessMessage, setEarlyAccessMessage] = useState('');
  const [earlyAccessFormStatus, setEarlyAccessFormStatus] = useState<string | null>(null);
  const [earlyAccessClickNotice, setEarlyAccessClickNotice] = useState<string | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible((prev) => ({ ...prev, [entry.target.id]: true }));
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll('[data-animate]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const earlyAccessCharsLeft = 200 - earlyAccessMessage.length;
  const isEarlyAccessBlocked = Boolean(earlyAccessStatus && !earlyAccessStatus.canSubmit);
  const earlyAccessBlockMessage = isEarlyAccessBlocked
    ? getEarlyAccessBlockMessage(earlyAccessStatus?.blockReason || null)
    : null;
  const latestRequestStatus = earlyAccessStatus?.request?.status || null;
  const showLatestRequestStatus = Boolean(
    latestRequestStatus &&
    (latestRequestStatus !== 'APPROVED' || isEarlyAccessBlocked)
  );

  useEffect(() => {
    if (!isEarlyAccessBlocked) {
      setEarlyAccessClickNotice(null);
    }
  }, [isEarlyAccessBlocked]);

  const closeEarlyAccessModal = () => {
    setIsEarlyAccessOpen(false);
    setEarlyAccessFormStatus(null);
  };

  const handleEarlyAccessButtonClick = () => {
    if (!isAuthenticated) {
      onOpenWalletConnect();
      return;
    }
    if (isEarlyAccessBlocked) {
      setEarlyAccessClickNotice(earlyAccessBlockMessage || 'Early access request is currently unavailable.');
      return;
    }
    setEarlyAccessClickNotice(null);
    setEarlyAccessFormStatus(null);
    setIsEarlyAccessOpen(true);
  };

  const handleEarlyAccessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onOpenWalletConnect();
      return;
    }
    if (isEarlyAccessBlocked) {
      setEarlyAccessFormStatus(earlyAccessBlockMessage || 'Early access request is currently unavailable.');
      return;
    }
    const safeContact = earlyAccessContact.trim();
    const safeMessage = earlyAccessMessage.trim();
    if (!safeContact || safeContact.length < 2 || safeContact.length > 100) {
      setEarlyAccessFormStatus('Telegram contact is required (2-100 chars).');
      return;
    }
    if (!safeMessage || safeMessage.length > 200) {
      setEarlyAccessFormStatus('Message is required (max 200 chars).');
      return;
    }
    setEarlyAccessFormStatus(null);
    try {
      await onSubmitEarlyAccess({ contact: safeContact, message: safeMessage });
      setEarlyAccessContact('');
      setEarlyAccessMessage('');
      setEarlyAccessFormStatus('Request sent. We will review it soon.');
    } catch (error: any) {
      setEarlyAccessFormStatus(error?.message || 'Failed to send early access request.');
    }
  };

  // Parallax effect on scroll (removed unused scrollY state)

  return (
    <div className="w-full min-h-screen text-white overflow-x-hidden relative">
      {/* Block 1: Hero Section */}
      <section className="relative min-h-[95vh] flex flex-col items-center justify-center text-center px-4 overflow-hidden">
        <div className="z-10 max-w-6xl space-y-8 flex flex-col items-center">
          {/* Badge with animation */}
          <div 
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-web3-accent/10 to-web3-purple/10 border border-web3-accent/30 text-web3-accent text-xs font-bold uppercase tracking-widest mb-4 animate-fade-in backdrop-blur-sm"
            style={{ animation: 'fadeInUp 0.6s ease-out' }}
          >
            <Sparkles size={14} className="animate-pulse" />
            Welcome to CaseFun
            <Sparkles size={14} className="animate-pulse" />
          </div>

          {/* Main Heading with stagger animation */}
          <h1 
            className="text-6xl md:text-8xl font-black tracking-tighter leading-tight"
            style={{ animation: 'fadeInUp 0.8s ease-out 0.2s backwards' }}
          >
            Your Token, Your Cases, <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-web3-accent via-white to-web3-purple animate-gradient">
              Your Rules.
            </span>
          </h1>
          
          <p 
            className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto leading-relaxed mb-8"
            style={{ animation: 'fadeInUp 1s ease-out 0.4s backwards' }}
          >
            Turn your token into an exciting game. Create custom loot boxes, launch battles, and grow your community in a single click.
          </p>

          {/* CTA Buttons with pulse animation */}
          <div 
            className="flex flex-col sm:flex-row items-center justify-center gap-6 mt-8 w-full"
            style={{ animation: 'fadeInUp 1.4s ease-out 0.8s backwards' }}
          >
            <button
              onClick={onCreateCase}
              className="group relative w-full sm:w-auto px-12 py-6 text-xl font-black rounded-xl bg-gradient-to-r from-web3-accent to-web3-success text-black overflow-hidden transform transition-all duration-300 hover:scale-105 hover:shadow-[0_0_60px_rgba(102,252,241,0.6)]"
            >
              {/* Animated shine effect */}
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
              <span className="relative flex items-center gap-2">
                <Rocket className="w-6 h-6" />
                Create a Case
                <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </span>
              {/* Pulse rings */}
              <span className="absolute -inset-2 rounded-xl bg-web3-accent/30 animate-ping opacity-75"></span>
            </button>

            <button
              onClick={handleEarlyAccessButtonClick}
              className="w-full sm:w-auto px-12 py-6 text-xl font-bold rounded-xl border-2 border-web3-purple/45 text-white hover:border-web3-purple/75 hover:bg-web3-purple/10 transition-all duration-300 backdrop-blur-sm"
            >
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-web3-purple" />
                Early Access
              </span>
            </button>
            
            <button
              onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
              className="w-full sm:w-auto px-12 py-6 text-xl font-bold rounded-xl border-2 border-white/20 hover:border-web3-accent/50 hover:bg-white/5 transition-all duration-300 backdrop-blur-sm"
            >
              Learn More
            </button>
          </div>
          {earlyAccessClickNotice && (
            <div className="mt-4 px-4 py-2 rounded-xl border border-web3-purple/30 bg-web3-purple/10 text-sm text-web3-purple max-w-xl">
              {earlyAccessClickNotice}
            </div>
          )}
        </div>
      </section>

      {/* Block 2: How It Works */}
      <section id="how-it-works" className="py-24 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div 
            className="text-center mb-20"
            data-animate
            id="how-section"
            style={{ 
              opacity: isVisible['how-section'] ? 1 : 0,
              transform: isVisible['how-section'] ? 'translateY(0)' : 'translateY(30px)',
              transition: 'all 0.8s ease-out'
            }}
          >
            <h2 className="text-5xl font-black mb-4 uppercase tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
              How It Works
            </h2>
            <p className="text-gray-400 text-2xl max-w-2xl mx-auto font-bold">
              Simple. Fair. Effective.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Step 1 */}
            <div 
              data-animate
              id="step-1"
              className="group relative bg-gradient-to-br from-web3-card to-web3-card/50 p-10 rounded-3xl border border-gray-800 hover:border-web3-accent/50 transition-all duration-500 overflow-hidden"
              style={{ 
                opacity: isVisible['step-1'] ? 1 : 0,
                transform: isVisible['step-1'] ? 'translateY(0)' : 'translateY(50px)',
                transition: 'all 0.8s ease-out 0.2s'
              }}
            >
              {/* Glow effect */}
              <div className="absolute inset-0 bg-web3-accent/0 group-hover:bg-web3-accent/5 transition-all duration-500"></div>
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-web3-accent/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-500"></div>
              
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-web3-accent to-web3-accent/50 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                  <Sparkles className="w-8 h-8 text-black" />
                </div>
                <div className="text-6xl font-black text-web3-accent/20 mb-4">01</div>
                <h3 className="text-3xl font-black mb-4 text-web3-accent">Create</h3>
                <p className="text-gray-300 leading-relaxed text-lg">
                  Launch your own token directly on the platform. Set your prizes and odds—our algorithm instantly handles the math for your cases.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div 
              data-animate
              id="step-2"
              className="group relative bg-gradient-to-br from-web3-card to-web3-card/50 p-10 rounded-3xl border border-gray-800 hover:border-web3-success/50 transition-all duration-500 overflow-hidden"
              style={{ 
                opacity: isVisible['step-2'] ? 1 : 0,
                transform: isVisible['step-2'] ? 'translateY(0)' : 'translateY(50px)',
                transition: 'all 0.8s ease-out 0.4s'
              }}
            >
              <div className="absolute inset-0 bg-web3-success/0 group-hover:bg-web3-success/5 transition-all duration-500"></div>
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-web3-success/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-500"></div>
              
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-web3-success to-web3-success/50 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                  <Rocket className="w-8 h-8 text-black" />
                </div>
                <div className="text-6xl font-black text-web3-success/20 mb-4">02</div>
                <h3 className="text-3xl font-black mb-4 text-web3-success">Launch</h3>
                <p className="text-gray-300 leading-relaxed text-lg">
                  Share the link with your audience. Your holders get the thrill of the game, while your token gains activity and volume.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div 
              data-animate
              id="step-3"
              className="group relative bg-gradient-to-br from-web3-card to-web3-card/50 p-10 rounded-3xl border border-gray-800 hover:border-web3-purple/50 transition-all duration-500 overflow-hidden"
              style={{ 
                opacity: isVisible['step-3'] ? 1 : 0,
                transform: isVisible['step-3'] ? 'translateY(0)' : 'translateY(50px)',
                transition: 'all 0.8s ease-out 0.6s'
              }}
            >
              <div className="absolute inset-0 bg-web3-purple/0 group-hover:bg-web3-purple/5 transition-all duration-500"></div>
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-web3-purple/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-500"></div>
              
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-web3-purple to-web3-purple/50 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                  <TrendingUp className="w-8 h-8 text-black" />
                </div>
                <div className="text-6xl font-black text-web3-purple/20 mb-4">03</div>
                <h3 className="text-3xl font-black mb-4 text-web3-purple">Scale</h3>
                <p className="text-gray-300 leading-relaxed text-lg">
                  Track your results and create new case collections to keep your fans engaged.
                </p>
              </div>
            </div>

            {/* Connecting line */}
            <div className="hidden md:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-web3-accent/30 to-transparent -translate-y-1/2 pointer-events-none"></div>
          </div>
        </div>
      </section>

      {/* Block 3: Core Functions */}
      <section className="py-24 px-6 relative overflow-hidden">
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div 
            className="text-center mb-20"
            data-animate
            id="core-section"
            style={{ 
              opacity: isVisible['core-section'] ? 1 : 0,
              transform: isVisible['core-section'] ? 'translateY(0)' : 'translateY(30px)',
              transition: 'all 0.8s ease-out'
            }}
          >
            <h2 className="text-5xl font-black mb-4 uppercase tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
              Core Functions
            </h2>
            <p className="text-gray-400 text-xl">Choose your game mode</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Cases Card */}
            <div 
              data-animate
              id="feature-1"
              className="group relative bg-gradient-to-br from-web3-card via-web3-card to-web3-accent/5 p-8 rounded-3xl border border-gray-800 hover:border-web3-gold/50 overflow-hidden transition-all duration-500 hover:scale-105"
              style={{ 
                opacity: isVisible['feature-1'] ? 1 : 0,
                transform: isVisible['feature-1'] ? 'scale(1)' : 'scale(0.9)',
                transition: 'all 0.6s ease-out 0.2s'
              }}
            >
              {/* Animated background */}
              <div className="absolute inset-0 bg-gradient-to-br from-web3-gold/0 to-web3-gold/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="absolute -bottom-20 -right-20 w-60 h-60 bg-web3-gold/20 rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700"></div>
              
              <div className="relative z-10">
                <div className="text-5xl mb-6 group-hover:scale-125 group-hover:rotate-12 transition-all duration-500">📦</div>
                <h3 className="text-3xl font-black mb-4 text-white group-hover:text-web3-gold transition-colors duration-300">
                  Cases (Classic)
                </h3>
                <p className="text-gray-300 leading-relaxed text-lg mb-6">
                  Classic unboxing experience. Test your luck and claim project tokens directly to your wallet. Fast, transparent, and fair.
                </p>
                <div className="flex items-center gap-2 text-web3-gold font-bold">
                  <span>Try Now</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform" />
                </div>
              </div>
            </div>

            {/* Battle Card */}
            <div 
              data-animate
              id="feature-2"
              className="group relative bg-gradient-to-br from-web3-card via-web3-card to-web3-danger/5 p-8 rounded-3xl border border-gray-800 hover:border-web3-danger/50 overflow-hidden transition-all duration-500 hover:scale-105"
              style={{ 
                opacity: isVisible['feature-2'] ? 1 : 0,
                transform: isVisible['feature-2'] ? 'scale(1)' : 'scale(0.9)',
                transition: 'all 0.6s ease-out 0.4s'
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-web3-danger/0 to-web3-danger/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="absolute -bottom-20 -right-20 w-60 h-60 bg-web3-danger/20 rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700"></div>
              
              <div className="relative z-10">
                <div className="text-5xl mb-6 group-hover:scale-125 group-hover:rotate-12 transition-all duration-500">⚔️</div>
                <h3 className="text-3xl font-black mb-4 text-white group-hover:text-web3-danger transition-colors duration-300">
                  Case Battle (Duels)
                </h3>
                <p className="text-gray-300 leading-relaxed text-lg mb-6">
                  A battle of luck! Create a duel and wait for a real opponent or fight a bot. Player with the highest total token value takes the pot.
                </p>
                <div className="flex items-center gap-2 text-web3-danger font-bold">
                  <span>Challenge</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform" />
                </div>
              </div>
            </div>

            {/* Upgrade Card */}
            <div 
              data-animate
              id="feature-3"
              className="group relative bg-gradient-to-br from-web3-card via-web3-card to-web3-purple/5 p-8 rounded-3xl border border-gray-800 hover:border-web3-purple/50 overflow-hidden transition-all duration-500 hover:scale-105"
              style={{ 
                opacity: isVisible['feature-3'] ? 1 : 0,
                transform: isVisible['feature-3'] ? 'scale(1)' : 'scale(0.9)',
                transition: 'all 0.6s ease-out 0.6s'
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-web3-purple/0 to-web3-purple/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="absolute -bottom-20 -right-20 w-60 h-60 bg-web3-purple/20 rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700"></div>
              
              <div className="relative z-10">
                <div className="text-5xl mb-6 group-hover:scale-125 group-hover:rotate-12 transition-all duration-500">⚡</div>
                <h3 className="text-3xl font-black mb-4 text-white group-hover:text-web3-purple transition-colors duration-300">
                  Upgrade (Power-up)
                </h3>
                <p className="text-gray-300 leading-relaxed text-lg mb-6">
                  Risk it all to turn your tokens into a massive jackpot! System calculates your odds. One click: secure the prize or try again.
                </p>
                <div className="flex items-center gap-2 text-web3-purple font-bold">
                  <span>Power Up</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Block 4: Why CaseFun? */}
      <section className="py-24 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div 
            className="text-center mb-20"
            data-animate
            id="why-section"
            style={{ 
              opacity: isVisible['why-section'] ? 1 : 0,
              transform: isVisible['why-section'] ? 'translateY(0)' : 'translateY(30px)',
              transition: 'all 0.8s ease-out'
            }}
          >
            <h2 className="text-5xl font-black mb-4 uppercase tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
              Why CaseFun?
            </h2>
            <p className="text-gray-400 text-xl">Built for creators, loved by communities</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div 
              data-animate
              id="why-1"
              className="group bg-web3-card/50 backdrop-blur-sm p-8 rounded-2xl border border-gray-800 hover:border-web3-accent/50 hover:bg-web3-card transition-all duration-500"
              style={{ 
                opacity: isVisible['why-1'] ? 1 : 0,
                transform: isVisible['why-1'] ? 'translateX(0)' : 'translateX(-30px)',
                transition: 'all 0.6s ease-out 0.2s'
              }}
            >
              <div className="w-14 h-14 rounded-xl bg-web3-accent/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Zap className="w-7 h-7 text-web3-accent" />
              </div>
              <h3 className="text-2xl font-bold mb-4 text-web3-accent">Full Automation</h3>
              <p className="text-gray-300 leading-relaxed text-lg">
                System manages prize distribution and odds calculation automatically. You just sit back and watch the results.
              </p>
            </div>

            <div 
              data-animate
              id="why-2"
              className="group bg-web3-card/50 backdrop-blur-sm p-8 rounded-2xl border border-gray-800 hover:border-web3-success/50 hover:bg-web3-card transition-all duration-500"
              style={{ 
                opacity: isVisible['why-2'] ? 1 : 0,
                transform: isVisible['why-2'] ? 'translateY(0)' : 'translateY(30px)',
                transition: 'all 0.6s ease-out 0.4s'
              }}
            >
              <div className="w-14 h-14 rounded-xl bg-web3-success/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Shield className="w-7 h-7 text-web3-success" />
              </div>
              <h3 className="text-2xl font-bold mb-4 text-web3-success">Provably Fair</h3>
              <p className="text-gray-300 leading-relaxed text-lg">
                We use transparent algorithms. Every player knows their exact win probability before they even click.
              </p>
            </div>

            <div 
              data-animate
              id="why-3"
              className="group bg-web3-card/50 backdrop-blur-sm p-8 rounded-2xl border border-gray-800 hover:border-web3-purple/50 hover:bg-web3-card transition-all duration-500"
              style={{ 
                opacity: isVisible['why-3'] ? 1 : 0,
                transform: isVisible['why-3'] ? 'translateX(0)' : 'translateX(30px)',
                transition: 'all 0.6s ease-out 0.6s'
              }}
            >
              <div className="w-14 h-14 rounded-xl bg-web3-purple/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Sparkles className="w-7 h-7 text-web3-purple" />
              </div>
              <h3 className="text-2xl font-bold mb-4 text-web3-purple">No-Code Launch</h3>
              <p className="text-gray-300 leading-relaxed text-lg">
                No developer skills required. Everything—from cases to battles—is ready to go right out of the box.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Block 5: Final CTA */}
      <section className="py-32 px-6 bg-gradient-to-t from-web3-accent/10 via-web3-purple/5 to-transparent text-center relative overflow-hidden">
        
        <div 
          className="relative z-10 max-w-4xl mx-auto"
          data-animate
          id="cta-section"
          style={{ 
            opacity: isVisible['cta-section'] ? 1 : 0,
            transform: isVisible['cta-section'] ? 'scale(1)' : 'scale(0.95)',
            transition: 'all 0.8s ease-out'
          }}
        >
          <h2 className="text-5xl md:text-7xl font-black mb-8 uppercase bg-clip-text text-transparent bg-gradient-to-r from-white via-web3-accent to-web3-purple animate-gradient">
            Ready to bring your token to life?
          </h2>
          <p className="text-2xl text-gray-300 max-w-2xl mx-auto mb-12 leading-relaxed">
            Launch your first case or battle right now. It takes less than a minute.
          </p>
          
          {/* Mega CTA Button */}
          <button
            onClick={onCreateCase}
            className="group relative inline-flex items-center gap-3 px-16 py-8 text-3xl font-black rounded-2xl bg-gradient-to-r from-web3-accent via-web3-success to-web3-accent bg-size-200 animate-gradient text-black overflow-hidden transform transition-all duration-300 hover:scale-110 hover:shadow-[0_0_100px_rgba(102,252,241,0.8)]"
          >
            {/* Shine effect */}
            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/40 to-transparent"></div>
            
            {/* Content */}
            <Rocket className="w-10 h-10 group-hover:rotate-12 transition-transform" />
            <span className="relative">Get Started Now</span>
            <ArrowRight className="w-10 h-10 group-hover:translate-x-2 transition-transform" />
            
            {/* Pulse rings */}
            <span className="absolute -inset-4 rounded-2xl bg-web3-accent/30 animate-ping"></span>
            <span className="absolute -inset-8 rounded-2xl bg-web3-accent/20 animate-ping" style={{ animationDelay: '0.5s' }}></span>
          </button>

        </div>
      </section>

      {isEarlyAccessOpen && (
        <div
          className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          onClick={closeEarlyAccessModal}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-white/[0.12] bg-web3-card/95 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.5)] my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-web3-purple">CaseFun</div>
                <h3 className="text-2xl font-black mt-1">Early Access Request</h3>
                <p className="text-sm text-gray-400 mt-2">Leave your Telegram and a short message (up to 200 chars).</p>
              </div>
              <button
                type="button"
                onClick={closeEarlyAccessModal}
                className="w-8 h-8 rounded-lg border border-white/[0.12] bg-black/30 text-gray-300 hover:text-white"
                aria-label="Close early access form"
              >
                <X size={14} className="mx-auto" />
              </button>
            </div>

            {showLatestRequestStatus && (
              <div className="mt-4 rounded-xl border border-white/[0.1] bg-black/25 px-3 py-2 text-xs">
                {latestRequestStatus === 'PENDING' && (
                  <div className="inline-flex items-center gap-1.5 text-yellow-300">
                    <Clock3 size={14} />
                    Your previous request is under review.
                  </div>
                )}
                {latestRequestStatus === 'APPROVED' && (
                  <div className="inline-flex items-center gap-1.5 text-web3-success">
                    <ShieldCheck size={14} />
                    Your request is approved. Please test the mechanics and report any bugs.
                  </div>
                )}
                {latestRequestStatus === 'REJECTED' && (
                  <div className="inline-flex items-center gap-1.5 text-red-300">
                    <XCircle size={14} />
                    Previous request was rejected. You can submit a new one.
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleEarlyAccessSubmit} className="mt-5 space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Telegram</div>
                <input
                  value={earlyAccessContact}
                  onChange={(e) => setEarlyAccessContact(e.target.value)}
                  placeholder="@username"
                  maxLength={100}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-sm"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] uppercase tracking-widest text-gray-500">Message</div>
                  <div className={`text-[10px] ${earlyAccessCharsLeft < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                    {earlyAccessCharsLeft}
                  </div>
                </div>
                <textarea
                  value={earlyAccessMessage}
                  onChange={(e) => setEarlyAccessMessage(e.target.value)}
                  rows={4}
                  maxLength={200}
                  placeholder="Tell us why you need early access..."
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-sm resize-none"
                />
              </div>
              {earlyAccessFormStatus && (
                <div className={`text-xs ${earlyAccessFormStatus.toLowerCase().includes('sent') ? 'text-web3-success' : 'text-gray-300'}`}>
                  {earlyAccessFormStatus}
            </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeEarlyAccessModal}
                  className="flex-1 py-2.5 rounded-xl border border-white/[0.12] bg-black/25 text-xs uppercase tracking-widest text-gray-300 hover:text-white"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={earlyAccessSubmitting || isEarlyAccessBlocked}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-web3-accent to-web3-success text-black font-black uppercase tracking-widest text-xs disabled:opacity-60"
                >
                  {!isAuthenticated
                    ? 'Connect Wallet'
                    : earlyAccessSubmitting
                      ? 'Sending...'
                      : isEarlyAccessBlocked
                        ? 'Request Locked'
                        : 'Submit Request'}
                </button>
            </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
