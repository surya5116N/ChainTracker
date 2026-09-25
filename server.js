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

const preservedEvidence = new Map();


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

        case "tron":
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
        value ===
            "ethereum" ||
        value ===
            "eth" ||
        value ===
            "ethereum-usdt"
    ) {
        return "ethereum";
    }

    if (
        value === "bnb" ||
        value === "bsc" ||
        value ===
            "bnb-chain" ||
        value ===
            "bnb-usdt"
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
        network ===
        "ethereum"
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
        network ===
        "ethereum"
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
        network ===
        "ethereum"
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
    const base =
        getExplorerBase(
            blockchain
        );

    return (
        base +
        "/address/" +
        encodeURIComponent(
            address
        )
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
        network ===
        "ethereum"
    ) {
        return (
            "https://etherscan.io/tx/" +
            encodeURIComponent(
                txHash
            )
        );
    }

    if (
        network === "bnb"
    ) {
        return (
            "https://bscscan.com/tx/" +
            encodeURIComponent(
                txHash
            )
        );
    }

    return (
        "https://tronscan.org/#/transaction/" +
        encodeURIComponent(
            txHash
        )
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
        toNumber(
            value
        );

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

function parseTimestamp(
    value
) {
    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    const numeric =
        Number(value);

    if (
        Number.isFinite(
            numeric
        )
    ) {
        if (
            numeric <
            100000000000
        ) {
            return new Date(
                numeric * 1000
            );
        }

        return new Date(
            numeric
        );
    }

    const parsed =
        new Date(
            value
        );

    if (
        Number.isNaN(
            parsed.getTime()
        )
    ) {
        return null;
    }

    return parsed;
}


function formatDate(
    value
) {
    const date =
        parseTimestamp(
            value
        );

    if (!date) {
        return null;
    }

    return date.toISOString();
}


/* =========================================================
   HASH HELPERS
========================================================= */

function createHash(
    value
) {
    return crypto
        .createHash(
            "sha256"
        )
        .update(
            String(value)
        )
        .digest(
            "hex"
        );
}


/* =========================================================
   FETCH HELPER
========================================================= */

async function fetchJson(
    url,
    options = {},
    timeoutMs = 20000
) {
    const controller =
        new AbortController();

    const timeout =
        setTimeout(
            () => {
                controller.abort();
            },
            timeoutMs
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
                text
                    ? JSON.parse(
                          text
                      )
                    : null;
        } catch {
            data = text;
        }

        if (
            !response.ok
        ) {
            const error =
                new Error(
                    `HTTP ${response.status}`
                );

            error.status =
                response.status;

            error.data =
                data;

            throw error;
        }

        return data;

    } finally {
        clearTimeout(
            timeout
        );
    }
}


/* =========================================================
   CACHE HELPERS
========================================================= */

function getCache(
    key
) {
    const item =
        transactionCache.get(
            key
        );

    if (!item) {
        return null;
    }

    if (
        Date.now() -
            item.timestamp >
        INDEXER_CACHE_TTL
    ) {
        transactionCache.delete(
            key
        );

        return null;
    }

    return item.value;
}


function setCache(
    key,
    value
) {
    transactionCache.set(
        key,
        {
            timestamp:
                Date.now(),
            value
        }
    );

    return value;
}


function getAnalysisCache(
    key
) {
    const item =
        analysisCache.get(
            key
        );

    if (!item) {
        return null;
    }

    if (
        Date.now() -
            item.timestamp >
        INDEXER_CACHE_TTL
    ) {
        analysisCache.delete(
            key
        );

        return null;
    }

    return item.value;
}


function setAnalysisCache(
    key,
    value
) {
    analysisCache.set(
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
   TRON ADDRESS CONVERSION
========================================================= */

function hexToBase58(
    hexAddress
) {
    try {
        if (
            !hexAddress
        ) {
            return null;
        }

        let hex =
            String(
                hexAddress
            ).replace(
                /^0x/i,
                ""
            );

        if (
            hex.length === 42 &&
            hex.startsWith(
                "41"
            )
        ) {
            // already TRON 21-byte hex
        } else if (
            hex.length === 40
        ) {
            hex =
                "41" +
                hex;
        }

        if (
            hex.length !== 42
        ) {
            return null;
        }

        const payload =
            Buffer.from(
                hex,
                "hex"
            );

        const checksum =
            crypto
                .createHash(
                    "sha256"
                )
                .update(
                    payload
                )
                .digest();

        const checksum2 =
            crypto
                .createHash(
                    "sha256"
                )
                .update(
                    checksum
                )
                .digest();

        const finalBuffer =
            Buffer.concat([
                payload,
                checksum2.subarray(
                    0,
                    4
                )
            ]);

        return base58Encode(
            finalBuffer
        );

    } catch {
        return null;
    }
}


function base58Encode(
    buffer
) {
    const alphabet =
        "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

    let value =
        BigInt(
            "0x" +
                buffer.toString(
                    "hex"
                )
        );

    let result = "";

    while (
        value > 0n
    ) {
        const mod =
            Number(
                value %
                    58n
            );

        result =
            alphabet[mod] +
            result;

        value /=
            58n;
    }

    for (
        let i = 0;
        i < buffer.length &&
        buffer[i] === 0;
        i++
    ) {
        result =
            "1" +
            result;
    }

    return result;
}


/* =========================================================
   TRON URL BUILDER
========================================================= */

function buildTronUrl(
    pathname,
    params = {}
) {
    const url =
        new URL(
            TRON_API +
                pathname
        );

    Object.entries(
        params
    ).forEach(
        ([key, value]) => {
            if (
                value !==
                    undefined &&
                value !== null
            ) {
                url.searchParams.set(
                    key,
                    String(value)
                );
            }
        }
    );

    return url.toString();
}


/* =========================================================
   ETHERSCAN URL BUILDER
========================================================= */

function buildEtherscanUrl(
    blockchain,
    params = {}
) {
    const url =
        new URL(
            ETHERSCAN_API_BASE
        );

    const chainId =
        getChainId(
            blockchain
        );

    url.searchParams.set(
        "chainid",
        String(
            chainId
        )
    );

    Object.entries(
        params
    ).forEach(
        ([key, value]) => {
            if (
                value !==
                    undefined &&
                value !== null
            ) {
                url.searchParams.set(
                    key,
                    String(value)
                );
            }
        }
    );

    if (
        ETHERSCAN_API_KEY
    ) {
        url.searchParams.set(
            "apikey",
            ETHERSCAN_API_KEY
        );
    }

    return url.toString();
}


/* =========================================================
   TRON TRC-20 FETCH
========================================================= */

async function fetchTronUsdtTransfers(
    address,
    options = {}
) {
    const wallet =
        normalizeAddress(
            address
        );

    const cacheKey =
        [
            "tron",
            "usdt",
            wallet.toLowerCase(),
            options.limit || 200,
            options.maxPages ||
                INDEXER_MAX_PAGES
        ].join(":");

    const cached =
        getCache(
            cacheKey
        );

    if (cached) {
        return cached;
    }

    const transactions = [];

    let fingerprint =
        null;

    const maxPages =
        Math.min(
            Math.max(
                Number(
                    options.maxPages
                ) ||
                    INDEXER_MAX_PAGES,
                1
            ),
            100
        );

    const limit =
        Math.min(
            Math.max(
                Number(
                    options.limit
                ) || 200,
                1
            ),
            200
        );

    for (
        let page = 0;
        page < maxPages;
        page++
    ) {
        const params = {
            limit,
            only_confirmed:
                true,
            contract_address:
                USDT_CONTRACT,
            order_by:
                "block_timestamp,desc"
        };

        if (
            fingerprint
        ) {
            params.fingerprint =
                fingerprint;
        }

        const url =
            buildTronUrl(
                `/v1/accounts/${encodeURIComponent(
                    wallet
                )}/transactions/trc20`,
                params
            );

        let data;

        try {
            data =
                await fetchJson(
                    url,
                    {
                        headers:
                            TRON_HEADERS
                    }
                );
        } catch (
            error
        ) {
            console.error(
                "TRON USDT FETCH ERROR:",
                error.message
            );

            if (
                error.data
            ) {
                console.error(
                    "TRON ERROR DATA:",
                    error.data
                );
            }

            throw error;
        }

        const rows =
            Array.isArray(
                data?.data
            )
                ? data.data
                : [];

        transactions.push(
            ...rows
        );

        const nextFingerprint =
            data?.meta
                ?.fingerprint ||
            null;

        if (
            !nextFingerprint ||
            rows.length <
                limit
        ) {
            break;
        }

        fingerprint =
            nextFingerprint;
    }

    return setCache(
        cacheKey,
        transactions
    );
}


/* =========================================================
   TRON NATIVE TRX FETCH
========================================================= */

async function fetchTronNativeTransfers(
    address,
    options = {}
) {
    const wallet =
        normalizeAddress(
            address
        );

    const cacheKey =
        [
            "tron",
            "trx",
            wallet.toLowerCase(),
            options.limit || 200,
            options.maxPages ||
                INDEXER_MAX_PAGES
        ].join(":");

    const cached =
        getCache(
            cacheKey
        );

    if (cached) {
        return cached;
    }

    const transactions = [];

    let fingerprint =
        null;

    const maxPages =
        Math.min(
            Math.max(
                Number(
                    options.maxPages
                ) ||
                    INDEXER_MAX_PAGES,
                1
            ),
            100
        );

    const limit =
        Math.min(
            Math.max(
                Number(
                    options.limit
                ) || 200,
                1
            ),
            200
        );

    for (
        let page = 0;
        page < maxPages;
        page++
    ) {
        const params = {
            limit,
            only_confirmed:
                true,
            order_by:
                "block_timestamp,desc"
        };

        if (
            fingerprint
        ) {
            params.fingerprint =
                fingerprint;
        }

        const url =
            buildTronUrl(
                `/v1/accounts/${encodeURIComponent(
                    wallet
                )}/transactions`,
                params
            );

        let data;

        try {
            data =
                await fetchJson(
                    url,
                    {
                        headers:
                            TRON_HEADERS
                    }
                );
        } catch (
            error
        ) {
            console.error(
                "TRON TRX FETCH ERROR:",
                error.message
            );

            throw error;
        }

        const rows =
            Array.isArray(
                data?.data
            )
                ? data.data
                : [];

        for (
            const tx of rows
        ) {
            const contract =
                tx
                    ?.raw_data
                    ?.contract?.[0];

            if (
                contract?.type !==
                "TransferContract"
            ) {
                continue;
            }

            const value =
                contract
                    ?.parameter
                    ?.value;

            if (!value) {
                continue;
            }

            const from =
                hexToBase58(
                    value.owner_address
                );

            const to =
                hexToBase58(
                    value
                        .to_address
                );

            const amount =
                toNumber(
                    value
                        .amount
                ) /
                1e6;

            transactions.push({
                transaction_id:
                    tx.txID,
                from,
                to,
                value: amount,
                token: "TRX",
                block_timestamp:
                    tx.block_timestamp,
                confirmed:
                    true,
                type:
                    "TransferContract"
            });
        }

        const nextFingerprint =
            data?.meta
                ?.fingerprint ||
            null;

        if (
            !nextFingerprint ||
            rows.length <
                limit
        ) {
            break;
        }

        fingerprint =
            nextFingerprint;
    }

    return setCache(
        cacheKey,
        transactions
    );
}

/* =========================================================
   TRON GET
========================================================= */

async function tronGet(
    endpoint,
    params = {}
) {
    const url =
        new URL(
            TRON_API + endpoint
        );

    Object.entries(params).forEach(
        ([key, value]) => {
            if (
                value !== undefined &&
                value !== null
            ) {
                url.searchParams.set(
                    key,
                    String(value)
                );
            }
        }
    );

    console.log(
        "TRON GET:",
        url.toString()
    );

    const response =
        await fetch(
            url,
            {
                method: "GET",
                headers: TRON_HEADERS
            }
        );

    const text =
        await response.text();

    let data = {};

    try {
        data =
            text
                ? JSON.parse(text)
                : {};
    } catch {
        data = {
            raw: text
        };
    }

    if (!response.ok) {

        console.error(
            "TRON API ERROR:",
            response.status,
            data
        );

        if (
            response.status === 401
        ) {
            throw new Error(
                "TRON API 401 Unauthorized. Check TRON_API_KEY."
            );
        }

        if (
            response.status === 403
        ) {
            throw new Error(
                "TRON API 403 Forbidden. Check API key permissions."
            );
        }

        if (
            response.status === 429
        ) {
            throw new Error(
                "TRON API rate limit reached."
            );
        }

        throw new Error(
            `TRON API error: ${response.status}`
        );
    }

    return data;
}


/* =========================================================
   PAGINATED TRC-20 USDT INDEXER
========================================================= */

async function getTrc20Transactions(
    address,
    maxPages = INDEXER_MAX_PAGES,
    minTimestamp = null
) {

    const allTransactions = [];
    const seenHashes = new Set();

    let fingerprint = null;

    for (
        let page = 0;
        page < maxPages;
        page++
    ) {

        const params = {

            limit: 200,

            only_confirmed:
                true,

            contract_address:
                USDT_CONTRACT,

            order_by:
                "block_timestamp,desc"
        };

        if (Number.isFinite(minTimestamp) && minTimestamp > 0) {
            params.min_timestamp = Math.floor(minTimestamp);
        }

        if (fingerprint) {
            params.fingerprint =
                fingerprint;
        }

        const data =
            await tronGet(
                `/v1/accounts/${address}/transactions/trc20`,
                params
            );

        const pageTransactions =
            Array.isArray(data.data)
                ? data.data
                : [];

        if (
            pageTransactions.length === 0
        ) {
            break;
        }

        for (
            const tx of pageTransactions
        ) {

            const hash =
                tx.transaction_id;

            if (
                hash &&
                !seenHashes.has(hash)
            ) {

                seenHashes.add(hash);

                allTransactions.push(
                    tx
                );
            }
        }

        fingerprint =
            data.meta?.finger ||
            data.meta?.fingerprint ||
            null;

        if (
            Number.isFinite(minTimestamp) &&
            minTimestamp > 0
        ) {
            const pageHasRecentTransaction =
                pageTransactions.some(tx =>
                    Number(tx.block_timestamp || 0) >= minTimestamp
                );

            if (!pageHasRecentTransaction) {
                break;
            }
        }

        if (!fingerprint || pageTransactions.length < 200) {
            break;
        }
    }

    return allTransactions;
}


/* =========================================================
   PAGINATED NATIVE TRX INDEXER
========================================================= */

function tronHexToBase58(address) {

    if (!address) {
        return "";
    }

    if (
        address.startsWith("T")
    ) {
        return address;
    }

    const hex =
        address.replace(
            /^0x/,
            ""
        );

    if (
        !/^[0-9a-fA-F]{42}$/.test(
            hex
        )
    ) {
        return address;
    }

    const payload =
        Buffer.from(
            hex,
            "hex"
        );

    const checksum =
        crypto
            .createHash(
                "sha256"
            )
            .update(
                crypto
                    .createHash(
                        "sha256"
                    )
                    .update(
                        payload
                    )
                    .digest()
            )
            .digest()
            .subarray(
                0,
                4
            );

    const bytes =
        Buffer.concat([
            payload,
            checksum
        ]);

    const alphabet =
        "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

    let n =
        BigInt(
            "0x" +
            bytes.toString(
                "hex"
            )
        );

    let out = "";

    while (
        n > 0n
    ) {

        const r =
            Number(
                n % 58n
            );

        out =
            alphabet[r] +
            out;

        n =
            n / 58n;
    }

    for (
        const b of bytes
    ) {

        if (
            b !== 0
        ) {
            break;
        }

        out =
            "1" +
            out;
    }

    return out;
}


async function getTrxTransactions(
    address,
    maxPages = INDEXER_MAX_PAGES
) {

    const allTransactions = [];
    const seenHashes = new Set();

    let fingerprint = null;

    for (
        let page = 0;
        page < maxPages;
        page++
    ) {

        const params = {

            limit: 200,

            only_confirmed:
                true,

            order_by:
                "block_timestamp,desc"
        };

        if (
            fingerprint
        ) {
            params.fingerprint =
                fingerprint;
        }

        const data =
            await tronGet(
                `/v1/accounts/${address}/transactions`,
                params
            );

        const pageTransactions =
            Array.isArray(
                data.data
            )
                ? data.data
                : [];

        if (
            !pageTransactions.length
        ) {
            break;
        }

        for (
            const tx of pageTransactions
        ) {

            const hash =
                tx.txID ||
                tx.txid ||
                tx.transaction_id;

            const contract =
                tx
                    .raw_data
                    ?.contract?.[0];

            const value =
                contract
                    ?.parameter
                    ?.value ||
                {};

            if (
                contract?.type !==
                    "TransferContract" ||
                !hash
            ) {
                continue;
            }

            const from =
                tronHexToBase58(
                    value.owner_address ||
                    ""
                );

            const to =
                tronHexToBase58(
                    value.to_address ||
                    ""
                );

            const amount =
                Number(
                    value.amount || 0
                );

            if (
                !seenHashes.has(
                    hash
                ) &&
                from &&
                to &&
                amount > 0
            ) {

                seenHashes.add(
                    hash
                );

                allTransactions.push({

                    transaction_id:
                        hash,

                    block_timestamp:
                        tx.block_timestamp,

                    from,

                    to,

                    value:
                        String(
                            amount
                        ),

                    token_info: {
                        symbol:
                            "TRX",

                        decimals:
                            6
                    }
                });
            }
        }

        fingerprint =
            data.meta?.fingerprint ||
            data.meta?.finger ||
            null;

        if (
            !fingerprint ||
            pageTransactions.length <
                200
        ) {
            break;
        }
    }

    return allTransactions;
}



function getCachedTransactions(
    wallet,
    token = "USDT",
    blockchain = "tron"
) {

    const key =
        `${blockchain}:${normalizeWallet(wallet)}:${String(token).toUpperCase()}`;

    const cached =
        transactionCache.get(
            key
        );

    if (!cached) {
        return null;
    }

    if (
        Date.now() -
            cached.timestamp >
        INDEXER_CACHE_TTL
    ) {

        transactionCache.delete(
            key
        );

        return null;
    }

    return cached.transactions;
}


function setCachedTransactions(
    wallet,
    transactions,
    token = "USDT",
    blockchain = "tron"
) {

    const key =
        `${blockchain}:${normalizeWallet(wallet)}:${String(token).toUpperCase()}`;

    transactionCache.set(
        key,
        {
            timestamp:
                Date.now(),

            transactions
        }
    );
}


/* =========================================================
   SCALABLE TRON INDEX
========================================================= */

async function scalableTronIndex(
    wallet,
    token = "USDT",
    blockchain = "tron",
    options = {}
) {

    const forceRefresh = Boolean(options.forceRefresh);

    const cached = forceRefresh
        ? null
        : getCachedTransactions(
            wallet,
            token,
            blockchain
        );

    if (cached) {

        return {

            transactions:
                cached,

            source:
                "CACHE"
        };
    }

    let transactions = [];

    const normalizedToken =
        String(
            token
        ).toUpperCase();

    if (
        normalizedToken ===
        "TRX"
    ) {

        transactions =
            await getTrxTransactions(
                wallet
            );

    } else {

        transactions =
            await getTrc20Transactions(
                wallet,
                options.maxPages || INDEXER_MAX_PAGES,
                options.minTimestamp || null
            );
    }

    setCachedTransactions(
        wallet,
        transactions,
        normalizedToken,
        blockchain
    );

    return {

        transactions,

        source:
            "TRONGRID"
    };
}


/* =========================================================
   MULTICHAIN INDEXER
========================================================= */

async function scalableBlockchainIndex(
    wallet,
    token = "USDT",
    blockchain = "tron",
    options = {}
) {

    const network =
        normalizeBlockchain(
            blockchain
        );

    if (
        network === "tron"
    ) {

        return scalableTronIndex(
            wallet,
            token,
            network,
            options
        );
    }

    const normalizedToken =
        String(
            token
        ).toUpperCase();

    if (
        normalizedToken !==
        "USDT"
    ) {

        throw new Error(
            `${getBlockchainName(
                network
            )} currently supports USDT token transfers only.`
        );
    }

    const cache =
        getCachedTransactions(
            wallet,
            normalizedToken,
            network
        );

    if (cache) {

        return {

            transactions:
                cache,

            source:
                "CACHE"
        };
    }

    const transactions =
        await getEvmUsdtTransactions(
            wallet,
            network,
            options.maxPages || INDEXER_MAX_PAGES,
            options.minTimestamp || null
        );

    setCachedTransactions(
        wallet,
        transactions,
        normalizedToken,
        network
    );

    return {

        transactions,

        source:
            "ETHERSCAN_V2"
    };
}


/* =========================================================
   TRANSACTION NORMALIZATION
========================================================= */

function normalizeTransaction(
    tx,
    wallet,
    blockchain = "tron"
) {

    const network =
        normalizeBlockchain(
            blockchain
        );

    const walletNormalized =
        normalizeWallet(
            wallet
        );

    const from =
        tx.from ||
        tx.from_address ||
        tx.owner_address ||
        "";

    const to =
        tx.to ||
        tx.to_address ||
        "";

    let amount = 0;

    let decimals = 6;

    let symbol =
        tx.token ||
        tx.token_info
            ?.symbol ||
        "USDT";

    if (
        tx.token_info
            ?.decimals !==
        undefined
    ) {

        decimals =
            Number(
                tx.token_info
                    .decimals
            );
    }

    if (
        tx.value !==
        undefined
    ) {

        const rawValue =
            String(
                tx.value
            );

        if (
            network !==
            "tron" &&
            /^\d+$/.test(
                rawValue
            )
        ) {

            amount =
                Number(
                    rawValue
                ) /
                Math.pow(
                    10,
                    decimals
                );

        } else {

            const numeric =
                Number(
                    rawValue
                );

            if (
                Number.isFinite(
                    numeric
                )
            ) {

                if (
                    network ===
                    "tron" &&
                    symbol ===
                    "USDT"
                ) {

                    amount =
                        numeric /
                        Math.pow(
                            10,
                            decimals
                        );

                } else {

                    amount =
                        numeric;
                }
            }
        }
    }

    const fromNormalized =
        normalizeWallet(
            from
        );

    const toNormalized =
        normalizeWallet(
            to
        );

    let direction =
        "Unknown";

    if (
        fromNormalized ===
        walletNormalized
    ) {

        direction =
            "Sent";

    } else if (
        toNormalized ===
        walletNormalized
    ) {

        direction =
            "Received";
    }

    const hash =
        tx.transaction_id ||
        tx.txID ||
        tx.hash ||
        tx.transactionHash ||
        "";

    const timestamp =
        tx.block_timestamp ||
        tx.timeStamp ||
        tx.timestamp ||
        null;

    return {

        hash,

        transaction_id:
            hash,

        blockchain:
            network,

        blockchain_name:
            getBlockchainName(
                network
            ),

        token:
            symbol,

        symbol,

        amount:
            formatAmount(
                amount
            ),

        value:
            amount,

        from,

        to,

        direction,

        timestamp,

        date:
            formatDate(
                timestamp
            ),

        explorer_url:
            getTransactionExplorerUrl(
                hash,
                network
            ),

        block:
            tx.blockNumber ||
            tx.block ||
            null,

        contract:
            tx._contract ||
            tx.contractAddress ||
            getUsdtContract(
                network
            )
    };
}


/* =========================================================
   SORT TRANSACTIONS
========================================================= */

function sortTransactions(
    transactions
) {

    return [
        ...transactions
    ].sort(
        (
            a,
            b
        ) => {

            const ta =
                Number(
                    a.timestamp ||
                    0
                );

            const tb =
                Number(
                    b.timestamp ||
                    0
                );

            return tb - ta;
        }
    );
}


/* =========================================================
   TRANSACTION SUMMARY
========================================================= */

function summarizeTransactions(
    transactions,
    wallet
) {

    let sentCount = 0;

    let receivedCount = 0;

    let sentAmount = 0;

    let receivedAmount = 0;

    const counterparties =
        new Set();

    for (
        const tx of transactions
    ) {

        const amount =
            Number(
                tx.amount ||
                tx.value ||
                0
            );

        if (
            tx.direction ===
            "Sent"
        ) {

            sentCount++;

            sentAmount +=
                amount;

            if (
                tx.to
            ) {
                counterparties.add(
                    tx.to
                );
            }

        } else if (
            tx.direction ===
            "Received"
        ) {

            receivedCount++;

            receivedAmount +=
                amount;

            if (
                tx.from
            ) {
                counterparties.add(
                    tx.from
                );
            }
        }
    }

    return {

        total:
            transactions.length,

        sentCount,

        receivedCount,

        sentAmount:
            formatAmount(
                sentAmount
            ),

        receivedAmount:
            formatAmount(
                receivedAmount
            ),

        netFlow:
            formatAmount(
                receivedAmount -
                sentAmount
            ),

        counterparties:
            counterparties.size,

        wallet:
            wallet
    };
}
/* =========================================================
   EVM USDT TRANSACTION INDEXER
   Ethereum + BNB Chain
========================================================= */

async function getEvmUsdtTransactions(
    address,
    blockchain,
    maxPages = INDEXER_MAX_PAGES,
    minTimestamp = null
) {

    const network =
        normalizeBlockchain(
            blockchain
        );

    if (
        network !== "ethereum" &&
        network !== "bnb"
    ) {
        throw new Error(
            "EVM indexer supports Ethereum and BNB Chain only."
        );
    }

    if (
        !isValidEvmAddress(
            address
        )
    ) {
        throw new Error(
            "Invalid EVM wallet address."
        );
    }

    if (
        !ETHERSCAN_API_KEY
    ) {
        throw new Error(
            "ETHERSCAN_API_KEY is missing in .env"
        );
    }

    const contract =
        getUsdtContract(
            network
        );

    const transactions = [];

    const seenHashes =
        new Set();

    const offset = 100;

    for (
        let page = 1;
        page <= maxPages;
        page++
    ) {

        const url =
            buildEtherscanUrl(
                network,
                {
                    module:
                        "account",

                    action:
                        "tokentx",

                    contractaddress:
                        contract,

                    address:
                        address,

                    page,

                    offset,

                    sort:
                        "desc"
                }
            );

        let data;

        try {

            data =
                await fetchJson(
                    url,
                    {
                        headers: {
                            Accept:
                                "application/json"
                        }
                    },
                    20000
                );

        } catch (
            error
        ) {

            console.error(
                "ETHERSCAN FETCH ERROR:",
                error.message
            );

            throw error;
        }

        if (
            data?.status ===
                "0" &&
            !Array.isArray(
                data?.result
            )
        ) {

            const message =
                data?.message ||
                "Etherscan API request failed.";

            throw new Error(
                message
            );
        }

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

        let reachedTimeWindow = false;

        for (
            const tx of rows
        ) {

            const txTimestampMs =
                Number.isFinite(Number(tx.timeStamp))
                    ? Number(tx.timeStamp) * 1000
                    : null;

            // Etherscan returns transactions newest-first. Once the
            // oldest row in the current page is older than the requested
            // window, the remaining pages cannot contain newer rows.
            if (
                Number.isFinite(minTimestamp) &&
                txTimestampMs !== null &&
                txTimestampMs < minTimestamp
            ) {
                reachedTimeWindow = true;
                continue;
            }

            const hash =
                tx.hash ||
                tx.transactionHash ||
                "";

            if (
                !hash ||
                seenHashes.has(
                    hash
                )
            ) {
                continue;
            }

            const tokenAddress =
                String(
                    tx.contractAddress ||
                    ""
                ).toLowerCase();

            if (
                tokenAddress !==
                contract.toLowerCase()
            ) {
                continue;
            }

            seenHashes.add(
                hash
            );

            transactions.push({

                hash,

                transaction_id:
                    hash,

                transactionHash:
                    hash,

                from:
                    tx.from || "",

                to:
                    tx.to || "",

                value:
                    tx.value || "0",

                token:
                    tx.tokenSymbol ||
                    "USDT",

                token_info: {

                    symbol:
                        tx.tokenSymbol ||
                        "USDT",

                    decimals:
                        Number(
                            tx.tokenDecimal ||
                            6
                        )
                },

                contractAddress:
                    tx.contractAddress ||
                    contract,

                blockNumber:
                    tx.blockNumber,

                timeStamp:
                    tx.timeStamp,

                gas:
                    tx.gas,

                gasPrice:
                    tx.gasPrice,

                gasUsed:
                    tx.gasUsed,

                confirmations:
                    tx.confirmations
            });
        }

        if (
            reachedTimeWindow ||
            rows.length < offset
        ) {
            break;
        }
    }

    return transactions;
}


/* =========================================================
   NORMALIZE WALLET
========================================================= */

function normalizeWallet(
    address
) {

    return safeString(
        address
    ).toLowerCase();
}


/* =========================================================
   WALLET MATCH
========================================================= */

function sameWallet(
    a,
    b
) {

    if (
        !a ||
        !b
    ) {
        return false;
    }

    return (
        normalizeWallet(a) ===
        normalizeWallet(b)
    );
}


/* =========================================================
   COUNTERPARTY EXTRACTION
========================================================= */

function getCounterparty(
    tx
) {

    if (
        tx.direction ===
        "Sent"
    ) {
        return tx.to || "";
    }

    if (
        tx.direction ===
        "Received"
    ) {
        return tx.from || "";
    }

    return "";
}


/* =========================================================
   UNIQUE COUNTERPARTIES
========================================================= */

function getUniqueCounterparties(
    transactions
) {

    const map =
        new Map();

    for (
        const tx of transactions
    ) {

        const address =
            getCounterparty(
                tx
            );

        if (!address) {
            continue;
        }

        const key =
            normalizeWallet(
                address
            );

        if (
            !map.has(key)
        ) {

            map.set(
                key,
                address
            );
        }
    }

    return Array.from(
        map.values()
    );
}


/* =========================================================
   VASP DATABASE HELPERS
========================================================= */

function getVaspDatabase() {

    if (
        Array.isArray(
            vaspDatabase
        )
    ) {
        return vaspDatabase;
    }

    if (
        vaspDatabase &&
        Array.isArray(
            vaspDatabase.data
        )
    ) {
        return vaspDatabase.data;
    }

    if (
        vaspDatabase &&
        Array.isArray(
            vaspDatabase.vasps
        )
    ) {
        return vaspDatabase.vasps;
    }

    return [];
}


function getComplaintDatabase() {

    if (
        Array.isArray(
            complaintDatabase
        )
    ) {
        return complaintDatabase;
    }

    if (
        complaintDatabase &&
        Array.isArray(
            complaintDatabase.data
        )
    ) {
        return complaintDatabase.data;
    }

    if (
        complaintDatabase &&
        Array.isArray(
            complaintDatabase.complaints
        )
    ) {
        return complaintDatabase.complaints;
    }

    return [];
}


/* =========================================================
   GENERIC ADDRESS SEARCH
========================================================= */

function objectContainsAddress(
    object,
    address
) {

    if (
        !object ||
        !address
    ) {
        return false;
    }

    const target =
        normalizeWallet(
            address
        );

    const values =
        Object.values(
            object
        );

    for (
        const value of values
    ) {

        if (
            typeof value ===
            "string"
        ) {

            if (
                normalizeWallet(
                    value
                ) ===
                target
            ) {
                return true;
            }

            if (
                value
                    .toLowerCase()
                    .includes(
                        target
                    )
            ) {
                return true;
            }
        }
    }

    return false;
}


/* =========================================================
   VASP LOOKUP
========================================================= */

function findVaspForAddress(
    address
) {

    const database =
        getVaspDatabase();

    const matches =
        [];

    for (
        const entry of database
    ) {

        if (
            objectContainsAddress(
                entry,
                address
            )
        ) {

            matches.push(
                entry
            );
        }
    }

    return matches;
}


/* =========================================================
   VASP ATTRIBUTION
========================================================= */

function buildVaspAttribution(
    transactions,
    rootWallet = ""
) {

    const counterparties =
        getUniqueCounterparties(
            transactions
        );

    const addresses =
        [];

    if (
        rootWallet &&
        !counterparties.some(
            address =>
                sameWallet(
                    address,
                    rootWallet
                )
        )
    ) {
        addresses.push(
            rootWallet
        );
    }

    addresses.push(
        ...counterparties
    );

    const results =
        [];

    const seen =
        new Set();

    for (
        const address of addresses
    ) {

        const matches =
            findVaspForAddress(
                address
            );

        for (
            const match of matches
        ) {

            const key =
                JSON.stringify(
                    [
                        address,
                        match
                    ]
                );

            if (
                seen.has(key)
            ) {
                continue;
            }

            seen.add(key);

            results.push({

                address,

                vasp:
                    match.name ||
                    match.vasp_name ||
                    match.exchange ||
                    match.platform ||
                    "Unknown VASP",

                category:
                    match.category ||
                    match.type ||
                    "VASP",

                country:
                    match.country ||
                    match.jurisdiction ||
                    "Unknown",

                status:
                    match.status ||
                    "Unknown",

                source:
                    match.source ||
                    "Local VASP Database",

                details:
                    match
            });
        }
    }

    return results;
}


/* =========================================================
   COMPLAINT MATCHING
========================================================= */

function complaintAddressMatches(
    complaint,
    address
) {

    if (
        !complaint ||
        !address
    ) {
        return false;
    }

    const target =
        normalizeWallet(
            address
        );

    const possibleFields = [

        "wallet",

        "wallet_address",

        "address",

        "crypto_address",

        "from",

        "to",

        "sender",

        "receiver",

        "suspect_wallet",

        "suspect_address",

        "transaction_address",

        "blockchain_address"
    ];

    for (
        const field of possibleFields
    ) {

        if (
            complaint[field]
        ) {

            const value =
                normalizeWallet(
                    complaint[field]
                );

            if (
                value ===
                target
            ) {
                return true;
            }
        }
    }

    return objectContainsAddress(
        complaint,
        address
    );
}


/* =========================================================
   COMPLAINT CROSS REFERENCE
========================================================= */

function findComplaintsForAddresses(
    addresses
) {

    const database =
        getComplaintDatabase();

    const results =
        [];

    const seen =
        new Set();

    for (
        const address of addresses
    ) {

        for (
            const complaint of database
        ) {

            if (
                !complaintAddressMatches(
                    complaint,
                    address
                )
            ) {
                continue;
            }

            const id =
                complaint.id ||
                complaint.complaint_id ||
                complaint.case_id ||
                createHash(
                    JSON.stringify(
                        complaint
                    )
                );

            const key =
                `${address}:${id}`;

            if (
                seen.has(key)
            ) {
                continue;
            }

            seen.add(key);

            results.push({

                address,

                complaint_id:
                    complaint.complaint_id ||
                    complaint.case_id ||
                    complaint.id ||
                    null,

                status:
                    complaint.status ||
                    "Reported",

                category:
                    complaint.category ||
                    complaint.type ||
                    "Crypto Fraud",

                date:
                    complaint.date ||
                    complaint.created_at ||
                    complaint.timestamp ||
                    null,

                description:
                    complaint.description ||
                    complaint.details ||
                    "",

                source:
                    complaint.source ||
                    "Complaint Database",

                details:
                    complaint
            });
        }
    }

    return results;
}


/* =========================================================
   TRANSACTION ADDRESS COLLECTION
========================================================= */

function collectTransactionAddresses(
    transactions,
    wallet
) {

    const addresses =
        new Set();

    if (wallet) {

        addresses.add(
            wallet
        );
    }

    for (
        const tx of transactions
    ) {

        if (tx.from) {
            addresses.add(
                tx.from
            );
        }

        if (tx.to) {
            addresses.add(
                tx.to
            );
        }
    }

    return Array.from(
        addresses
    );
}


/* =========================================================
   RISK SCORING
========================================================= */

function calculateRiskScore(
    transactions,
    complaints,
    vaspMatches
) {

    let score = 0;

    const reasons =
        [];

    const total =
        transactions.length;

    const complaintCount =
        complaints.length;

    const vaspCount =
        vaspMatches.length;

    if (
        complaintCount > 0
    ) {

        score += 45;

        reasons.push(
            `${complaintCount} complaint match(es) found`
        );
    }

    if (
        vaspCount > 0
    ) {

        score += 10;

        reasons.push(
            `${vaspCount} VASP attribution match(es) found`
        );
    }

    let highValueCount = 0;

    let rapidCount = 0;

    let uniqueCounterparties =
        new Set();

    let sentAmount = 0;

    let receivedAmount = 0;

    for (
        const tx of transactions
    ) {

        const amount =
            Number(
                tx.amount ||
                tx.value ||
                0
            );

        if (
            tx.direction ===
            "Sent"
        ) {

            sentAmount +=
                amount;

        } else if (
            tx.direction ===
            "Received"
        ) {

            receivedAmount +=
                amount;
        }

        if (
            amount >=
            10000
        ) {

            highValueCount++;
        }

        const cp =
            getCounterparty(
                tx
            );

        if (cp) {

            uniqueCounterparties.add(
                normalizeWallet(
                    cp
                )
            );
        }
    }

    if (
        highValueCount > 0
    ) {

        score +=
            Math.min(
                20,
                highValueCount * 5
            );

        reasons.push(
            `${highValueCount} high-value transaction(s)`
        );
    }

    if (
        total >= 20
    ) {

        score += 5;

        reasons.push(
            "High transaction activity"
        );
    }

    if (
        uniqueCounterparties.size >=
        10
    ) {

        score += 5;

        reasons.push(
            "Large counterparty network"
        );
    }

    if (
        sentAmount >
            0 &&
        receivedAmount >
            0
    ) {

        const ratio =
            sentAmount /
            Math.max(
                receivedAmount,
                1
            );

        if (
            ratio >= 2 ||
            ratio <= 0.5
        ) {

            score += 5;

            reasons.push(
                "Significant directional fund-flow imbalance"
            );
        }
    }

    score =
        Math.min(
            100,
            Math.max(
                0,
                score
            )
        );

    let level =
        "LOW";

    if (
        score >= 70
    ) {

        level =
            "CRITICAL";

    } else if (
        score >= 50
    ) {

        level =
            "HIGH";

    } else if (
        score >= 30
    ) {

        level =
            "MEDIUM";
    }

    return {

        score,

        level,

        reasons,

        metrics: {

            transactions:
                total,

            complaints:
                complaintCount,

            vaspMatches:
                vaspCount,

            highValueTransactions:
                highValueCount,

            counterparties:
                uniqueCounterparties.size,

            sentAmount:
                formatAmount(
                    sentAmount
                ),

            receivedAmount:
                formatAmount(
                    receivedAmount
                )
        }
    };
}


/* =========================================================
   FRAUD TYPOLOGY
========================================================= */

function detectFraudTypology(
    transactions,
    complaints,
    vaspMatches
) {

    const typologies =
        [];

    const counterpartySet =
        new Set();

    let highValue = 0;

    let sent = 0;

    let received = 0;

    for (
        const tx of transactions
    ) {

        const amount =
            Number(
                tx.amount ||
                tx.value ||
                0
            );

        if (
            amount >=
            10000
        ) {
            highValue++;
        }

        if (
            tx.direction ===
            "Sent"
        ) {
            sent += amount;
        }

        if (
            tx.direction ===
            "Received"
        ) {
            received += amount;
        }

        const cp =
            getCounterparty(
                tx
            );

        if (cp) {
            counterpartySet.add(
                normalizeWallet(
                    cp
                )
            );
        }
    }

    if (
        complaints.length > 0
    ) {

        typologies.push({
            type:
                "Reported Fraud Exposure",

            confidence:
                "HIGH",

            reason:
                "Wallet or related address matched complaint records."
        });
    }

    if (
        highValue >= 3
    ) {

        typologies.push({
            type:
                "High-Value Transfer Pattern",

            confidence:
                "MEDIUM",

            reason:
                "Multiple high-value transfers were observed."
        });
    }

    if (
        counterpartySet.size >=
        10
    ) {

        typologies.push({
            type:
                "Layering / Multi-Counterparty Flow",

            confidence:
                "MEDIUM",

            reason:
                "Wallet interacted with a comparatively large number of counterparties."
        });
    }

    if (
        sent > 0 &&
        received > 0 &&
        sent > received * 2
    ) {

        typologies.push({
            type:
                "Rapid Outbound Fund Movement",

            confidence:
                "MEDIUM",

            reason:
                "Outbound value substantially exceeded inbound value."
        });
    }

    if (
        vaspMatches.length > 0
    ) {

        typologies.push({
            type:
                "VASP Exposure",

            confidence:
                "LOW",

            reason:
                "One or more counterparties were attributed to a VASP."
        });
    }

    if (
        typologies.length === 0
    ) {

        typologies.push({
            type:
                "No Strong Typology Detected",

            confidence:
                "LOW",

            reason:
                "Available transaction evidence does not strongly match the configured typologies."
        });
    }

    return typologies;
}


/* =========================================================
   INVESTIGATION INSIGHTS
========================================================= */

function generateInsights(
    transactions,
    risk,
    complaints,
    vaspMatches
) {

    const insights =
        [];

    if (
        risk.level ===
        "CRITICAL"
    ) {

        insights.push(
            "The wallet exhibits a critical-risk pattern based on the available evidence."
        );

    } else if (
        risk.level ===
        "HIGH"
    ) {

        insights.push(
            "The wallet exhibits elevated risk indicators that warrant further investigation."
        );

    } else if (
        risk.level ===
        "MEDIUM"
    ) {

        insights.push(
            "The wallet contains moderate risk indicators."
        );

    } else {

        insights.push(
            "No strong high-risk indicators were identified from the available dataset."
        );
    }

    if (
        complaints.length > 0
    ) {

        insights.push(
            "Complaint database correlation increases the evidentiary priority of this wallet."
        );
    }

    if (
        vaspMatches.length > 0
    ) {

        insights.push(
            "VASP attribution may provide an additional investigative lead."
        );
    }

    if (
        transactions.length === 0
    ) {

        insights.push(
            "No matching transactions were returned for the selected network and token."
        );
    }

    return insights;
}


/* =========================================================
   RECOMMENDATIONS
========================================================= */

function generateRecommendations(
    risk,
    complaints,
    vaspMatches,
    transactions
) {

    const recommendations =
        [];

    if (
        risk.score >= 70
    ) {

        recommendations.push(
            "Prioritize the wallet for manual investigative review."
        );

        recommendations.push(
            "Preserve relevant transaction hashes and blockchain evidence."
        );
    }

    if (
        complaints.length > 0
    ) {

        recommendations.push(
            "Cross-reference matched complaint records with the underlying transaction evidence."
        );
    }

    if (
        vaspMatches.length > 0
    ) {

        recommendations.push(
            "Review attributed VASP information and applicable legal/request channels."
        );
    }

    if (
        transactions.length > 0
    ) {

        recommendations.push(
            "Trace significant counterparties to identify upstream and downstream fund movement."
        );
    }

    if (
        recommendations.length ===
        0
    ) {

        recommendations.push(
            "Collect additional transaction history before making a final attribution decision."
        );
    }

    return recommendations;
}
/* =========================================================
   FUND FLOW GRAPH
========================================================= */

function buildFundFlowGraph(
    transactions,
    wallet
) {

    const nodes =
        new Map();

    const edges =
        [];

    function addNode(
        address,
        role = "counterparty"
    ) {

        if (!address) {
            return;
        }

        const key =
            normalizeWallet(
                address
            );

        if (
            nodes.has(key)
        ) {
            return;
        }

        nodes.set(
            key,
            {
                id: address,

                label:
                    shortenAddress(
                        address
                    ),

                address,

                role
            }
        );
    }

    addNode(
        wallet,
        "investigated_wallet"
    );

    for (
        const tx of transactions
    ) {

        if (
            !tx.from ||
            !tx.to
        ) {
            continue;
        }

        addNode(
            tx.from,
            sameWallet(
                tx.from,
                wallet
            )
                ? "investigated_wallet"
                : "sender"
        );

        addNode(
            tx.to,
            sameWallet(
                tx.to,
                wallet
            )
                ? "investigated_wallet"
                : "receiver"
        );

        const amount =
            Number(
                tx.amount ||
                tx.value ||
                0
            );

        edges.push({

            id:
                createHash(
                    [
                        tx.hash,
                        tx.from,
                        tx.to,
                        amount
                    ].join(":")
                ),

            source:
                tx.from,

            target:
                tx.to,

            amount:
                amount,

            amountFormatted:
                formatAmount(
                    amount
                ),

            token:
                tx.token ||
                "USDT",

            direction:
                tx.direction,

            hash:
                tx.hash,

            timestamp:
                tx.timestamp
        });
    }

    return {

        nodes:
            Array.from(
                nodes.values()
            ),

        edges,

        nodeCount:
            nodes.size,

        edgeCount:
            edges.length
    };
}


/* =========================================================
   DIRECT FUND FLOW
========================================================= */

function getDirectFundFlow(
    transactions,
    wallet
) {

    const incoming = [];

    const outgoing = [];

    for (
        const tx of transactions
    ) {

        const item = {

            hash:
                tx.hash,

            from:
                tx.from,

            to:
                tx.to,

            amount:
                Number(
                    tx.amount ||
                    tx.value ||
                    0
                ),

            amountFormatted:
                formatAmount(
                    Number(
                        tx.amount ||
                        tx.value ||
                        0
                    )
                ),

            token:
                tx.token ||
                "USDT",

            timestamp:
                tx.timestamp,

            date:
                tx.date,

            explorer_url:
                tx.explorer_url
        };

        if (
            sameWallet(
                tx.to,
                wallet
            )
        ) {

            incoming.push(
                item
            );

        } else if (
            sameWallet(
                tx.from,
                wallet
            )
        ) {

            outgoing.push(
                item
            );
        }
    }

    return {

        incoming,

        outgoing,

        incomingCount:
            incoming.length,

        outgoingCount:
            outgoing.length
    };
}


/* =========================================================
   TOP COUNTERPARTIES
========================================================= */

function getTopCounterparties(
    transactions,
    wallet,
    limit = 10
) {

    const map =
        new Map();

    for (
        const tx of transactions
    ) {

        const address =
            getCounterparty(
                tx
            );

        if (!address) {
            continue;
        }

        const key =
            normalizeWallet(
                address
            );

        const amount =
            Number(
                tx.amount ||
                tx.value ||
                0
            );

        if (
            !map.has(key)
        ) {

            map.set(
                key,
                {
                    address,

                    transactionCount:
                        0,

                    totalAmount:
                        0,

                    sentAmount:
                        0,

                    receivedAmount:
                        0
                }
            );
        }

        const item =
            map.get(key);

        item.transactionCount++;

        item.totalAmount +=
            amount;

        if (
            tx.direction ===
            "Sent"
        ) {

            item.sentAmount +=
                amount;

        } else if (
            tx.direction ===
            "Received"
        ) {

            item.receivedAmount +=
                amount;
        }
    }

    return Array.from(
        map.values()
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
            limit
        )
        .map(
            item => ({

                address:
                    item.address,

                label:
                    shortenAddress(
                        item.address
                    ),

                transactionCount:
                    item.transactionCount,

                totalAmount:
                    formatAmount(
                        item.totalAmount
                    ),

                sentAmount:
                    formatAmount(
                        item.sentAmount
                    ),

                receivedAmount:
                    formatAmount(
                        item.receivedAmount
                    )
            })
        );
}


/* =========================================================
   TRANSACTION TIMELINE
========================================================= */

function buildTransactionTimeline(
    transactions
) {

    return transactions
        .map(
            tx => ({

                hash:
                    tx.hash,

                timestamp:
                    tx.timestamp,

                date:
                    tx.date,

                direction:
                    tx.direction,

                amount:
                    Number(
                        tx.amount ||
                        tx.value ||
                        0
                    ),

                amountFormatted:
                    formatAmount(
                        Number(
                            tx.amount ||
                            tx.value ||
                            0
                        )
                    ),

                from:
                    tx.from,

                to:
                    tx.to,

                token:
                    tx.token,

                blockchain:
                    tx.blockchain,

                explorer_url:
                    tx.explorer_url
            })
        )
        .sort(
            (
                a,
                b
            ) =>
                Number(
                    b.timestamp || 0
                ) -
                Number(
                    a.timestamp || 0
                )
        );
}


/* =========================================================
   TRANSACTION STATISTICS
========================================================= */

function calculateTransactionStatistics(
    transactions
) {

    let totalVolume = 0;

    let maxTransaction = 0;

    let minTransaction =
        transactions.length
            ? Infinity
            : 0;

    let sentVolume = 0;

    let receivedVolume = 0;

    let sentCount = 0;

    let receivedCount = 0;

    for (
        const tx of transactions
    ) {

        const amount =
            Number(
                tx.amount ||
                tx.value ||
                0
            );

        totalVolume +=
            amount;

        maxTransaction =
            Math.max(
                maxTransaction,
                amount
            );

        minTransaction =
            Math.min(
                minTransaction,
                amount
            );

        if (
            tx.direction ===
            "Sent"
        ) {

            sentCount++;

            sentVolume +=
                amount;

        } else if (
            tx.direction ===
            "Received"
        ) {

            receivedCount++;

            receivedVolume +=
                amount;
        }
    }

    return {

        totalTransactions:
            transactions.length,

        sentCount,

        receivedCount,

        totalVolume:
            formatAmount(
                totalVolume
            ),

        sentVolume:
            formatAmount(
                sentVolume
            ),

        receivedVolume:
            formatAmount(
                receivedVolume
            ),

        averageTransaction:
            formatAmount(
                transactions.length
                    ? totalVolume /
                          transactions.length
                    : 0
            ),

        maxTransaction:
            formatAmount(
                maxTransaction
            ),

        minTransaction:
            formatAmount(
                minTransaction
            ),

        netFlow:
            formatAmount(
                receivedVolume -
                sentVolume
            )
    };
}


/* =========================================================
   NETWORK METADATA
========================================================= */

function getNetworkMetadata(
    blockchain
) {

    const network =
        normalizeBlockchain(
            blockchain
        );

    if (
        network ===
        "ethereum"
    ) {

        return {

            blockchain:
                "ethereum",

            name:
                "Ethereum",

            standard:
                "ERC-20",

            chainId:
                1,

            token:
                "USDT",

            contract:
                ETH_USDT_CONTRACT,

            explorer:
                "Etherscan",

            explorerBase:
                "https://etherscan.io"
        };
    }

    if (
        network ===
        "bnb"
    ) {

        return {

            blockchain:
                "bnb",

            name:
                "BNB Chain",

            standard:
                "BEP-20",

            chainId:
                56,

            token:
                "USDT",

            contract:
                BNB_USDT_CONTRACT,

            explorer:
                "BscScan",

            explorerBase:
                "https://bscscan.com"
        };
    }

    return {

        blockchain:
            "tron",

        name:
            "TRON",

        standard:
            "TRC-20",

        chainId:
            null,

        token:
            "USDT",

        contract:
            USDT_CONTRACT,

        explorer:
            "TRONSCAN",

        explorerBase:
            "https://tronscan.org"
    };
}


/* =========================================================
   API HEALTH
========================================================= */

app.get(
    "/api/health",
    (
        req,
        res
    ) => {

        res.json({

            status:
                "online",

            service:
                "ChainTrace AI",

            version:
                "multichain",

            timestamp:
                new Date().toISOString(),

            blockchainSupport: {

                tron: true,

                ethereum:
                    Boolean(
                        ETHERSCAN_API_KEY
                    ),

                bnb:
                    Boolean(
                        ETHERSCAN_API_KEY
                    )
            },

            data: {

                complaintDatabase:
                    getComplaintDatabase()
                        .length,

                vaspDatabase:
                    getVaspDatabase()
                        .length,

                realtimeWatchers:
                    realtimeWatchers.size,

                realtimeAlerts:
                    realtimeAlerts.length
            },

            integrations: {

                tron:
                    Boolean(
                        TRON_API_KEY
                    ),

                etherscan:
                    Boolean(
                        ETHERSCAN_API_KEY
                    ),

                apiIntegration:
                    Boolean(
                        API_INTEGRATION_KEY &&
                        API_INTEGRATION_URL
                    ),

                ncrp:
                    Boolean(
                        NCRP_API_KEY &&
                        NCRP_API_URL
                    ),

                sahyog:
                    Boolean(
                        SAHYOG_API_KEY &&
                        SAHYOG_API_URL
                    )
            }
        });
    }
);


/* =========================================================
   NETWORK INFO API
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

                    standard:
                        "TRC-20",

                    token:
                        "USDT",

                    enabled:
                        Boolean(
                            TRON_API_KEY
                        ),

                    contract:
                        USDT_CONTRACT,

                    explorer:
                        "TRONSCAN"
                },

                {

                    id:
                        "ethereum",

                    name:
                        "Ethereum",

                    standard:
                        "ERC-20",

                    token:
                        "USDT",

                    enabled:
                        Boolean(
                            ETHERSCAN_API_KEY
                        ),

                    contract:
                        ETH_USDT_CONTRACT,

                    chainId:
                        1,

                    explorer:
                        "Etherscan"
                },

                {

                    id:
                        "bnb",

                    name:
                        "BNB Chain",

                    standard:
                        "BEP-20",

                    token:
                        "USDT",

                    enabled:
                        Boolean(
                            ETHERSCAN_API_KEY
                        ),

                    contract:
                        BNB_USDT_CONTRACT,

                    chainId:
                        56,

                    explorer:
                        "BscScan"
                }
            ]
        });
    }
);


/* =========================================================
   SIMPLE WALLET VALIDATION API
========================================================= */

app.post(
    "/api/validate-wallet",
    (
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

            const valid =
                isValidBlockchainAddress(
                    wallet,
                    blockchain
                );

            res.json({

                success:
                    true,

                valid,

                wallet,

                blockchain,

                blockchain_name:
                    getBlockchainName(
                        blockchain
                    )
            });

        } catch (
            error
        ) {

            res.status(
                400
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
   WALLET ANALYSIS
========================================================= */

app.post(
    "/api/analyze",
    async (
        req,
        res
    ) => {

        const startedAt =
            Date.now();

        try {

            const wallet =
                safeString(
                    req.body?.wallet ||
                    req.body?.address
                );

            const blockchain =
                normalizeBlockchain(
                    req.body?.blockchain
                );

            const token =
                String(
                    req.body?.token ||
                    "USDT"
                ).toUpperCase();

            if (!wallet) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        error:
                            "Wallet address is required."
                    });
            }

            if (
                !isValidBlockchainAddress(
                    wallet,
                    blockchain
                )
            ) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        error:
                            `Invalid ${getBlockchainName(
                                blockchain
                            )} wallet address.`
                    });
            }

            const network =
                getNetworkMetadata(
                    blockchain
                );

            const cacheKey =
                createHash(
                    JSON.stringify({
                        wallet:
                            normalizeWallet(
                                wallet
                            ),

                        blockchain,

                        token
                    })
                );

            const cached =
                getAnalysisCache(
                    cacheKey
                );

            if (cached) {

                return res.json({

                    ...cached,

                    cached:
                        true
                });
            }

            const indexed =
                await scalableBlockchainIndex(
                    wallet,
                    token,
                    blockchain,
                    {
                        forceRefresh: true,
                        maxPages: INDEXER_MAX_PAGES
                    }
                );

            const normalized =
                indexed.transactions
                    .map(
                        tx =>
                            normalizeTransaction(
                                tx,
                                wallet,
                                blockchain
                            )
                    );

            const transactions =
                sortTransactions(
                    normalized
                );

            const summary =
                summarizeTransactions(
                    transactions,
                    wallet
                );

            const statistics =
                calculateTransactionStatistics(
                    transactions
                );

            const addresses =
                collectTransactionAddresses(
                    transactions,
                    wallet
                );

            const complaints =
                findComplaintsForAddresses(
                    addresses
                );

            const vaspMatches =
                buildVaspAttribution(
                    transactions,
                    wallet
                );

            const primaryVaspMatch =
                vaspMatches.length > 0
                    ? vaspMatches[0]
                    : null;

            const vasp =
                primaryVaspMatch
                    ? {
                        name:
                            primaryVaspMatch.vasp ||
                            "Unknown VASP",

                        type:
                            primaryVaspMatch.category ||
                            "VASP",

                        confidence:
                            String(
                                primaryVaspMatch.status ||
                                ""
                            ).toUpperCase() === "VERIFIED"
                                ? "Verified database match"
                                : "Database match",

                        verified:
                            String(
                                primaryVaspMatch.status ||
                                ""
                            ).toUpperCase() === "VERIFIED",

                        note:
                            `Matched address ${primaryVaspMatch.address} from ${primaryVaspMatch.source}.`,

                        address:
                            primaryVaspMatch.address,

                        country:
                            primaryVaspMatch.country,

                        status:
                            primaryVaspMatch.status,

                        source:
                            primaryVaspMatch.source
                    }
                    : null;

            const risk =
                calculateRiskScore(
                    transactions,
                    complaints,
                    vaspMatches
                );

            const typologies =
                detectFraudTypology(
                    transactions,
                    complaints,
                    vaspMatches
                );

            const insights =
                generateInsights(
                    transactions,
                    risk,
                    complaints,
                    vaspMatches
                );

            const recommendations =
                generateRecommendations(
                    risk,
                    complaints,
                    vaspMatches,
                    transactions
                );

            const fundFlow =
                buildFundFlowGraph(
                    transactions,
                    wallet
                );

            const directFlow =
                getDirectFundFlow(
                    transactions,
                    wallet
                );

            const topCounterparties =
                getTopCounterparties(
                    transactions,
                    wallet,
                    10
                );

            const timeline =
                buildTransactionTimeline(
                    transactions
                );

            const responseData = {

                success:
                    true,

                wallet,

                wallet_short:
                    shortenAddress(
                        wallet
                    ),

                blockchain,

                blockchain_name:
                    network.name,

                standard:
                    network.standard,

                token,

                total_indexed_transactions:
                    indexed.transactions.length,

                vasp,

                contract:
                    network.contract,

                chain_id:
                    network.chainId,

                explorer:
                    getAddressExplorerUrl(
                        wallet,
                        blockchain
                    ),

                source:
                    indexed.source,

                cached:
                    false,

                processing_time_ms:
                    Date.now() -
                    startedAt,

                summary,

                statistics,

                risk,

                typologies,

                insights,

                recommendations,

                complaints,

                complaint_matches:
                    complaints,

                vaspMatches,

                vasp_attribution:
                    vaspMatches,

                fundFlow,

                fund_flow:
                    fundFlow,

                directFlow,

                direct_fund_flow:
                    directFlow,

                topCounterparties,

                top_counterparties:
                    topCounterparties,

                timeline,

                transactions
            };

            setAnalysisCache(
                cacheKey,
                responseData
            );

            return res.json(
                responseData
            );

        } catch (
            error
        ) {

            console.error(
                "ANALYZE ERROR:",
                error
            );

            return res
                .status(500)
                .json({

                    success:
                        false,

                    error:
                        error.message ||
                        "Wallet analysis failed.",

                    blockchain:
                        normalizeBlockchain(
                            req.body?.blockchain
                        )
                });
        }
    }
);


