# ArcMilestone Frontend

ArcMilestone is a responsive frontend prototype for milestone-based USDC escrow on Arc. It includes public marketing pages, a full client/freelancer dashboard, centralized demo data, and simulated wallet and escrow interactions.

The demo supports open jobs (`open`) and direct hires (`direct`). A wallet has no permanent role: use the demo wallet selector in the desktop or mobile navigation to move between client and freelancer views. Jobs and applications persist in local storage.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Other useful commands:

```bash
npm run lint
npm run build
npm run preview
```

## Project structure

- `src/components/` — reusable navigation, form, modal, status, job, transaction, and feedback components
- `src/pages/` — public and dashboard route screens
- `src/layouts/` — responsive dashboard shell
- `src/data/mockData.js` — centralized demo wallet, job, transaction, and activity data
- `src/context/` and `src/hooks/` — shared frontend state
- `src/services/mockBlockchain.js` — simulated async wallet and escrow actions
- `src/utils/format.js` — address, date, currency, and clipboard helpers
- `src/utils/permissions.js` — reusable, case-insensitive wallet relationship and action checks

## Demo flow

1. Create an **Open for Applications** job from `/jobs/create`.
2. Switch to another demo wallet in the navigation and apply from the job details page.
3. Switch back to the creator, open **My Jobs**, and review applications.
4. Accept an application, then complete the mock **Create and Fund Escrow** confirmation.
5. Switch to the selected wallet to submit work, or create a **Direct Hire** from the same create page.

Open marketplace state and application mutations currently live in `src/context/AppContext.jsx`; replace those operations with the future Go API client. Simulated funding, submission, approval, and refund calls live in `src/services/mockBlockchain.js`; replace those functions with the future Arc wallet and contract adapter.

## Future blockchain integration

Replace the functions in `src/services/mockBlockchain.js` with the Arc wallet and smart-contract adapter. Keep provider-level connection/account state in `src/context/AppContext.jsx`. Contract addresses, ABIs, chain configuration, transaction receipt handling, and explorer URL generation should live in a dedicated integration module rather than in page components.

All current funding, submission, approval, and refund actions are explicitly simulated. No real wallet connection or on-chain transaction is performed.
