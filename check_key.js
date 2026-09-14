require("dotenv").config();

const key = process.env.TRON_API_KEY || "";

console.log("==========================================");
console.log("ChainTrace TRON API Key Check");
console.log("==========================================");

console.log("Length:", key.length);

if (!key) {
    console.log("Status: MISSING");
    console.log("Add TRON_API_KEY to backend/.env");
    process.exit(1);
}

console.log("Status: LOADED");

console.log(
    "First 4 chars:",
    key.slice(0, 4)
);

console.log(
    "Last 4 chars:",
    key.slice(-4)
);

console.log(
    "Has double quote:",
    key.includes('"')
);

console.log(
    "Has single quote:",
    key.includes("'")
);

console.log(
    "Has leading/trailing space:",
    key !== key.trim()
);

console.log(
    "Raw length check:",
    JSON.stringify(key)
);

console.log("==========================================");