/* =========================================================
   DIRECT TRANSACTION API
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
                    req.body?.wallet ||
                    req.body?.address
                );

            const blockchain =
                normalizeBlockchain(
                    req.body?.blockchain
                );

            const token =
                String(
                    req.body?.token ||
                    "USDT"
                ).toUpperCase();

            if (!wallet) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        error:
                            "Wallet address is required."
                    });
            }

            if (
                !isValidBlockchainAddress(
                    wallet,
                    blockchain
                )
            ) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        error:
                            "Invalid wallet address."
                    });
            }

            const result =
                await scalableBlockchainIndex(
                    wallet,
                    token,
                    blockchain
                );

            const transactions =
                sortTransactions(
                    result.transactions
                        .map(
                            tx =>
                                normalizeTransaction(
                                    tx,
                                    wallet,
                                    blockchain
                                )
                        )
                );

            res.json({

                success:
                    true,

                wallet,

                blockchain,

                blockchain_name:
                    getBlockchainName(
                        blockchain
                    ),

                token,

                contract:
                    getUsdtContract(
                        blockchain
                    ),

                source:
                    result.source,

                count:
                    transactions.length,

                transactions
            });

        } catch (
            error
        ) {

            console.error(
                "TRANSACTIONS ERROR:",
                error
            );

            res
                .status(500)
                .json({

                    success:
                        false,

                    error:
                        error.message ||
                        "Unable to fetch transactions."
                });
        }
    }
);
/* =========================================================
   MULTI-HOP FUND TRACE
========================================================= */

