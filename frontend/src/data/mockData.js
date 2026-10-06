export const demoWallets = [
  {
    address: '0x71C4A6F2B8e90D3aE4217B6c9fD12A5e8C34091F',
    network: 'Arc Testnet',
    balance: 2450,
    displayName: 'Alex Morgan',
    email: 'alex@example.com',
    demoLabel: 'Alex · client demo',
  },
  {
    address: '0x4B12dA783C11f95D87a4C222cE81D9A089c3F520',
    network: 'Arc Testnet',
    balance: 1280,
    displayName: 'Jordan Lee',
    email: 'jordan@example.com',
    demoLabel: 'Jordan · freelancer demo',
  },
  {
    address: '0x90A81E12D540a6f119B13e5c77C0E29d0fD6a214',
    network: 'Arc Testnet',
    balance: 900,
    displayName: 'Sam Rivera',
    email: 'sam@example.com',
    demoLabel: 'Sam · alternate demo',
  },
]

export const currentWallet = demoWallets[0]

export const jobs = [
  {
    id: 'job-001', blockchainJobId: null, creatorWallet: demoWallets[0].address,
    hiringMethod: 'open', title: 'Build a React landing page',
    description: 'Build an accessible, responsive product landing page from supplied wireframes using React and Tailwind CSS. Include reusable sections and polished mobile layouts.',
    requiredSkills: ['React', 'Tailwind CSS', 'Accessibility'], budget: '150',
    applicationDeadline: '2026-09-25', deliveryDeadline: '2026-10-05',
    referenceUrl: 'https://example.com/landing-page-brief', marketplaceStatus: 'Open',
    selectedFreelancerWallet: null, freelancerWallet: null, escrowStatus: null,
    transactionHash: null, applicationCount: 1, createdAt: '2026-09-14T10:30:00Z',
  },
  {
    id: 'job-002', blockchainJobId: null, creatorWallet: demoWallets[2].address,
    hiringMethod: 'open', title: 'Design an analytics dashboard',
    description: 'Create a clear desktop and mobile dashboard design for a small logistics team, including empty, loading, and error states.',
    requiredSkills: ['Figma', 'UI Design', 'Design Systems'], budget: '320',
    applicationDeadline: '2026-09-28', deliveryDeadline: '2026-10-12', referenceUrl: '',
    marketplaceStatus: 'Open', selectedFreelancerWallet: null, freelancerWallet: null,
    escrowStatus: null, transactionHash: null, applicationCount: 1,
    createdAt: '2026-09-16T08:20:00Z',
  },
  {
    id: 'job-003', blockchainJobId: 'ARC-1048', creatorWallet: demoWallets[0].address,
    hiringMethod: 'open', title: 'Build a SaaS landing page',
    description: 'Design and build a responsive marketing page for a B2B analytics platform with accessible interactions and a clean component structure.',
    requiredSkills: ['React', 'Tailwind CSS'], budget: '150', applicationDeadline: null,
    deliveryDeadline: '2026-09-24', referenceUrl: 'https://example.com/saas-brief',
    marketplaceStatus: 'In Progress', freelancerWallet: demoWallets[1].address,
    selectedFreelancerWallet: demoWallets[1].address, escrowStatus: 'Work Submitted',
    transactionHash: 'demo-8c47b6d2a9f70c25e741a09f6bd33789', applicationCount: 0,
    submissionUrl: 'https://staging.example.com/saas-page',
    submissionNotes: 'Responsive build is ready for review, including mobile and tablet layouts.',
    createdAt: '2026-09-14T10:30:00Z',
  },
  {
    id: 'job-004', blockchainJobId: 'ARC-1044', creatorWallet: demoWallets[2].address,
    hiringMethod: 'open', title: 'Design a company logo',
    description: 'Create a refined logo system for a sustainable logistics company, including primary, monochrome, and icon-only variations.',
    requiredSkills: ['Brand Design', 'Illustrator'], budget: '75', applicationDeadline: null,
    deliveryDeadline: '2026-10-01', referenceUrl: 'https://example.com/brand-brief',
    marketplaceStatus: 'In Progress', freelancerWallet: demoWallets[1].address,
    selectedFreelancerWallet: demoWallets[1].address, escrowStatus: 'Funded',
    transactionHash: 'demo-5316c710287f4df89eb04437e9e781e7', applicationCount: 0,
    createdAt: '2026-09-12T14:15:00Z',
  },
  {
    id: 'job-005', blockchainJobId: 'ARC-1037', creatorWallet: demoWallets[0].address,
    hiringMethod: 'open', title: 'Develop a Go API endpoint',
    description: 'Implement an authenticated reporting endpoint with pagination, validation, and unit tests in an existing Go service.',
    requiredSkills: ['Go', 'REST API', 'Testing'], budget: '200', applicationDeadline: null,
    deliveryDeadline: '2026-09-18', referenceUrl: 'https://example.com/api-spec',
    marketplaceStatus: 'Completed', freelancerWallet: demoWallets[2].address,
    selectedFreelancerWallet: demoWallets[2].address, escrowStatus: 'Completed',
    transactionHash: 'demo-ddda6fdd9c42df4c3f50568f742458cb', applicationCount: 0,
    createdAt: '2026-09-02T09:20:00Z',
  },
  {
    id: 'job-006', blockchainJobId: null, creatorWallet: demoWallets[2].address,
    hiringMethod: 'open', title: 'Write product onboarding copy',
    description: 'Write concise onboarding copy for a five-step workflow, including empty states and validation messages.',
    requiredSkills: ['UX Writing', 'SaaS'], budget: '90', applicationDeadline: '2026-09-17',
    deliveryDeadline: '2026-09-30', referenceUrl: '', marketplaceStatus: 'Open',
    selectedFreelancerWallet: null, freelancerWallet: null, escrowStatus: null,
    transactionHash: null, applicationCount: 0, createdAt: '2026-09-10T11:10:00Z',
  },
]

