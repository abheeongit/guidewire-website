import { useMemo, useState, useEffect } from 'react'
import { motion as Motion, AnimatePresence } from 'framer-motion'
import indiaMap from '@svg-maps/india'
import indiaStateDistricts from './data/india-state-districts.json'
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ChevronRight,
  CloudLightning,
  Compass,
  Lock,
  Mail,
  MapPin,
  Menu,
  Moon,
  Radar,
  Shield,
  ShieldAlert,
  Sun,
  Wallet,
  X,
  Zap,
} from 'lucide-react'

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', bounce: 0.25, duration: 0.75 } },
}

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
}

const plans = {
  basic: { multiplier: 1, coverage: 'Essential accident coverage', weekly: 20, payout: 200 },
  premium: {
    multiplier: 1.45,
    coverage: 'Accident + health disruption coverage',
    weekly: 35,
    payout: 350,
  },
  elite: {
    multiplier: 1.9,
    coverage: 'Full disruption + income protection coverage',
    weekly: 50,
    payout: 500,
  },
}

const weatherSeverity = {
  mild: 0,
  moderate: 1,
  severe: 2,
  extreme: 3,
}

const INDIA_REGIONS = indiaStateDistricts

function normalizeLocationName(name) {
  return String(name || '')
    .toLowerCase()
    .replace('new delhi', 'delhi')
    .replace('andaman and nicobar islands', 'andaman and nicobar')
    .replace(/[^a-z]/g, '')
}

async function resolveIndiaLocationCandidates(queries) {
  for (const query of queries) {
    const params = new URLSearchParams({
      name: query,
      count: '20',
      language: 'en',
      format: 'json',
    })

    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`)
    if (!response.ok) continue

    const payload = await response.json()
    const results = Array.isArray(payload?.results) ? payload.results : []
    const indian = results.filter((item) => {
      const code = String(item.country_code || '').toUpperCase()
      const country = normalizeLocationName(item.country)
      return code === 'IN' || country === 'india'
    })
    if (indian.length) {
      return indian
    }

    // Some geocoder responses omit country metadata for administrative regions.
    if (results.length) {
      return results
    }
  }

  return []
}

async function resolveIndiaLocationWithNominatim(queries) {
  for (const query of queries) {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      addressdetails: '1',
      limit: '10',
      countrycodes: 'in',
    })

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`)
    if (!response.ok) continue

    const payload = await response.json()
    const list = Array.isArray(payload) ? payload : []
    if (list.length) {
      return list
    }
  }

  return []
}

