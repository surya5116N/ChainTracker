const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT) || 3000;

/* =========================================================
   CONFIGURATION
========================================================= */

const TRON_API = (
    process.env.TRON_API_BASE ||
    "https://api.trongrid.io"
).replace(/\/+$/, "");

const TRON_API_KEY = (
    process.env.TRON_API_KEY || ""
).trim();

const ETHERSCAN_API_BASE = (
    process.env.ETHERSCAN_API_BASE ||
    "https://api.etherscan.io/v2/api"
).replace(/\/+$/, "");

const ETHERSCAN_API_KEY = (
    process.env.ETHERSCAN_API_KEY ||
    process.env.ETH_API_KEY ||
    ""
).trim();

const ETH_USDT_CONTRACT = (
    process.env.USDT_ETH_CONTRACT ||
    "0xdAC17F958D2ee523a2206206994597C13D831ec7"
).trim();

const BNB_USDT_CONTRACT = (
    process.env.USDT_BNB_CONTRACT ||
    "0x55d398326f99059fF775485246999027B3197955"
).trim();

const USDT_CONTRACT = (
    process.env.USDT_TRON_CONTRACT ||
    "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
).trim();

const INDEXER_MAX_PAGES = Math.min(
    Math.max(
        Number(process.env.INDEXER_MAX_PAGES) || 10,
        1
    ),
    100
);

const INDEXER_CACHE_TTL =
    Number(process.env.INDEXER_CACHE_TTL_MS) || 30000;

const REALTIME_ALERT_INTERVAL =
    Math.max(
        Number(process.env.REALTIME_ALERT_INTERVAL_MS) || 60000,
        60000
    );

const API_INTEGRATION_KEY = (
    process.env.API_INTEGRATION_KEY || ""
).trim();

const API_INTEGRATION_URL = (
    process.env.API_INTEGRATION_URL || ""
).trim();

const NCRP_API_KEY = (
    process.env.NCRP_API_KEY || ""
).trim();

const NCRP_API_URL = (
    process.env.NCRP_API_URL || ""
).trim();

const SAHYOG_API_KEY = (
    process.env.SAHYOG_API_KEY || ""
).trim();

const SAHYOG_API_URL = (
    process.env.SAHYOG_API_URL || ""
).trim();

const SOLANA_RPC_URL = (
    process.env.SOLANA_RPC_URL ||
    "https://api.mainnet-beta.solana.com"
).replace(/\/+$/, "");

const SOLANA_USDT_MINT = (
    process.env.USDT_SOLANA_MINT ||
    ""
).trim();


/* =========================================================
   DATA FILES
========================================================= */

const DATA_DIR = path.join(
    __dirname,
    "data"
);

const VASP_FILE = path.join(
    DATA_DIR,
    "vasp.json"
);

const COMPLAINT_FILE = path.join(
    DATA_DIR,
    "complaints.json"
);


/* =========================================================
   TRON HEADERS
========================================================= */

const TRON_HEADERS = {
    Accept: "application/json",
    "Content-Type": "application/json"
};

if (TRON_API_KEY) {
    TRON_HEADERS["TRON-PRO-API-KEY"] =
        TRON_API_KEY;
}


/* =========================================================
   STARTUP
========================================================= */

console.log(
    "=========================================="
);

console.log(
    "ChainTrace AI Backend"
);

console.log(
    "TRON API:",
    TRON_API
);

console.log(
    "USDT Contract:",
    USDT_CONTRACT
);

console.log(
    "TRON API KEY:",
    TRON_API_KEY
        ? "LOADED"
        : "MISSING"
);

console.log(
    "VASP DATA:",
    VASP_FILE
);

console.log(
    "COMPLAINT DATA:",
    COMPLAINT_FILE
);

console.log(
    "INDEXER MAX PAGES:",
    INDEXER_MAX_PAGES
);

console.log(
    "REALTIME INTERVAL:",
    REALTIME_ALERT_INTERVAL
);

console.log(
    "=========================================="
);


/* =========================================================
   JSON FILE LOADER
========================================================= */

function loadJsonFile(
    filePath,
    fallback = []
) {
    try {
        if (!fs.existsSync(filePath)) {
            console.warn(
                "JSON file not found:",
                filePath
            );

            return fallback;
        }

        const raw =
            fs.readFileSync(
                filePath,
                "utf8"
            );

        return JSON.parse(raw);

    } catch (error) {

        console.error(
            "JSON LOAD ERROR:",
            filePath,
            error.message
        );

        return fallback;
    }
}


/* =========================================================
   JSON DATA
========================================================= */

let vaspDatabase =
    loadJsonFile(
        VASP_FILE,
        []
    );

let complaintDatabase =
    loadJsonFile(
        COMPLAINT_FILE,
        []
    );


/* =========================================================
   MEMORY CACHE
========================================================= */

const transactionCache =
    new Map();

const analysisCache =
    new Map();

const realtimeWatchers =
    new Map();

const realtimeAlerts =
    [];


/* =========================================================
   GENERIC HELPERS
========================================================= */

function safeString(
    value
) {
    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    return String(value).trim();
}


function normalizeAddress(
    address
) {
    return safeString(
        address
    );
}


function normalizeWallet(
    address
) {
    return safeString(
        address
    ).toLowerCase();
}


function sameWallet(
    a,
    b
) {
    return (
        normalizeWallet(a) ===
        normalizeWallet(b)
    );
}


function shortenAddress(
    address,
    start = 8,
    end = 6
) {
    const value =
        safeString(address);

    if (
        value.length <=
        start + end + 3
    ) {
        return value;
    }

    return (
        value.slice(0, start) +
        "..." +
        value.slice(-end)
    );
}


function isValidTronAddress(
    address
) {
    const value =
        safeString(address);

    return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(
        value
    );
}


function isValidEvmAddress(
    address
) {
    const value =
        safeString(address);

    return /^0x[a-fA-F0-9]{40}$/.test(
        value
    );
}


function isValidBlockchainAddress(
    address,
    blockchain
) {
    if (
        blockchain ===
        "ethereum" ||
        blockchain ===
        "bnb"
    ) {
        return isValidEvmAddress(
            address
        );
    }

    return isValidTronAddress(
        address
    );
}


function getBlockchainName(
    blockchain
) {
    switch (
        safeString(
            blockchain
        ).toLowerCase()
    ) {
        case "ethereum":
            return "Ethereum";

        case "bnb":
        case "bsc":
        case "bnb-chain":
            return "BNB Chain";

        default:
            return "TRON";
    }
}


function normalizeBlockchain(
    blockchain
) {
    const value =
        safeString(
            blockchain
        ).toLowerCase();

    if (
        value === "ethereum" ||
        value === "eth" ||
        value === "ethereum-usdt"
    ) {
        return "ethereum";
    }

    if (
        value === "bnb" ||
        value === "bsc" ||
        value === "bnb-chain" ||
        value === "bnb-usdt"
    ) {
        return "bnb";
    }

    return "tron";
}


