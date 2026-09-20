import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Code2,
  FileCheck2,
  Fingerprint,
  Gauge,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  WalletCards,
  Zap,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import Accordion from '../components/Accordion'
import Footer from '../components/Footer'
import Navbar from '../components/Navbar'
import { faqs } from '../data/mockData'

const steps = [
  { number: '01', title: 'Choose how to hire', description: 'Post an open job for applications or directly assign a wallet you already know. Funding happens before work begins.', icon: LockKeyhole },
  { number: '02', title: 'Submit the work', description: 'The freelancer completes the milestone and shares a delivery link with clear notes.', icon: FileCheck2 },
  { number: '03', title: 'Approve and release', description: 'The client reviews the delivery and approves release of the escrowed USDC.', icon: CircleDollarSign },
]

const features = [
  { title: 'USDC settlement', description: 'Price work in a familiar digital dollar, without exposing either party to token volatility.', icon: Banknote },
  { title: 'Clear job states', description: 'Both parties see the same milestone status, payment amount, deadline, and activity history.', icon: Gauge },
  { title: 'Wallet controlled', description: 'Users approve actions from their own wallet. ArcMilestone never asks for private keys.', icon: WalletCards },
  { title: 'Built for Arc', description: 'A focused experience designed around fast, low-cost transactions on the Arc network.', icon: Zap },
  { title: 'Verifiable activity', description: 'Funding and release transactions will be traceable on Arc Explorer after integration.', icon: Fingerprint },
  { title: 'Simple by design', description: 'Purposeful workflows help clients and freelancers move from agreement to payment quickly.', icon: Sparkles },
]