async function traceWallet(
    wallet,
    blockchain = "tron",
    token = "USDT",
    visited = new Set()
) {

    const network =
        normalizeBlockchain(
            blockchain
        ); 
    // Preserve the previous default tracing expansion without a user-configurable option.
    const maxTraceLayers = 2;


    const walletKey =
        normalizeWallet(
            wallet
        );

    if (
        visited.has(walletKey)
    ) {

        return {

            wallet,

            blockchain:
                network,

            transactions: [],

            counterparties: [],

            nodes: [],

            edges: []
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
            wallet,
            token,
            network
        );

    const transactions =
        sortTransactions(
            indexed.transactions
                .map(
                    tx =>
                        normalizeTransaction(
                            tx,
                            wallet,
                            network
                        )
                )
        );

    const counterparties =
        getUniqueCounterparties(
            transactions
        );

    const graph =
        buildFundFlowGraph(
            transactions,
            wallet
        );

    const result = {

        wallet,

        wallet_short:
            shortenAddress(
                wallet
            ),

        blockchain:
            network,

        blockchain_name:
            getBlockchainName(
                network
            ),

        token,

        source:
            indexed.source,

        transactions,

        transaction_count:
            transactions.length,

        counterparties,

        graph,

        children: []
    };

    if (
        maxTraceLayers <=
        visited.size
    ) {

        return result;
    }

    /*
     * Limit branching so that a large wallet
     * cannot create an uncontrolled recursive
     * request tree.
     */

    const nextAddresses =
        counterparties.slice(
            0,
            10
        );

    for (
        const nextAddress of nextAddresses
    ) {

        const nextKey =
            normalizeWallet(
                nextAddress
            );

        if (
            nextVisited.has(
                nextKey
            )
        ) {
            continue;
        }

        try {

            const child =
                await traceWallet(
                    nextAddress,
                    network,
                    token,
                    nextVisited
                );

            result.children.push(
                child
            );

        } catch (
            error
        ) {

            result.children.push({

                wallet:
                    nextAddress,

                blockchain:
                    network,

                error:
                    error.message
            });
        }
    }

    return result;
}


/* =========================================================
   FLATTEN TRACE GRAPH
========================================================= */

function flattenTraceGraph(
    trace,
    nodes = new Map(),
    edges = [],
    visited = new Set()
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

    const walletKey =
        normalizeWallet(
            trace.wallet
        );

    if (
        visited.has(
            walletKey
        )
    ) {

        return {
            nodes,
            edges
        };
    }

    visited.add(
        walletKey
    );

    if (
        !nodes.has(
            walletKey
        )
    ) {

        nodes.set(
            walletKey,
            {
                id:
                    trace.wallet,

                label:
                    shortenAddress(
                        trace.wallet
                    ),

                address:
                    trace.wallet,

                role:
                    nodes.size === 0
                        ? "investigated_wallet"
                        : "traced_wallet"
            }
        );
    }

    for (
        const tx of
        trace.transactions ||
        []
    ) {

        if (
            !tx.from ||
            !tx.to
        ) {
            continue;
        }

        const fromKey =
            normalizeWallet(
                tx.from
            );

        const toKey =
            normalizeWallet(
                tx.to
            );

        if (
            !nodes.has(
                fromKey
            )
        ) {

            nodes.set(
                fromKey,
                {
                    id:
                        tx.from,

                    label:
                        shortenAddress(
                            tx.from
                        ),

                    address:
                        tx.from,

                    role:
                        "counterparty"
                }
            );
        }

        if (
            !nodes.has(
                toKey
            )
        ) {

            nodes.set(
                toKey,
                {
                    id:
                        tx.to,

                    label:
                        shortenAddress(
                            tx.to
                        ),

                    address:
                        tx.to,

                    role:
                        "counterparty"
                }
            );
        }

        edges.push({

            id:
                createHash(
                    [
                        tx.hash,
                        tx.from,
                        tx.to
                    ].join(":")
                ),

            source:
                tx.from,

            target:
                tx.to,

            amount:
                Number(
                    tx.amount ||
                    tx.value ||
                    0
                ),

            amountFormatted:
                formatAmount(
                    Number(
                        tx.amount ||
                        tx.value ||
                        0
                    )
                ),

            token:
                tx.token,

            blockchain:
                tx.blockchain,

            hash:
                tx.hash,

            timestamp:
                tx.timestamp,

            explorer_url:
                tx.explorer_url
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
            visited
        );
    }

    return {
        nodes,
        edges
    };
}


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
                    req.body?.wallet ||
                    req.body?.address
                );

            const blockchain =
                normalizeBlockchain(
                    req.body?.blockchain
                );

            const token =
                String(
                    req.body?.token ||
                    "USDT"
                ).toUpperCase();

            if (!wallet) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        error:
                            "Wallet address is required."
                    });
            }

            if (
                !isValidBlockchainAddress(
                    wallet,
                    blockchain
                )
            ) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        error:
                            `Invalid ${getBlockchainName(
                                blockchain
                            )} wallet address.`
                    });
            }

            const trace =
                await traceWallet(
                    wallet,
                    blockchain,
                    token
                );

            const flattened =
                flattenTraceGraph(
                    trace
                );

            return res.json({

                success:
                    true,

                wallet,

                blockchain,

                blockchain_name:
                    getBlockchainName(
                        blockchain
                    ),

                token,

                trace,

                graph: {

                    nodes:
                        Array.from(
                            flattened.nodes.values()
                        ),

                    edges:
                        flattened.edges
                }
            });

        } catch (
            error
        ) {

            console.error(
                "TRACE ERROR:",
                error
            );

            return res
                .status(500)
                .json({

                    success:
                        false,

                    error:
                        error.message ||
                        "Fund tracing failed."
                });
        }
    }
);