function getChainId(
    blockchain
) {
    const network =
        normalizeBlockchain(
            blockchain
        );

    if (
        network === "ethereum"
    ) {
        return 1;
    }

    if (
        network === "bnb"
    ) {
        return 56;
    }

    return null;
}


function getUsdtContract(
    blockchain
) {
    const network =
        normalizeBlockchain(
            blockchain
        );

    if (
        network === "ethereum"
    ) {
        return ETH_USDT_CONTRACT;
    }

    if (
        network === "bnb"
    ) {
        return BNB_USDT_CONTRACT;
    }

    return USDT_CONTRACT;
}


/* =========================================================
   EXPLORER HELPERS
========================================================= */

function getExplorerBase(
    blockchain
) {
    const network =
        normalizeBlockchain(
            blockchain
        );

    if (
        network === "ethereum"
    ) {
        return "https://etherscan.io";
    }

    if (
        network === "bnb"
    ) {
        return "https://bscscan.com";
    }

    return "https://tronscan.org";
}


function getAddressExplorerUrl(
    address,
    blockchain
) {
    return (
        getExplorerBase(blockchain) +
        "/address/" +
        encodeURIComponent(address)
    );
}


function getTransactionExplorerUrl(
    txHash,
    blockchain
) {
    const network =
        normalizeBlockchain(
            blockchain
        );

    if (
        network === "ethereum"
    ) {
        return (
            "https://etherscan.io/tx/" +
            encodeURIComponent(txHash)
        );
    }

    if (
        network === "bnb"
    ) {
        return (
            "https://bscscan.com/tx/" +
            encodeURIComponent(txHash)
        );
    }

    return (
        "https://tronscan.org/#/transaction/" +
        encodeURIComponent(txHash)
    );
}


/* =========================================================
   NUMBER HELPERS
========================================================= */

function toNumber(
    value,
    fallback = 0
) {
    const number =
        Number(value);

    return Number.isFinite(
        number
    )
        ? number
        : fallback;
}


function roundNumber(
    value,
    decimals = 6
) {
    const number =
        toNumber(value);

    const factor =
        Math.pow(
            10,
            decimals
        );

    return (
        Math.round(
            number * factor
        ) / factor
    );
}


function formatAmount(
    value,
    decimals = 6
) {
    return roundNumber(
        value,
        decimals
    ).toLocaleString(
        "en-US",
        {
            maximumFractionDigits:
                decimals
        }
    );
}


/* =========================================================
   DATE HELPERS
========================================================= */

function toTimestamp(
    value
) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return 0;
    }

    const number =
        Number(value);

    if (
        Number.isFinite(number)
    ) {
        if (
            number < 100000000000
        ) {
            return number * 1000;
        }

        return number;
    }

    const parsed =
        Date.parse(
            String(value)
        );

    return Number.isFinite(
        parsed
    )
        ? parsed
        : 0;
}


function formatDate(
    value
) {
    const timestamp =
        toTimestamp(value);

    if (!timestamp) {
        return "";
    }

    return new Date(
        timestamp
    ).toISOString();
}


/* =========================================================
   HASH
========================================================= */

function hashObject(
    value
) {
    return crypto
        .createHash("sha256")
        .update(
            JSON.stringify(value)
        )
        .digest("hex");
}


/* =========================================================
   FETCH HELPER
========================================================= */

async function fetchJson(
    url,
    options = {},
    timeout = 20000
) {
    const controller =
        new AbortController();

    const timer =
        setTimeout(
            () =>
                controller.abort(),
            timeout
        );

    try {

        const response =
            await fetch(
                url,
                {
                    ...options,
                    signal:
                        controller.signal
                }
            );

        const text =
            await response.text();

        let data;

        try {
            data =
                JSON.parse(text);
        } catch {
            data = {
                raw: text
            };
        }

        if (
            !response.ok
        ) {
            throw new Error(
                `HTTP ${response.status}: ${
                    typeof data === "string"
                        ? data
                        : JSON.stringify(data)
                }`
            );
        }

        return data;

    } finally {
        clearTimeout(timer);
    }
}


/* =========================================================
   CACHE
========================================================= */

function getCache(
    cache,
    key,
    ttl
) {
    const item =
        cache.get(key);

    if (!item) {
        return null;
    }

    if (
        Date.now() -
            item.timestamp >
        ttl
    ) {
        cache.delete(key);
        return null;
    }

    return item.value;
}


function setCache(
    cache,
    key,
    value
) {
    cache.set(
        key,
        {
            timestamp:
                Date.now(),
            value
        }
    );

    return value;
}


/* =========================================================
   TRANSACTION NORMALIZER
========================================================= */

function normalizeTransaction(
    tx,
    blockchain,
    wallet
) {
    const network =
        normalizeBlockchain(
            blockchain
        );

    const from =
        tx.from ||
        tx.from_address ||
        tx.ownerAddress ||
        tx.owner_address ||
        tx.sender ||
        "";

    const to =
        tx.to ||
        tx.to_address ||
        tx.toAddress ||
        tx.receiver ||
        "";

    const hash =
        tx.hash ||
        tx.txID ||
        tx.tx_id ||
        tx.transaction_id ||
        tx.transactionHash ||
        "";

    let amount =
        tx.amount ??
        tx.value ??
        tx.tokenAmount ??
        tx.quantity ??
        0;

    amount =
        toNumber(
            amount
        );

    const timestamp =
        toTimestamp(
            tx.timestamp ||
            tx.block_timestamp ||
            tx.timeStamp ||
            tx.blockTimestamp ||
            tx.time
        );

    const normalized = {

        hash:
            safeString(hash),

        tx_hash:
            safeString(hash),

        from:
            safeString(from),

        to:
            safeString(to),

        amount:
            amount,

        token:
            tx.token ||
            tx.token_symbol ||
            tx.tokenSymbol ||
            "USDT",

        blockchain:
            network,

        blockchain_name:
            getBlockchainName(
                network
            ),

        timestamp:
            timestamp,

        datetime:
            formatDate(
                timestamp
            ),

        block:
            tx.block ||
            tx.blockNumber ||
            tx.block_num ||
            null,

        confirmed:
            tx.confirmed !== false,

        explorer:
            hash
                ? getTransactionExplorerUrl(
                      hash,
                      network
                  )
                : "",

        direction:
            sameWallet(
                from,
                wallet
            )
                ? "out"
                : sameWallet(
                      to,
                      wallet
                  )
                    ? "in"
                    : "unknown"
    };

    return normalized;
}


/* =========================================================
   SORT
========================================================= */

function sortTransactions(
    transactions
) {
    return [...transactions].sort(
        (
            a,
            b
        ) =>
            toNumber(
                b.timestamp
            ) -
            toNumber(
                a.timestamp
            )
    );
}


