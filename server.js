const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'ChainTrace AI', mode: 'demo' });
});

function shortHash(input) {
  let h = 2166136261;
  for (const c of String(input)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}

function makeAddress(seed, index) {
  const base = shortHash(`${seed}:${index}`);
  return 'T' + (base + shortHash(`${seed}:${index}:x`) + shortHash(`${seed}:${index}:y`)).slice(0, 33);
}

function makeTx(seed, index, from, to, amount, timestamp) {
  const hash = shortHash(`${seed}:tx:${index}`) + shortHash(`${seed}:tx:${index}:b`) + shortHash(`${seed}:tx:${index}:c`);
  return {
    hash,
    from,
    to,
    amount: Number(amount.toFixed(2)),
    token: 'USDT',
    direction: index === 0 ? 'RECEIVED' : 'SENT',
    timestamp,
    block: 70000000 + index,
    explorer_url: `https://tronscan.org/#/transaction/${hash}`
  };
}

function buildDemoAnalysis(wallet, blockchain, year) {
  const seed = `${wallet}:${blockchain}:${year}`;
  const suspect = wallet;
  const a = makeAddress(seed, 1);
  const b = makeAddress(seed, 2);
  const c = makeAddress(seed, 3);
  const ex1 = makeAddress(seed, 4);
  const ex2 = makeAddress(seed, 5);
  const ex3 = makeAddress(seed, 6);
  const base = 1000 + (parseInt(shortHash(seed), 16) % 8000);
  const amounts = [base, base * .43, base * .31, base * .19, base * .42, base * .29, base * .17];
  const times = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(Number(year) || 2026, 2, 14, 10 + i, 21, 0)).toISOString());

  const transactions = [
    makeTx(seed, 0, makeAddress(seed, 0), suspect, amounts[0], times[0]),
    makeTx(seed, 1, suspect, a, amounts[1], times[1]),
    makeTx(seed, 2, suspect, b, amounts[2], times[2]),
    makeTx(seed, 3, suspect, c, amounts[3], times[3]),
    makeTx(seed, 4, a, ex1, amounts[4], times[4]),
    makeTx(seed, 5, b, ex2, amounts[5], times[5]),
    makeTx(seed, 6, c, ex3, amounts[6], times[6])
  ];

  const risk = 40 + (parseInt(shortHash(seed), 16) % 56);
  const riskText = risk >= 80 ? 'High risk' : risk >= 60 ? 'Medium risk' : 'Low risk';

  return {
    success: true,
    mode: 'demo',
    wallet,
    blockchain,
    year,
    risk,
    riskText,
    totalReceived: amounts[0],
    totalSent: amounts.slice(1).reduce((x, y) => x + y, 0),
    transactionCount: transactions.length,
    transactions,
    graph: {
      nodes: [
        { id: 'victim', label: 'Source Wallet', address: transactions[0].from, role: 'Source' },
        { id: 'suspect', label: 'Suspect Wallet', address: suspect, role: 'Investigated Wallet' },
        { id: 'a', label: 'Wallet A', address: a, role: 'Intermediary' },
        { id: 'b', label: 'Wallet B', address: b, role: 'Intermediary' },
        { id: 'c', label: 'Wallet C', address: c, role: 'Intermediary' },
        { id: 'ex1', label: 'Endpoint A', address: ex1, role: 'Endpoint' },
        { id: 'ex2', label: 'Endpoint B', address: ex2, role: 'Endpoint' },
        { id: 'ex3', label: 'Endpoint C', address: ex3, role: 'Endpoint' }
      ],
      edges: [
        { from: 'victim', to: 'suspect', amount: amounts[0], hash: transactions[0].hash },
        { from: 'suspect', to: 'a', amount: amounts[1], hash: transactions[1].hash },
        { from: 'suspect', to: 'b', amount: amounts[2], hash: transactions[2].hash },
        { from: 'suspect', to: 'c', amount: amounts[3], hash: transactions[3].hash },
        { from: 'a', to: 'ex1', amount: amounts[4], hash: transactions[4].hash },
        { from: 'b', to: 'ex2', amount: amounts[5], hash: transactions[5].hash },
        { from: 'c', to: 'ex3', amount: amounts[6], hash: transactions[6].hash }
      ]
    },
    alerts: [
      'Multiple outbound paths detected from the investigated wallet.',
      'Funds are distributed across intermediary wallets in the demo trace.',
      'Endpoint attribution is not established from on-chain data alone.'
    ],
    fraudTypologies: ['Layering / fund splitting', 'Rapid onward transfer', 'Potential service endpoint'],
    recommendations: ['Preserve transaction evidence.', 'Review connected transactions and counterparties.', 'Use authorized VASP/KYC processes for off-chain attribution.'],
    complaintCrossReference: { status: 'Not connected', matches: [] },
    vasp: { status: 'Not identified from public on-chain data', name: null, confidence: null },
    disclaimer: 'Demo data only. Wallet ownership cannot be established from public blockchain data alone.'
  };
}

app.post('/api/analyze', (req, res) => {
  const { wallet, blockchain = 'tron-usdt', year = new Date().getUTCFullYear() } = req.body || {};
  if (!wallet || typeof wallet !== 'string') return res.status(400).json({ success: false, error: 'Wallet address is required.' });
  res.json(buildDemoAnalysis(wallet.trim(), blockchain, String(year)));
});

app.post('/api/evidence/preserve', (req, res) => {
  const analysis = req.body?.analysis;
  if (!analysis?.wallet) return res.status(400).json({ success: false, error: 'Analysis data is required.' });
  const caseId = `CT-${Date.now().toString(36).toUpperCase()}`;
  res.json({ success: true, evidence: { caseId, wallet: analysis.wallet, transactionCount: Array.isArray(analysis.transactions) ? analysis.transactions.length : 0, preservedAt: new Date().toISOString(), snapshot: analysis } });
});

app.use(express.static(path.join(__dirname, '../frontend')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));

app.listen(PORT, () => console.log(`ChainTrace AI running at http://localhost:${PORT}`));
