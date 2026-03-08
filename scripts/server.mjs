// x402 AI API Server - Pay-per-call endpoints with USDC verification
import express from "express";
import cors from "cors";
import { publicClient, CONTRACT, PAYABLE_API_ABI, API_ENDPOINTS, ARC_RPC } from "./config.mjs";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3402;

// --- Simple AI Processing (no external API needed) ---

function summarize(text) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const keyPoints = sentences.slice(0, Math.min(3, sentences.length));
  return {
    summary: keyPoints.map(s => s.trim()).join(" "),
    originalLength: text.length,
    sentenceCount: sentences.length,
    keyPointCount: keyPoints.length,
  };
}

function sentiment(text) {
  const positiveWords = ["good", "great", "excellent", "amazing", "wonderful", "love", "happy", "best", "fantastic", "beautiful", "perfect", "awesome"];
  const negativeWords = ["bad", "terrible", "awful", "horrible", "hate", "worst", "ugly", "poor", "sad", "angry", "fail", "broken"];
  const words = text.toLowerCase().split(/\s+/);
  let posCount = 0, negCount = 0;
  for (const w of words) {
    if (positiveWords.some(p => w.includes(p))) posCount++;
    if (negativeWords.some(n => w.includes(n))) negCount++;
  }
  const total = posCount + negCount || 1;
  const score = (posCount - negCount) / total;
  let label = "neutral";
  if (score > 0.2) label = "positive";
  else if (score < -0.2) label = "negative";
  return { sentiment: label, score: Math.round(score * 100) / 100, positive: posCount, negative: negCount, wordCount: words.length };
}

function translate(text, targetLang = "es") {
  // Simple word-level translation demo (English → target)
  const dictionaries = {
    es: { hello: "hola", world: "mundo", the: "el", is: "es", good: "bueno", bad: "malo", yes: "sí", no: "no", thank: "gracias", please: "por favor", money: "dinero", pay: "pagar", api: "api", blockchain: "cadena de bloques" },
    zh: { hello: "你好", world: "世界", the: "这个", is: "是", good: "好", bad: "坏", yes: "是", no: "不", thank: "谢谢", please: "请", money: "钱", pay: "支付", api: "接口", blockchain: "区块链" },
    ja: { hello: "こんにちは", world: "世界", the: "その", is: "です", good: "良い", bad: "悪い", yes: "はい", no: "いいえ", thank: "ありがとう", please: "お願い", money: "お金", pay: "支払う", api: "API", blockchain: "ブロックチェーン" },
  };
  const dict = dictionaries[targetLang] || dictionaries.es;
  const words = text.split(/\s+/);
  const translated = words.map(w => {
    const clean = w.toLowerCase().replace(/[^a-z]/g, "");
    return dict[clean] || w;
  });
  return { original: text, translated: translated.join(" "), targetLanguage: targetLang, wordsTranslated: words.length };
}

function keywords(text) {
  const stopWords = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "can", "shall", "to", "of", "in", "for", "on", "with", "at", "by", "from", "it", "this", "that", "and", "or", "but", "not", "as", "if", "its", "i", "you", "he", "she", "we", "they"]);
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/);
  const freq = {};
  for (const w of words) {
    if (w.length > 2 && !stopWords.has(w)) {
      freq[w] = (freq[w] || 0) + 1;
    }
  }
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return { keywords: sorted.map(([word, count]) => ({ word, count })), totalWords: words.length, uniqueKeywords: sorted.length };
}

const processors = { summarize, sentiment, translate, keywords };

// --- x402 Middleware ---

async function verifyPayment(txHash, expectedEndpoint) {
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") return { valid: false, reason: "Transaction failed" };
    if (receipt.to?.toLowerCase() !== CONTRACT.toLowerCase()) return { valid: false, reason: "Wrong contract" };
    return { valid: true, payer: receipt.from };
  } catch (e) {
    return { valid: false, reason: "Cannot verify tx: " + e.message };
  }
}

function x402Middleware(endpointId) {
  return async (req, res, next) => {
    const ep = API_ENDPOINTS[endpointId];
    const paymentTx = req.headers["x-payment-tx"] || req.query.paymentTx;

    if (!paymentTx) {
      // Return 402 Payment Required
      return res.status(402).json({
        error: "Payment Required",
        protocol: "x402",
        payment: {
          network: "ARC-TESTNET",
          chainId: 5042002,
          rpcUrl: ARC_RPC,
          token: "USDC",
          tokenAddress: "0x3600000000000000000000000000000000000000",
          payTo: CONTRACT,
          amount: ep.price,
          amountFormatted: (ep.price / 1e6).toFixed(6) + " USDC",
          method: `payForAPI(${endpointId})`,
          description: ep.description,
          endpoint: ep.name,
          endpointId: endpointId,
        },
        instructions: {
          step1: `Approve ${(ep.price / 1e6).toFixed(6)} USDC to contract ${CONTRACT}`,
          step2: `Call payForAPI(${endpointId}) on contract ${CONTRACT}`,
          step3: "Retry this request with header: X-Payment-Tx: <txHash>",
        },
      });
    }

    // Verify payment
    const verification = await verifyPayment(paymentTx);
    if (!verification.valid) {
      return res.status(402).json({
        error: "Payment verification failed",
        reason: verification.reason,
      });
    }

    req.payer = verification.payer;
    req.paymentTx = paymentTx;
    next();
  };
}