/* =========================================================
   TRON TRC20 TRANSACTIONS
========================================================= */

async function getTrc20Transactions(
    wallet,
    tokenContract = USDT_CONTRACT
) {
    const address =
        normalizeAddress(
            wallet
        );

    const cacheKey =
        `tron:${address}:${tokenContract}`;

    const cached =
        getCache(
            transactionCache,
            cacheKey,
            INDEXER_CACHE_TTL
        );

    if (cached) {
        return cached;
    }

    const transactions = [];

    let fingerprint = "";

    for (
        let page = 0;
        page < INDEXER_MAX_PAGES;
        page++
    ) {

        const params =
            new URLSearchParams();

        params.set(
            "limit",
            "200"
        );

        params.set(
            "contract_address",
            tokenContract
        );

        if (fingerprint) {
            params.set(
                "fingerprint",
                fingerprint
            );
        }

        const url =
            `${TRON_API}/v1/accounts/${encodeURIComponent(
                address
            )}/transactions/trc20?${params.toString()}`;

        try {

            const data =
                await fetchJson(
                    url,
                    {
                        headers:
                            TRON_HEADERS
                    }
                );

            const rows =
                Array.isArray(
                    data?.data
                )
                    ? data.data
                    : [];

            for (
                const row of rows
            ) {
                transactions.push(
                    normalizeTransaction(
                        {
                            hash:
                                row.transaction_id,
                            from:
                                row.from,
                            to:
                                row.to,
                            amount:
                                toNumber(
                                    row.value
                                ) /
                                Math.pow(
                                    10,
                                    toNumber(
                                        row.token_info
                                            ?.decimals,
                                        6
                                    )
                                ),
                            token:
                                row.token_info
                                    ?.symbol ||
                                "USDT",
                            timestamp:
                                row.block_timestamp
                        },
                        "tron",
                        address
                    )
                );
            }

            fingerprint =
                data?.meta
                    ?.fingerprint ||
                "";

            if (
                !fingerprint ||
                rows.length === 0
            ) {
                break;
            }

        } catch (
            error
        ) {

            console.error(
                "TRON TRC20 ERROR:",
                error.message
            );

            break;
        }
    }

    const unique =
        new Map();

    for (
        const tx of transactions
    ) {
        const key =
            [
                tx.hash,
                tx.from,
                tx.to,
                tx.amount
            ].join("|");

        if (!unique.has(key)) {
            unique.set(
                key,
                tx
            );
        }
    }

    const result =
        sortTransactions(
            Array.from(
                unique.values()
            )
        );

    return setCache(
        transactionCache,
        cacheKey,
        result
    );
}


/* =========================================================
   ETH / BNB ERC20 TRANSACTIONS
========================================================= */

async function getEvmUsdtTransactions(
    wallet,
    blockchain
) {
    const network =
        normalizeBlockchain(
            blockchain
        );

    const address =
        normalizeAddress(
            wallet
        );

    const contract =
        getUsdtContract(
            network
        );

    const cacheKey =
        `${network}:${address}:${contract}`;

    const cached =
        getCache(
            transactionCache,
            cacheKey,
            INDEXER_CACHE_TTL
        );

    if (cached) {
        return cached;
    }

    if (!ETHERSCAN_API_KEY) {

        console.warn(
            "Etherscan API key missing."
        );

        return [];
    }

    const chainId =
        getChainId(
            network
        );

    const transactions = [];

    for (
        let page = 1;
        page <=
        INDEXER_MAX_PAGES;
        page++
    ) {

        const url =
            `${ETHERSCAN_API_BASE}?` +
            new URLSearchParams(
                {
                    chainid:
                        String(
                            chainId
                        ),
                    module:
                        "account",
                    action:
                        "tokentx",
                    contractaddress:
                        contract,
                    address:
                        address,
                    page:
                        String(
                            page
                        ),
                    offset:
                        "100",
                    sort:
                        "desc",
                    apikey:
                        ETHERSCAN_API_KEY
                }
            ).toString();

        try {

            const data =
                await fetchJson(
                    url
                );

            const rows =
                Array.isArray(
                    data?.result
                )
                    ? data.result
                    : [];

            if (
                rows.length === 0
            ) {
                break;
            }

            for (
                const row of rows
            ) {

                const decimals =
                    toNumber(
                        row.tokenDecimal,
                        6
                    );

                transactions.push(
                    normalizeTransaction(
                        {
                            hash:
                                row.hash,
                            from:
                                row.from,
                            to:
                                row.to,
                            amount:
                                toNumber(
                                    row.value
                                ) /
                                Math.pow(
                                    10,
                                    decimals
                                ),
                            token:
                                row.tokenSymbol ||
                                "USDT",
                            timestamp:
                                row.timeStamp,
                            block:
                                row.blockNumber
                        },
                        network,
                        address
                    )
                );
            }

            if (
                rows.length < 100
            ) {
                break;
            }

        } catch (
            error
        ) {

            console.error(
                `${network} EVM ERROR:`,
                error.message
            );

            break;
        }
    }

    const unique =
        new Map();

    for (
        const tx of transactions
    ) {

        const key =
            [
                tx.hash,
                tx.from,
                tx.to,
                tx.amount
            ].join("|");

        if (!unique.has(key)) {
            unique.set(
                key,
                tx
            );
        }
    }

    const result =
        sortTransactions(
            Array.from(
                unique.values()
            )
        );

    return setCache(
        transactionCache,
        cacheKey,
        result
    );
}


/* =========================================================
   BLOCKCHAIN INDEXER
========================================================= */

async function scalableBlockchainIndex(
    wallet,
    blockchain,
    token = "USDT"
) {
    const network =
        normalizeBlockchain(
            blockchain
        );

    if (
        network === "tron"
    ) {
        return {
            transactions:
                await getTrc20Transactions(
                    wallet,
                    getUsdtContract(
                        network
                    )
                )
        };
    }

    if (
        network === "ethereum" ||
        network === "bnb"
    ) {
        return {
            transactions:
                await getEvmUsdtTransactions(
                    wallet,
                    network
                )
        };
    }

    return {
        transactions: []
    };
}


/* =========================================================
   VASP HELPERS
========================================================= */

function normalizeVaspEntry(
    entry
) {
    if (
        !entry ||
        typeof entry !==
            "object"
    ) {
        return null;
    }

    const addresses =
        Array.isArray(
            entry.addresses
        )
            ? entry.addresses
            : Array.isArray(
                  entry.wallets
              )
                ? entry.wallets
                : entry.address
                    ? [
                          entry.address
                      ]
                    : [];

    return {
        ...entry,

        name:
            entry.name ||
            entry.label ||
            entry.exchange ||
            entry.company ||
            "Unknown VASP",

        type:
            entry.type ||
            entry.category ||
            "VASP",

        addresses:
            addresses
                .map(
                    normalizeWallet
                )
                .filter(
                    Boolean
                )
    };
}


