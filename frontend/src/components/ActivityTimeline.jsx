import { CheckCircle2, CircleDollarSign, FilePlus2, Send } from 'lucide-react'

const eventIcons = {
  created: FilePlus2,
  funded: CircleDollarSign,
  submitted: Send,
  completed: CheckCircle2,
}

export default function ActivityTimeline({ events }) {
  return (
    <ol className="space-y-0">
      {events.map((event, index) => {
        const Icon = eventIcons[event.type] || CheckCircle2
        return (
          <li key={`${event.title}-${event.date}`} className="relative flex gap-4 pb-7 last:pb-0">
            {index < events.length - 1 && <span className="absolute top-9 bottom-0 left-[17px] w-px bg-slate-200" aria-hidden="true" />}
            <span className="relative z-10 grid size-9 shrink-0 place-items-center rounded-full border border-mint-100 bg-mint-50 text-mint-600">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="pt-1">
              <p className="text-sm font-bold text-slate-900">{event.title}</p>
              <p className="mt-1 text-sm leading-5 text-slate-600">{event.description}</p>
              <time className="mt-1.5 block text-xs text-slate-400">{event.date}</time>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
