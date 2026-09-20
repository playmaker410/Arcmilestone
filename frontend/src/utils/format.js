export function shortenAddress(value, start = 6, end = 4) {
  if (!value || value.length <= start + end) return value || '—'
  return `${value.slice(0, start)}…${value.slice(-end)}`
}

export function formatUSDC(value, options = {}) {
  const { sign = false } = options
  const amount = Number(value)
  const prefix = sign && amount > 0 ? '+' : ''
  return `${prefix}${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} USDC`
}

// formatUSDCFromString works with decimal strings from the backend without
// converting through float for math (display only is fine with parseFloat).
export function formatUSDCFromString(value) {
  if (!value) return '0.00 USDC'
  // value is a decimal string like "125.000000000000000000"
  // Display max 2 decimal places
  const str = String(value).replace(/\.?0+$/, '') // trim trailing zeros
  const num = parseFloat(str) // ok for display only
  return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num)} USDC`
}

export function formatDate(value, options = {}) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options,
  }).format(new Date(value))
}

export async function copyToClipboard(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textArea = document.createElement('textarea')
  textArea.value = value
  textArea.style.position = 'fixed'
  textArea.style.opacity = '0'
  document.body.appendChild(textArea)
  textArea.select()
  document.execCommand('copy')
  textArea.remove()
}
