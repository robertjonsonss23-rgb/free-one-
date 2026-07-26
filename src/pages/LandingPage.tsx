import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { login, signup, type AuthUser } from "../utils/api";

interface LandingPageProps {
  onAuthenticated: (user: AuthUser) => void;
}

/* ============================================================
   Small building blocks
   ============================================================ */

function GradientText({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
      {children}
    </span>
  );
}

/** Counts up to a number once it scrolls into view. */
function CountUp({ value, suffix = "", decimals = 0 }: { value: number; suffix?: string; decimals?: number }) {
  const [shown, setShown] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Failsafe: if the observer never fires, still show the final number.
    const failsafe = setTimeout(() => {
      if (!done.current) { done.current = true; setShown(value); }
    }, 1500);

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || done.current) return;
        done.current = true;
        clearTimeout(failsafe);
        const duration = 1400;
        const start = performance.now();
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          setShown(value * eased);
          if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      },
      { threshold: 0.3 }
    );
    io.observe(node);
    return () => { io.disconnect(); clearTimeout(failsafe); };
  }, [value]);

  return (
    <span ref={ref}>
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  );
}

function Section({
  id,
  children,
  className = "",
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`relative px-4 py-20 sm:py-24 ${className}`}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

/**
 * Fade-up on scroll.
 *
 * Deliberately not framer's `whileInView`: that left sections stranded at
 * opacity 0 when the observer didn't fire (long pages, fast scrolling,
 * reduced-motion). Here the element starts visible and only animates if the
 * observer is actually available, so content can never be invisible.
 */
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    // Only hide once we know we can reveal it again.
    setShown(false);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.05, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(node);

    // Safety net: never leave content hidden.
    const failsafe = setTimeout(() => setShown(true), 1200);
    return () => { io.disconnect(); clearTimeout(failsafe); };
  }, []);

  return (
    <div
      ref={ref}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(18px)",
        transition: `opacity .5s ease ${delay}s, transform .5s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

/* ============================================================
   Live S-curve preview
   ============================================================ */

const CURVES: Record<string, { label: string; blurb: string; steepness: number; hours: string }> = {
  organic: { label: "Organic", blurb: "Gradual warmup, strong peak, smooth decay", steepness: 10, hours: "24–168h" },
  whop: { label: "Whop", blurb: "Steady, low-variance delivery across the window", steepness: 6, hours: "12–48h" },
  clipster: { label: "Clipster", blurb: "Front-loaded burst that eases off naturally", steepness: 16, hours: "6–18h" },
  universal: { label: "Universal", blurb: "Balanced pacing that suits most platforms", steepness: 8, hours: "12–72h" },
};

function CurvePreview() {
  const [active, setActive] = useState<keyof typeof CURVES>("organic");
  const curve = CURVES[active];

  // Logistic S-curve sampled across the window.
  const points = Array.from({ length: 60 }, (_, i) => {
    const t = i / 59;
    const k = curve.steepness;
    const y = 1 / (1 + Math.exp(-k * (t - 0.5)));
    return { x: t * 100, y: 100 - y * 100 };
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const area = `${path} L100,100 L0,100 Z`;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(CURVES) as Array<keyof typeof CURVES>).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setActive(key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              active === key
                ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-purple-500/20"
                : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            {CURVES[key].label}
          </button>
        ))}
      </div>

      <div className="relative h-56 w-full overflow-hidden rounded-xl border border-white/5 bg-[#0d0d14] pb-6">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
          <defs>
            <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="curveLine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>
          {[20, 40, 60, 80].map((y) => (
            <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="0.4" />
          ))}
          <motion.path
            key={`${active}-area`}
            d={area}
            fill="url(#curveFill)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          />
          <motion.path
            key={active}
            d={path}
            fill="none"
            stroke="url(#curveLine)"
            strokeWidth="1.6"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
          />
        </svg>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between border-t border-white/5 bg-[#0d0d14] px-3 py-1.5 text-[10px] font-medium text-slate-400">
          <span>Launch</span><span>Warmup</span><span>Peak</span><span>Decay</span><span>Done</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-white">{curve.label}</p>
          <p className="text-xs text-slate-300">{curve.blurb}</p>
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Window</p>
            <p className="text-sm font-bold text-blue-300">{curve.hours}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Steepness</p>
            <p className="text-sm font-bold text-purple-300">{curve.steepness}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Auth modal
   ============================================================ */

function AuthModal({
  open,
  mode,
  onClose,
  onModeChange,
  onAuthenticated,
}: {
  open: boolean;
  mode: "login" | "signup";
  onClose: () => void;
  onModeChange: (m: "login" | "signup") => void;
  onAuthenticated: (u: AuthUser) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) { setError(""); setPassword(""); setConfirm(""); }
  }, [open, mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isSignup = mode === "signup";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const mail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { setError("Enter a valid email address."); return; }
    if (!password) { setError("Enter your password."); return; }
    if (isSignup) {
      if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
      if (password !== confirm) { setError("Passwords do not match."); return; }
    }
    setLoading(true);
    try {
      const result = isSignup
        ? await signup(mail, password, name.trim())
        : await login(mail, password);
      onAuthenticated(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const field =
    "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white " +
    "placeholder:text-slate-500 outline-none transition focus:border-blue-400/60 focus:bg-white/10";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22 }}
            onClick={(e) => e.stopPropagation()}
            className="landing-auth relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f17] p-6 shadow-2xl sm:p-8"
          >
            <div className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full bg-purple-600/20 blur-3xl" />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 text-slate-500 transition hover:text-white"
            >
              ✕
            </button>

            <div className="relative">
              <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
                {(["login", "signup"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onModeChange(m)}
                    className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                      mode === m
                        ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white"
                        : "text-slate-300 hover:text-white"
                    }`}
                  >
                    {m === "login" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>

              <h2 className="text-xl font-bold text-white">
                {isSignup ? "Launch your account" : "Welcome back"}
              </h2>
              <p className="mt-1 text-sm text-slate-300">
                {isSignup
                  ? "Free to join. Add funds only when you're ready to order."
                  : "Sign in to reach your campaigns from any device."}
              </p>

              <form onSubmit={submit} className="mt-5 space-y-3">
                {isSignup && (
                  <input
                    className={field}
                    placeholder="Your name (optional)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    disabled={loading}
                  />
                )}
                <input
                  className={field}
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  autoComplete="email"
                  autoFocus
                  disabled={loading}
                />
                <div className="relative">
                  <input
                    className={`${field} pr-16`}
                    type={showPassword ? "text" : "password"}
                    placeholder={isSignup ? "At least 8 characters" : "Password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-300 hover:text-white"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                {isSignup && (
                  <input
                    className={field}
                    type={showPassword ? "text" : "password"}
                    placeholder="Confirm password"
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); setError(""); }}
                    autoComplete="new-password"
                    disabled={loading}
                  />
                )}

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300"
                  >
                    {error}
                  </motion.p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-purple-500/25 transition hover:opacity-95 disabled:opacity-60"
                >
                  {loading ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
                </button>
              </form>

              <p className="mt-4 text-center text-xs text-slate-400">
                {isSignup ? "Already registered? " : "New here? "}
                <button
                  type="button"
                  onClick={() => onModeChange(isSignup ? "login" : "signup")}
                  className="font-semibold text-blue-400 hover:text-blue-300"
                >
                  {isSignup ? "Sign in" : "Create an account"}
                </button>
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ============================================================
   Landing page
   ============================================================ */

const FEATURES = [
  { icon: "◷", title: "Timed Delivery System", body: "Runs are scheduled minute-by-minute, not dumped in one batch." },
  { icon: "◠", title: "Organic Pacing Curves", body: "Warmup → peak → decay, so growth reads naturally." },
  { icon: "⛨", title: "Multi-Panel Routing", body: "Rotate across providers, so one slow panel can't stall a campaign." },
  { icon: "₹", title: "Wallet Billing", body: "Top up once, spend per order. Unused runs are refunded on cancel." },
];

const STEPS = [
  { n: "1", title: "Create account", body: "Email and password. Takes a few seconds." },
  { n: "2", title: "Add funds", body: "UPI or crypto. Minimum ₹50." },
  { n: "3", title: "Configure campaign", body: "Paste a link, set views, pick a pacing preset." },
  { n: "4", title: "Launch & track", body: "Watch each run land on the live schedule." },
];

const FAQS = [
  { q: "Do I need to add funds to start?", a: "No — creating an account is free. You only need a balance when you place your first order. The minimum top-up is ₹50." },
  { q: "What is S-curve pacing?", a: "Your order is split into many timed runs following a logistic curve: a gradual warmup, a strong peak, then a natural cooldown. It mirrors how real engagement builds instead of arriving all at once." },
  { q: "How do deposits work?", a: "Pay via UPI or crypto using the details on your wallet page, then submit the reference number. Your balance is credited once the payment is verified." },
  { q: "Can I cancel an order?", a: "Yes. Cancel any time and the portion that hasn't been delivered yet is refunded to your wallet automatically." },
  { q: "Can I adjust the numbers myself?", a: "Yes. Sliders control the engagement mix, and every individual run in the schedule can be edited by hand before you launch." },
  { q: "Will my campaigns follow me across devices?", a: "Yes. Everything is tied to your account, so signing in anywhere shows the same orders and balance." },
];

export function LandingPage({ onAuthenticated }: LandingPageProps) {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const openAuth = (mode: "login" | "signup") => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  return (
    <div className="landing-shell min-h-screen bg-[#0a0a0f] text-white">
      {/* ---------- NAV ---------- */}
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#0a0a0f]/80 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
                <svg viewBox="0 0 100 100" className="h-4 w-4 text-white" fill="currentColor">
                  <path d="M50 22 L58 42 L78 46 L64 60 L68 80 L50 70 L32 80 L36 60 L22 46 L42 42 Z" />
                </svg>
              </div>
              <span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-xl font-bold text-transparent">
                TRUESMM
              </span>
            </div>

            <div className="hidden items-center gap-7 md:flex">
              {[["Features", "features"], ["How it works", "how-it-works"], ["Pacing", "pacing"], ["FAQ", "faq"]].map(
                ([label, id]) => (
                  <a key={id} href={`#${id}`} className="text-sm font-medium text-slate-200 transition hover:text-white">
                    {label}
                  </a>
                )
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openAuth("login")}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 transition hover:text-white"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => openAuth("signup")}
                className="rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-purple-500/20 transition hover:opacity-95"
              >
                Get started
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ---------- HERO ---------- */}
      <section className="relative overflow-hidden px-4 pb-16 pt-32 sm:pt-40">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-blue-600/20 blur-[120px]" />
          <div className="absolute -top-20 right-1/4 h-96 w-96 rounded-full bg-purple-600/20 blur-[120px]" />
          <div
            className="absolute inset-0 opacity-[0.15]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
            }}
          />
        </div>

        <div className="relative mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="mx-auto max-w-3xl text-center"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold text-slate-300 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Organic pacing SMM panel
            </span>

            <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Stop dumping orders.
              <br />
              <GradientText>Deliver like it&apos;s real.</GradientText>
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-base text-slate-300 sm:text-lg">
              Split every order into hundreds of timed runs that follow a natural growth curve —
              warmup, peak, decay. Multi-panel routing, editable schedules and balanced engagement
              ratios, in one place.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => openAuth("signup")}
                className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 px-7 py-3.5 text-sm font-bold text-white shadow-xl shadow-purple-500/25 transition hover:opacity-95 sm:w-auto"
              >
                Create free account
              </button>
              <a
                href="#how-it-works"
                className="w-full rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 text-center text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/10 sm:w-auto"
              >
                See how it works
              </a>
            </div>
            <p className="mt-5 text-xs text-slate-400">
              Free to join · No subscription · Pay only for what you order
            </p>
          </motion.div>

          {/* stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.15 }}
            className="mx-auto mt-14 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4"
          >
            {[
              { v: <><CountUp value={300} />+</>, l: "Runs per order" },
              { v: <><CountUp value={14} />+</>, l: "Pacing presets" },
              { v: <>₹<CountUp value={50} /></>, l: "Minimum top-up" },
              { v: <><CountUp value={6} /></>, l: "Engagement types" },
            ].map((s, i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center backdrop-blur-sm"
              >
                <p className="text-2xl font-extrabold text-white sm:text-3xl">{s.v}</p>
                <p className="mt-1 text-xs font-medium text-slate-400">{s.l}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ---------- FEATURES ---------- */}
      <Section id="features">
        <Reveal>
          <h2 className="text-center text-3xl font-extrabold sm:text-4xl">
            Built for <GradientText>believable growth</GradientText>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-base leading-relaxed text-slate-300">
            The difference between a spike and a curve is whether it looks real.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.07}>
              <div className="group h-full rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition hover:border-purple-500/40 hover:bg-white/[0.07]">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-lg font-bold text-white">
                  {f.icon}
                </div>
                <h3 className="mt-4 text-base font-bold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ---------- PACING ---------- */}
      <Section id="pacing" className="border-y border-white/5 bg-white/[0.02]">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <h2 className="text-3xl font-extrabold sm:text-4xl">
              Watch the <GradientText>curve</GradientText>, not a spike
            </h2>
            <p className="mt-4 leading-relaxed text-slate-300">
              Every preset is a different delivery shape. Pick one and the whole schedule
              rebuilds — hundreds of runs, each with its own time and quantity.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Engagement scales with each run's views, never flat",
                "Provider minimums respected automatically",
                "Edit any individual run before you launch",
                "Cancel anytime — undelivered runs are refunded",
              ].map((t) => (
                <li key={t} className="flex items-start gap-3 text-sm text-slate-300">
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-[10px] font-bold">
                    ✓
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.12}>
            <CurvePreview />
          </Reveal>
        </div>
      </Section>

      {/* ---------- HOW IT WORKS ---------- */}
      <Section id="how-it-works">
        <Reveal>
          <h2 className="text-center text-3xl font-extrabold sm:text-4xl">
            Four steps to <GradientText>launch</GradientText>
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.08}>
              <div className="relative h-full rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-extrabold">
                  {s.n}
                </div>
                <h3 className="mt-4 text-base font-bold text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2}>
          <div className="mt-12 text-center">
            <button
              type="button"
              onClick={() => openAuth("signup")}
              className="rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 px-8 py-3.5 text-sm font-bold shadow-xl shadow-purple-500/25 transition hover:opacity-95"
            >
              Get started now
            </button>
          </div>
        </Reveal>
      </Section>

      {/* ---------- FAQ ---------- */}
      <Section id="faq" className="border-t border-white/5 bg-white/[0.02]">
        <Reveal>
          <h2 className="text-center text-3xl font-extrabold sm:text-4xl">
            Frequently asked <GradientText>questions</GradientText>
          </h2>
        </Reveal>

        <div className="mx-auto mt-10 max-w-3xl space-y-3">
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={i * 0.04}>
              <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="text-sm font-semibold text-white">{f.q}</span>
                  <span
                    className={`flex-shrink-0 text-xl text-purple-300 transition-transform ${
                      openFaq === i ? "rotate-45" : ""
                    }`}
                  >
                    +
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {openFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22 }}
                    >
                      <p className="px-5 pb-4 text-sm leading-relaxed text-slate-300">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ---------- FINAL CTA ---------- */}
      <Section>
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-blue-600/20 to-purple-600/20 p-10 text-center backdrop-blur-sm sm:p-14">
            <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-purple-500/20 blur-3xl" />
            <div className="relative">
              <h2 className="text-3xl font-extrabold sm:text-4xl">
                Ready to run <GradientText>real campaigns</GradientText>?
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-slate-300">
                Create an account free. Add funds only when you place your first order.
              </p>
              <button
                type="button"
                onClick={() => openAuth("signup")}
                className="mt-7 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 px-8 py-3.5 text-sm font-bold shadow-xl shadow-purple-500/25 transition hover:opacity-95"
              >
                Create free account
              </button>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* ---------- FOOTER ---------- */}
      <footer className="border-t border-white/10 px-4 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-blue-500 to-purple-600">
              <svg viewBox="0 0 100 100" className="h-3 w-3 text-white" fill="currentColor">
                <path d="M50 22 L58 42 L78 46 L64 60 L68 80 L50 70 L32 80 L36 60 L22 46 L42 42 Z" />
              </svg>
            </div>
            <span className="text-sm font-bold text-slate-300">TRUESMM</span>
          </div>
          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} TRUESMM. All rights reserved.
          </p>
        </div>
      </footer>

      <AuthModal
        open={authOpen}
        mode={authMode}
        onClose={() => setAuthOpen(false)}
        onModeChange={setAuthMode}
        onAuthenticated={onAuthenticated}
      />
    </div>
  );
}
