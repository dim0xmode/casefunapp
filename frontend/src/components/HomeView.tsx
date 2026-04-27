import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Sparkles,
  Zap,
  Shield,
  Rocket,
  Boxes,
  Swords,
  Wand2,
  Coins,
  Users,
  Activity,
  AlertTriangle,
  Flame,
  Lock,
  Eye,
  Mail,
  MessageCircle,
  Trophy,
  Hourglass,
  CheckCircle2,
  Target,
} from 'lucide-react';

interface HomeViewProps {
  onCreateCase: () => void;
  isAuthenticated: boolean;
  onOpenWalletConnect: () => void;
}

type Reveal = Record<string, boolean>;

const useReveal = (): Reveal => {
  const [visible, setVisible] = useState<Reveal>({});
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible((prev) => ({ ...prev, [entry.target.id]: true }));
          }
        });
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll('[data-animate]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return visible;
};

const SectionTitle: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  id: string;
  visible: Reveal;
  small?: boolean;
}> = ({ title, subtitle, id, visible, small }) => (
  <div
    id={id}
    data-animate
    className="text-center max-w-3xl mx-auto mb-14"
    style={{
      opacity: visible[id] ? 1 : 0,
      transform: visible[id] ? 'translateY(0)' : 'translateY(24px)',
      transition: 'all 0.7s ease-out',
    }}
  >
    <h2
      className={`font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-web3-accent via-emerald-300 to-web3-success ${
        small ? 'text-3xl md:text-4xl' : 'text-4xl md:text-6xl'
      }`}
    >
      {title}
    </h2>
    {subtitle && (
      <p className="mt-3 text-gray-400 text-base md:text-lg">{subtitle}</p>
    )}
  </div>
);

const Card: React.FC<{
  id: string;
  visible: Reveal;
  delay?: number;
  className?: string;
  children: React.ReactNode;
}> = ({ id, visible, delay = 0, className = '', children }) => (
  <div
    id={id}
    data-animate
    className={`group relative bg-[#0F1620]/80 border border-white/5 rounded-2xl p-6 md:p-7 backdrop-blur-sm hover:border-web3-accent/40 transition-all duration-500 overflow-hidden ${className}`}
    style={{
      opacity: visible[id] ? 1 : 0,
      transform: visible[id] ? 'translateY(0)' : 'translateY(28px)',
      transition: `all 0.7s ease-out ${delay}ms`,
    }}
  >
    <div className="absolute inset-0 bg-gradient-to-br from-web3-accent/0 via-transparent to-emerald-400/0 group-hover:from-web3-accent/5 group-hover:to-emerald-400/5 transition-colors duration-500 pointer-events-none" />
    <div className="relative z-10">{children}</div>
  </div>
);

const IconBadge: React.FC<{
  Icon: React.ComponentType<{ className?: string }>;
  tone?: 'mint' | 'emerald' | 'gold' | 'red' | 'purple';
}> = ({ Icon, tone = 'mint' }) => {
  const map: Record<string, string> = {
    mint: 'bg-web3-accent/10 text-web3-accent border-web3-accent/30',
    emerald: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/30',
    gold: 'bg-amber-400/10 text-amber-300 border-amber-400/30',
    red: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    purple: 'bg-violet-400/10 text-violet-300 border-violet-400/30',
  };
  return (
    <div
      className={`w-11 h-11 rounded-xl flex items-center justify-center border ${map[tone]} mb-4`}
    >
      <Icon className="w-5 h-5" />
    </div>
  );
};

