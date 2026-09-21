require("dotenv").config();

const checks = [
  ["TRON_API_KEY", process.env.TRON_API_KEY || ""],
  [
    "ETHERSCAN_API_KEY",
    process.env.ETHERSCAN_API_KEY ||
      process.env.ETH_API_KEY ||
      ""
  ],
  [
    "SOLANA_RPC_URL",
    process.env.SOLANA_RPC_URL ||
      "https://api.mainnet-beta.solana.com"
  ],
  [
    "USDT_SOLANA_MINT",
    process.env.USDT_SOLANA_MINT || ""
  ]
];

console.log("==========================================");
console.log("ChainTrace API Configuration Check");
console.log("==========================================");

for (const [name, value] of checks) {
  if (!value) {
    console.log(`${name}: MISSING`);
    continue;
  }

  if (name.endsWith("_KEY")) {
    console.log(
      `${name}: LOADED (length ${value.length})`
    );
  } else {
    console.log(`${name}: CONFIGURED`);
  }
}

console.log("==========================================");
console.log(
  "Note: API 429 errors are provider rate limits, not npm package errors."
);
console.log("==========================================");