function findVasp(
    address
) {
    const target =
        normalizeWallet(
            address
        );

    if (!target) {
        return null;
    }

    for (
        const rawEntry of
        vaspDatabase
    ) {

        const entry =
            normalizeVaspEntry(
                rawEntry
            );

        if (!entry) {
            continue;
        }

        if (
            entry.addresses.includes(
                target
            )
        ) {
            return {
                ...entry,
                matchedAddress:
                    address,
                matchType:
                    "local_database"
            };
        }
    }

    return null;
}


function getVaspAttribution(
    address
) {
    const vasp =
        findVasp(
            address
        );

    if (vasp) {
        return {
            identified:
                true,

            name:
                vasp.name,

            type:
                vasp.type,

            confidence:
                1,

            source:
                "local_database",

            matchedAddress:
                vasp.matchedAddress
        };
    }

    return {
        identified:
            false,

        name:
            null,

        type:
            null,

        confidence:
            0,

        source:
            null,

        matchedAddress:
            null
    };
}


/* =========================================================
   COMPLAINT HELPERS
========================================================= */

function getComplaintsForWallet(
    address
) {
    const target =
        normalizeWallet(
            address
        );

    if (!target) {
        return [];
    }

    return complaintDatabase.filter(
        complaint => {

            const walletFields = [
                complaint.wallet,
                complaint.address,
                complaint.from,
                complaint.to,
                complaint.suspect_wallet
            ];

            return walletFields.some(
                value =>
                    sameWallet(
                        value,
                        target
                    )
            );
        }
    );
}


/* =========================================================
   RISK SCORE
========================================================= */

function calculateRiskScore(
    wallet,
    transactions
) {
    let score = 10;

    const complaints =
        getComplaintsForWallet(
            wallet
        );

    if (
        complaints.length > 0
    ) {
        score +=
            Math.min(
                complaints.length *
                    20,
                40
            );
    }

    let highValueCount = 0;

    let outgoingCount = 0;

    let incomingCount = 0;

    const counterparties =
        new Set();

    for (
        const tx of
        transactions
    ) {

        if (
            sameWallet(
                tx.from,
                wallet
            )
        ) {
            outgoingCount++;

            if (
                toNumber(
                    tx.amount
                ) >= 1000
            ) {
                highValueCount++;
            }

            if (tx.to) {
                counterparties.add(
                    normalizeWallet(
                        tx.to
                    )
                );
            }

        } else if (
            sameWallet(
                tx.to,
                wallet
            )
        ) {
            incomingCount++;

            if (
                toNumber(
                    tx.amount
                ) >= 1000
            ) {
                highValueCount++;
            }

            if (tx.from) {
                counterparties.add(
                    normalizeWallet(
                        tx.from
                    )
                );
            }
        }
    }

    score +=
        Math.min(
            highValueCount *
                5,
            20
        );

    if (
        outgoingCount > 20
    ) {
        score += 10;
    }

    if (
        incomingCount > 20
    ) {
        score += 5;
    }

    if (
        counterparties.size > 20
    ) {
        score += 5;
    }

    const vasp =
        getVaspAttribution(
            wallet
        );

    if (
        vasp.identified
    ) {
        score += 5;
    }

    return Math.min(
        Math.max(
            Math.round(score),
            0
        ),
        100
    );
}


/* =========================================================
   TYPOLOGIES
========================================================= */

function detectTypologies(
    wallet,
    transactions
) {
    const result = [];

    const outgoing =
        transactions.filter(
            tx =>
                sameWallet(
                    tx.from,
                    wallet
                )
        );

    const incoming =
        transactions.filter(
            tx =>
                sameWallet(
                    tx.to,
                    wallet
                )
        );

    if (
        outgoing.length >= 5
    ) {
        result.push({
            type:
                "multiple_outgoing",
            description:
                "Wallet has multiple outgoing transfers."
        });
    }

    if (
        incoming.length >= 5
    ) {
        result.push({
            type:
                "multiple_incoming",
            description:
                "Wallet has multiple incoming transfers."
        });
    }

    const outgoingByAddress =
        new Map();

    for (
        const tx of outgoing
    ) {
        const key =
            normalizeWallet(
                tx.to
            );

        if (!key) {
            continue;
        }

        outgoingByAddress.set(
            key,
            (
                outgoingByAddress.get(
                    key
                ) || 0
            ) + 1
        );
    }

    for (
        const [
            address,
            count
        ] of outgoingByAddress
    ) {
        if (
            count >= 3
        ) {
            result.push({
                type:
                    "repeated_counterparty",
                address:
                    address,
                count:
                    count
            });
        }
    }

    const splitMap =
        new Map();

    for (
        const tx of outgoing
    ) {

        const amount =
            toNumber(
                tx.amount
            );

        if (
            amount <= 0
        ) {
            continue;
        }

        const rounded =
            roundNumber(
                amount,
                2
            );

        splitMap.set(
            rounded,
            (
                splitMap.get(
                    rounded
                ) || 0
            ) + 1
        );
    }

    for (
        const [
            amount,
            count
        ] of splitMap
    ) {
        if (
            count >= 3
        ) {
            result.push({
                type:
                    "fund_splitting",
                amount:
                    amount,
                count:
                    count
            });
        }
    }

    return result;
}


/* =========================================================
   TRANSACTION STATISTICS
========================================================= */

function calculateStatistics(
    wallet,
    transactions
) {
    let incomingAmount = 0;

    let outgoingAmount = 0;

    let incomingCount = 0;

    let outgoingCount = 0;

    const counterparties =
        new Set();

    let highestTransaction = null;

    for (
        const tx of
        transactions
    ) {

        const amount =
            toNumber(
                tx.amount
            );

        if (
            sameWallet(
                tx.to,
                wallet
            )
        ) {

            incomingCount++;

            incomingAmount +=
                amount;

            if (tx.from) {
                counterparties.add(
                    normalizeWallet(
                        tx.from
                    )
                );
            }

        } else if (
            sameWallet(
                tx.from,
                wallet
            )
        ) {

            outgoingCount++;

            outgoingAmount +=
                amount;

            if (tx.to) {
                counterparties.add(
                    normalizeWallet(
                        tx.to
                    )
                );
            }
        }

        if (
            !highestTransaction ||
            amount >
                toNumber(
                    highestTransaction.amount
                )
        ) {
            highestTransaction =
                tx;
        }
    }

    return {

        incomingCount,

        outgoingCount,

        incomingAmount:
            roundNumber(
                incomingAmount,
                6
            ),

        outgoingAmount:
            roundNumber(
                outgoingAmount,
                6
            ),

        netFlow:
            roundNumber(
                incomingAmount -
                    outgoingAmount,
                6
            ),

        totalVolume:
            roundNumber(
                incomingAmount +
                    outgoingAmount,
                6
            ),

        transactionCount:
            transactions.length,

        uniqueCounterparties:
            counterparties.size,

        highestTransaction
    };
}


