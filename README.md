# ChainTracker — Blockchain Forensics Tool

A full-stack crypto wallet investigation tool supporting **TRON (TRC-20)**, **Ethereum (ERC-20)**, and **BNB Chain (BEP-20)** USDT transaction analysis.

## Features

- 🔍 Deep wallet analysis with fund-flow graph
- 📊 Risk scoring engine
- 🚨 Fraud typology detection
- 🏛️ VASP attribution
- 📋 Complaint cross-referencing
- ⏱️ Live wallet monitoring
- 🔒 Rate-limit handling with real countdown timer

## Project Structure

```
ChainTracker/
├── backend/          # Node.js / Express API server
│   ├── server.js     # Main server (all routes + analysis logic)
│   ├── package.json
│   ├── check_key.js  # API key diagnostic script
│   └── data/
│       ├── vasp.json
│       └── complaints.json
├── frontend/
│   └── index.html    # Single-page frontend
└── .gitignore
```

## Setup

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in your API keys
npm start              # runs on http://localhost:3000
```

Required `.env` variables:

| Variable | Description |
|---|---|
| `TRON_API_KEY` | TronGrid Pro API key |
| `ETH_API_KEY` | Etherscan V2 API key |
| `TRON_API_BASE` | TronGrid base URL (default: https://api.trongrid.io) |
| `USDT_TRON_CONTRACT` | TRC-20 USDT contract address |
| `USDT_ETH_CONTRACT` | ERC-20 USDT contract address |
| `USDT_BNB_CONTRACT` | BEP-20 USDT contract address |
| `INDEXER_CACHE_TTL_MS` | Cache TTL in ms (default: 60000) |
| `INDEXER_MAX_PAGES` | Max paginated fetch pages (default: 10) |

### Frontend

Open `frontend/index.html` directly in a browser. No build step required.

> The frontend expects the backend at `http://localhost:3000`.

## API

### `POST /api/analyze`

```json
{
  "wallet": "T...",
  "blockchain": "tron",
  "token": "USDT",
  "depth": 2
}
```

**Success response** (`200`):
```json
{ "success": true, "wallet": "...", "transactions": [...], "risk": {...}, ... }
```

**Rate limit response** (`429`):
```json
{
  "success": false,
  "error": "TRON API rate limit reached. Retry in 60 second(s).",
  "rate_limited": true,
  "retry_after_ms": 60000,
  "blockchain": "tron"
}
```

## Security Notes

- **Never commit `.env`** — it is in `.gitignore`
- **Never commit `node_modules/`** — it is in `.gitignore`

## License

MIT
