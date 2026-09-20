import { ArrowLeft, Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import Logo from '../components/Logo'

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-ink-950 p-5 text-center text-white"><div><Logo inverse /><span className="mx-auto mt-12 grid size-16 place-items-center rounded-2xl bg-white/8 text-mint-400"><Compass className="size-8" /></span><p className="mt-6 text-xs font-bold tracking-[0.15em] text-mint-400 uppercase">404 · Not found</p><h1 className="mt-3 font-display text-3xl font-bold">This page is off the map</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-400">The page may have moved, or the address may be incorrect.</p><Link to="/" className="btn-primary mt-7"><ArrowLeft className="size-4" />Back to home</Link></div></main>
  )
}