// --- Routes ---

// Info endpoint (free)
app.get("/", (req, res) => {
  res.json({
    name: "x402 AI Agent API",
    version: "1.0.0",
    protocol: "x402 (HTTP 402 Payment Required)",
    network: "Arc Testnet",
    contract: CONTRACT,
    endpoints: API_ENDPOINTS.map(ep => ({
      ...ep,
      url: `/api/${ep.name}`,
      priceFormatted: (ep.price / 1e6).toFixed(6) + " USDC",
    })),
  });
});

// Usage stats (free)
app.get("/api/stats", async (req, res) => {
  try {
    const [totalPay, totalEp, revenue] = await Promise.all([
      publicClient.readContract({ address: CONTRACT, abi: PAYABLE_API_ABI, functionName: "totalPayments" }),
      publicClient.readContract({ address: CONTRACT, abi: PAYABLE_API_ABI, functionName: "totalEndpoints" }),
      publicClient.readContract({ address: CONTRACT, abi: PAYABLE_API_ABI, functionName: "totalRevenue" }),
    ]);

    // Get recent payments
    const total = Number(totalPay);
    const recentPayments = [];
    const start = Math.max(0, total - 10);
    for (let i = total - 1; i >= start; i--) {
      const p = await publicClient.readContract({ address: CONTRACT, abi: PAYABLE_API_ABI, functionName: "getPayment", args: [BigInt(i)] });
      recentPayments.push({
        id: i,
        payer: p[0],
        amount: Number(p[1]),
        amountFormatted: (Number(p[1]) / 1e6).toFixed(6) + " USDC",
        endpoint: p[2],
        timestamp: Number(p[3]),
        time: new Date(Number(p[3]) * 1000).toISOString(),
      });
    }

    res.json({
      totalPayments: total,
      totalEndpoints: Number(totalEp),
      totalRevenue: (Number(revenue) / 1e6).toFixed(6) + " USDC",
      recentPayments,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// User stats (free)
app.get("/api/user/:address", async (req, res) => {
  try {
    const addr = req.params.address;
    const [count, spent] = await Promise.all([
      publicClient.readContract({ address: CONTRACT, abi: PAYABLE_API_ABI, functionName: "userPaymentCount", args: [addr] }),
      publicClient.readContract({ address: CONTRACT, abi: PAYABLE_API_ABI, functionName: "userTotalSpent", args: [addr] }),
    ]);
    res.json({
      address: addr,
      totalCalls: Number(count),
      totalSpent: (Number(spent) / 1e6).toFixed(6) + " USDC",
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Paid AI endpoints
app.post("/api/summarize", x402Middleware(0), (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "Missing 'text' field" });
  const result = summarize(text);
  res.json({ endpoint: "summarize", payer: req.payer, paymentTx: req.paymentTx, result });
});

app.post("/api/sentiment", x402Middleware(1), (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "Missing 'text' field" });
  const result = sentiment(text);
  res.json({ endpoint: "sentiment", payer: req.payer, paymentTx: req.paymentTx, result });
});

app.post("/api/translate", x402Middleware(2), (req, res) => {
  const { text, targetLang } = req.body;
  if (!text) return res.status(400).json({ error: "Missing 'text' field" });
  const result = translate(text, targetLang || "es");
  res.json({ endpoint: "translate", payer: req.payer, paymentTx: req.paymentTx, result });
});

app.post("/api/keywords", x402Middleware(3), (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "Missing 'text' field" });
  const result = keywords(text);
  res.json({ endpoint: "keywords", payer: req.payer, paymentTx: req.paymentTx, result });
});

// Endpoint catalog (free)
app.get("/api/endpoints", async (req, res) => {
  try {
    const total = await publicClient.readContract({ address: CONTRACT, abi: PAYABLE_API_ABI, functionName: "totalEndpoints" });
    const eps = [];
    for (let i = 0; i < Number(total); i++) {
      const ep = await publicClient.readContract({ address: CONTRACT, abi: PAYABLE_API_ABI, functionName: "getEndpoint", args: [BigInt(i)] });
      eps.push({ id: i, name: ep[0], price: Number(ep[1]), priceFormatted: (Number(ep[1]) / 1e6).toFixed(6) + " USDC", active: ep[2] });
    }
    res.json({ endpoints: eps });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\nx402 AI API Server running on http://localhost:${PORT}`);
  console.log(`Contract: ${CONTRACT}`);
  console.log(`\nEndpoints:`);
  for (const ep of API_ENDPOINTS) {
    console.log(`  POST /api/${ep.name.padEnd(12)} ${(ep.price / 1e6).toFixed(3)} USDC  - ${ep.description}`);
  }
  console.log(`\nFree routes:`);
  console.log(`  GET  /             API info`);
  console.log(`  GET  /api/stats    Usage stats`);
  console.log(`  GET  /api/user/:a  User stats`);
  console.log(`  GET  /api/endpoints On-chain catalog`);
});