/* =========================================================
   TRACE WALLET
========================================================= */

async function traceWallet(
    wallet,
    network,
    token = "USDT",
    depth = 1,
    visited = new Set(),
    currentDepth = 1
) {
    const address =
        normalizeAddress(
            wallet
        );

    const walletKey =
        normalizeWallet(
            address
        );

    const maxDepth =
        depth === "all"
            ? 5
            : Math.min(
                Math.max(
                    Number(depth) || 1,
                    1
                ),
                5
            );

    if (
        visited.has(
            walletKey
        )
    ) {
        return {
            wallet:
                address,

            depth:
                currentDepth,

            current_depth:
                currentDepth,

            transactions:
                [],

            children:
                [],

            cycle:
                true
        };
    }

    const nextVisited =
        new Set(
            visited
        );

    nextVisited.add(
        walletKey
    );

    const indexed =
        await scalableBlockchainIndex(
            address,
            network,
            token
        );

    const transactions =
        sortTransactions(
            indexed.transactions ||
            []
        );

    const counterparties =
        new Map();

    for (
        const tx of transactions
    ) {

        let counterparty =
            null;

        if (
            sameWallet(
                tx.from,
                address
            )
        ) {
            counterparty =
                tx.to;
        } else if (
            sameWallet(
                tx.to,
                address
            )
        ) {
            counterparty =
                tx.from;
        }

        if (!counterparty) {
            continue;
        }

        const key =
            normalizeWallet(
                counterparty
            );

        if (
            !key ||
            key === walletKey
        ) {
            continue;
        }

        const existing =
            counterparties.get(
                key
            );

        if (existing) {

            existing.count++;

            existing.totalAmount +=
                toNumber(
                    tx.amount
                );

        } else {

            counterparties.set(
                key,
                {
                    address:
                        counterparty,

                    count:
                        1,

                    totalAmount:
                        toNumber(
                            tx.amount
                        )
                }
            );
        }
    }

    const traceNode = {

        wallet:
            address,

        depth:
            currentDepth,

        current_depth:
            currentDepth,

        transactions:
            transactions,

        transactionCount:
            transactions.length,

        counterparties:
            Array.from(
                counterparties.values()
            ).sort(
                (
                    a,
                    b
                ) =>
                    b.totalAmount -
                    a.totalAmount
            ),

        children:
            []
    };

    if (
        currentDepth >=
        maxDepth
    ) {
        return traceNode;
    }

    const nextNodes =
        Array.from(
            counterparties.values()
        )
        .sort(
            (
                a,
                b
            ) =>
                b.totalAmount -
                a.totalAmount
        )
        .slice(
            0,
            10
        );

    for (
        const counterparty of
        nextNodes
    ) {

        const childKey =
            normalizeWallet(
                counterparty.address
            );

        if (
            nextVisited.has(
                childKey
            )
        ) {
            continue;
        }

        try {

            const child =
                await traceWallet(
                    counterparty.address,
                    network,
                    token,
                    maxDepth,
                    nextVisited,
                    currentDepth + 1
                );

            traceNode.children.push(
                child
            );

        } catch (
            error
        ) {

            console.error(
                "TRACE CHILD ERROR:",
                error.message
            );
        }
    }

    return traceNode;
}


/* =========================================================
   FLATTEN TRACE TRANSACTIONS
========================================================= */

function flattenTraceTransactions(
    trace,
    output = [],
    visited = new Set()
) {
    if (
        !trace ||
        !trace.wallet
    ) {
        return output;
    }

    const walletKey =
        normalizeWallet(
            trace.wallet
        );

    if (
        visited.has(
            walletKey
        )
    ) {
        return output;
    }

    visited.add(
        walletKey
    );

    for (
        const tx of
        trace.transactions ||
        []
    ) {

        output.push({
            ...tx,

            trace_level:
                trace.current_depth ||
                trace.depth ||
                1,

            traced_wallet:
                trace.wallet
        });
    }

    for (
        const child of
        trace.children ||
        []
    ) {

        flattenTraceTransactions(
            child,
            output,
            visited
        );
    }

    return output;
}


/* =========================================================
   FLATTEN TRACE GRAPH
========================================================= */

function flattenTraceGraph(
    trace,
    nodes = [],
    edges = [],
    parent = null
) {
    if (
        !trace ||
        !trace.wallet
    ) {
        return {
            nodes,
            edges
        };
    }

    const nodeId =
        normalizeWallet(
            trace.wallet
        );

    nodes.push({

        id:
            nodeId,

        wallet:
            trace.wallet,

        depth:
            trace.current_depth ||
            trace.depth ||
            1,

        transactionCount:
            (
                trace.transactions ||
                []
            ).length,

        vasp:
            getVaspAttribution(
                trace.wallet
            )
    });

    if (parent) {

        edges.push({

            from:
                parent,

            to:
                nodeId
        });
    }

    for (
        const child of
        trace.children ||
        []
    ) {

        flattenTraceGraph(
            child,
            nodes,
            edges,
            nodeId
        );
    }

    return {
        nodes,
        edges
    };
}


/* =========================================================
   HEALTH
========================================================= */

app.get(
    "/api/health",
    (
        req,
        res
    ) => {

        res.json({

            success:
                true,

            service:
                "ChainTrace AI",

            status:
                "healthy",

            timestamp:
                new Date().toISOString(),

            uptime:
                process.uptime(),

            supportedNetworks: [
                "TRON",
                "Ethereum",
                "BNB Chain"
            ]
        });
    }
);


/* =========================================================
   NETWORKS
========================================================= */

app.get(
    "/api/networks",
    (
        req,
        res
    ) => {

        res.json({

            success:
                true,

            networks: [

                {
                    id:
                        "tron",

                    name:
                        "TRON",

                    token:
                        "TRC-20 USDT",

                    contract:
                        USDT_CONTRACT,

                    explorer:
                        getExplorerBase(
                            "tron"
                        )
                },

                {
                    id:
                        "ethereum",

                    name:
                        "Ethereum",

                    token:
                        "ERC-20 USDT",

                    contract:
                        ETH_USDT_CONTRACT,

                    explorer:
                        getExplorerBase(
                            "ethereum"
                        )
                },

                {
                    id:
                        "bnb",

                    name:
                        "BNB Chain",

                    token:
                        "BEP-20 USDT",

                    contract:
                        BNB_USDT_CONTRACT,

                    explorer:
                        getExplorerBase(
                            "bnb"
                        )
                }
            ]
        });
    }
);


/* =========================================================
   VALIDATE WALLET
========================================================= */

