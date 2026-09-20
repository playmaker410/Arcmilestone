import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

export default function Accordion({ items, allowMultiple = false }) {
  const [openItems, setOpenItems] = useState([0])

  const toggleItem = (index) => {
    setOpenItems((current) => {
      if (current.includes(index)) return current.filter((item) => item !== index)
      return allowMultiple ? [...current, index] : [index]
    })
  }

  return (
    <div className="divide-y divide-slate-200">
      {items.map((item, index) => {
        const open = openItems.includes(index)
        return (
          <div key={item.question}>
            <h3>
              <button type="button" onClick={() => toggleItem(index)} className="flex w-full items-center justify-between gap-4 py-5 text-left text-sm font-bold text-slate-900 sm:text-base" aria-expanded={open} aria-controls={`accordion-panel-${index}`}>
                {item.question}<ChevronDown className={`size-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
            </h3>
            <div id={`accordion-panel-${index}`} hidden={!open} className="pb-5 pr-8 text-sm leading-6 text-slate-600">{item.answer}</div>
          </div>
        )
      })}
    </div>
  )
}