/* =========================================================
   REALTIME ALERT CREATOR
========================================================= */

function createRealtimeAlert(
    watcher,
    transaction
) {

    const alert = {

        id:
            createHash(
                [
                    watcher.wallet,
                    watcher.blockchain,
                    transaction.hash,
                    Date.now()
                ].join(":")
            ),

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

        transaction_hash:
            transaction.hash,

        direction:
            transaction.direction,

        amount:
            transaction.amount,

        from:
            transaction.from,

        to:
            transaction.to,

        timestamp:
            transaction.timestamp,

        date:
            transaction.date,

        explorer_url:
            transaction.explorer_url,

        created_at:
            new Date().toISOString(),

        severity:
            Number(
                transaction.amount ||
                transaction.value ||
                0
            ) >= 10000
                ? "HIGH"
                : "INFO"
    };

    realtimeAlerts.unshift(
        alert
    );

    /*
     * Keep only the latest 500 alerts.
     */

    if (
        realtimeAlerts.length >
        500
    ) {

        realtimeAlerts.splice(
            500
        );
    }

    return alert;
}


/* =========================================================
   REALTIME WATCH CHECK
========================================================= */

async function checkRealtimeWatcher(
    watcher
) {

    try {

        const indexed =
            await scalableBlockchainIndex(
                watcher.wallet,
                watcher.token,
                watcher.blockchain
            );

        const normalized =
            sortTransactions(
                indexed.transactions
                    .map(
                        tx =>
                            normalizeTransaction(
                                tx,
                                watcher.wallet,
                                watcher.blockchain
                            )
                    )
            );

        const now =
            Date.now();

        const trackingStart =
            new Date(
                watcher.trackingStartedAt
            ).getTime();

        const pastCutoff =
            now -
            24 * 60 * 60 * 1000;

        const past =
            normalized.filter(
                tx => {
                    const t = Number(
                        tx.timestampMs ||
                        tx.block_timestamp ||
                        tx.timestamp ||
                        0
                    );
                    return t >= pastCutoff && t < trackingStart;
                }
            );

        watcher.past24hTransactions =
            past.slice(
                0,
                2000
            );

        const newTransactions = [];

        for (const tx of normalized) {

            if (!tx.hash) continue;

            const txTime =
                Number(
                    tx.timestampMs ||
                    tx.block_timestamp ||
                    tx.timestamp ||
                    0
                );

            if (!watcher.seenHashes.has(tx.hash)) {

                watcher.seenHashes.add(tx.hash);

                if (
                    watcher.initialized &&
                    txTime >= trackingStart &&
                    txTime <= now
                ) {
                    newTransactions.push(tx);
                }
            }
        }

        if (!watcher.initialized) {
            watcher.initialized = true;
        }

        const existingFuture =
            Array.isArray(
                watcher.future24hTransactions
            )
                ? watcher.future24hTransactions
                : [];

        const futureMap =
            new Map();

        for (const tx of existingFuture) {
            if (tx?.hash) {
                futureMap.set(tx.hash, tx);
            }
        }

        for (const tx of newTransactions) {
            if (tx?.hash) {
                futureMap.set(tx.hash, tx);
            }
        }

        watcher.future24hTransactions =
            Array.from(
                futureMap.values()
            )
            .filter(
                tx => {
                    const t = Number(
                        tx.timestampMs ||
                        tx.block_timestamp ||
                        tx.timestamp ||
                        0
                    );
                    return t >= trackingStart &&
                        t <= trackingStart + 24 * 60 * 60 * 1000;
                }
            )
            .sort(
                (a,b) =>
                    Number(b.timestampMs || b.block_timestamp || b.timestamp || 0) -
                    Number(a.timestampMs || a.block_timestamp || a.timestamp || 0)
            )
            .slice(
                0,
                2000
            );

        const alerts = [];

        for (const tx of newTransactions) {
            alerts.push(
                createRealtimeAlert(
                    watcher,
                    tx
                )
            );
        }

        watcher.lastCheck =
            new Date().toISOString();

        watcher.lastTransactionCount =
            normalized.length;

        watcher.lastError =
            null;

        return {
            newTransactions,
            alerts
        };

    } catch (error) {

        watcher.lastError =
            error.message;

        watcher.lastCheck =
            new Date().toISOString();

        console.error(
            "REALTIME WATCH ERROR:",
            watcher.wallet,
            error.message
        );

        return {
            newTransactions: [],
            alerts: [],
            error: error.message
        };
    }
}