function classifyWeatherSeverity({ weatherCode, windSpeed, precipitation }) {
  const intenseWeatherCode = [95, 96, 99, 82, 86]
  if (intenseWeatherCode.includes(weatherCode) || windSpeed >= 55 || precipitation >= 20) {
    return 'extreme'
  }
  if (windSpeed >= 38 || precipitation >= 10 || [81, 85, 65, 75].includes(weatherCode)) {
    return 'severe'
  }
  if (windSpeed >= 22 || precipitation >= 3 || [61, 63, 71, 73, 80].includes(weatherCode)) {
    return 'moderate'
  }
  return 'mild'
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function statusStyles(state, isDark) {
  if (state === 'approved') return 'border-green-400/30 bg-green-500/10 text-green-300'
  if (state === 'manual-review') return 'border-amber-300/30 bg-amber-500/10 text-amber-200'
  return isDark
    ? 'border-white/20 bg-white/[0.03] backdrop-blur-2xl text-zinc-300'
    : 'border-zinc-300 bg-white text-zinc-700'
}

function calculateRisk(form) {
  const parsedHours = Number(form.hours) || 0
  const expectedDeliveries = Number(form.expectedDeliveries) || 0
  const actualDeliveries = Number(form.actualDeliveries) || 0
  const deliveryGap = Math.max(expectedDeliveries - actualDeliveries, 0)
  const selectedPlan = plans[form.plan] ?? plans.basic

  let riskScore = 0

  if (form.worker === 'driver') riskScore += 3
  else if (form.worker === 'delivery') riskScore += 2
  else riskScore += 1

  if (parsedHours > 8) riskScore += 2
  else if (parsedHours > 5) riskScore += 1

  if (form.time === 'night') riskScore += 2
  riskScore += weatherSeverity[form.weather]

  if (deliveryGap >= 8) riskScore += 2
  else if (deliveryGap >= 4) riskScore += 1

  let risk = 'Low'
  let basePremium = 50
  if (riskScore > 7) {
    risk = 'High'
    basePremium = 200
  } else if (riskScore > 4) {
    risk = 'Medium'
    basePremium = 110
  }

  const disruptionProbability = clamp(
    Math.round(22 + riskScore * 9 + weatherSeverity[form.weather] * 4 + (form.time === 'night' ? 5 : 0)),
    8,
    96
  )

  const confidence = clamp(Math.round(80 + Math.min(riskScore, 9) * 1.8), 82, 97)

  const alerts = []
  if (form.weather === 'severe' || form.weather === 'extreme') {
    alerts.push('Weather disruption alert: payout trigger risk is elevated for this shift.')
  }
  if (parsedHours >= 10) {
    alerts.push('Extended hours detected: fatigue risk is high for the selected profile.')
  }
  if (form.time === 'night') {
    alerts.push('Night operations increase claim probability and premium sensitivity.')
  }
  if (!alerts.length) {
    alerts.push('Current conditions are stable. Continue active monitoring.')
  }

  const fraudSignals = []
  if (expectedDeliveries >= 10 && actualDeliveries <= 2 && form.weather === 'mild') {
    fraudSignals.push('Activity anomaly: large delivery drop during mild conditions.')
  }
  if (form.previousClaims >= 3 && risk !== 'High') {
    fraudSignals.push('Repeated claim pattern requires manual review.')
  }

  const severityFactor = risk === 'High' ? 1 : risk === 'Medium' ? 0.8 : 0.6
  const performanceFactor = expectedDeliveries ? clamp(actualDeliveries / expectedDeliveries, 0.5, 1) : 0.75
  const modelPayout = Math.round(selectedPlan.payout * severityFactor * (0.85 + performanceFactor * 0.25))

  const claimEligible =
    form.weather === 'extreme' ||
    (form.weather === 'severe' && risk !== 'Low') ||
    (risk === 'High' && parsedHours >= 8)

  const claimDecision = fraudSignals.length >= 2 ? 'manual-review' : claimEligible ? 'approved' : 'monitoring'

  return {
    risk,
    riskScore,
    confidence,
    premium: Math.round(basePremium * selectedPlan.multiplier),
    weekly: selectedPlan.weekly,
    payout: claimDecision === 'manual-review' ? 0 : modelPayout,
    coverage: selectedPlan.coverage,
    alerts,
    fraudSignals,
    claimDecision,
    disruptionProbability,
    projectedIncomeProtected: Math.round((selectedPlan.payout * disruptionProbability) / 100),
    explanation: `Risk is driven by ${form.worker} profile, ${parsedHours}h shift, ${form.time} schedule, ${form.weather} weather, and a delivery gap of ${deliveryGap}.`,
  }
}

function AnimatedNumber({ value, prefix = '', suffix = '' }) {
  return (
    <AnimatePresence mode="popLayout">
      <Motion.span
        key={`${prefix}${value}${suffix}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ type: 'spring', stiffness: 280, damping: 24 }}
        className="inline-block"
      >
        {prefix}
        {value}
        {suffix}
      </Motion.span>
    </AnimatePresence>
  )
}

function LandingPage({ isDark, onGoAuth }) {
  return (
    <main className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-20 sm:px-6 lg:px-8 lg:pb-28 lg:pt-28">
      <Motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid items-center gap-14 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Motion.p variants={fadeUp} className="mb-6 inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/10 px-4 py-1.5 text-xs font-bold font-heading uppercase tracking-wider text-green-400">
            <Radar className="h-3.5 w-3.5" /> Parametric income protection
          </Motion.p>

          <Motion.h1 variants={fadeUp} className={isDark ? 'text-balance text-6xl md:text-7xl tracking-tighter font-heading font-extrabold leading-[1.1] tracking-tight text-white lg:text-[6rem] xl:text-[7rem]' : 'text-balance text-6xl md:text-7xl tracking-tighter font-heading font-extrabold leading-[1.1] tracking-tight text-zinc-900 lg:text-[6rem] xl:text-[7rem]'}>
            Insurance intelligence designed for gig workers.
          </Motion.h1>

          <Motion.p variants={fadeUp} className={isDark ? 'mt-7 max-w-2xl text-lg leading-relaxed text-zinc-300' : 'mt-7 max-w-2xl text-lg leading-relaxed text-zinc-700'}>
            Valor Shield protects delivery workers and freelancers against disruption-driven income loss. We use dynamic risk scoring based on shift timing, weather conditions, work intensity, and zone behavior.
          </Motion.p>

          <Motion.div variants={fadeUp} className="mt-9 flex flex-wrap gap-8">
            <Motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onGoAuth('login')}
              className={isDark ? 'inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-lg tracking-wide shadow-2xl font-bold font-heading text-zinc-900 shadow-[0_0_36px_rgba(255,255,255,0.16)]' : 'inline-flex items-center gap-2 rounded-full bg-zinc-900 px-8 py-4 text-lg tracking-wide shadow-2xl font-bold font-heading text-white shadow-[0_14px_38px_rgba(15,23,42,0.25)]'}
            >
              Login <ChevronRight className="h-4 w-4" />
            </Motion.button>
            <Motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onGoAuth('signup')}
              className={isDark ? 'inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] backdrop-blur-2xl px-8 py-4 text-lg tracking-wide shadow-2xl font-bold font-heading text-white' : 'inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-8 py-4 text-lg tracking-wide shadow-2xl font-bold font-heading text-zinc-900'}
            >
              Sign up
            </Motion.button>
          </Motion.div>
        </div>

        <Motion.div variants={fadeUp} className={isDark ? 'rounded-[2rem] border border-white/5 bg-gradient-to-b from-white/5 to-white/[0.02] p-1 shadow-2xl backdrop-blur-2xl' : 'rounded-[2rem] border border-zinc-200 bg-gradient-to-b from-white to-zinc-100 p-1 shadow-2xl'}>
          <div className={isDark ? 'rounded-[1.8rem] bg-black/40 backdrop-blur-3xl p-8 sm:p-8' : 'rounded-[1.8rem] bg-white/90 p-8 sm:p-8'}>
            <h2 className={isDark ? 'text-2xl font-extrabold font-heading text-white' : 'text-2xl font-extrabold font-heading text-zinc-900'}>What we are implementing</h2>
            <div className="mt-6 space-y-4">
              {[
                'Rule-based AI-like risk scoring with explainable outputs',
                'Parametric disruption triggers with payout recommendation',
                'Fraud signal layer with location and activity checks',
                'Progressive path to live API and backend synchronization',
              ].map((item) => (
                <div key={item} className={isDark ? 'rounded-[1.5rem] border border-white/5 bg-white/[0.03] backdrop-blur-2xl p-8 text-sm text-zinc-200' : 'rounded-[1.5rem] border border-zinc-200 bg-white p-8 text-sm text-zinc-700'}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400" /> {item}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3">
              {[
                { label: 'Coverage tiers', value: '3' },
                { label: 'Core signals', value: '6' },
                { label: 'Decision modes', value: '3' },
              ].map((metric) => (
                <div key={metric.label} className={isDark ? 'rounded-[1.5rem] border border-white/5 bg-white/[0.03] backdrop-blur-2xl p-3' : 'rounded-[1.5rem] border border-zinc-200 bg-white p-3'}>
                  <p className={isDark ? 'text-2xl font-extrabold font-heading text-white' : 'text-2xl font-extrabold font-heading text-zinc-900'}>{metric.value}</p>
                  <p className={isDark ? 'text-xs text-zinc-400' : 'text-xs text-zinc-500'}>{metric.label}</p>
                </div>
              ))}
            </div>
          </div>
        </Motion.div>
      </Motion.div>

      {/* Modern Scrolling Features Section */}
      <Motion.div 
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="mt-32 border-t border-zinc-200/10 pt-20"
      >
        <div className="text-center mb-16">
          <h2 className={isDark ? "text-4xl lg:text-5xl font-extrabold font-heading tracking-tight text-white focus:outline-none" : "text-4xl lg:text-5xl font-extrabold font-heading tracking-tight text-zinc-900 focus:outline-none"}>
            Engineered for the modern worker
          </h2>
          <p className={isDark ? "mt-6 text-xl text-zinc-400" : "mt-6 text-xl text-zinc-600"}>Enterprise-grade architecture wrapped in an effortless experience.</p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { icon: Zap, title: "Lightning Fast calculations", desc: "Real-time parametric assessment utilizing lightweight rule engines." },
            { icon: Shield, title: "Deterministic Validation", desc: "No black boxes. Every calculation provides a transparent explanation trail." },
            { icon: CloudLightning, title: "Adaptive Edge", desc: "Constantly syncing zone weather drops and algorithmic trigger updates." }
          ].map((feature, i) => (
            <Motion.div
              key={i}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ delay: i * 0.15, duration: 0.6, ease: "easeOut" }}
              whileHover={{ y: -8, scale: 1.02 }}
              className={isDark ? 'group rounded-[2rem] border border-white/5 bg-white/[0.03] backdrop-blur-2xl p-10 cursor-none' : 'group rounded-[2rem] border border-zinc-200 bg-white p-10 shadow-xl cursor-none'}
            >
              <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-green-500/10 text-green-400 transition-transform duration-300 group-hover:scale-110 group-hover:bg-green-400 group-hover:text-zinc-900 shadow-xl shadow-green-500/10">
                <feature.icon className="h-7 w-7" />
              </div>
              <h3 className={isDark ? "text-2xl font-bold font-heading text-white mb-3" : "text-2xl font-bold font-heading text-zinc-900 mb-3"}>{feature.title}</h3>
              <p className={isDark ? "text-zinc-400 leading-relaxed text-sm font-light" : "text-zinc-600 leading-relaxed text-sm font-light"}>{feature.desc}</p>
            </Motion.div>
          ))}
        </div>
      </Motion.div>
    </main>
  )
}

function AuthPage({ isDark, mode, setMode, onBack, onEnterModel }) {
  return (
    <main className="relative z-10 mx-auto max-w-xl px-4 pb-20 pt-20 sm:px-6 lg:pt-28">
      <Motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className={isDark ? 'rounded-[2.5rem] border border-white/5 bg-white/[0.03] backdrop-blur-2xl p-10 backdrop-blur-xl' : 'rounded-[2.5rem] border border-zinc-200 bg-white p-10 shadow-sm'}>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className={isDark ? 'text-3xl lg:text-4xl font-extrabold font-heading tracking-tight text-white' : 'text-3xl lg:text-4xl font-extrabold font-heading tracking-tight text-zinc-900'}>{mode === 'login' ? 'Login' : 'Sign up'}</h2>
            <p className={isDark ? 'mt-1 text-sm text-zinc-300' : 'mt-1 text-sm text-zinc-600'}>Authentication UI is hardcoded now and ready for backend sync later.</p>
          </div>
          <button onClick={onBack} className={isDark ? 'text-sm text-zinc-300 hover:text-white' : 'text-sm text-zinc-600 hover:text-zinc-900'}>Back</button>
        </div>

        <div className="mb-6 inline-flex rounded-full border border-green-400/20 bg-green-500/10 p-1 text-sm">
          <button
            onClick={() => setMode('login')}
            className={`rounded-full px-4 py-1.5 font-medium transition ${mode === 'login' ? 'bg-green-500 text-zinc-950' : isDark ? 'text-zinc-200' : 'text-zinc-700'}`}
          >
            Login
          </button>
          <button
            onClick={() => setMode('signup')}
            className={`rounded-full px-4 py-1.5 font-medium transition ${mode === 'signup' ? 'bg-green-500 text-zinc-950' : isDark ? 'text-zinc-200' : 'text-zinc-700'}`}
          >
            Sign up
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className={isDark ? 'mb-2 block text-sm text-zinc-200' : 'mb-2 block text-sm text-zinc-700'}>Email</span>
            <div className="relative">
              <Mail className={isDark ? 'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -tranzinc-y-1/2 text-zinc-400' : 'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -tranzinc-y-1/2 text-zinc-500'} />
              <input placeholder="worker@valorshield.app" className={isDark ? 'w-full rounded-[1.5rem] border border-white/15 bg-white/[0.02] backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] border border-white/[0.05] px-10 py-3 text-zinc-100 outline-none ring-green-200/40 focus:ring' : 'w-full rounded-[1.5rem] border border-zinc-300 bg-white px-10 py-3 text-zinc-900 outline-none ring-green-500/30 focus:ring'} />
            </div>
          </label>

          <label className="block">
            <span className={isDark ? 'mb-2 block text-sm text-zinc-200' : 'mb-2 block text-sm text-zinc-700'}>Password</span>
            <div className="relative">
              <Lock className={isDark ? 'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -tranzinc-y-1/2 text-zinc-400' : 'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -tranzinc-y-1/2 text-zinc-500'} />
              <input type="password" placeholder="Enter password" className={isDark ? 'w-full rounded-[1.5rem] border border-white/15 bg-white/[0.02] backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] border border-white/[0.05] px-10 py-3 text-zinc-100 outline-none ring-green-200/40 focus:ring' : 'w-full rounded-[1.5rem] border border-zinc-300 bg-white px-10 py-3 text-zinc-900 outline-none ring-green-500/30 focus:ring'} />
            </div>
          </label>

          {mode === 'signup' ? (
            <label className="block">
              <span className={isDark ? 'mb-2 block text-sm text-zinc-200' : 'mb-2 block text-sm text-zinc-700'}>Organization / Platform</span>
              <input placeholder="Gig Platform Name" className={isDark ? 'w-full rounded-[1.5rem] border border-white/15 bg-white/[0.02] backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] border border-white/[0.05] px-6 py-4 text-lg tracking-wide shadow-xl text-zinc-100 outline-none ring-green-200/40 focus:ring' : 'w-full rounded-[1.5rem] border border-zinc-300 bg-white px-6 py-4 text-lg tracking-wide shadow-xl text-zinc-900 outline-none ring-green-500/30 focus:ring'} />
            </label>
          ) : null}
        </div>

        <Motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={onEnterModel}
          className={isDark ? 'mt-6 inline-flex w-full items-center justify-center gap-2 rounded-[1.5rem] bg-white px-6 py-4 text-lg tracking-wide shadow-xl font-bold font-heading text-zinc-900 transition hover:bg-green-100' : 'mt-6 inline-flex w-full items-center justify-center gap-2 rounded-[1.5rem] bg-zinc-900 px-6 py-4 text-lg tracking-wide shadow-xl font-bold font-heading text-white transition hover:bg-zinc-700'}
        >
          Continue to workspace <ChevronRight className="h-4 w-4" />
        </Motion.button>
      </Motion.div>
    </main>
  )
}

function DashboardPage({
  isDark,
  form,
  setForm,
  result,
  claims,
  triggerClaim,
  regions,
  selectedState,
  selectedStateCode,
  setSelectedState,
  setSelectedStateByCode,
  selectedDistrict,
  setSelectedDistrict,
  selectedStateDistricts,
  regionWeather,
  regionLoading,
  regionError,
  fetchRegionWeather,
  isMapPickerOpen,
  setIsMapPickerOpen,
}) {
  return (
    <main className="relative z-10">
      <section className="mx-auto max-w-7xl px-4 pb-24 pt-20 sm:px-6 lg:px-8 lg:pt-24">
        <Motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <Motion.p variants={fadeUp} className="mb-5 inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/10 px-4 py-1.5 text-xs font-bold font-heading uppercase tracking-wider text-green-400">
              <Radar className="h-3.5 w-3.5" /> Active risk console
            </Motion.p>
            <Motion.h1 variants={fadeUp} className={isDark ? 'text-balance text-5xl lg:text-7xl tracking-tight font-heading font-extrabold leading-tight text-white ' : 'text-balance text-5xl lg:text-7xl tracking-tight font-heading font-extrabold leading-tight text-zinc-900 '}>
              Live decision workspace
            </Motion.h1>
            <Motion.p variants={fadeUp} className={isDark ? 'mt-6 text-xl lg:text-2xl text-zinc-300/80 font-light leading-relaxed' : 'mt-6 text-xl lg:text-2xl text-zinc-600 font-light leading-relaxed'}>
              Inputs update premium, payout recommendation, disruption alerts, and fraud signals instantly.
            </Motion.p>
          </div>

          <Motion.aside variants={fadeUp} className={isDark ? 'rounded-[2.5rem] border border-green-200/20 bg-gradient-to-b from-green-200/10 to-zinc-900/55 p-10' : 'rounded-[2.5rem] border border-green-200 bg-gradient-to-b from-green-50 to-white p-10'}>
            <div className="flex items-center justify-between">
              <h3 className={isDark ? 'text-3xl lg:text-4xl font-extrabold font-heading tracking-tight text-white' : 'text-3xl lg:text-4xl font-extrabold font-heading tracking-tight text-zinc-900'}>Decision output</h3>
              <span className={statusStyles(result.claimDecision, isDark) + ' rounded-full border px-3 py-1 text-xs font-bold font-heading'}>
                {result.claimDecision.replace('-', ' ')}
              </span>
            </div>

            <div className="mt-7 grid grid-cols-2 gap-8">
              <div className={isDark ? 'rounded-[2rem] bg-white/[0.02] backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] border border-white/[0.05] p-8' : 'rounded-[2rem] border border-zinc-200 bg-white p-8'}>
                <p className={isDark ? 'text-xs text-zinc-400' : 'text-xs text-zinc-500'}>Risk score</p>
                <p className={isDark ? 'mt-2 text-4xl lg:text-5xl font-black font-mono tracking-tighter text-white' : 'mt-2 text-4xl lg:text-5xl font-black font-mono tracking-tighter text-zinc-900'}><AnimatedNumber value={result.riskScore} /></p>
              </div>
              <div className={isDark ? 'rounded-[2rem] bg-white/[0.02] backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] border border-white/[0.05] p-8' : 'rounded-[2rem] border border-zinc-200 bg-white p-8'}>
                <p className={isDark ? 'text-xs text-zinc-400' : 'text-xs text-zinc-500'}>Risk level</p>
                <p className={isDark ? 'mt-2 text-4xl lg:text-5xl font-black font-mono tracking-tighter text-white' : 'mt-2 text-4xl lg:text-5xl font-black font-mono tracking-tighter text-zinc-900'}>{result.risk}</p>
              </div>
              <div className={isDark ? 'rounded-[2rem] bg-white/[0.02] backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] border border-white/[0.05] p-8' : 'rounded-[2rem] border border-zinc-200 bg-white p-8'}>
                <p className={isDark ? 'text-xs text-zinc-400' : 'text-xs text-zinc-500'}>Premium</p>
                <p className={isDark ? 'mt-2 text-4xl lg:text-5xl font-black font-mono tracking-tighter text-white' : 'mt-2 text-4xl lg:text-5xl font-black font-mono tracking-tighter text-zinc-900'}><AnimatedNumber value={result.premium} prefix="Rs " /></p>
              </div>
              <div className={isDark ? 'rounded-[2rem] bg-white/[0.02] backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] border border-white/[0.05] p-8' : 'rounded-[2rem] border border-zinc-200 bg-white p-8'}>
                <p className={isDark ? 'text-xs text-zinc-400' : 'text-xs text-zinc-500'}>Recommended payout</p>
                <p className={isDark ? 'mt-2 text-4xl lg:text-5xl font-black font-mono tracking-tighter text-green-300' : 'mt-2 text-4xl lg:text-5xl font-black font-mono tracking-tighter text-green-600'}><AnimatedNumber value={result.payout} prefix="Rs " /></p>
              </div>
            </div>

            <div className={isDark ? 'mt-6 rounded-[1.5rem] border border-green-300/20 bg-green-200/10 p-8' : 'mt-6 rounded-[1.5rem] border border-green-200 bg-green-50 p-8'}>
              <p className={isDark ? 'text-xs font-bold font-heading uppercase tracking-wider text-green-200' : 'text-xs font-bold font-heading uppercase tracking-wider text-green-800'}>Disruption Alerts</p>
              <ul className={isDark ? 'mt-3 space-y-2 text-sm text-green-100/90' : 'mt-3 space-y-2 text-sm text-green-900'}>
                {result.alerts.map((alert) => (
                  <li key={alert} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {alert}
                  </li>
                ))}
              </ul>
            </div>

            <div className={isDark ? 'mt-4 rounded-[1.5rem] border border-amber-300/20 bg-amber-100/10 p-8' : 'mt-4 rounded-[1.5rem] border border-amber-200 bg-amber-50 p-8'}>
              <p className={isDark ? 'text-xs font-bold font-heading uppercase tracking-wider text-amber-200' : 'text-xs font-bold font-heading uppercase tracking-wider text-amber-800'}>Fraud detection</p>
              {result.fraudSignals.length ? (
                <ul className={isDark ? 'mt-3 space-y-2 text-sm text-amber-50/95' : 'mt-3 space-y-2 text-sm text-amber-900'}>
                  {result.fraudSignals.map((signal) => (
                    <li key={signal} className="flex items-start gap-2">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {signal}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={isDark ? 'mt-3 text-sm text-amber-50/90' : 'mt-3 text-sm text-amber-900'}>No anomaly detected for the selected run.</p>
              )}
            </div>

            <Motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={triggerClaim}
              className={isDark ? 'mt-6 inline-flex w-full items-center justify-center gap-2 rounded-[1.5rem] bg-white px-6 py-4 text-lg tracking-wide shadow-xl font-bold font-heading text-zinc-900 transition hover:bg-green-100' : 'mt-6 inline-flex w-full items-center justify-center gap-2 rounded-[1.5rem] bg-zinc-900 px-6 py-4 text-lg tracking-wide shadow-xl font-bold font-heading text-white transition hover:bg-zinc-700'}
            >
              <Zap className="h-4 w-4" /> Record disruption event
            </Motion.button>
          </Motion.aside>
        </Motion.div>
      </section>

      <section id="platform" className="relative py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-10 max-w-3xl">
            <h2 className={isDark ? 'text-5xl lg:text-7xl tracking-tight font-heading font-extrabold text-white' : 'text-5xl lg:text-7xl tracking-tight font-heading font-extrabold text-zinc-900'}>Platform capabilities</h2>
            <p className={isDark ? 'mt-3 text-zinc-300' : 'mt-3 text-zinc-700'}>
              Built from your project docs: predictive alerts, fraud signals, smart payout logic, and explainable scoring.
            </p>
          </Motion.div>

          <div className="grid gap-8 md:grid-cols-4">
            {[
              { icon: BellRing, title: 'Predictive Alerts', copy: `${result.alerts.length} alert(s) active for current conditions.` },
              { icon: ShieldAlert, title: 'Fraud Signals', copy: result.fraudSignals.length ? `${result.fraudSignals.length} signal(s) require attention.` : 'No fraud signal detected for current profile.' },
              { icon: Wallet, title: 'Smart Payout', copy: `Severity-adjusted payout recommendation: Rs ${result.payout}.` },
              { icon: Compass, title: 'Activity Validation', copy: `Expected ${form.expectedDeliveries} vs actual ${form.actualDeliveries} deliveries.` },
            ].map((item, idx) => (
              <Motion.article
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.08 }}
                whileHover={{ y: -5 }}
                className={isDark ? 'rounded-[2rem] border border-white/5 bg-white/[0.03] backdrop-blur-2xl p-8 backdrop-blur-xl' : 'rounded-[2rem] border border-zinc-200 bg-white p-8'}
              >
                <item.icon className={isDark ? 'h-6 w-6 text-green-300' : 'h-6 w-6 text-green-600'} />
                <h3 className={isDark ? 'mt-4 text-lg font-bold font-heading text-white' : 'mt-4 text-lg font-bold font-heading text-zinc-900'}>{item.title}</h3>
                <p className={isDark ? 'mt-2 text-sm text-zinc-300' : 'mt-2 text-sm text-zinc-700'}>{item.copy}</p>
              </Motion.article>
            ))}
          </div>
        </div>
      </section>

      <section id="workspace" className="relative py-20">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-8">
          <Motion.div
            initial={{ opacity: 0, x: -22 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className={isDark ? 'rounded-[2.5rem] border border-white/5 bg-white/[0.03] backdrop-blur-2xl p-10 backdrop-blur-xl' : 'rounded-[2.5rem] border border-zinc-200 bg-white p-10'}
          >
            <h3 className={isDark ? 'text-3xl lg:text-4xl font-extrabold font-heading tracking-tight text-white' : 'text-3xl lg:text-4xl font-extrabold font-heading tracking-tight text-zinc-900'}>Risk inputs</h3>
            <p className={isDark ? 'mt-2 text-sm text-zinc-300' : 'mt-2 text-sm text-zinc-600'}>
              Configure worker profile and operational signals.
            </p>

            <div className="mt-7 space-y-5">
              <div className="grid grid-cols-2 gap-8">
                <label className="block">
                  <span className={isDark ? 'mb-2 block text-sm text-zinc-200' : 'mb-2 block text-sm text-zinc-700'}>Worker Type</span>
                  <select
                    className={isDark ? 'w-full rounded-[1.5rem] border border-white/15 bg-white/[0.02] backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] border border-white/[0.05] px-6 py-4 text-lg tracking-wide shadow-xl text-zinc-100 outline-none ring-green-200/40 focus:ring' : 'w-full rounded-[1.5rem] border border-zinc-300 bg-white px-6 py-4 text-lg tracking-wide shadow-xl text-zinc-900 outline-none ring-green-500/30 focus:ring'}
                    value={form.worker}
                    onChange={(e) => setForm((prev) => ({ ...prev, worker: e.target.value }))}
                  >
                    <option value="driver">Driver</option>
                    <option value="delivery">Delivery</option>
                    <option value="other">Other</option>
                  </select>
                </label>

                <label className="block">
                  <span className={isDark ? 'mb-2 block text-sm text-zinc-200' : 'mb-2 block text-sm text-zinc-700'}>Plan</span>
                  <select
                    className={isDark ? 'w-full rounded-[1.5rem] border border-white/15 bg-white/[0.02] backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] border border-white/[0.05] px-6 py-4 text-lg tracking-wide shadow-xl text-zinc-100 outline-none ring-green-200/40 focus:ring' : 'w-full rounded-[1.5rem] border border-zinc-300 bg-white px-6 py-4 text-lg tracking-wide shadow-xl text-zinc-900 outline-none ring-green-500/30 focus:ring'}
                    value={form.plan}
                    onChange={(e) => setForm((prev) => ({ ...prev, plan: e.target.value }))}
                  >
                    <option value="basic">Basic</option>
                    <option value="premium">Premium</option>
                    <option value="elite">Elite</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <label className="block">
                  <span className={isDark ? 'mb-2 block text-sm text-zinc-200' : 'mb-2 block text-sm text-zinc-700'}>Shift</span>
                  <select
                    className={isDark ? 'w-full rounded-[1.5rem] border border-white/15 bg-white/[0.02] backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] border border-white/[0.05] px-6 py-4 text-lg tracking-wide shadow-xl text-zinc-100 outline-none ring-green-200/40 focus:ring' : 'w-full rounded-[1.5rem] border border-zinc-300 bg-white px-6 py-4 text-lg tracking-wide shadow-xl text-zinc-900 outline-none ring-green-500/30 focus:ring'}
                    value={form.time}
                    onChange={(e) => setForm((prev) => ({ ...prev, time: e.target.value }))}
                  >
                    <option value="day">Day</option>
                    <option value="night">Night</option>
                  </select>
                </label>

                <label className="block">
                  <span className={isDark ? 'mb-2 block text-sm text-zinc-200' : 'mb-2 block text-sm text-zinc-700'}>Weather</span>
                  <select
                    className={isDark ? 'w-full rounded-[1.5rem] border border-white/15 bg-white/[0.02] backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] border border-white/[0.05] px-6 py-4 text-lg tracking-wide shadow-xl text-zinc-100 outline-none ring-green-200/40 focus:ring' : 'w-full rounded-[1.5rem] border border-zinc-300 bg-white px-6 py-4 text-lg tracking-wide shadow-xl text-zinc-900 outline-none ring-green-500/30 focus:ring'}
                    value={form.weather}
                    onChange={(e) => setForm((prev) => ({ ...prev, weather: e.target.value }))}
                  >
                    <option value="mild">Mild</option>
                    <option value="moderate">Moderate</option>
                    <option value="severe">Severe</option>
                    <option value="extreme">Extreme</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <label className="block">
                  <span className={isDark ? 'mb-2 block text-sm text-zinc-200' : 'mb-2 block text-sm text-zinc-700'}>Hours</span>
                  <input
                    min="1"
                    max="16"
                    type="number"
                    className={isDark ? 'w-full rounded-[1.5rem] border border-white/15 bg-white/[0.02] backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] border border-white/[0.05] px-6 py-4 text-lg tracking-wide shadow-xl text-zinc-100 outline-none ring-green-200/40 focus:ring' : 'w-full rounded-[1.5rem] border border-zinc-300 bg-white px-6 py-4 text-lg tracking-wide shadow-xl text-zinc-900 outline-none ring-green-500/30 focus:ring'}
                    value={form.hours}
                    onChange={(e) => setForm((prev) => ({ ...prev, hours: e.target.value }))}
                  />
                </label>

                <label className="block">
                  <span className={isDark ? 'mb-2 block text-sm text-zinc-200' : 'mb-2 block text-sm text-zinc-700'}>Previous Claims</span>
                  <input
                    min="0"
                    max="8"
                    type="number"
                    className={isDark ? 'w-full rounded-[1.5rem] border border-white/15 bg-white/[0.02] backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] border border-white/[0.05] px-6 py-4 text-lg tracking-wide shadow-xl text-zinc-100 outline-none ring-green-200/40 focus:ring' : 'w-full rounded-[1.5rem] border border-zinc-300 bg-white px-6 py-4 text-lg tracking-wide shadow-xl text-zinc-900 outline-none ring-green-500/30 focus:ring'}
                    value={form.previousClaims}
                    onChange={(e) => setForm((prev) => ({ ...prev, previousClaims: Number(e.target.value) || 0 }))}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <label className="block">
                  <span className={isDark ? 'mb-2 block text-sm text-zinc-200' : 'mb-2 block text-sm text-zinc-700'}>Expected Deliveries</span>
                  <input
                    min="0"
                    max="60"
                    type="number"
                    className={isDark ? 'w-full rounded-[1.5rem] border border-white/15 bg-white/[0.02] backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] border border-white/[0.05] px-6 py-4 text-lg tracking-wide shadow-xl text-zinc-100 outline-none ring-green-200/40 focus:ring' : 'w-full rounded-[1.5rem] border border-zinc-300 bg-white px-6 py-4 text-lg tracking-wide shadow-xl text-zinc-900 outline-none ring-green-500/30 focus:ring'}
                    value={form.expectedDeliveries}
                    onChange={(e) => setForm((prev) => ({ ...prev, expectedDeliveries: Number(e.target.value) || 0 }))}
                  />
                </label>

                <label className="block">
                  <span className={isDark ? 'mb-2 block text-sm text-zinc-200' : 'mb-2 block text-sm text-zinc-700'}>Actual Deliveries</span>
                  <input
                    min="0"
                    max="60"
                    type="number"
                    className={isDark ? 'w-full rounded-[1.5rem] border border-white/15 bg-white/[0.02] backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] border border-white/[0.05] px-6 py-4 text-lg tracking-wide shadow-xl text-zinc-100 outline-none ring-green-200/40 focus:ring' : 'w-full rounded-[1.5rem] border border-zinc-300 bg-white px-6 py-4 text-lg tracking-wide shadow-xl text-zinc-900 outline-none ring-green-500/30 focus:ring'}
                    value={form.actualDeliveries}
                    onChange={(e) => setForm((prev) => ({ ...prev, actualDeliveries: Number(e.target.value) || 0 }))}
                  />
                </label>
              </div>

              <div className={isDark ? 'rounded-[2rem] border border-white/10 bg-white/[0.02] p-6 backdrop-blur-2xl' : 'rounded-[2rem] border border-zinc-200 bg-zinc-50 p-6'}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className={isDark ? 'text-sm font-bold font-heading uppercase tracking-wider text-green-300' : 'text-sm font-bold font-heading uppercase tracking-wider text-green-700'}>Region intelligence</p>
                    <p className={isDark ? 'mt-1 text-xs text-zinc-400' : 'mt-1 text-xs text-zinc-600'}>Select a state and district, then fetch live weather to classify disruption severity.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsMapPickerOpen(true)}
                      className={isDark ? 'rounded-full border border-white/20 bg-white/[0.04] px-4 py-2 text-xs font-bold font-heading text-zinc-100 transition hover:border-green-300/40 hover:text-green-100' : 'rounded-full border border-zinc-300 bg-white px-4 py-2 text-xs font-bold font-heading text-zinc-800 transition hover:border-green-300 hover:text-green-700'}
                    >
                      Pick on map
                    </button>
                    <button
                      type="button"
                      onClick={fetchRegionWeather}
                      disabled={regionLoading}
                      className={isDark ? 'rounded-full border border-green-300/30 bg-green-500/20 px-4 py-2 text-xs font-bold font-heading text-green-100 transition hover:bg-green-500/30 disabled:cursor-not-allowed disabled:opacity-60' : 'rounded-full border border-green-300 bg-green-100 px-4 py-2 text-xs font-bold font-heading text-green-800 transition hover:bg-green-200 disabled:cursor-not-allowed disabled:opacity-60'}
                    >
                      {regionLoading ? 'Fetching weather...' : 'Select region'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className={isDark ? 'mb-2 block text-sm text-zinc-200' : 'mb-2 block text-sm text-zinc-700'}>State</span>
                    <select
                      value={selectedState}
                      onChange={(e) => setSelectedState(e.target.value)}
                      className={isDark ? 'w-full rounded-[1.25rem] border border-white/10 bg-black/50 px-4 py-3 text-sm text-zinc-100 outline-none ring-green-200/30 focus:ring' : 'w-full rounded-[1.25rem] border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none ring-green-500/30 focus:ring'}
                    >
                      {regions.map((region) => (
                        <option key={region.state} value={region.state}>{region.state}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className={isDark ? 'mb-2 block text-sm text-zinc-200' : 'mb-2 block text-sm text-zinc-700'}>District</span>
                    <select
                      value={selectedDistrict}
                      onChange={(e) => setSelectedDistrict(e.target.value)}
                      className={isDark ? 'w-full rounded-[1.25rem] border border-white/10 bg-black/50 px-4 py-3 text-sm text-zinc-100 outline-none ring-green-200/30 focus:ring' : 'w-full rounded-[1.25rem] border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none ring-green-500/30 focus:ring'}
                    >
                      {selectedStateDistricts.map((district) => (
                        <option key={district} value={district}>{district}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className={isDark ? 'mt-4 rounded-[1.5rem] border border-white/10 bg-black/30 p-4 backdrop-blur-xl' : 'mt-4 rounded-[1.5rem] border border-zinc-200 bg-white p-4'}>
                  <p className={isDark ? 'text-xs font-bold font-heading uppercase tracking-wider text-zinc-300' : 'text-xs font-bold font-heading uppercase tracking-wider text-zinc-600'}>Interactive India map</p>
                  <div className={isDark ? 'mt-3 rounded-[1.25rem] border border-white/10 bg-black/60 p-3 shadow-[0_20px_50px_rgba(0,0,0,0.45)]' : 'mt-3 rounded-[1.25rem] border border-zinc-200 bg-zinc-50 p-3 shadow-[0_20px_50px_rgba(0,0,0,0.08)]'}>
                    <svg viewBox={indiaMap.viewBox} className="h-72 w-full">
                      {indiaMap.locations.map((location) => {
                        const code = location.id.toUpperCase()
                        const active = code === selectedStateCode
                        return (
                          <path
                            key={location.id}
                            d={location.path}
                            role="button"
                            tabIndex={0}
                            onMouseEnter={() => setSelectedStateByCode(code)}
                            onClick={() => setSelectedStateByCode(code)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                setSelectedStateByCode(code)
                              }
                            }}
                            className="transition-colors duration-200"
                            fill={active ? (isDark ? '#22c55e' : '#16a34a') : isDark ? '#1f2937' : '#e5e7eb'}
                            stroke={isDark ? '#3f3f46' : '#d4d4d8'}
                            strokeWidth={active ? 1.3 : 0.8}
                          >
                            <title>{location.name}</title>
                          </path>
                        )
                      })}
                    </svg>
                    <p className={isDark ? 'mt-2 text-xs text-zinc-400' : 'mt-2 text-xs text-zinc-600'}>
                      Hover or click a state/UT to switch context. Current selection: {selectedState}
                    </p>
                  </div>

                  <div className="mt-3 grid max-h-40 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                    {regions.map((region) => {
                      const active = region.code === selectedStateCode
                      return (
                        <button
                          key={region.code}
                          type="button"
                          onClick={() => setSelectedState(region.state)}
                          className={active
                            ? isDark
                              ? 'rounded-xl border border-green-300/60 bg-green-500/20 px-2 py-2 text-xs font-semibold text-green-100'
                              : 'rounded-xl border border-green-400 bg-green-100 px-2 py-2 text-xs font-semibold text-green-800'
                            : isDark
                              ? 'rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2 text-xs text-zinc-300 hover:border-green-300/30'
                              : 'rounded-xl border border-zinc-200 bg-zinc-100 px-2 py-2 text-xs text-zinc-700 hover:border-green-300'}
                        >
                          {region.code}
                        </button>
                      )
                    })}
                  </div>

                  <div className="mt-3 flex max-h-28 flex-wrap gap-2 overflow-y-auto pr-1">
                    {selectedStateDistricts.map((district) => {
                      const active = district === selectedDistrict
                      return (
                        <button
                          key={district}
                          type="button"
                          onClick={() => setSelectedDistrict(district)}
                          className={active
                            ? isDark
                              ? 'rounded-full border border-green-300/50 bg-green-500/20 px-3 py-1 text-xs font-semibold text-green-100'
                              : 'rounded-full border border-green-400 bg-green-100 px-3 py-1 text-xs font-semibold text-green-800'
                            : isDark
                              ? 'rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-zinc-300 hover:border-green-300/30'
                              : 'rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1 text-xs text-zinc-700 hover:border-green-300'}
                        >
                          {district}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className={isDark ? 'mt-4 rounded-[1.25rem] border border-white/10 bg-white/[0.02] p-4' : 'mt-4 rounded-[1.25rem] border border-zinc-200 bg-white p-4'}>
                  <div className="flex items-center gap-2">
                    <MapPin className={isDark ? 'h-4 w-4 text-green-300' : 'h-4 w-4 text-green-600'} />
                    <p className={isDark ? 'text-sm font-semibold text-zinc-100' : 'text-sm font-semibold text-zinc-900'}>Registered Region: {form.zone}</p>
                  </div>
                  {regionWeather ? (
                    <p className={isDark ? 'mt-2 text-xs text-zinc-300' : 'mt-2 text-xs text-zinc-700'}>
                      Live weather report: {regionWeather.temperature}C, wind {regionWeather.windSpeed} km/h, precipitation {regionWeather.precipitation} mm/h, code {regionWeather.weatherCode}. Classified as{' '}
                      <span className={isDark ? 'font-bold text-green-300' : 'font-bold text-green-700'}>{regionWeather.severity}</span>.
                    </p>
                  ) : (
                    <p className={isDark ? 'mt-2 text-xs text-zinc-400' : 'mt-2 text-xs text-zinc-600'}>Fetch weather to auto-update severity and zone-based risk profile.</p>
                  )}
                  {regionError ? (
                    <p className={isDark ? 'mt-2 text-xs text-amber-200' : 'mt-2 text-xs text-amber-700'}>{regionError}</p>
                  ) : null}
                </div>
              </div>

              <AnimatePresence>
                {isMapPickerOpen ? (
                  <Motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4"
                    onClick={() => setIsMapPickerOpen(false)}
                  >
                    <Motion.div
                      initial={{ opacity: 0, y: 20, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 20, scale: 0.98 }}
                      transition={{ duration: 0.22 }}
                      className={isDark ? 'w-full max-w-4xl rounded-[2rem] border border-white/10 bg-zinc-950/95 p-6 backdrop-blur-3xl' : 'w-full max-w-4xl rounded-[2rem] border border-zinc-200 bg-white/95 p-6 backdrop-blur-3xl'}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <p className={isDark ? 'text-lg font-bold font-heading text-white' : 'text-lg font-bold font-heading text-zinc-900'}>Select Region on India Map</p>
                          <p className={isDark ? 'text-xs text-zinc-400' : 'text-xs text-zinc-600'}>Click a state/UT, then choose a district and fetch weather.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsMapPickerOpen(false)}
                          className={isDark ? 'rounded-full border border-white/20 px-3 py-1.5 text-xs text-zinc-200 hover:border-green-300/40 hover:text-green-200' : 'rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:border-green-300 hover:text-green-700'}
                        >
                          Close
                        </button>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                        <div className={isDark ? 'rounded-[1.5rem] border border-white/10 bg-black/60 p-3' : 'rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-3'}>
                          <svg viewBox={indiaMap.viewBox} className="h-[420px] w-full">
                            {indiaMap.locations.map((location) => {
                              const code = location.id.toUpperCase()
                              const active = code === selectedStateCode
                              return (
                                <path
                                  key={location.id}
                                  d={location.path}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setSelectedStateByCode(code)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault()
                                      setSelectedStateByCode(code)
                                    }
                                  }}
                                  className="cursor-pointer transition-colors duration-200"
                                  fill={active ? (isDark ? '#22c55e' : '#16a34a') : isDark ? '#18181b' : '#e4e4e7'}
                                  stroke={isDark ? '#52525b' : '#d4d4d8'}
                                  strokeWidth={active ? 1.4 : 0.9}
                                >
                                  <title>{location.name}</title>
                                </path>
                              )
                            })}
                          </svg>
                        </div>

                        <div className={isDark ? 'rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4' : 'rounded-[1.5rem] border border-zinc-200 bg-white p-4'}>
                          <p className={isDark ? 'text-sm font-semibold text-zinc-100' : 'text-sm font-semibold text-zinc-900'}>{selectedState}</p>
                          <p className={isDark ? 'mt-1 text-xs text-zinc-400' : 'mt-1 text-xs text-zinc-600'}>Code: {selectedStateCode}</p>

                          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                            {selectedStateDistricts.map((district) => {
                              const active = district === selectedDistrict
                              return (
                                <button
                                  key={district}
                                  type="button"
                                  onClick={() => setSelectedDistrict(district)}
                                  className={active
                                    ? isDark
                                      ? 'w-full rounded-xl border border-green-300/50 bg-green-500/20 px-3 py-2 text-left text-xs font-semibold text-green-100'
                                      : 'w-full rounded-xl border border-green-400 bg-green-100 px-3 py-2 text-left text-xs font-semibold text-green-800'
                                    : isDark
                                      ? 'w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-left text-xs text-zinc-300 hover:border-green-300/30'
                                      : 'w-full rounded-xl border border-zinc-300 bg-zinc-100 px-3 py-2 text-left text-xs text-zinc-700 hover:border-green-300'}
                                >
                                  {district}
                                </button>
                              )
                            })}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setIsMapPickerOpen(false)
                              fetchRegionWeather()
                            }}
                            className={isDark ? 'mt-4 w-full rounded-full border border-green-300/40 bg-green-500/20 px-4 py-2.5 text-xs font-bold font-heading text-green-100 hover:bg-green-500/30' : 'mt-4 w-full rounded-full border border-green-300 bg-green-100 px-4 py-2.5 text-xs font-bold font-heading text-green-800 hover:bg-green-200'}
                          >
                            Use this region
                          </button>
                        </div>
                      </div>
                    </Motion.div>
                  </Motion.div>
                ) : null}
              </AnimatePresence>

              <Motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={triggerClaim}
                className={isDark ? 'inline-flex w-full items-center justify-center gap-2 rounded-[1.5rem] bg-white px-6 py-4 text-lg tracking-wide shadow-xl font-bold font-heading text-zinc-900 transition hover:bg-green-100' : 'inline-flex w-full items-center justify-center gap-2 rounded-[1.5rem] bg-zinc-900 px-6 py-4 text-lg tracking-wide shadow-xl font-bold font-heading text-white transition hover:bg-zinc-700'}
              >
                <CloudLightning className="h-4 w-4" /> Add event
              </Motion.button>
            </div>
          </Motion.div>

          <Motion.div
            initial={{ opacity: 0, x: 22 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className={isDark ? 'rounded-[2.5rem] border border-white/5 bg-white/[0.03] backdrop-blur-2xl p-10 backdrop-blur-xl' : 'rounded-[2.5rem] border border-zinc-200 bg-white p-10'}
          >
            <h3 className={isDark ? 'text-3xl lg:text-4xl font-extrabold font-heading tracking-tight text-white' : 'text-3xl lg:text-4xl font-extrabold font-heading tracking-tight text-zinc-900'}>Decision output</h3>
            <p className={isDark ? 'mt-2 text-sm text-zinc-300' : 'mt-2 text-sm text-zinc-600'}>
              Live underwriting output based on the risk inputs at this section.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-8">
              <div className={isDark ? 'rounded-[2rem] bg-white/[0.02] backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] border border-white/[0.05] p-8' : 'rounded-[2rem] border border-zinc-200 bg-white p-8'}>
                <p className={isDark ? 'text-xs text-zinc-400' : 'text-xs text-zinc-500'}>Risk score</p>
                <p className={isDark ? 'mt-2 text-4xl lg:text-5xl font-black font-mono tracking-tighter text-white' : 'mt-2 text-4xl lg:text-5xl font-black font-mono tracking-tighter text-zinc-900'}><AnimatedNumber value={result.riskScore} /></p>
              </div>
              <div className={isDark ? 'rounded-[2rem] bg-white/[0.02] backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] border border-white/[0.05] p-8' : 'rounded-[2rem] border border-zinc-200 bg-white p-8'}>
                <p className={isDark ? 'text-xs text-zinc-400' : 'text-xs text-zinc-500'}>Risk level</p>
                <p className={isDark ? 'mt-2 text-4xl lg:text-5xl font-black font-mono tracking-tighter text-white' : 'mt-2 text-4xl lg:text-5xl font-black font-mono tracking-tighter text-zinc-900'}>{result.risk}</p>
              </div>
              <div className={isDark ? 'rounded-[2rem] bg-white/[0.02] backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] border border-white/[0.05] p-8' : 'rounded-[2rem] border border-zinc-200 bg-white p-8'}>
                <p className={isDark ? 'text-xs text-zinc-400' : 'text-xs text-zinc-500'}>Premium</p>
                <p className={isDark ? 'mt-2 text-4xl lg:text-5xl font-black font-mono tracking-tighter text-white' : 'mt-2 text-4xl lg:text-5xl font-black font-mono tracking-tighter text-zinc-900'}><AnimatedNumber value={result.premium} prefix="Rs " /></p>
              </div>
              <div className={isDark ? 'rounded-[2rem] bg-white/[0.02] backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] border border-white/[0.05] p-8' : 'rounded-[2rem] border border-zinc-200 bg-white p-8'}>
                <p className={isDark ? 'text-xs text-zinc-400' : 'text-xs text-zinc-500'}>Recommended payout</p>
                <p className={isDark ? 'mt-2 text-4xl lg:text-5xl font-black font-mono tracking-tighter text-green-300' : 'mt-2 text-4xl lg:text-5xl font-black font-mono tracking-tighter text-green-600'}><AnimatedNumber value={result.payout} prefix="Rs " /></p>
              </div>
            </div>

            <div className={isDark ? 'mt-5 rounded-[1.5rem] border border-green-300/20 bg-green-200/10 p-8' : 'mt-5 rounded-[1.5rem] border border-green-200 bg-green-50 p-8'}>
              <p className={isDark ? 'text-xs font-bold font-heading uppercase tracking-wider text-green-200' : 'text-xs font-bold font-heading uppercase tracking-wider text-green-800'}>Disruption alerts</p>
              <ul className={isDark ? 'mt-3 space-y-2 text-sm text-green-100/90' : 'mt-3 space-y-2 text-sm text-green-900'}>
                {result.alerts.map((alert) => (
                  <li key={alert} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {alert}
                  </li>
                ))}
              </ul>
            </div>

            <div className={isDark ? 'mt-4 rounded-[1.5rem] border border-amber-300/20 bg-amber-100/10 p-8' : 'mt-4 rounded-[1.5rem] border border-amber-200 bg-amber-50 p-8'}>
              <p className={isDark ? 'text-xs font-bold font-heading uppercase tracking-wider text-amber-200' : 'text-xs font-bold font-heading uppercase tracking-wider text-amber-800'}>Fraud detection</p>
              {result.fraudSignals.length ? (
                <ul className={isDark ? 'mt-3 space-y-2 text-sm text-amber-50/95' : 'mt-3 space-y-2 text-sm text-amber-900'}>
                  {result.fraudSignals.map((signal) => (
                    <li key={signal} className="flex items-start gap-2">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {signal}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={isDark ? 'mt-3 text-sm text-amber-50/90' : 'mt-3 text-sm text-amber-900'}>No anomaly detected for the selected run.</p>
              )}
            </div>
          </Motion.div>
        </div>
      </section>

      <section id="coverage" className="relative py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className={isDark ? 'text-4xl lg:text-5xl font-extrabold font-heading tracking-tight text-white sm:text-5xl lg:text-7xl tracking-tight font-heading' : 'text-4xl lg:text-5xl font-extrabold font-heading tracking-tight text-zinc-900 sm:text-5xl lg:text-7xl tracking-tight font-heading'}>Weekly coverage plans</h2>
          <p className={isDark ? 'mt-3 max-w-3xl text-zinc-300' : 'mt-3 max-w-3xl text-zinc-700'}>
            Plans are fixed weekly subscriptions. Trigger payout is adjusted by disruption severity and activity validation.
          </p>

          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {Object.entries(plans).map(([key, plan]) => {
              const active = form.plan === key
              return (
                <Motion.div
                  key={key}
                  whileHover={{ y: -5 }}
                  onClick={() => setForm((f) => ({ ...f, plan: key }))}
                  className={`${
                    active
                      ? isDark
                        ? 'border-green-300/60 bg-green-100/10 shadow-[0_14px_36px_rgba(34,211,238,0.18)]'
                        : 'border-green-400 bg-green-50 shadow-[0_14px_36px_rgba(6,182,212,0.18)]'
                      : isDark
                        ? 'border-white/5 bg-white/[0.03] backdrop-blur-2xl'
                        : 'border-zinc-200 bg-white'
                  } cursor-pointer rounded-[2rem] border p-8 transition`}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <p className={isDark ? 'text-lg font-bold font-heading capitalize text-white' : 'text-lg font-bold font-heading capitalize text-zinc-900'}>{key}</p>
                    {active ? (
                      <span className={isDark ? 'rounded-full border border-green-200/60 bg-green-300/20 px-3 py-1 text-xs text-green-100' : 'rounded-full border border-green-300 bg-green-100 px-3 py-1 text-xs text-green-700'}>
                        Selected
                      </span>
                    ) : null}
                  </div>
                  <p className={isDark ? 'text-5xl lg:text-7xl tracking-tight font-heading font-extrabold text-white' : 'text-5xl lg:text-7xl tracking-tight font-heading font-extrabold text-zinc-900'}>Rs {plan.weekly}</p>
                  <p className={isDark ? 'mt-1 text-sm text-zinc-400' : 'mt-1 text-sm text-zinc-500'}>per week</p>
                  <ul className={isDark ? 'mt-5 space-y-3 text-sm text-zinc-200' : 'mt-5 space-y-3 text-sm text-zinc-700'}>
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-400" /> Max payout up to Rs {plan.payout}</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-400" /> {plan.coverage}</li>
                    <li className="flex items-center gap-2"><CloudLightning className="h-4 w-4 text-green-400" /> Dynamic trigger and explainable validation</li>
                  </ul>
                </Motion.div>
              )
            })}
          </div>
        </div>
      </section>

      <section id="claims" className={isDark ? 'relative py-20 bg-black/50 backdrop-blur-3xl' : 'relative py-20 bg-zinc-100/75'}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-8">
            <div>
              <h2 className={isDark ? 'text-4xl lg:text-5xl font-extrabold font-heading tracking-tight text-white sm:text-5xl lg:text-7xl tracking-tight font-heading' : 'text-4xl lg:text-5xl font-extrabold font-heading tracking-tight text-zinc-900 sm:text-5xl lg:text-7xl tracking-tight font-heading'}>Event history</h2>
              <p className={isDark ? 'mt-2 text-zinc-300' : 'mt-2 text-zinc-700'}>Recent event outcomes with decision state and payout output.</p>
            </div>
            <span className={isDark ? 'rounded-full border border-white/15 bg-white/[0.03] backdrop-blur-2xl px-4 py-2 text-xs font-bold font-heading text-zinc-200' : 'rounded-full border border-zinc-300 bg-white px-4 py-2 text-xs font-bold font-heading text-zinc-700'}>
              Total events: {claims.length}
            </span>
          </div>

          {claims.length === 0 ? (
            <div className={isDark ? 'rounded-[2rem] border border-dashed border-white/15 bg-white/[0.03] backdrop-blur-2xl p-8 text-center text-zinc-300' : 'rounded-[2rem] border border-dashed border-zinc-300 bg-white p-8 text-center text-zinc-700'}>
              No events recorded yet.
            </div>
          ) : (
            <div className="grid gap-8">
              {claims.map((claim, index) => (
                <Motion.article
                  key={claim.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  className={isDark ? 'rounded-[2rem] border border-white/5 bg-white/[0.03] backdrop-blur-2xl p-5 backdrop-blur-xl' : 'rounded-[2rem] border border-zinc-200 bg-white p-5'}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className={isDark ? 'text-sm font-bold font-heading text-white' : 'text-sm font-bold font-heading text-zinc-900'}>{claim.zone}</p>
                      <p className={isDark ? 'text-xs text-zinc-400' : 'text-xs text-zinc-500'}>{claim.time}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={statusStyles(claim.decision, isDark) + ' rounded-full border px-3 py-1 text-xs font-bold font-heading'}>
                        {claim.decision.replace('-', ' ')}
                      </span>
                      <span className={isDark ? 'text-sm font-bold text-green-300' : 'text-sm font-bold text-green-600'}>Rs {claim.payout}</span>
                    </div>
                  </div>
                </Motion.article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

export default function App() {
  const [view, setView] = useState('landing')
  const [authMode, setAuthMode] = useState('login')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [theme, setTheme] = useState(() => {
    const stored = window.localStorage.getItem('valor-theme')
    return stored === 'light' || stored === 'dark' ? stored : 'dark'
  })
  const [claims, setClaims] = useState([])
  const [selectedState, setSelectedState] = useState('Telangana')
  const [selectedDistrict, setSelectedDistrict] = useState('Hyderabad')
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false)
  const [regionWeather, setRegionWeather] = useState(null)
  const [regionLoading, setRegionLoading] = useState(false)
  const [regionError, setRegionError] = useState('')
  const [form, setForm] = useState({
    worker: 'delivery',
    plan: 'premium',
    hours: 8,
    time: 'day',
    weather: 'moderate',
    zone: 'Hyderabad, Telangana',
    expectedDeliveries: 18,
    actualDeliveries: 14,
    previousClaims: 1,
  })

  const selectedStateCode = useMemo(() => {
    const region = INDIA_REGIONS.find((item) => item.state === selectedState)
    return region?.code ?? 'TG'
  }, [selectedState])

  const selectedStateDistricts = useMemo(() => {
    const found = INDIA_REGIONS.find((region) => region.state === selectedState)
    return found?.districts ?? []
  }, [selectedState])

  const setSelectedStateByCode = (code) => {
    const region = INDIA_REGIONS.find((item) => item.code === code)
    if (region) {
      setSelectedState(region.state)
    }
  }

  useEffect(() => {
    window.localStorage.setItem('valor-theme', theme)
  }, [theme])

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (!selectedStateDistricts.length) return
    const districtExists = selectedStateDistricts.includes(selectedDistrict)
    if (!districtExists) {
      setSelectedDistrict(selectedStateDistricts[0])
    }
  }, [selectedStateDistricts, selectedDistrict])

  useEffect(() => {
    setForm((prev) => ({ ...prev, zone: `${selectedDistrict}, ${selectedState}` }))
  }, [selectedState, selectedDistrict])

  const result = useMemo(() => calculateRisk(form), [form])

  const triggerClaim = () => {
    const newClaim = {
      id: crypto.randomUUID(),
      time: new Date().toLocaleString(),
      zone: form.zone,
      decision: result.claimDecision,
      payout: result.payout,
    }
    setClaims((prev) => [newClaim, ...prev].slice(0, 6))
    setForm((prev) => ({ ...prev, previousClaims: prev.previousClaims + 1 }))
  }

  const fetchRegionWeather = async () => {
    if (!selectedDistrict || !selectedState) {
      setRegionError('Select a valid region before fetching weather.')
      return
    }

    setRegionLoading(true)
    setRegionError('')

    try {
      const districtQueries = [
        `${selectedDistrict}, ${selectedState}, India`,
        `${selectedDistrict} district, ${selectedState}, India`,
        `${selectedDistrict.replace(/[-–]/g, ' ')}, ${selectedState}, India`,
      ]

      let candidates = await resolveIndiaLocationCandidates(districtQueries)
      let usedStateFallback = false
      let usedSecondaryProvider = false

      if (!candidates.length) {
        candidates = await resolveIndiaLocationCandidates([`${selectedState}, India`])
        usedStateFallback = Boolean(candidates.length)
      }

      let resolved = candidates.find((item) => {
        const admin = normalizeLocationName(item.admin1)
        return admin === normalizeLocationName(selectedState)
      }) ?? candidates[0]

      if (!resolved) {
        const nominatimCandidates = await resolveIndiaLocationWithNominatim([
          `${selectedDistrict}, ${selectedState}, India`,
          `${selectedDistrict} district, ${selectedState}, India`,
          `${selectedState}, India`,
        ])

        resolved = nominatimCandidates.find((item) => {
          const stateText = normalizeLocationName(item?.address?.state || item?.address?.region)
          return stateText === normalizeLocationName(selectedState)
        }) ?? nominatimCandidates[0]

        usedSecondaryProvider = Boolean(resolved)
      }

      if (!resolved) {
        throw new Error('No India location found for this region.')
      }

      const latitude = Number(resolved.latitude ?? resolved.lat)
      const longitude = Number(resolved.longitude ?? resolved.lon)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error('Region coordinates are unavailable from geocoding providers.')
      }

      const weatherParams = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        current: 'temperature_2m,wind_speed_10m,precipitation,weather_code',
        timezone: 'auto',
      })
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${weatherParams.toString()}`)
      if (!response.ok) {
        throw new Error('Weather provider returned an error.')
      }

      const payload = await response.json()
      const current = payload?.current
      if (!current) {
        throw new Error('Weather data missing for selected region.')
      }

      const severity = classifyWeatherSeverity({
        weatherCode: Number(current.weather_code ?? 0),
        windSpeed: Number(current.wind_speed_10m ?? 0),
        precipitation: Number(current.precipitation ?? 0),
      })

      setRegionWeather({
        weatherCode: Number(current.weather_code ?? 0),
        windSpeed: Number(current.wind_speed_10m ?? 0),
        precipitation: Number(current.precipitation ?? 0),
        temperature: Number(current.temperature_2m ?? 0),
        severity,
      })

      setForm((prev) => ({
        ...prev,
        weather: severity,
        zone: `${selectedDistrict}, ${selectedState}`,
      }))

      if (usedStateFallback) {
        setRegionError('Exact district coordinates were unavailable. Showing state-level weather for this region.')
      }
    } catch (error) {
      setRegionError(error instanceof Error ? error.message : 'Unable to fetch weather right now.')
    } finally {
      setRegionLoading(false)
    }
  }

  const isDark = theme === 'dark'

  return (
    <Motion.div 
      initial={false}
      animate={{ 
        backgroundColor: isDark ? '#000000' : '#fafafa',
        color: isDark ? '#f4f4f5' : '#18181b'
      }}
      transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
      className={`min-h-screen overflow-x-hidden ${isDark ? 'theme-dark selection:bg-green-500/30 selection:text-green-100' : 'theme-light selection:bg-green-500/20 selection:text-zinc-900'}`}
    >
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <Motion.div
          animate={{ x: [0, 45, 0], y: [0, -32, 0], scale: [1, 1.08, 1] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
          className={isDark ? 'absolute -top-[20%] -left-[10%] h-[800px] w-[800px] rounded-full bg-white/10 blur-[160px] mix-blend-screen' : 'absolute -top-[20%] -left-[10%] h-[800px] w-[800px] rounded-full bg-white/5 blur-[160px] mix-blend-multiply'}
        />
        <Motion.div
          animate={{ x: [0, -48, 0], y: [0, 34, 0], scale: [1, 1.12, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut', delay: 1.8 }}
          className={isDark ? 'absolute -right-[10%] top-[20%] h-[900px] w-[900px] rounded-full bg-green-600/30 blur-[180px] mix-blend-screen' : 'absolute -right-[10%] top-[20%] h-[900px] w-[900px] rounded-full bg-green-500/20 blur-[180px] mix-blend-add'}
        />
      </div>

      <nav
        className={`sticky top-0 z-50 border-b transition-all duration-300 ${
          scrolled
            ? isDark
              ? 'border-white/5 bg-black/60 backdrop-blur-3xl border-b border-white/[0.05] backdrop-blur-xl'
              : 'border-zinc-200/80 bg-zinc-50/75 backdrop-blur-xl'
            : 'border-transparent bg-transparent'
        }`}
      >
        <div className="mx-auto flex h-24 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => {
              setView('landing')
              setIsMenuOpen(false)
            }}
            className="flex items-center gap-3 text-left"
          >
            <div className="relative grid h-10 w-10 place-items-center rounded-[1.5rem] bg-gradient-to-br from-green-400 to-green-500 shadow-lg shadow-green-500/25">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className={isDark ? 'text-2xl font-extrabold font-heading tracking-tight text-white' : 'text-2xl font-extrabold font-heading tracking-tight text-zinc-900'}>Valor Shield</p>
              <p className="text-[0.65rem] uppercase tracking-[0.28em] text-green-500/90">Parametric Cover</p>
            </div>
          </button>

          <div className="hidden items-center gap-8 md:flex">
            <button onClick={() => setView('landing')} className={isDark ? 'text-sm font-medium text-zinc-300 transition-colors hover:text-white' : 'text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950'}>Home</button>
            <button onClick={() => setView('auth')} className={isDark ? 'text-sm font-medium text-zinc-300 transition-colors hover:text-white' : 'text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950'}>Login</button>
            <button onClick={() => setView('dashboard')} className={isDark ? 'text-sm font-medium text-zinc-300 transition-colors hover:text-white' : 'text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950'}>Workspace</button>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <button
              type="button"
              onClick={() => setTheme((v) => (v === 'dark' ? 'light' : 'dark'))}
              className={isDark ? 'inline-flex items-center gap-2 rounded-full border border-white/5 bg-white/[0.03] backdrop-blur-2xl px-4 py-2 text-xs font-bold font-heading text-zinc-200 backdrop-blur-2xl transition hover:bg-white/10' : 'inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-4 py-2 text-xs font-bold font-heading text-zinc-700 transition hover:bg-zinc-100'}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {isDark ? 'Light mode' : 'Dark mode'}
            </button>
            <span className={statusStyles(result.claimDecision, isDark) + ' rounded-full border px-3 py-1 text-xs font-bold font-heading'}>
              Claim status: {result.claimDecision.replace('-', ' ')}
            </span>
          </div>

          <button
            className={isDark ? 'grid h-10 w-10 place-items-center rounded-lg border border-white/5 text-white md:hidden' : 'grid h-10 w-10 place-items-center rounded-lg border border-zinc-300 text-zinc-900 md:hidden'}
            onClick={() => setIsMenuOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <AnimatePresence>
          {isMenuOpen && (
            <Motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={isDark ? 'border-t border-white/5 bg-black/80 backdrop-blur-3xl px-4 py-5 backdrop-blur-xl md:hidden' : 'border-t border-zinc-200 bg-zinc-50/95 px-4 py-5 backdrop-blur-xl md:hidden'}
            >
              <div className="flex flex-col gap-3 text-sm">
                <button className="text-left" onClick={() => { setView('landing'); setIsMenuOpen(false) }}>Home</button>
                <button className="text-left" onClick={() => { setView('auth'); setAuthMode('login'); setIsMenuOpen(false) }}>Login</button>
                <button className="text-left" onClick={() => { setView('auth'); setAuthMode('signup'); setIsMenuOpen(false) }}>Sign up</button>
                <button className="text-left" onClick={() => { setView('dashboard'); setIsMenuOpen(false) }}>Workspace</button>
              </div>
            </Motion.div>
          )}
        </AnimatePresence>
      </nav>

      {view === 'landing' ? (
        <LandingPage isDark={isDark} onGoAuth={(mode) => { setAuthMode(mode); setView('auth') }} />
      ) : null}

      {view === 'auth' ? (
        <AuthPage
          isDark={isDark}
          mode={authMode}
          setMode={setAuthMode}
          onBack={() => setView('landing')}
          onEnterModel={() => setView('dashboard')}
        />
      ) : null}

      {view === 'dashboard' ? (
        <DashboardPage
          isDark={isDark}
          form={form}
          setForm={setForm}
          result={result}
          claims={claims}
          triggerClaim={triggerClaim}
          regions={INDIA_REGIONS}
          selectedState={selectedState}
          selectedStateCode={selectedStateCode}
          setSelectedState={setSelectedState}
          setSelectedStateByCode={setSelectedStateByCode}
          selectedDistrict={selectedDistrict}
          setSelectedDistrict={setSelectedDistrict}
          selectedStateDistricts={selectedStateDistricts}
          regionWeather={regionWeather}
          regionLoading={regionLoading}
          regionError={regionError}
          fetchRegionWeather={fetchRegionWeather}
          isMapPickerOpen={isMapPickerOpen}
          setIsMapPickerOpen={setIsMapPickerOpen}
        />
      ) : null}

      <footer className={isDark ? 'relative z-10 border-t border-white/5 bg-black py-12' : 'relative z-10 border-t border-zinc-200 bg-white py-12'}>
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-4 sm:px-6 lg:flex-row lg:px-8">
          <div className="flex items-center gap-3">
            <Shield className={isDark ? 'h-6 w-6 text-green-400' : 'h-6 w-6 text-green-600'} />
            <span className={isDark ? 'text-lg font-bold text-white' : 'text-lg font-bold text-zinc-900'}>Valor Shield</span>
          </div>
          <p className={isDark ? 'text-sm text-zinc-400' : 'text-sm text-zinc-600'}>2026 Valor Shield. Worker-safe, explainable parametric insurance.</p>
          <div className={isDark ? 'flex gap-8 text-sm text-zinc-400' : 'flex gap-8 text-sm text-zinc-600'}>
            <a href="#" className="hover:text-green-400">Privacy</a>
            <a href="#" className="hover:text-green-400">Terms</a>
            <a href="#" className="hover:text-green-400">Audit</a>
          </div>
        </div>
      </footer>
    </Motion.div>
  )
}
