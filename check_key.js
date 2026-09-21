require("dotenv").config();

const tron = (process.env.TRON_API_KEY || "").trim();
const etherscan = (process.env.ETHERSCAN_API_KEY || process.env.ETH_API_KEY || "").trim();

console.log("==========================================");
console.log("ChainTrace API Key Check");
console.log("==========================================");
console.log("TRON API KEY:", tron ? "LOADED" : "MISSING");
console.log("TRON KEY LENGTH:", tron.length);
console.log("ETHERSCAN API KEY:", etherscan ? "LOADED" : "MISSING");
console.log("ETHERSCAN KEY LENGTH:", etherscan.length);
console.log("==========================================");

if (!tron) process.exitCode = 1;