export default function Home() {
  return (
    <div id="home" className="min-h-screen bg-white">
      <Navbar />
      <main>
        <section className="relative overflow-hidden bg-ink-950 pt-18 text-white">
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-mint-500/30 to-transparent" />
          <div className="absolute top-24 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-mint-500/6 blur-3xl" aria-hidden="true" />
          <div className="container-shell relative grid min-h-[730px] items-center gap-14 py-20 lg:grid-cols-[1.04fr_.96fr] lg:py-24">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-mint-400/20 bg-mint-400/8 px-3 py-1.5 text-xs font-bold text-mint-400"><ShieldCheck className="size-4" />Purpose-built escrow for Arc</div>
              <h1 className="mt-6 max-w-2xl font-display text-4xl font-extrabold leading-[1.08] tracking-[-0.04em] text-white sm:text-5xl lg:text-[3.65rem]">Secure milestone payments with <span className="text-mint-400">USDC</span></h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">Post an open job and review applications, or directly hire a known wallet. Once a freelancer is selected, fund clear terms through escrow.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Link to="/jobs/create" className="btn-primary px-6">Create a Job <ArrowRight className="size-4" /></Link><Link to="/explore" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-6 py-2.5 text-sm font-bold text-white transition hover:border-white/30 hover:bg-white/5">Explore Jobs</Link></div>
              <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold text-slate-400"><span className="inline-flex items-center gap-2"><Check className="size-4 text-mint-400" />Non-custodial design</span><span className="inline-flex items-center gap-2"><Check className="size-4 text-mint-400" />Transparent job terms</span><span className="inline-flex items-center gap-2"><Check className="size-4 text-mint-400" />No platform custody</span></div>
            </div>
            <div className="relative mx-auto w-full max-w-lg lg:ml-auto">
              <div className="absolute -inset-6 rounded-[2rem] border border-white/[0.04]" aria-hidden="true" />
              <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-float backdrop-blur-sm sm:p-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-5"><div><p className="text-xs font-bold tracking-wider text-slate-400 uppercase">Active escrow</p><p className="mt-1.5 font-display text-lg font-bold">SaaS landing page</p></div><span className="rounded-full bg-amber-400/12 px-2.5 py-1.5 text-xs font-bold text-amber-300">Work Submitted</span></div>
                <div className="py-7 text-center"><p className="text-xs font-medium text-slate-400">Protected payment</p><p className="mt-2 font-display text-4xl font-extrabold tracking-tight">150.00 <span className="text-xl text-slate-400">USDC</span></p><div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-lg bg-mint-400/10 px-3 py-1.5 text-xs font-bold text-mint-400"><LockKeyhole className="size-3.5" />Locked in escrow</div></div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border border-white/8 bg-ink-950/55 p-4"><div><div className="grid size-9 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300"><BriefcaseBusiness className="size-4" /></div><p className="mt-2 text-xs font-bold">Client</p><p className="mt-1 font-mono text-[10px] text-slate-500">0x71C4…091F</p></div><ArrowRight className="size-5 text-mint-400" /><div className="text-right"><div className="ml-auto grid size-9 place-items-center rounded-xl bg-mint-400/10 text-mint-300"><Code2 className="size-4" /></div><p className="mt-2 text-xs font-bold">Freelancer</p><p className="mt-1 font-mono text-[10px] text-slate-500">0x4B12…F520</p></div></div>
                <div className="mt-5 grid grid-cols-3 gap-2"><div className="text-center"><CheckCircle2 className="mx-auto size-5 text-mint-400" /><p className="mt-2 text-[10px] font-bold text-slate-300">Funded</p></div><div className="relative text-center"><span className="absolute top-2.5 right-[58%] left-[-42%] h-px bg-mint-400/40" /><CheckCircle2 className="relative mx-auto size-5 text-mint-400" /><p className="mt-2 text-[10px] font-bold text-slate-300">Submitted</p></div><div className="relative text-center"><span className="absolute top-2.5 right-[58%] left-[-42%] h-px bg-white/10" /><span className="relative mx-auto block size-5 rounded-full border-2 border-slate-600 bg-ink-950" /><p className="mt-2 text-[10px] font-bold text-slate-500">Released</p></div></div>
                <p className="mt-5 border-t border-white/10 pt-4 text-center text-[11px] text-slate-500">Interactive preview · No funds are moved</p>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-18 bg-slate-50 py-20 sm:py-24">
          <div className="container-shell"><div className="mx-auto max-w-2xl text-center"><p className="eyebrow">A simpler agreement</p><h2 className="section-heading mt-3">From scope to settlement in three steps</h2><p className="mt-4 text-base leading-7 text-slate-600">One shared workflow keeps expectations clear and payment protected.</p></div><div className="mt-12 grid gap-5 lg:grid-cols-3">{steps.map(({ number, title, description, icon: Icon }) => <article key={number} className="card relative overflow-hidden p-6 sm:p-7"><span className="absolute top-5 right-6 font-display text-4xl font-extrabold text-slate-100">{number}</span><span className="grid size-11 place-items-center rounded-xl bg-mint-50 text-mint-600"><Icon className="size-5" /></span><h3 className="mt-6 font-display text-xl font-bold text-ink-950">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{description}</p></article>)}</div></div>
        </section>

        <section className="py-20 sm:py-24"><div className="container-shell"><div className="grid gap-6 lg:grid-cols-2"><article className="rounded-3xl border border-slate-200 bg-white p-7 shadow-card sm:p-9"><span className="grid size-12 place-items-center rounded-2xl bg-cyan-50 text-cyan-700"><UserRoundCheck className="size-6" /></span><p className="eyebrow mt-7">For clients</p><h2 className="mt-2 font-display text-2xl font-bold text-ink-950">Fund outcomes, not uncertainty</h2><p className="mt-4 text-sm leading-6 text-slate-600">Set clear terms and reserve payment before work begins. Release USDC only after reviewing the submitted deliverable.</p><ul className="mt-6 space-y-3">{['Demonstrate that payment is ready', 'Review work before release', 'Keep an auditable activity record'].map((item) => <li key={item} className="flex items-center gap-3 text-sm font-semibold text-slate-700"><BadgeCheck className="size-5 shrink-0 text-cyan-600" />{item}</li>)}</ul></article><article className="rounded-3xl border border-ink-800 bg-ink-950 p-7 text-white shadow-card sm:p-9"><span className="grid size-12 place-items-center rounded-2xl bg-mint-400/10 text-mint-400"><Code2 className="size-6" /></span><p className="mt-7 text-xs font-bold tracking-[0.14em] text-mint-400 uppercase">For freelancers</p><h2 className="mt-2 font-display text-2xl font-bold">Work with payment confidence</h2><p className="mt-4 text-sm leading-6 text-slate-300">See that USDC is funded before you begin. Submit through one clear workflow and receive payment to your wallet after approval.</p><ul className="mt-6 space-y-3">{['Verify escrow before starting', 'Submit work against agreed terms', 'Receive USDC directly to your wallet'].map((item) => <li key={item} className="flex items-center gap-3 text-sm font-semibold text-slate-200"><BadgeCheck className="size-5 shrink-0 text-mint-400" />{item}</li>)}</ul></article></div></div></section>

        <section id="features" className="scroll-mt-18 border-y border-slate-200 bg-slate-50 py-20 sm:py-24"><div className="container-shell"><div className="max-w-2xl"><p className="eyebrow">Built for real work</p><h2 className="section-heading mt-3">Everything needed for a trustworthy milestone</h2><p className="mt-4 text-base leading-7 text-slate-600">A focused set of tools keeps the agreement understandable from funding through release.</p></div><div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">{features.map(({ title, description, icon: Icon }) => <article key={title} className="flex gap-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-mint-600 shadow-sm"><Icon className="size-5" /></span><div><h3 className="font-display text-base font-bold text-ink-950">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p></div></article>)}</div></div></section>

        <section className="py-20 sm:py-24"><div className="container-shell"><div className="overflow-hidden rounded-3xl bg-ink-950 text-white"><div className="grid items-center gap-10 p-7 sm:p-10 lg:grid-cols-[1.1fr_.9fr] lg:p-14"><div><div className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-mint-400 uppercase"><ShieldCheck className="size-4" />Security by design</div><h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">Your wallet stays yours</h2><p className="mt-5 max-w-xl text-base leading-7 text-slate-300">ArcMilestone is designed as a non-custodial interface. You approve contract interactions through your own wallet, and we will never request a private key or recovery phrase.</p><Link to="/help" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-mint-400 hover:text-mint-300">Read the safety guide <ArrowRight className="size-4" /></Link></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">{['Review every wallet prompt', 'Verify addresses before signing', 'Inspect transactions on Arc Explorer'].map((item, index) => <div key={item} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-mint-400/10 text-xs font-extrabold text-mint-400">0{index + 1}</span><p className="text-sm font-semibold text-slate-200">{item}</p></div>)}</div></div></div></div></section>

        <section id="faq" className="scroll-mt-18 bg-slate-50 py-20 sm:py-24"><div className="container-shell grid gap-10 lg:grid-cols-[.72fr_1.28fr]"><div><p className="eyebrow">Common questions</p><h2 className="section-heading mt-3">Clear answers, before you fund</h2><p className="mt-4 max-w-sm text-sm leading-6 text-slate-600">Learn how escrow, wallet approvals, and USDC payments are intended to work.</p></div><div className="card px-5 sm:px-7"><Accordion items={faqs} /></div></div></section>

        <section className="bg-white py-20"><div className="container-shell"><div className="rounded-3xl border border-mint-100 bg-mint-50 px-6 py-12 text-center sm:px-10"><h2 className="font-display text-3xl font-bold tracking-tight text-ink-950">Ready to create a safer agreement?</h2><p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-600">Preview the complete milestone workflow with demo data. No wallet signature or real funds are required.</p><Link to="/jobs/create" className="btn-dark mt-7">Create a Demo Job <ArrowRight className="size-4" /></Link></div></div></section>
      </main>
      <Footer />
    </div>
  )
}