export const HomeView: React.FC<HomeViewProps> = ({
  onCreateCase,
  isAuthenticated: _isAuthenticated,
  onOpenWalletConnect: _onOpenWalletConnect,
}) => {
  const visible = useReveal();

  const economics = useMemo(
    () => [
      {
        label: '$CF Buyback',
        value: 25,
        color: '#66FCF1',
        note: 'Deflation and market cap support.',
      },
      {
        label: 'Stakers',
        value: 20,
        color: '#10B981',
        note: 'Real Yield for long‑term holders.',
      },
      {
        label: 'Creator Share',
        value: 20,
        color: '#8B5CF6',
        note: 'Direct revenue for token creators.',
      },
      {
        label: 'Treasury',
        value: 15,
        color: '#F59E0B',
        note: 'Marketing, R&D, and Tier‑1 listings.',
      },
      {
        label: 'Investors',
        value: 10,
        color: '#3B82F6',
        note: 'Payouts for early backers.',
      },
      {
        label: 'Referral',
        value: 5,
        color: '#EF4444',
        note: 'Rewards for traffic acquisition.',
      },
      {
        label: 'Luck Hour',
        value: 5,
        color: '#EC4899',
        note: 'Hourly Buyback & Burn pool for top tokens.',
      },
    ],
    []
  );

  const donut = useMemo(() => {
    const total = economics.reduce((acc, slice) => acc + slice.value, 0);
    let acc = 0;
    return economics.map((slice) => {
      const start = (acc / total) * 360;
      acc += slice.value;
      const end = (acc / total) * 360;
      return { ...slice, start, end };
    });
  }, [economics]);

  const donutBg = `conic-gradient(${donut
    .map((s) => `${s.color} ${s.start}deg ${s.end}deg`)
    .join(', ')})`;

  return (
    <div className="w-full text-white relative overflow-hidden">
      {/* Ambient backdrop: starfield + soft mint glow blobs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(102,252,241,0.10),transparent_45%),radial-gradient(circle_at_85%_30%,rgba(16,185,129,0.10),transparent_40%),radial-gradient(circle_at_50%_85%,rgba(139,92,246,0.10),transparent_45%)]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'radial-gradient(rgba(255,255,255,0.18) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
      </div>

      {/* HERO — pitch deck cover */}
      <section className="relative px-4 pt-20 md:pt-28 pb-20 md:pb-28 text-center">
        <div className="max-w-5xl mx-auto flex flex-col items-center">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-web3-accent/30 bg-web3-accent/5 text-web3-accent text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ animation: 'fadeInUp 0.6s ease-out' }}
          >
            <Sparkles size={12} />
            Public Testnet · Live
          </div>

          <h1
            className="mt-8 text-6xl md:text-8xl font-black tracking-tight leading-[0.95]"
            style={{ animation: 'fadeInUp 0.8s ease-out 0.15s backwards' }}
          >
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-web3-accent via-emerald-300 to-web3-success">
              Case
            </span>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-300 via-web3-success to-web3-accent">
              Fun
            </span>
          </h1>

          <p
            className="mt-6 text-xl md:text-2xl text-gray-200 font-semibold"
            style={{ animation: 'fadeInUp 0.9s ease-out 0.3s backwards' }}
          >
            Your Token. Your Cases. Your Rules.
          </p>
          <p
            className="mt-4 max-w-2xl text-gray-400 text-base md:text-lg leading-relaxed"
            style={{ animation: 'fadeInUp 1s ease-out 0.45s backwards' }}
          >
            CaseFun turns any token into a playable, on‑chain economy — loot
            cases, PvP battles, upgrades and provably fair drops. Launch in
            minutes, no code required.
          </p>

          <div
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 w-full"
            style={{ animation: 'fadeInUp 1.1s ease-out 0.6s backwards' }}
          >
            <button
              onClick={onCreateCase}
              className="group relative w-full sm:w-auto px-10 py-5 text-lg font-black rounded-xl bg-gradient-to-r from-web3-accent to-web3-success text-black overflow-hidden transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_50px_rgba(102,252,241,0.55)]"
            >
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              <span className="relative flex items-center justify-center gap-2">
                <Rocket className="w-5 h-5" />
                Create a Case
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
            </button>
            <button
              onClick={() =>
                document
                  .getElementById('product')
                  ?.scrollIntoView({ behavior: 'smooth' })
              }
              className="w-full sm:w-auto px-10 py-5 text-lg font-bold rounded-xl border border-white/15 hover:border-web3-accent/40 hover:bg-white/5 transition-all duration-300"
            >
              See how it works
            </button>
          </div>
        </div>
      </section>

      {/* PROBLEM — "One-day Token" Culture */}
      <section className="relative px-4 py-16 md:py-24">
        <div className="max-w-6xl mx-auto">
          <SectionTitle
            id="problem"
            visible={visible}
            title={<>The “One‑day Token” Culture</>}
            subtitle="Most projects launch with hype and die within a week. CaseFun fixes the post‑launch black hole with retention‑first mechanics."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              {
                icon: Flame,
                title: 'Instant Death',
                text: 'New tokens lose 90% of holders in the first 48 hours after launch.',
              },
              {
                icon: AlertTriangle,
                title: 'Zero Retention',
                text: 'No reason to stay: holders sell on the first green candle.',
              },
              {
                icon: Eye,
                title: 'Bot Wars',
                text: 'Snipers and bots dominate early volume, real users churn.',
              },
              {
                icon: Activity,
                title: 'Stagnation',
                text: 'Even surviving projects flatline — no usage, no narrative.',
              },
            ].map((it, i) => (
              <Card
                key={it.title}
                id={`problem-${i}`}
                visible={visible}
                delay={i * 80}
              >
                <div className="flex items-start gap-4">
                  <IconBadge Icon={it.icon} tone="red" />
                  <div>
                    <h3 className="text-lg font-bold">{it.title}</h3>
                    <p className="text-gray-400 text-sm md:text-base mt-1.5 leading-relaxed">
                      {it.text}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* GROWTH STATS */}
      <section className="relative px-4 py-12 md:py-16">
        <div className="max-w-6xl mx-auto">
          <SectionTitle
            id="growth"
            visible={visible}
            title={<>Exponential Growth</>}
            subtitle={
              <>
                The “Fair Launch” market is showing colossal numbers, proving
                demand is at an all‑time high despite the flaws of current
                platforms.
              </>
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Card id="g-1" visible={visible} delay={60}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-base font-bold text-white">Pump.fun</div>
                <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-web3-accent/15 text-web3-accent border border-web3-accent/30">
                  Revenue
                </span>
              </div>
              <div className="mt-3 text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-web3-accent to-emerald-300">
                $150M+
              </div>
              <p className="mt-3 text-sm text-gray-400 leading-relaxed">
                Platform revenue exceeded $150M in its first year. At peak
                times, up to 40,000 new tokens were created daily.
              </p>
            </Card>
            <Card id="g-2" visible={visible} delay={140}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-base font-bold text-white">Zora.co</div>
                <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-300 border border-emerald-400/30">
                  Growth
                </span>
              </div>
              <div className="mt-3 text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-emerald-300 to-web3-success">
                +400%
              </div>
              <p className="mt-3 text-sm text-gray-400 leading-relaxed">
                Social minting surged, leading to a 400% increase in active
                users.
              </p>
            </Card>
            <Card id="g-3" visible={visible} delay={220}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-base font-bold text-white">DEX Volume</div>
                <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-violet-400/15 text-violet-300 border border-violet-400/30">
                  Share
                </span>
              </div>
              <div className="mt-3 text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-violet-300 to-web3-accent">
                30%
              </div>
              <p className="mt-3 text-sm text-gray-400 leading-relaxed">
                Meme tokens and new launches accounted for up to 30% of total
                decentralized exchange volume in 2025.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* PRODUCT — Interactive Evolution of Assets */}
      <section id="product" className="relative px-4 py-16 md:py-24">
        <div className="max-w-6xl mx-auto">
          <SectionTitle
            id="product-title"
            visible={visible}
            title={<>Interactive Evolution of Assets</>}
            subtitle="A complete launchpad‑grade product suite, designed around long‑term engagement."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              {
                icon: Wand2,
                tone: 'mint' as const,
                title: 'One‑Click Creation',
                text: 'Spin up a token + cases in minutes. No Solidity, no UI work, no audits to coordinate.',
              },
              {
                icon: Boxes,
                tone: 'emerald' as const,
                title: 'Case Unboxing',
                text: 'Provably fair drops with adjustable rarity. Every roll is verifiable on‑chain.',
              },
              {
                icon: Coins,
                tone: 'gold' as const,
                title: 'Tokens as a Resource',
                text: 'Holders use tokens to play, upgrade, and battle — utility from day one.',
              },
              {
                icon: Target,
                tone: 'purple' as const,
                title: 'Mission‑Driven',
                text: 'Built for creators who care about retention, not just the launch candle.',
              },
            ].map((it, i) => (
              <Card key={it.title} id={`prod-${i}`} visible={visible} delay={i * 80}>
                <IconBadge Icon={it.icon} tone={it.tone} />
                <h3 className="text-xl font-bold">{it.title}</h3>
                <p className="text-gray-400 text-sm md:text-base mt-2 leading-relaxed">
                  {it.text}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CORE FEATURES — Cases / Battle / Upgrade */}
      <section className="relative px-4 py-16 md:py-24">
        <div className="max-w-6xl mx-auto">
          <SectionTitle
            id="modes-title"
            visible={visible}
            title={<>Three Game Modes</>}
            subtitle="Pick your loop — luck, skill, or risk. All three reinforce token velocity."
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Card id="mode-1" visible={visible} delay={60}>
              <IconBadge Icon={Boxes} tone="mint" />
              <h3 className="text-2xl font-black">Cases</h3>
              <p className="text-gray-400 text-sm md:text-base mt-2 leading-relaxed">
                Classic unboxing. Set odds and prizes once — players unbox
                forever. Drops settle straight to the wallet.
              </p>
              <div className="mt-5 inline-flex items-center gap-2 text-web3-accent font-semibold text-sm">
                Try unboxing <ArrowRight className="w-4 h-4" />
              </div>
            </Card>
            <Card id="mode-2" visible={visible} delay={140}>
              <IconBadge Icon={Swords} tone="red" />
              <h3 className="text-2xl font-black">Case Battle</h3>
              <p className="text-gray-400 text-sm md:text-base mt-2 leading-relaxed">
                1v1 PvP duels — both players unbox, the higher payout takes the
                pot. Fights bots if no opponent shows up.
              </p>
              <div className="mt-5 inline-flex items-center gap-2 text-rose-300 font-semibold text-sm">
                Challenge <ArrowRight className="w-4 h-4" />
              </div>
            </Card>
            <Card id="mode-3" visible={visible} delay={220}>
              <IconBadge Icon={Zap} tone="purple" />
              <h3 className="text-2xl font-black">Upgrade</h3>
              <p className="text-gray-400 text-sm md:text-base mt-2 leading-relaxed">
                Risk a small drop for a big one. Transparent odds, instant
                resolution, no middlemen.
              </p>
              <div className="mt-5 inline-flex items-center gap-2 text-violet-300 font-semibold text-sm">
                Power up <ArrowRight className="w-4 h-4" />
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* RETENTION — Luck Hour & Referral */}
      <section className="relative px-4 py-12 md:py-16">
        <div className="max-w-6xl mx-auto">
          <SectionTitle
            id="retention-title"
            visible={visible}
            title={<>Luck Hour &amp; Referral</>}
            subtitle="Mechanics designed to bring users back every day."
            small
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Card id="ret-1" visible={visible} delay={60}>
              <div className="flex items-start gap-4">
                <IconBadge Icon={Hourglass} tone="mint" />
                <div>
                  <h3 className="text-lg font-bold">Luck Hour</h3>
                  <p className="text-gray-400 text-sm md:text-base mt-1.5 leading-relaxed">
                    Random hourly windows with boosted odds. Active users get
                    rewarded just for showing up.
                  </p>
                </div>
              </div>
            </Card>
            <Card id="ret-2" visible={visible} delay={140}>
              <div className="flex items-start gap-4">
                <IconBadge Icon={Users} tone="emerald" />
                <div>
                  <h3 className="text-lg font-bold">Referral Program</h3>
                  <p className="text-gray-400 text-sm md:text-base mt-1.5 leading-relaxed">
                    Multi‑tier rewards from invites. Communities grow themselves
                    with built‑in incentives.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* TRUST — Provably Fair */}
      <section className="relative px-4 py-16 md:py-24">
        <div className="max-w-6xl mx-auto">
          <SectionTitle
            id="trust-title"
            visible={visible}
            title={<>Provably Fair</>}
            subtitle="Cryptographic randomness. Every roll is auditable, every probability is public."
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Card id="trust-1" visible={visible} delay={60}>
              <IconBadge Icon={Shield} tone="emerald" />
              <h3 className="text-lg font-bold">Open Algorithm</h3>
              <p className="text-gray-400 text-sm md:text-base mt-2 leading-relaxed">
                Drop probabilities are derived from token price and case cost,
                visible in the UI before every spin.
              </p>
            </Card>
            <Card id="trust-2" visible={visible} delay={140}>
              <IconBadge Icon={Lock} tone="mint" />
              <h3 className="text-lg font-bold">On‑chain Settlement</h3>
              <p className="text-gray-400 text-sm md:text-base mt-2 leading-relaxed">
                Outcomes are committed and settled on‑chain — no off‑chain
                operator can rewrite history.
              </p>
            </Card>
            <Card id="trust-3" visible={visible} delay={220}>
              <IconBadge Icon={CheckCircle2} tone="purple" />
              <h3 className="text-lg font-bold">Verifiable RNG</h3>
              <p className="text-gray-400 text-sm md:text-base mt-2 leading-relaxed">
                Each roll exposes a seed and proof so anyone can replay the
                drop and confirm the outcome.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* ECONOMICS — distribution of platform commission fees (from pitch) */}
      <section className="relative px-4 py-16 md:py-24">
        <div className="max-w-6xl mx-auto">
          <SectionTitle
            id="economics-title"
            visible={visible}
            title={<>Economics — 100% Community‑Focused</>}
            subtitle={<>Distribution of platform commission fees.</>}
          />
          <Card id="economics-card" visible={visible} delay={80}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="flex items-center justify-center">
                <div
                  className="relative w-56 h-56 md:w-72 md:h-72 rounded-full"
                  style={{ background: donutBg }}
                >
                  <div className="absolute inset-6 rounded-full bg-[#0B1018] border border-white/5 flex flex-col items-center justify-center text-center px-3">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
                      Platform fees
                    </div>
                    <div className="mt-1 text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-web3-accent to-emerald-300">
                      100%
                    </div>
                    <div className="mt-1 text-[11px] text-gray-400">
                      to the community
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-2.5">
                {economics.map((slice) => (
                  <div
                    key={slice.label}
                    className="flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/5"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <span
                        className="mt-1.5 w-3 h-3 rounded-sm shrink-0"
                        style={{ backgroundColor: slice.color }}
                      />
                      <div className="min-w-0">
                        <div className="text-sm text-white font-semibold">
                          {slice.label}
                        </div>
                        <div className="text-xs text-gray-400 leading-snug mt-0.5">
                          {slice.note}
                        </div>
                      </div>
                    </div>
                    <span className="text-sm font-mono text-gray-200 shrink-0 pt-0.5">
                      {slice.value}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative px-4 py-20 md:py-28 text-center">
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-web3-accent/10 via-transparent to-transparent" />
        <div
          id="final-cta"
          data-animate
          className="max-w-3xl mx-auto"
          style={{
            opacity: visible['final-cta'] ? 1 : 0,
            transform: visible['final-cta'] ? 'scale(1)' : 'scale(0.96)',
            transition: 'all 0.7s ease-out',
          }}
        >
          <h2 className="text-4xl md:text-6xl font-black tracking-tight">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-web3-accent via-emerald-300 to-web3-success">
              Ready to bring your token to life?
            </span>
          </h2>
          <p className="mt-5 text-gray-300 text-base md:text-lg">
            Launch your first case in less than a minute. No code, no audit,
            no overhead.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onCreateCase}
              className="group relative inline-flex items-center gap-3 px-12 py-6 text-xl font-black rounded-xl bg-gradient-to-r from-web3-accent via-emerald-300 to-web3-success text-black overflow-hidden transition-all duration-300 hover:scale-[1.04] hover:shadow-[0_0_70px_rgba(102,252,241,0.55)]"
            >
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
              <Rocket className="w-6 h-6" />
              Get Started
              <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </button>
            <a
              href="https://t.me/casefun_bot"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 px-8 py-6 text-base font-bold rounded-xl border border-white/15 hover:border-web3-accent/40 hover:bg-white/5 transition-all duration-300"
            >
              <MessageCircle className="w-5 h-5" />
              Open in Telegram
            </a>
          </div>

          <div className="mt-14 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-400">
            <a
              href="mailto:hello@casefun.net"
              className="inline-flex items-center gap-2 hover:text-web3-accent transition-colors"
            >
              <Mail className="w-4 h-4" />
              hello@casefun.net
            </a>
            <span className="hidden sm:inline text-white/10">•</span>
            <span className="inline-flex items-center gap-2">
              <Trophy className="w-4 h-4 text-web3-accent" />
              Public Testnet · Live now
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};