export const applications = [
  {
    id: 'application-001', jobId: 'job-001', applicantWallet: demoWallets[1].address,
    coverLetter: 'I build accessible React interfaces and can deliver the supplied layouts as a clean, reusable component system.',
    estimatedDays: 7, portfolioUrl: 'https://example.com/jordan-portfolio',
    status: 'Pending', createdAt: '2026-09-17T12:15:00Z',
  },
  {
    id: 'application-002', jobId: 'job-002', applicantWallet: demoWallets[0].address,
    coverLetter: 'I can create the dashboard system, responsive variants, and documented component states in Figma.',
    estimatedDays: 9, portfolioUrl: 'https://example.com/alex-design-work',
    status: 'Pending', createdAt: '2026-09-17T15:40:00Z',
  },
]

export const transactions = [
  { id: 'TX-2051', type: 'Escrow funded', jobId: 'job-003', jobTitle: 'Build a SaaS landing page', amount: -150, wallet: demoWallets[1].address, status: 'Confirmed', date: '2026-09-14T10:34:00Z', hash: 'demo-8c47b6d2a9f70c25e741a09f6bd33789' },
  { id: 'TX-2040', type: 'Payment released', jobId: 'job-005', jobTitle: 'Develop a Go API endpoint', amount: -200, wallet: demoWallets[2].address, status: 'Confirmed', date: '2026-09-10T15:42:00Z', hash: 'demo-ddda6fdd9c42df4c3f50568f742458cb' },
  { id: 'TX-2034', type: 'Escrow funded', jobId: 'job-004', jobTitle: 'Design a company logo', amount: 75, wallet: demoWallets[2].address, status: 'Confirmed', date: '2026-09-12T14:18:00Z', hash: 'demo-5316c710287f4df89eb04437e9e781e7' },
]

export const activityEvents = {
  'job-003': [
    { title: 'Work submitted', description: 'The freelancer shared the completed deliverable.', date: 'Sep 17, 2026 · 3:18 PM', type: 'submitted' },
    { title: 'Escrow funded', description: '150 USDC was mock-funded for this agreement.', date: 'Sep 14, 2026 · 10:34 AM', type: 'funded' },
  ],
  'job-004': [{ title: 'Escrow funded', description: '75 USDC was mock-funded for this agreement.', date: 'Sep 12, 2026 · 2:18 PM', type: 'funded' }],
}

export const faqs = [
  { question: 'How does ArcMilestone protect my payment?', answer: 'The intended production flow locks a client’s USDC in a smart contract until the agreed work is approved. This preview uses demo data and does not move funds.' },
  { question: 'Which currency is used?', answer: 'ArcMilestone is designed for USDC payments on Arc. USDC is a digital dollar designed to maintain a stable value relative to the US dollar.' },
  { question: 'Can a payment be reversed?', answer: 'Confirmed blockchain transactions generally cannot be reversed. Always verify the amount, wallet address, and job terms before signing.' },
  { question: 'Does ArcMilestone hold my wallet keys?', answer: 'No. ArcMilestone will never ask for your private key or recovery phrase. Wallet approvals will happen through your connected wallet.' },
  { question: 'What happens if a deadline is missed?', answer: 'Refund eligibility will depend on the escrow contract terms. A future release will display the exact on-chain conditions before funding.' },
]
