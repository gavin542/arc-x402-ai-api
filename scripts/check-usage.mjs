// Check on-chain API usage stats
import { publicClient, CONTRACT, PAYABLE_API_ABI } from "./config.mjs";

console.log("=== x402 API Usage Stats ===");
console.log(`Contract: ${CONTRACT}\n`);

const [totalPay, totalEp, revenue] = await Promise.all([
  publicClient.readContract({ address: CONTRACT, abi: PAYABLE_API_ABI, functionName: "totalPayments" }),
  publicClient.readContract({ address: CONTRACT, abi: PAYABLE_API_ABI, functionName: "totalEndpoints" }),
  publicClient.readContract({ address: CONTRACT, abi: PAYABLE_API_ABI, functionName: "totalRevenue" }),
]);

console.log(`Total Endpoints: ${totalEp}`);
console.log(`Total Payments:  ${totalPay}`);
console.log(`Total Revenue:   ${(Number(revenue) / 1e6).toFixed(6)} USDC\n`);

// Show endpoints
console.log("--- Endpoints ---");
for (let i = 0; i < Number(totalEp); i++) {
  const ep = await publicClient.readContract({ address: CONTRACT, abi: PAYABLE_API_ABI, functionName: "getEndpoint", args: [BigInt(i)] });
  const status = ep[2] ? "ACTIVE" : "INACTIVE";
  console.log(`  [${i}] ${ep[0].padEnd(12)} ${(Number(ep[1]) / 1e6).toFixed(3)} USDC  ${status}`);
}

// Show recent payments
const total = Number(totalPay);
if (total > 0) {
  console.log("\n--- Recent Payments ---");
  const start = Math.max(0, total - 10);
  for (let i = total - 1; i >= start; i--) {
    const p = await publicClient.readContract({ address: CONTRACT, abi: PAYABLE_API_ABI, functionName: "getPayment", args: [BigInt(i)] });
    const time = new Date(Number(p[3]) * 1000).toLocaleString();
    console.log(`  #${i} | ${p[0].slice(0, 8)}... | ${(Number(p[1]) / 1e6).toFixed(6)} USDC | ${p[2]} | ${time}`);
  }
}

// Check specific user stats
const addresses = [process.env.WALLET1_ADDRESS, process.env.WALLET2_ADDRESS, process.env.SCA_WALLET_ADDRESS].filter(Boolean);
if (addresses.length > 0) {
  console.log("\n--- User Stats ---");
  for (const addr of addresses) {
    const [count, spent] = await Promise.all([
      publicClient.readContract({ address: CONTRACT, abi: PAYABLE_API_ABI, functionName: "userPaymentCount", args: [addr] }),
      publicClient.readContract({ address: CONTRACT, abi: PAYABLE_API_ABI, functionName: "userTotalSpent", args: [addr] }),
    ]);
    if (Number(count) > 0) {
      console.log(`  ${addr.slice(0, 8)}... | ${count} calls | ${(Number(spent) / 1e6).toFixed(6)} USDC`);
    }
  }
}