app.post(
    "/api/validate-wallet",
    (
        req,
        res
    ) => {

        const wallet =
            safeString(
                req.body?.wallet
            );

        const blockchain =
            normalizeBlockchain(
                req.body?.blockchain
            );

        const valid =
            isValidBlockchainAddress(
                wallet,
                blockchain
            );

        res.json({

            success:
                true,

            wallet:

                wallet,

            blockchain:

                blockchain,

            blockchain_name:
                getBlockchainName(
                    blockchain
                ),

            valid:
                valid,

            explorer:
                valid
                    ? getAddressExplorerUrl(
                          wallet,
                          blockchain
                      )
                    : null
        });
    }
);


/* =========================================================
   TRANSACTIONS API
========================================================= */

app.post(
    "/api/transactions",
    async (
        req,
        res
    ) => {

        try {

            const wallet =
                safeString(
                    req.body?.wallet
                );

            const blockchain =
                normalizeBlockchain(
                    req.body?.blockchain
                );

            const token =
                safeString(
                    req.body?.token ||
                    "USDT"
                );

            if (
                !isValidBlockchainAddress(
                    wallet,
                    blockchain
                )
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    error:
                        "Invalid wallet address."
                });
            }

            const indexed =
                await scalableBlockchainIndex(
                    wallet,
                    blockchain,
                    token
                );

            const transactions =
                sortTransactions(
                    indexed.transactions ||
                    []
                );

            res.json({

                success:
                    true,

                wallet:
                    wallet,

                blockchain:
                    blockchain,

                blockchain_name:
                    getBlockchainName(
                        blockchain
                    ),

                token:
                    token,

                count:
                    transactions.length,

                transactions:
                    transactions
            });

        } catch (
            error
        ) {

            console.error(
                "/api/transactions ERROR:",
                error
            );

            res.status(
                500
            ).json({

                success:
                    false,

                error:
                    error.message
            });
        }
    }
);


/* =========================================================
   ANALYZE API
========================================================= */

app.post(
    "/api/analyze",
    async (
        req,
        res
    ) => {

        try {

            const wallet =
                safeString(
                    req.body?.wallet
                );

            const blockchain =
                normalizeBlockchain(
                    req.body?.blockchain
                );

            const token =
                safeString(
                    req.body?.token ||
                    "USDT"
                );

            const depthValue =
                safeString(
                    req.body?.depth
                ).toLowerCase();

            const depth =
                depthValue === "all"
                    ? "all"
                    : Math.min(
                        Math.max(
                            Number(
                                depthValue
                            ) || 1,
                            1
                        ),
                        5
                    );

            if (
                !isValidBlockchainAddress(
                    wallet,
                    blockchain
                )
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    error:
                        "Invalid wallet address."
                });
            }

            const cacheKey =
                hashObject({
                    wallet:
                        normalizeWallet(
                            wallet
                        ),

                    blockchain,

                    token,

                    depth
                });

            const cached =
                getCache(
                    analysisCache,
                    cacheKey,
                    INDEXER_CACHE_TTL
                );

            if (cached) {
                return res.json(
                    cached
                );
            }

            const indexed =
                await scalableBlockchainIndex(
                    wallet,
                    blockchain,
                    token
                );

            const directTransactions =
                sortTransactions(
                    (
                        indexed.transactions ||
                        []
                    ).map(
                        tx =>
                            normalizeTransaction(
                                tx,
                                blockchain,
                                wallet
                            )
                    )
                );

            let trace = null;

            let traceTransactions = [];

            let transactions =
                directTransactions;

            /*
             * Depth > 1 or ALL:
             * trace connected wallets and merge
             * all discovered transactions.
             */

            if (
                depth === "all" ||
                Number(depth) > 1
            ) {

                try {

                    trace =
                        await traceWallet(
                            wallet,
                            blockchain,
                            token,
                            depth
                        );

                    traceTransactions =
                        flattenTraceTransactions(
                            trace
                        );

                    const merged =
                        new Map();

                    for (
                        const tx of
                        [
                            ...directTransactions,
                            ...traceTransactions
                        ]
                    ) {

                        const key =
                            [
                                tx.hash,
                                tx.from,
                                tx.to,
                                tx.amount
                            ].join("|");

                        if (
                            !merged.has(
                                key
                            )
                        ) {
                            merged.set(
                                key,
                                tx
                            );
                        }
                    }

                    transactions =
                        sortTransactions(
                            Array.from(
                                merged.values()
                            )
                        );

                } catch (
                    traceError
                ) {

                    console.error(
                        "ANALYZE TRACE ERROR:",
                        traceError.message
                    );

                    trace =
                        null;

                    traceTransactions =
                        [];
                }
            }

            const statistics =
                calculateStatistics(
                    wallet,
                    transactions
                );

            const riskScore =
                calculateRiskScore(
                    wallet,
                    transactions
                );

            const typologies =
                detectTypologies(
                    wallet,
                    transactions
                );

            const vasp =
                getVaspAttribution(
                    wallet
                );

            const complaints =
                getComplaintsForWallet(
                    wallet
                );

            const incoming =
                transactions.filter(
                    tx =>
                        sameWallet(
                            tx.to,
                            wallet
                        )
                );

            const outgoing =
                transactions.filter(
                    tx =>
                        sameWallet(
                            tx.from,
                            wallet
                        )
                );

            const counterparties =
                new Set();

            for (
                const tx of
                transactions
            ) {

                if (
                    sameWallet(
                        tx.from,
                        wallet
                    )
                ) {

                    if (tx.to) {
                        counterparties.add(
                            tx.to
                        );
                    }

                } else if (
                    sameWallet(
                        tx.to,
                        wallet
                    )
                ) {

                    if (tx.from) {
                        counterparties.add(
                            tx.from
                        );
                    }
                }
            }

            const response = {

                success:
                    true,

                wallet:
                    wallet,

                blockchain:
                    blockchain,

                blockchain_name:
                    getBlockchainName(
                        blockchain
                    ),

                token:
                    token,

                depth:
                    depth,

                depthLabel:
                    depth === "all"
                        ? "ALL"
                        : `Depth ${depth}`,

                explorer:
                    getAddressExplorerUrl(
                        wallet,
                        blockchain
                    ),

                vasp:
                    vasp,

                complaints:
                    complaints,

                complaintCount:
                    complaints.length,

                riskScore:
                    riskScore,

                risk:
                    riskScore >= 80
                        ? "HIGH"
                        : riskScore >= 50
                            ? "MEDIUM"
                            : "LOW",

                statistics:
                    statistics,

                summary: {

                    totalTransactions:
                        transactions.length,

                    incomingTransactions:
                        incoming.length,

                    outgoingTransactions:
                        outgoing.length,

                    incomingAmount:
                        roundNumber(
                            incoming.reduce(
                                (
                                    total,
                                    tx
                                ) =>
                                    total +
                                    toNumber(
                                        tx.amount
                                    ),
                                0
                            ),
                            6
                        ),

                    outgoingAmount:
                        roundNumber(
                            outgoing.reduce(
                                (
                                    total,
                                    tx
                                ) =>
                                    total +
                                    toNumber(
                                        tx.amount
                                    ),
                                0
                            ),
                            6
                        ),

                    uniqueCounterparties:
                        counterparties.size
                },

                typologies:
                    typologies,

                directTransactions:
                    directTransactions,

                trace:
                    trace,

                traceTransactions:
                    traceTransactions,

                transactions:
                    transactions,

                allTransactions:
                    transactions
            };

            setCache(
                analysisCache,
                cacheKey,
                response
            );

            res.json(
                response
            );

        } catch (
            error
        ) {

            console.error(
                "/api/analyze ERROR:",
                error
            );

            res.status(
                500
            ).json({

                success:
                    false,

                error:
                    error.message ||
                    "Analysis failed."
            });
        }
    }
);


