// AI Agent Client - Pays USDC and calls x402 API endpoints
import { circleClient, CONTRACT, USDC_ARC, API_ENDPOINTS } from "./config.mjs";
import dotenv from "dotenv";
dotenv.config();

const SERVER_URL = process.env.API_SERVER || "http://localhost:3402";

async function callPaidAPI(endpoint, body, walletId) {
  const ep = API_ENDPOINTS.find(e => e.name === endpoint);
  if (!ep) throw new Error(`Unknown endpoint: ${endpoint}`);

  console.log(`\n--- Calling /api/${endpoint} ---`);

  // Step 1: Try calling without payment → get 402
  console.log("  Step 1: Request without payment...");
  const res1 = await fetch(`${SERVER_URL}/api/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res1.status === 402) {
    const paymentInfo = await res1.json();
    console.log(`  Got 402: ${paymentInfo.payment.amountFormatted} required`);
    console.log(`  Contract: ${paymentInfo.payment.payTo}`);

    // Step 2: Pay via Circle SDK (direct USDC transfer as payment)
    console.log(`  Step 2: Paying ${(ep.price / 1e6).toFixed(6)} USDC via Circle SDK...`);
    const tx = await circleClient.createTransaction({
      amount: [(ep.price / 1e6).toString()],
      destinationAddress: CONTRACT,
      tokenAddress: USDC_ARC,
      blockchain: "ARC-TESTNET",
      walletId: walletId,
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });
    const txId = tx.data?.id;
    const txState = tx.data?.state;
    console.log(`  TX State: ${txState}, ID: ${txId}`);

    // Wait for confirmation
    console.log("  Step 3: Waiting for confirmation (6s)...");
    await new Promise(r => setTimeout(r, 6000));

    // Get tx hash
    let txHash = tx.data?.txHash;
    if (!txHash) {
      // Poll for tx hash
      const status = await circleClient.getTransaction({ id: txId });
      txHash = status.data?.txHash;
    }

    if (!txHash) {
      console.log("  Warning: No txHash yet, using txId as proof");
      txHash = txId;
    }
    console.log(`  Payment TX: ${txHash}`);

    // Step 3: Retry with payment proof
    console.log("  Step 4: Retrying with payment proof...");
    const res2 = await fetch(`${SERVER_URL}/api/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Payment-Tx": txHash,
      },
      body: JSON.stringify(body),
    });

    if (res2.ok) {
      const data = await res2.json();
      console.log("  SUCCESS! Response:");
      console.log(JSON.stringify(data.result, null, 2));
      return data;
    } else {
      const err = await res2.json();
      console.error("  Failed:", err);
      return null;
    }
  } else if (res1.ok) {
    const data = await res1.json();
    console.log("  (Free endpoint) Response:");
    console.log(JSON.stringify(data, null, 2));
    return data;
  } else {
    console.error("  Error:", res1.status, await res1.text());
    return null;
  }
}

// --- Demo: Agent makes paid API calls ---
async function runAgent() {
  const walletId = process.env.WALLET1_ARC_ID;
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  x402 AI Agent - Paid API Client Demo   ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`\nAgent Wallet ID: ${walletId}`);
  console.log(`API Server: ${SERVER_URL}`);

  // Call 1: Summarize
  await callPaidAPI("summarize", {
    text: "Blockchain technology enables decentralized applications. Smart contracts automate agreements without intermediaries. USDC is a regulated stablecoin pegged to the US dollar. Circle provides APIs for building with digital currencies. The x402 protocol enables pay-per-call APIs using cryptocurrency."
  }, walletId);

  // Call 2: Sentiment
  await callPaidAPI("sentiment", {
    text: "The Arc Testnet is amazing! Great performance and excellent developer tools. I love building on this blockchain."
  }, walletId);

  // Call 3: Translate
  await callPaidAPI("translate", {
    text: "Hello world, blockchain is good for money and pay",
    targetLang: "zh"
  }, walletId);

  // Call 4: Keywords
  await callPaidAPI("keywords", {
    text: "Multi-chain fund management dashboard provides real-time balance tracking across Arc Testnet and Ethereum Sepolia. USDC and EURC stablecoins are supported with Circle developer-controlled wallets and Gateway unified balances."
  }, walletId);

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║         Agent Demo Complete!             ║");
  console.log("╚══════════════════════════════════════════╝");
}

runAgent().catch(console.error);
