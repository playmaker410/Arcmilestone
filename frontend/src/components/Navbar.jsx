import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ConnectWalletButton from './ConnectWalletButton'
import Logo from './Logo'

const links = [
  { label: 'Home', href: '#home' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Features', href: '#features' },
  { label: 'FAQ', href: '#faq' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const closeOnResize = () => window.innerWidth >= 768 && setOpen(false)
    window.addEventListener('resize', closeOnResize)
    return () => window.removeEventListener('resize', closeOnResize)
  }, [])

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-white/8 bg-ink-950/95 backdrop-blur-xl">
      <div className="container-shell flex h-18 items-center justify-between">
        <Logo inverse />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary navigation">{links.map((link) => <a key={link.href} href={link.href} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white">{link.label}</a>)}</nav>
        <div className="hidden items-center gap-3 md:flex"><Link to="/dashboard" className="rounded-lg px-2 py-2 text-sm font-bold text-slate-300 hover:text-white">Dashboard</Link><ConnectWalletButton dark redirectOnConnect /></div>
        <button type="button" onClick={() => setOpen((current) => !current)} className="rounded-xl border border-white/10 p-2.5 text-white md:hidden" aria-expanded={open} aria-controls="home-mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'}>{open ? <X className="size-5" /> : <Menu className="size-5" />}</button>
      </div>
      {open && <div id="home-mobile-menu" className="border-t border-white/10 bg-ink-950 px-4 pb-5 pt-3 md:hidden"><nav className="flex flex-col" aria-label="Mobile primary navigation">{links.map((link) => <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-semibold text-slate-200 hover:bg-white/5">{link.label}</a>)}</nav><div className="mt-3 grid gap-2 border-t border-white/10 pt-4"><Link to="/dashboard" onClick={() => setOpen(false)} className="btn-secondary w-full">Open Dashboard</Link><ConnectWalletButton dark redirectOnConnect className="w-full" /></div></div>}
    </header>
  )
}