/* =========================================================
   EVIDENCE PRESERVATION
========================================================= */

app.post(
    "/api/evidence/preserve",
    (
        req,
        res
    ) => {

        try {

            const wallet =
                safeString(
                    req.body?.wallet
                );

            if (!wallet) {
                return res.status(400).json({
                    success: false,
                    error: "Wallet address is required."
                });
            }

            const evidencePayload = {
                wallet,
                blockchain:
                    safeString(req.body?.blockchain) || "tron",
                token:
                    safeString(req.body?.token) || "USDT",
                transactions:
                    Array.isArray(req.body?.transactions)
                        ? req.body.transactions
                        : [],
                risk:
                    req.body?.risk || null,
                riskText:
                    req.body?.riskText || "",
                alerts:
                    Array.isArray(req.body?.alerts)
                        ? req.body.alerts
                        : [],
                fraudTypologies:
                    Array.isArray(req.body?.fraudTypologies)
                        ? req.body.fraudTypologies
                        : [],
                recommendations:
                    Array.isArray(req.body?.recommendations)
                        ? req.body.recommendations
                        : [],
                complaintCrossReference:
                    req.body?.complaintCrossReference || null,
                vasp:
                    req.body?.vasp || null
            };

            const caseId =
                "CT-" +
                Date.now().toString(36).toUpperCase() +
                "-" +
                crypto.randomBytes(4).toString("hex").toUpperCase();

            const evidence = {
                caseId,
                wallet: evidencePayload.wallet,
                blockchain: evidencePayload.blockchain,
                token: evidencePayload.token,
                preservedAt: new Date().toISOString(),
                transactionCount:
                    evidencePayload.transactions.length,
                integrityHash:
                    createHash(
                        JSON.stringify(
                            evidencePayload
                        )
                    ),
                evidence:
                    evidencePayload
            };

            preservedEvidence.set(
                caseId,
                evidence
            );

            return res.json({
                success: true,
                evidence
            });

        } catch (error) {

            console.error(
                "EVIDENCE PRESERVATION ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error.message ||
                    "Evidence preservation failed."
            });
        }
    }
);


