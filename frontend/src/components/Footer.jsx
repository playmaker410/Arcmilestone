import { Code2, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import Logo from './Logo'

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-ink-950 text-slate-400">
      <div className="container-shell grid gap-10 py-12 md:grid-cols-[1.6fr_1fr_1fr]">
        <div><Logo inverse /><p className="mt-4 max-w-sm text-sm leading-6">Secure milestone-based USDC payments for clients and freelancers building on Arc.</p><div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs"><ShieldCheck className="size-4 text-mint-400" />Non-custodial by design</div></div>
        <div><p className="text-sm font-bold text-white">Product</p><ul className="mt-4 space-y-3 text-sm"><li><a href="#how-it-works" className="hover:text-white">How it works</a></li><li><a href="#features" className="hover:text-white">Features</a></li><li><Link to="/dashboard" className="hover:text-white">Dashboard</Link></li></ul></div>
        <div><p className="text-sm font-bold text-white">Resources</p><ul className="mt-4 space-y-3 text-sm"><li><Link to="/help" className="hover:text-white">Help center</Link></li><li><a href="#faq" className="hover:text-white">FAQ</a></li><li><button type="button" onClick={() => window.alert('The public repository link will be added before launch.')} className="inline-flex items-center gap-2 hover:text-white"><Code2 className="size-4" />GitHub</button></li></ul></div>
      </div>
      <div className="border-t border-white/8"><div className="container-shell flex flex-col gap-2 py-5 text-xs sm:flex-row sm:items-center sm:justify-between"><p>© 2026 ArcMilestone. Frontend demo.</p><p>Never share your private key or recovery phrase.</p></div></div>
    </footer>
  )
}
