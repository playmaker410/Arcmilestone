import { AlertTriangle, CircleDollarSign, CircleHelp, FileWarning, LifeBuoy, LockKeyhole, PenLine, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react'
import Accordion from '../components/Accordion'
import Alert from '../components/Alert'
import PageHeader from '../components/PageHeader'
import { faqs } from '../data/mockData'

const guides = [
  { title: 'How escrow works', description: 'A client locks USDC against agreed job terms. The intended contract releases payment after the client approves submitted work.', icon: LockKeyhole },
  { title: 'What USDC is', description: 'USDC is a digital currency designed to track the value of the US dollar. It can be sent between compatible blockchain wallets.', icon: CircleDollarSign },
  { title: 'Wallet signatures', description: 'A wallet signature proves you approve an action. Read each prompt carefully; signing does not reveal your private key.', icon: PenLine },
]

const problems = [
  { title: 'Transaction is pending', answer: 'Wait for network confirmation and avoid submitting the same action repeatedly. Check the hash in Arc Explorer when available.', icon: RefreshCw },
  { title: 'Wallet will not connect', answer: 'Confirm your wallet extension is unlocked, the site has permission, and the correct Arc network is selected.', icon: WifiOff },
  { title: 'Transaction was rejected', answer: 'Check that you have enough USDC and native tokens for fees, then review the wallet error before trying again.', icon: FileWarning },
  { title: 'Address looks unfamiliar', answer: 'Stop before signing. Compare the full address with the expected contract or recipient through a trusted source.', icon: AlertTriangle },
]

export default function Help() {
  return (
    <>
      <PageHeader eyebrow="Support & safety" title="Help Center" description="Understand escrow, wallet approvals, and safe transaction practices before using real funds." />
      <div className="mb-6"><Alert variant="warning" title="Protect your wallet">Never share your private key or seed phrase. ArcMilestone support will never ask for them, and confirmed blockchain transactions normally cannot be reversed.</Alert></div>
      <section className="grid gap-5 md:grid-cols-3" aria-label="Getting started guides">{guides.map(({ title, description, icon: Icon }) => <article key={title} className="card p-5 sm:p-6"><span className="grid size-11 place-items-center rounded-xl bg-mint-50 text-mint-600"><Icon className="size-5" /></span><h2 className="mt-5 font-display text-lg font-bold text-ink-950">{title}</h2><p className="mt-3 text-sm leading-6 text-slate-600">{description}</p></article>)}</section>
      <section className="mt-8"><div className="mb-5"><p className="eyebrow">Troubleshooting</p><h2 className="mt-2 font-display text-2xl font-bold text-ink-950">Common transaction problems</h2></div><div className="grid gap-4 sm:grid-cols-2">{problems.map(({ title, answer, icon: Icon }) => <article key={title} className="card flex gap-4 p-5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><Icon className="size-5" /></span><div><h3 className="text-sm font-bold text-slate-900">{title}</h3><p className="mt-2 text-xs leading-5 text-slate-600">{answer}</p></div></article>)}</div></section>
      <section className="mt-8 grid gap-6 xl:grid-cols-[1.35fr_.65fr]"><div className="card px-5 sm:px-7"><div className="border-b border-slate-100 py-5"><p className="eyebrow">FAQ</p><h2 className="mt-2 font-display text-2xl font-bold text-ink-950">Frequently asked questions</h2></div><Accordion items={faqs} allowMultiple /></div><aside className="rounded-2xl bg-ink-950 p-6 text-white"><span className="grid size-11 place-items-center rounded-xl bg-white/10 text-mint-400"><LifeBuoy className="size-5" /></span><h2 className="mt-5 font-display text-xl font-bold">Still need help?</h2><p className="mt-3 text-sm leading-6 text-slate-300">This is a frontend preview. Support contact and on-chain transaction assistance will be added before launch.</p><button type="button" onClick={() => window.alert('Support messaging is not connected in this frontend demo.')} className="btn-primary mt-6 w-full"><CircleHelp className="size-4" />Contact Support</button><div className="mt-6 border-t border-white/10 pt-5"><p className="flex items-start gap-2 text-xs leading-5 text-slate-400"><ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-400" />Support cannot recover funds sent to an incorrect address.</p></div></aside></section>
    </>
  )
}