/* =========================================================
   REALTIME WATCH START
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
                    req.body?.wallet ||
                    req.body?.address
                );

            const blockchain =
                normalizeBlockchain(
                    req.body?.blockchain
                );

            const token =
                String(
                    req.body?.token ||
                    "USDT"
                ).toUpperCase();

            if (!wallet) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        error:
                            "Wallet address is required."
                    });
            }

            if (
                !isValidBlockchainAddress(
                    wallet,
                    blockchain
                )
            ) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        error:
                            `Invalid ${getBlockchainName(
                                blockchain
                            )} wallet address.`
                    });
            }

            const key =
                normalizeWallet(
                    wallet
                );

            /*
             * Existing watcher is updated instead
             * of creating a duplicate watcher.
             */

            let watcher =
                realtimeWatchers.get(
                    key
                );

            if (!watcher) {

                watcher = {

                    wallet,

                    blockchain,

                    token,

                    createdAt:
                        new Date().toISOString(),

                    trackingStartedAt:
                        new Date().toISOString(),

                    windowHours:
                        Math.min(
                            Math.max(
                                Number(req.body?.windowHours) || 24,
                                1
                            ),
                            24
                        ),

                    past24hTransactions:
                        [],

                    future24hTransactions:
                        [],

                    lastCheck:
                        null,

                    lastError:
                        null,

                    initialized:
                        false,

                    lastTransactionCount:
                        0,

                    seenHashes:
                        new Set(),

                    active:
                        true
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

                watcher.trackingStartedAt =
                    new Date().toISOString();

                watcher.windowHours =
                    Math.min(
                        Math.max(
                            Number(req.body?.windowHours) || 24,
                            1
                        ),
                        24
                    );

                watcher.past24hTransactions =
                    [];

                watcher.future24hTransactions =
                    [];

                watcher.seenHashes =
                    new Set();

                watcher.initialized =
                    false;

                watcher.lastError =
                    null;
            }

            await checkRealtimeWatcher(
                watcher
            );

            return res.json({

                success:
                    true,

                watching:
                    true,

                wallet,

                blockchain,

                blockchain_name:
                    getBlockchainName(
                        blockchain
                    ),

                token,

                watcherCount:
                    realtimeWatchers.size,

                trackingStartedAt:
                    watcher.trackingStartedAt,

                windowHours:
                    watcher.windowHours,

                message:
                    "Real-time wallet monitoring started."
            });

        } catch (
            error
        ) {

            console.error(
                "WATCH ERROR:",
                error
            );

            return res
                .status(500)
                .json({

                    success:
                        false,

                    error:
                        error.message ||
                        "Unable to start real-time monitoring."
                });
        }
    }
);