/* =========================================================
   TRACE API
========================================================= */

app.post(
    "/api/trace",
    async (
        req,
        res
    ) => {

        try {

            const wallet =
                safeString(
                    req.body?.wallet
                );

            const blockchain =
                normalizeBlockchain(
                    req.body?.blockchain
                );

            const token =
                safeString(
                    req.body?.token ||
                    "USDT"
                );

            const depthValue =
                safeString(
                    req.body?.depth
                ).toLowerCase();

            const depth =
                depthValue === "all"
                    ? "all"
                    : Math.min(
                        Math.max(
                            Number(
                                depthValue
                            ) || 1,
                            1
                        ),
                        5
                    );

            if (
                !isValidBlockchainAddress(
                    wallet,
                    blockchain
                )
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    error:
                        "Invalid wallet address."
                });
            }

            const trace =
                await traceWallet(
                    wallet,
                    blockchain,
                    token,
                    depth
                );

            const graph =
                flattenTraceGraph(
                    trace
                );

            const traceTransactions =
                flattenTraceTransactions(
                    trace
                );

            res.json({

                success:
                    true,

                wallet:
                    wallet,

                blockchain:
                    blockchain,

                blockchain_name:
                    getBlockchainName(
                        blockchain
                    ),

                token:
                    token,

                depth:
                    depth,

                depthLabel:
                    depth === "all"
                        ? "ALL"
                        : `Depth ${depth}`,

                trace:
                    trace,

                graph:
                    graph,

                traceTransactions:
                    traceTransactions,

                transactions:
                    traceTransactions,

                allTransactions:
                    traceTransactions
            });

        } catch (
            error
        ) {

            console.error(
                "/api/trace ERROR:",
                error
            );

            res.status(
                500
            ).json({

                success:
                    false,

                error:
                    error.message ||
                    "Trace failed."
            });
        }
    }
);


/* =========================================================
   REALTIME HELPERS
========================================================= */

function createRealtimeAlert(
    watcher,
    transaction
) {
    const alert = {

        id:
            crypto.randomUUID(),

        wallet:
            watcher.wallet,

        blockchain:
            watcher.blockchain,

        token:
            watcher.token,

        type:
            "new_transaction",

        timestamp:
            Date.now(),

        transaction:
            transaction
    };

    realtimeAlerts.unshift(
        alert
    );

    if (
        realtimeAlerts.length >
        1000
    ) {
        realtimeAlerts.length =
            1000;
    }

    return alert;
}


async function checkRealtimeWatcher(
    watcher
) {
    if (
        !watcher.active
    ) {
        return;
    }

    try {

        const indexed =
            await scalableBlockchainIndex(
                watcher.wallet,
                watcher.blockchain,
                watcher.token
            );

        const transactions =
            sortTransactions(
                indexed.transactions ||
                []
            );

        const previousHashes =
            watcher.seenHashes ||
            new Set();

        const newTransactions =
            [];

        for (
            const tx of
            transactions
        ) {

            if (
                !previousHashes.has(
                    tx.hash
                )
            ) {

                previousHashes.add(
                    tx.hash
                );

                newTransactions.push(
                    tx
                );
            }
        }

        watcher.seenHashes =
            previousHashes;

        watcher.lastCheck =
            Date.now();

        watcher.lastTransactionCount =
            transactions.length;

        watcher.lastError =
            null;

        for (
            const tx of
            newTransactions
        ) {
            createRealtimeAlert(
                watcher,
                tx
            );
        }

        return newTransactions;

    } catch (
        error
    ) {

        watcher.lastCheck =
            Date.now();

        watcher.lastError =
            error.message;

        throw error;
    }
}


/* =========================================================
   REALTIME WATCH
========================================================= */

app.post(
    "/api/realtime/watch",
    async (
        req,
        res
    ) => {

        try {

            const wallet =
                safeString(
                    req.body?.wallet
                );

            const blockchain =
                normalizeBlockchain(
                    req.body?.blockchain
                );

            const token =
                safeString(
                    req.body?.token ||
                    "USDT"
                );

            if (
                !isValidBlockchainAddress(
                    wallet,
                    blockchain
                )
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    error:
                        "Invalid wallet address."
                });
            }

            const key =
                normalizeWallet(
                    wallet
                );

            let watcher =
                realtimeWatchers.get(
                    key
                );

            if (!watcher) {

                watcher = {

                    wallet:
                        wallet,

                    blockchain:
                        blockchain,

                    token:
                        token,

                    active:
                        true,

                    createdAt:
                        Date.now(),

                    lastCheck:
                        null,

                    lastError:
                        null,

                    lastTransactionCount:
                        0,

                    seenHashes:
                        new Set()
                };

                realtimeWatchers.set(
                    key,
                    watcher
                );

            } else {

                watcher.blockchain =
                    blockchain;

                watcher.token =
                    token;

                watcher.active =
                    true;
            }

            await checkRealtimeWatcher(
                watcher
            );

            res.json({

                success:
                    true,

                watching:
                    true,

                wallet:
                    wallet,

                blockchain:
                    blockchain,

                blockchain_name:
                    getBlockchainName(
                        blockchain
                    ),

                token:
                    token,

                watcherCount:
                    realtimeWatchers.size
            });

        } catch (
            error
        ) {

            console.error(
                "/api/realtime/watch ERROR:",
                error
            );

            res.status(
                500
            ).json({

                success:
                    false,

                error:
                    error.message
            });
        }
    }
);


/* =========================================================
   REALTIME UNWATCH
========================================================= */

app.post(
    "/api/realtime/unwatch",
    (
        req,
        res
    ) => {

        const wallet =
            safeString(
                req.body?.wallet
            );

        const key =
            normalizeWallet(
                wallet
            );

        const watcher =
            realtimeWatchers.get(
                key
            );

        if (watcher) {

            watcher.active =
                false;

            realtimeWatchers.delete(
                key
            );
        }

        res.json({

            success:
                true,

            watching:
                false,

            wallet:
                wallet,

            watcherCount:
                realtimeWatchers.size
        });
    }
);


