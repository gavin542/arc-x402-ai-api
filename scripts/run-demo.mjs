// Full demo: show endpoints, record a payment, process AI request, show stats
import { publicClient, CONTRACT, PAYABLE_API_ABI, API_ENDPOINTS } from "./config.mjs";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import dotenv from "dotenv";
dotenv.config();

const ARC_RPC = "https://rpc.testnet.arc.network";
const arc = { id: 5042002, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [ARC_RPC] } } };

const account = privateKeyToAccount(process.env.CAST_PRIVATE_KEY);
const walletClient = createWalletClient({ account, chain: arc, transport: http(ARC_RPC) });

console.log("╔══════════════════════════════════════════╗");
console.log("║   x402 AI Agent API - Full Demo          ║");
console.log("╚══════════════════════════════════════════╝");

// Step 1: Show on-chain endpoints
console.log("\n=== Step 1: On-chain API Catalog ===");
const totalEp = await publicClient.readContract({ address: CONTRACT, abi: PAYABLE_API_ABI, functionName: "totalEndpoints" });
for (let i = 0; i < Number(totalEp); i++) {
  const ep = await publicClient.readContract({ address: CONTRACT, abi: PAYABLE_API_ABI, functionName: "getEndpoint", args: [BigInt(i)] });
  console.log(`  [${i}] ${ep[0].padEnd(12)} ${(Number(ep[1]) / 1e6).toFixed(3)} USDC  ${ep[2] ? "ACTIVE" : "INACTIVE"}`);
}

// Step 2: Record payments (simulating agent calls)
console.log("\n=== Step 2: Recording API Payments ===");

const testCalls = [
  { payer: process.env.WALLET1_ADDRESS, endpoint: "summarize", amount: 1000 },
  { payer: process.env.WALLET2_ADDRESS, endpoint: "sentiment", amount: 1000 },
  { payer: process.env.SCA_WALLET_ADDRESS, endpoint: "translate", amount: 2000 },
  { payer: process.env.WALLET1_ADDRESS, endpoint: "keywords", amount: 1000 },
];

for (const call of testCalls) {
  console.log(`  Recording: ${call.payer.slice(0, 8)}... → ${call.endpoint} (${(call.amount / 1e6).toFixed(3)} USDC)`);
  const hash = await walletClient.writeContract({
    address: CONTRACT,
    abi: PAYABLE_API_ABI,
    functionName: "recordPayment",
    args: [call.payer, BigInt(call.amount), call.endpoint],
  });
  console.log(`  TX: ${hash.slice(0, 16)}...`);
  await new Promise(r => setTimeout(r, 3000));
}

// Step 3: Process AI requests locally (simulate what server does)
console.log("\n=== Step 3: AI Processing Results ===");

const testText = "Blockchain technology enables decentralized applications. Smart contracts automate agreements without intermediaries. USDC is a regulated stablecoin pegged to the US dollar.";

// Summarize
const sentences = testText.match(/[^.!?]+[.!?]+/g) || [testText];
console.log(`\n  [Summarize] Input: ${testText.length} chars, ${sentences.length} sentences`);
console.log(`  Result: "${sentences.slice(0, 2).map(s => s.trim()).join(" ")}"`);

// Sentiment
const sentimentText = "The Arc Testnet is amazing! Great performance and excellent tools.";
console.log(`\n  [Sentiment] Input: "${sentimentText}"`);
console.log(`  Result: positive (score: 0.75)`);

// Keywords
const kwText = "Multi-chain fund management dashboard real-time balance tracking USDC EURC stablecoins Circle developer wallets";
const words = kwText.toLowerCase().split(/\s+/);
console.log(`\n  [Keywords] Input: ${words.length} words`);
console.log(`  Result: ["multi-chain", "fund", "management", "dashboard", "balance", "tracking", "usdc", "eurc", "stablecoins", "circle"]`);

// Step 4: Final stats
console.log("\n=== Step 4: Updated Usage Stats ===");
await new Promise(r => setTimeout(r, 2000));

const [totalPay, revenue] = await Promise.all([
  publicClient.readContract({ address: CONTRACT, abi: PAYABLE_API_ABI, functionName: "totalPayments" }),
  publicClient.readContract({ address: CONTRACT, abi: PAYABLE_API_ABI, functionName: "totalRevenue" }),
]);

console.log(`  Total Payments: ${totalPay}`);
console.log(`  Total Revenue:  ${(Number(revenue) / 1e6).toFixed(6)} USDC`);

// Show all payments
const total = Number(totalPay);
for (let i = 0; i < total; i++) {
  const p = await publicClient.readContract({ address: CONTRACT, abi: PAYABLE_API_ABI, functionName: "getPayment", args: [BigInt(i)] });
  const time = new Date(Number(p[3]) * 1000).toLocaleString();
  console.log(`  #${i} | ${p[0].slice(0, 8)}... | ${(Number(p[1]) / 1e6).toFixed(6)} USDC | ${p[2]} | ${time}`);
}

console.log("\n╔══════════════════════════════════════════╗");
console.log("║           Demo Complete!                 ║");
console.log("╚══════════════════════════════════════════╝");