/* =========================================================
   REALTIME WATCH STOP
========================================================= */

app.post(
    "/api/realtime/unwatch",
    (
        req,
        res
    ) => {

        try {

            const wallet =
                safeString(
                    req.body?.wallet ||
                    req.body?.address
                );

            if (!wallet) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        error:
                            "Wallet address is required."
                    });
            }

            const key =
                normalizeWallet(
                    wallet
                );

            const removed =
                realtimeWatchers.delete(
                    key
                );

            return res.json({

                success:
                    true,

                watching:
                    false,

                wallet,

                removed,

                watcherCount:
                    realtimeWatchers.size,

                message:
                    removed
                        ? "Real-time wallet monitoring stopped."
                        : "Wallet was not being monitored."
            });

        } catch (
            error
        ) {

            return res
                .status(500)
                .json({

                    success:
                        false,

                    error:
                        error.message
                });
        }
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

                trackingStartedAt:
                    watcher.trackingStartedAt,

                windowHours:
                    watcher.windowHours,

                past24hCount:
                    watcher.past24hTransactions?.length || 0,

                future24hCount:
                    watcher.future24hTransactions?.length || 0,

                watcherCount:
                    realtimeWatchers.size
            });
        }

        /*
         * Do not expose the full wallet watchlist.
         * Only return aggregate monitoring status.
         */

        return res.json({

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
   REALTIME 24-HOUR DATA
========================================================= */

app.get(
    "/api/realtime/24h",
    (
        req,
        res
    ) => {

        const wallet =
            safeString(
                req.query?.wallet
            );

        if (!wallet) {
            return res.status(400).json({
                success: false,
                error: "Wallet address is required."
            });
        }

        const watcher =
            realtimeWatchers.get(
                normalizeWallet(wallet)
            );

        if (!watcher) {
            return res.json({
                success: true,
                watching: false,
                wallet,
                past24hTransactions: [],
                future24hTransactions: [],
                past24hCount: 0,
                future24hCount: 0,
                trackingStartedAt: null,
                windowHours: 24
            });
        }

        const start =
            new Date(
                watcher.trackingStartedAt
            ).getTime();

        const now =
            Date.now();

        const expired =
            now >=
            start + 24 * 60 * 60 * 1000;

        if (expired) {
            watcher.active = false;
        }

        return res.json({
            success: true,
            watching: watcher.active,
            wallet: watcher.wallet,
            blockchain: watcher.blockchain,
            blockchain_name:
                getBlockchainName(
                    watcher.blockchain
                ),
            token: watcher.token,
            trackingStartedAt:
                watcher.trackingStartedAt,
            windowHours: 24,
            timeRemainingMs:
                Math.max(
                    0,
                    start + 24 * 60 * 60 * 1000 - now
                ),
            past24hTransactions:
                watcher.past24hTransactions || [],
            future24hTransactions:
                watcher.future24hTransactions || [],
            past24hCount:
                watcher.past24hTransactions?.length || 0,
            future24hCount:
                watcher.future24hTransactions?.length || 0,
            lastCheck:
                watcher.lastCheck,
            lastError:
                watcher.lastError
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

        return res.json({

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

                "POST /api/tron/account",

                "POST /api/analyze",

                "POST /api/transactions",

                "POST /api/trace",

                "POST /api/evidence/preserve",

                "POST /api/realtime/watch",

                "GET /api/realtime/24h",

                "POST /api/realtime/unwatch",

                "GET /api/realtime/status",

                "GET /api/realtime/alerts"
            ]
        });
    }
);


/* =========================================================
   TRON ACCOUNT INFORMATION
========================================================= */

app.post(
    "/api/tron/account",
    async (req, res) => {
        try {
            const address = safeString(
                req.body?.address || req.body?.wallet
            );

            if (!address) {
                return res.status(400).json({
                    success: false,
                    error: "TRON wallet address is required."
                });
            }

            if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid TRON wallet address."
                });
            }

            const url = new URL(`${TRON_API}/wallet/getaccount`);

            const response = await fetch(url, {
                method: "POST",
                headers: TRON_HEADERS,
                body: JSON.stringify({
                    address,
                    visible: true
                })
            });

            const text = await response.text();
            let data = {};
            try {
                data = text ? JSON.parse(text) : {};
            } catch {
                data = { raw: text };
            }

            if (!response.ok) {
                console.error("TRON ACCOUNT API ERROR:", response.status, data);

                if (response.status === 401) {
                    throw new Error("TRON API 401 Unauthorized. Check TRON_API_KEY.");
                }
                if (response.status === 403) {
                    throw new Error("TRON API 403 Forbidden. Check API key permissions.");
                }
                if (response.status === 429) {
                    throw new Error("TRON API rate limit reached. Please try again later.");
                }
                throw new Error(`TRON API error: ${response.status}`);
            }

            const balanceSun = Number(data.balance || 0);
            const frozen = Array.isArray(data.frozen)
                ? data.frozen.map(item => ({
                    frozen_balance_sun: Number(item.frozen_balance || 0),
                    frozen_balance_trx: Number(item.frozen_balance || 0) / 1e6,
                    expire_time: item.expire_time || null
                }))
                : [];

            const accountResource = data.account_resource || {};
            const votes = Array.isArray(data.votes) ? data.votes : [];

            return res.json({
                success: true,
                address,
                account: {
                    balance_sun: balanceSun,
                    balance_trx: balanceSun / 1e6,
                    frozen,
                    frozen_total_trx: frozen.reduce(
                        (sum, item) => sum + item.frozen_balance_trx,
                        0
                    ),
                    votes,
                    vote_count: votes.length,
                    create_time: data.create_time || null,
                    latest_operation_time: data.latest_opration_time || null,
                    latest_consume_free_time: data.latest_consume_free_time || null,
                    latest_consume_time: data.latest_consume_time || null,
                    account_resource: accountResource,
                    owner_permission: data.owner_permission || null,
                    active_permission: data.active_permission || [],
                    asset: data.asset || [],
                    asset_v2: data.assetV2 || data.asset_v2 || []
                },
                raw: data
            });
        } catch (error) {
            console.error("TRON ACCOUNT ERROR:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to query TRON account."
            });
        }
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
        )
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
const SOLANA_RPC_URL = (
    process.env.SOLANA_RPC_URL ||
    "https://api.mainnet-beta.solana.com"
).replace(/\/+$/, "");

const SOLANA_USDT_MINT = (
    process.env.USDT_SOLANA_MINT ||
    ""
).trim();