/* =========================================================
   REALTIME STATUS
========================================================= */

app.get(
    "/api/realtime/status",
    (
        req,
        res
    ) => {

        const requestedWallet =
            safeString(
                req.query?.wallet
            );

        if (
            requestedWallet
        ) {

            const watcher =
                realtimeWatchers.get(
                    normalizeWallet(
                        requestedWallet
                    )
                );

            if (!watcher) {

                return res.json({

                    success:
                        true,

                    watching:
                        false,

                    wallet:
                        requestedWallet,

                    watcherCount:
                        realtimeWatchers.size
                });
            }

            return res.json({

                success:
                    true,

                watching:
                    watcher.active,

                wallet:
                    watcher.wallet,

                blockchain:
                    watcher.blockchain,

                blockchain_name:
                    getBlockchainName(
                        watcher.blockchain
                    ),

                token:
                    watcher.token,

                lastCheck:
                    watcher.lastCheck,

                lastError:
                    watcher.lastError,

                transactionCount:
                    watcher.lastTransactionCount,

                watcherCount:
                    realtimeWatchers.size
            });
        }

        res.json({

            success:
                true,

            watching:
                realtimeWatchers.size >
                0,

            watcherCount:
                realtimeWatchers.size,

            active:
                realtimeWatchers.size,

            message:
                realtimeWatchers.size >
                0
                    ? "Real-time monitoring is active."
                    : "Real-time monitoring is inactive."
        });
    }
);


/* =========================================================
   REALTIME ALERTS
========================================================= */

app.get(
    "/api/realtime/alerts",
    (
        req,
        res
    ) => {

        const wallet =
            safeString(
                req.query?.wallet
            );

        const blockchain =
            req.query?.blockchain
                ? normalizeBlockchain(
                      req.query.blockchain
                  )
                : null;

        const limit =
            Math.min(
                Math.max(
                    Number(
                        req.query?.limit
                    ) || 50,
                    1
                ),
                500
            );

        let alerts =
            realtimeAlerts;

        if (wallet) {

            alerts =
                alerts.filter(
                    alert =>
                        sameWallet(
                            alert.wallet,
                            wallet
                        )
                );
        }

        if (
            blockchain
        ) {

            alerts =
                alerts.filter(
                    alert =>
                        alert.blockchain ===
                        blockchain
                );
        }

        res.json({

            success:
                true,

            count:
                Math.min(
                    alerts.length,
                    limit
                ),

            alerts:
                alerts.slice(
                    0,
                    limit
                )
        });
    }
);


/* =========================================================
   REALTIME POLLING LOOP
========================================================= */

async function runRealtimeMonitoring() {

    const watchers =
        Array.from(
            realtimeWatchers.values()
        );

    if (
        watchers.length === 0
    ) {
        return;
    }

    for (
        const watcher of watchers
    ) {

        if (
            !watcher.active
        ) {
            continue;
        }

        try {

            await checkRealtimeWatcher(
                watcher
            );

        } catch (
            error
        ) {

            console.error(
                "REALTIME LOOP ERROR:",
                error.message
            );
        }
    }
}


/* =========================================================
   REALTIME INTERVAL
========================================================= */

const realtimeInterval =
    setInterval(
        () => {

            runRealtimeMonitoring()
                .catch(
                    error => {

                        console.error(
                            "REALTIME INTERVAL ERROR:",
                            error.message
                        );
                    }
                );

        },
        REALTIME_ALERT_INTERVAL
    );


/* =========================================================
   ROOT API
========================================================= */

app.get(
    "/",
    (
        req,
        res
    ) => {

        res.json({

            service:
                "ChainTrace AI",

            status:
                "online",

            version:
                "multichain",

            supportedNetworks: [

                "TRON / TRC-20",

                "Ethereum / ERC-20",

                "BNB Chain / BEP-20"
            ],

            endpoints: [

                "GET /api/health",

                "GET /api/networks",

                "POST /api/validate-wallet",

                "POST /api/analyze",

                "POST /api/transactions",

                "POST /api/trace",

                "POST /api/realtime/watch",

                "POST /api/realtime/unwatch",

                "GET /api/realtime/status",

                "GET /api/realtime/alerts"
            ]
        });
    }
);


/* =========================================================
   404 HANDLER
========================================================= */

app.use(
    (
        req,
        res
    ) => {

        res.status(
            404
        ).json({

            success:
                false,

            error:
                "API endpoint not found.",

            path:
                req.originalUrl
        });
    }
);


/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
            "GLOBAL ERROR:",
            error
        );

        if (
            res.headersSent
        ) {
            return next(
                error
            );
        }

        res.status(
            500
        ).json({

            success:
                false,

            error:
                error.message ||
                "Internal server error."
        });
    }
);


/* =========================================================
   SERVER START
========================================================= */

const server =
    app.listen(
        PORT,
        () => {

            console.log(
                "=========================================="
            );

            console.log(
                `ChainTrace AI server running on http://localhost:${PORT}`
            );

            console.log(
                "=========================================="
            );

            console.log(
                "Supported networks:"
            );

            console.log(
                "1. TRON / TRC-20 USDT"
            );

            console.log(
                "2. Ethereum / ERC-20 USDT"
            );

            console.log(
                "3. BNB Chain / BEP-20 USDT"
            );

            console.log(
                "=========================================="
            );

            console.log(
                "TRON API:",
                TRON_API_KEY
                    ? "READY"
                    : "NO API KEY"
            );

            console.log(
                "Etherscan V2 API:",
                ETHERSCAN_API_KEY
                    ? "READY"
                    : "NO API KEY"
            );

            console.log(
                "=========================================="
            );
        }
    );


/* =========================================================
   GRACEFUL SHUTDOWN
========================================================= */

function shutdown(
    signal
) {

    console.log(
        `${signal} received. Shutting down server...`
    );

    clearInterval(
        realtimeInterval
    );

    for (
        const watcher of
        realtimeWatchers.values()
    ) {

        watcher.active =
            false;
    }

    realtimeWatchers.clear();

    server.close(
        () => {

            console.log(
                "Server closed."
            );

            process.exit(
                0
            );
        }
    );

    setTimeout(
        () => {

            process.exit(
                1
            );

        },
        10000
    );
}


process.on(
    "SIGINT",
    () =>
        shutdown(
            "SIGINT"
        )
);


process.on(
    "SIGTERM",
    () =>
        shutdown(
            "SIGTERM"
        );


/* =========================================================
   UNHANDLED ERRORS
========================================================= */

process.on(
    "unhandledRejection",
    error => {

        console.error(
            "UNHANDLED REJECTION:",
            error
        );
    }
);


process.on(
    "uncaughtException",
    error => {

        console.error(
            "UNCAUGHT EXCEPTION:",
            error
        );
    }
);
