export const transactions = [
  { id: 'TX-2051', type: 'Escrow funded', jobId: 'job-003', jobTitle: 'Build a SaaS landing page', amount: -150, wallet: '0x4B12dA783C11f95D87a4C222cE81D9A089c3F520', status: 'Confirmed', date: '2026-09-14T10:34:00Z', hash: 'demo-8c47b6d2a9f70c25e741a09f6bd33789' },
  { id: 'TX-2040', type: 'Payment released', jobId: 'job-005', jobTitle: 'Develop a Go API endpoint', amount: -200, wallet: '0x90A81E12D540a6f119B13e5c77C0E29d0fD6a214', status: 'Confirmed', date: '2026-09-10T15:42:00Z', hash: 'demo-ddda6fdd9c42df4c3f50568f742458cb' },
  { id: 'TX-2034', type: 'Escrow funded', jobId: 'job-004', jobTitle: 'Design a company logo', amount: 75, wallet: '0x90A81E12D540a6f119B13e5c77C0E29d0fD6a214', status: 'Confirmed', date: '2026-09-12T14:18:00Z', hash: 'demo-5316c710287f4df89eb04437e9e781e7' },
]

export const faqs = [
  { question: 'How does ArcMilestone protect my payment?', answer: 'The intended production flow locks a client’s USDC in a smart contract until the agreed work is approved. This preview uses demo data and does not move funds.' },
  { question: 'Which currency is used?', answer: 'ArcMilestone is designed for USDC payments on Arc. USDC is a digital dollar designed to maintain a stable value relative to the US dollar.' },
  { question: 'Can a payment be reversed?', answer: 'Confirmed blockchain transactions generally cannot be reversed. Always verify the amount, wallet address, and job terms before signing.' },
  { question: 'Does ArcMilestone hold my wallet keys?', answer: 'No. ArcMilestone will never ask for your private key or recovery phrase. Wallet approvals will happen through your connected wallet.' },
  { question: 'What happens if a deadline is missed?', answer: 'Refund eligibility will depend on the escrow contract terms. A future release will display the exact on-chain conditions before funding.' },
]
