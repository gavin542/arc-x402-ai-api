// x402 AI Agent API - Web Frontend
// On-chain queries + MetaMask payment + client-side AI processing

const ARC_RPC = "https://rpc.testnet.arc.network";
const ARC_CHAIN_ID = "0x4cef52";
const USDC_ARC = "0x3600000000000000000000000000000000000000";
const CONTRACT = "0xFa67C96f60e2A31f6600239B513efc5c88D0334A";

// Selectors (verified with cast sig)
const SEL = {
  totalPayments:    "0x005b4487",
  totalEndpoints:   "0x8c6178b7",
  totalRevenue:     "0xbf2d9e0b",
  getPayment:       "0x3280a836",
  getEndpoint:      "0x937bbc4a",
  userPaymentCount: "0x199d3719",
  userTotalSpent:   "0xf8289b85",
  approve:          "0x095ea7b3",
  transfer:         "0xa9059cbb",
  payForAPI:        "0x21e85a1c",
};

const EP_INFO = [
  { id: 0, name: "summarize", price: 1000, desc: "Summarize text into key points" },
  { id: 1, name: "sentiment", price: 1000, desc: "Analyze text sentiment" },
  { id: 2, name: "translate", price: 2000, desc: "Translate text to target language" },
  { id: 3, name: "keywords",  price: 1000, desc: "Extract keywords from text" },
];

let connectedAddress = null;

// --- Helpers ---

function pad256(val) { return val.replace("0x", "").padStart(64, "0"); }
function padAddr(a) { return a.toLowerCase().replace("0x", "").padStart(64, "0"); }
function shortAddr(a) { return a.slice(0, 6) + "..." + a.slice(-4); }

function hexToNum(h) {
  if (!h || h === "0x") return 0;
  return parseInt(h, 16);
}

function decodeString(hex) {
  // ABI-encoded string: offset(32) + length(32) + data
  const clean = hex.replace("0x", "");
  // Find string data - offset tells where string starts
  const offset = parseInt(clean.slice(0, 64), 16) * 2;
  const len = parseInt(clean.slice(offset, offset + 64), 16);
  const data = clean.slice(offset + 64, offset + 64 + len * 2);
  let str = "";
  for (let i = 0; i < data.length; i += 2) {
    str += String.fromCharCode(parseInt(data.slice(i, i + 2), 16));
  }
  return str;
}

async function rpcCall(method, params) {
  const res = await fetch(ARC_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

async function ethCall(to, data) {
  return rpcCall("eth_call", [{ to, data }, "latest"]);
}

// --- On-chain Reads ---

async function loadEndpoints() {
  const el = document.getElementById("endpointsList");
  el.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const totalHex = await ethCall(CONTRACT, SEL.totalEndpoints);
    const total = hexToNum(totalHex);
    document.getElementById("totalEndpoints").textContent = total;

    let html = "";
    for (let i = 0; i < total; i++) {
      const data = SEL.getEndpoint + pad256("0x" + i.toString(16));
      const result = await ethCall(CONTRACT, data);
      const clean = result.replace("0x", "");
      // Return: (string name, uint256 price, bool active)
      // Slots: offset(64) + price(64) + active(64) + string_len(64) + string_data
      const price = parseInt(clean.slice(64, 128), 16);
      const active = parseInt(clean.slice(128, 192), 16) === 1;
      const strOffset = parseInt(clean.slice(0, 64), 16) * 2;
      const strLen = parseInt(clean.slice(strOffset, strOffset + 64), 16);
      const strData = clean.slice(strOffset + 64, strOffset + 64 + strLen * 2);
      let name = "";
      for (let j = 0; j < strData.length; j += 2) {
        name += String.fromCharCode(parseInt(strData.slice(j, j + 2), 16));
      }

      const info = EP_INFO[i] || { desc: "API endpoint" };
      html += `<div class="endpoint-card">
        <div class="ep-name">/api/${name}</div>
        <div class="ep-price">${(price / 1e6).toFixed(6)} USDC</div>
        <div class="ep-desc">${info.desc}</div>
        <div class="ep-status ${active ? 'ep-active' : 'ep-inactive'}">${active ? 'ACTIVE' : 'INACTIVE'}</div>
      </div>`;
    }
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = `<p class="muted">Error: ${e.message}</p>`;
  }
}

async function loadStats() {
  try {
    const [payHex, revHex] = await Promise.all([
      ethCall(CONTRACT, SEL.totalPayments),
      ethCall(CONTRACT, SEL.totalRevenue),
    ]);
    document.getElementById("totalPayments").textContent = hexToNum(payHex);
    document.getElementById("totalRevenue").textContent = (hexToNum(revHex) / 1e6).toFixed(6);
  } catch (e) {
    console.error("Stats error:", e);
  }
}

async function loadPayments() {
  const tbody = document.getElementById("paymentsBody");
  tbody.innerHTML = '<tr><td colspan="5" class="loading">Loading...</td></tr>';
  try {
    const totalHex = await ethCall(CONTRACT, SEL.totalPayments);
    const total = hexToNum(totalHex);

    if (total === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="loading">No payments yet</td></tr>';
      return;
    }

    let rows = "";
    const start = Math.max(0, total - 15);
    for (let i = total - 1; i >= start; i--) {
      const data = SEL.getPayment + pad256("0x" + i.toString(16));
      const result = await ethCall(CONTRACT, data);
      const clean = result.replace("0x", "");
      // Return: (address payer, uint256 amount, string endpoint, uint256 timestamp)
      const payer = "0x" + clean.slice(24, 64);
      const amount = parseInt(clean.slice(64, 128), 16);
      const timestamp = parseInt(clean.slice(128, 192), 16);
      // String is at offset from slot 2 (skip first 3 fixed slots)
      const strOffset = parseInt(clean.slice(192, 256), 16) * 2;
      const strLen = parseInt(clean.slice(strOffset, strOffset + 64), 16);
      const strData = clean.slice(strOffset + 64, strOffset + 64 + strLen * 2);
      let endpoint = "";
      for (let j = 0; j < strData.length; j += 2) {
        endpoint += String.fromCharCode(parseInt(strData.slice(j, j + 2), 16));
      }

      const time = new Date(timestamp * 1000).toLocaleString();
      rows += `<tr>
        <td>${i}</td>
        <td title="${payer}">${shortAddr(payer)}</td>
        <td>${endpoint}</td>
        <td>${(amount / 1e6).toFixed(6)}</td>
        <td>${time}</td>
      </tr>`;
    }
    tbody.innerHTML = rows;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="loading">Error: ${e.message}</td></tr>`;
  }
}

// --- AI Processing (client-side) ---

function processSummarize(text) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const keyPoints = sentences.slice(0, Math.min(3, sentences.length));
  return { summary: keyPoints.map(s => s.trim()).join(" "), originalLength: text.length, sentenceCount: sentences.length, keyPointCount: keyPoints.length };
}

function processSentiment(text) {
  const pos = ["good","great","excellent","amazing","wonderful","love","happy","best","fantastic","beautiful","perfect","awesome"];
  const neg = ["bad","terrible","awful","horrible","hate","worst","ugly","poor","sad","angry","fail","broken"];
  const words = text.toLowerCase().split(/\s+/);
  let p = 0, n = 0;
  for (const w of words) { if (pos.some(x => w.includes(x))) p++; if (neg.some(x => w.includes(x))) n++; }
  const total = p + n || 1;
  const score = (p - n) / total;
  return { sentiment: score > 0.2 ? "positive" : score < -0.2 ? "negative" : "neutral", score: Math.round(score * 100) / 100, positive: p, negative: n, wordCount: words.length };
}

function processTranslate(text, lang) {
  const dicts = {
    es: { hello:"hola", world:"mundo", the:"el", is:"es", good:"bueno", bad:"malo", blockchain:"cadena de bloques", money:"dinero", pay:"pagar" },
    zh: { hello:"你好", world:"世界", the:"这个", is:"是", good:"好", bad:"坏", blockchain:"区块链", money:"钱", pay:"支付" },
    ja: { hello:"こんにちは", world:"世界", the:"その", is:"です", good:"良い", bad:"悪い", blockchain:"ブロックチェーン", money:"お金", pay:"支払う" },
  };
  const dict = dicts[lang] || dicts.es;
  const words = text.split(/\s+/);
  const translated = words.map(w => { const c = w.toLowerCase().replace(/[^a-z]/g, ""); return dict[c] || w; });
  return { original: text, translated: translated.join(" "), targetLanguage: lang, wordsTranslated: words.length };
}

function processKeywords(text) {
  const stop = new Set(["the","a","an","is","are","was","were","be","have","has","had","do","does","will","to","of","in","for","on","with","at","by","from","it","this","that","and","or","but","not","as","if","i","you","he","she","we","they"]);
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/);
  const freq = {};
  for (const w of words) { if (w.length > 2 && !stop.has(w)) freq[w] = (freq[w] || 0) + 1; }
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return { keywords: sorted.map(([word, count]) => ({ word, count })), totalWords: words.length, uniqueKeywords: sorted.length };
}

const processors = { summarize: processSummarize, sentiment: processSentiment, translate: processTranslate, keywords: processKeywords };

// --- MetaMask ---

async function connectWallet() {
  if (!window.ethereum) { alert("MetaMask not found!"); return; }
  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    connectedAddress = accounts[0];
    const btn = document.getElementById("connectBtn");
    btn.textContent = shortAddr(connectedAddress);
    btn.classList.add("connected");

    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_CHAIN_ID }] });
    } catch (e) {
      if (e.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{ chainId: ARC_CHAIN_ID, chainName: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: [ARC_RPC], blockExplorerUrls: ["https://testnet.arcscan.io"] }],
        });
      }
    }
  } catch (e) { alert("Connection failed: " + e.message); }
}

function updatePrice() {
  const epId = parseInt(document.getElementById("apiEndpoint").value);
  const ep = EP_INFO[epId];
  document.getElementById("priceTag").textContent = (ep.price / 1e6).toFixed(6) + " USDC";
  document.getElementById("langGroup").style.display = epId === 2 ? "block" : "none";
}

async function callAPI() {
  if (!connectedAddress) { alert("Connect MetaMask first!"); return; }

  const epId = parseInt(document.getElementById("apiEndpoint").value);
  const ep = EP_INFO[epId];
  const text = document.getElementById("inputText").value.trim();
  const statusEl = document.getElementById("apiStatus");
  const resultEl = document.getElementById("apiResult");
  const resultJson = document.getElementById("resultJson");
  const btn = document.getElementById("callBtn");

  if (!text) { statusEl.className = "error"; statusEl.textContent = "Enter some text!"; statusEl.style.display = "block"; return; }

  btn.disabled = true;
  resultEl.style.display = "none";

  // Step 1: Approve USDC to contract
  statusEl.className = "pending";
  statusEl.textContent = "Step 1/3: Approving USDC to contract...";
  statusEl.style.display = "block";

  try {
    const amountHex = BigInt(ep.price).toString(16).padStart(64, "0");
    const approveData = SEL.approve + padAddr(CONTRACT) + amountHex;

    const approveTx = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [{ from: connectedAddress, to: USDC_ARC, data: approveData, chainId: ARC_CHAIN_ID }],
    });
    statusEl.textContent = `Step 1/3: Approve sent (${approveTx.slice(0, 16)}...), waiting...`;
    await waitForTx(approveTx);

    // Step 2: Call payForAPI on contract
    statusEl.textContent = "Step 2/3: Paying for API access...";
    const payData = SEL.payForAPI + pad256("0x" + epId.toString(16));

    const payTx = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [{ from: connectedAddress, to: CONTRACT, data: payData, chainId: ARC_CHAIN_ID }],
    });
    statusEl.textContent = `Step 2/3: Payment sent (${payTx.slice(0, 16)}...), waiting...`;
    await waitForTx(payTx);

    // Step 3: Process locally (simulate server response)
    statusEl.textContent = "Step 3/3: Processing AI request...";
    await new Promise(r => setTimeout(r, 500));

    let result;
    if (ep.name === "translate") {
      const lang = document.getElementById("targetLang").value;
      result = processors.translate(text, lang);
    } else {
      result = processors[ep.name](text);
    }

    statusEl.className = "success";
    statusEl.innerHTML = `Payment verified! TX: <a href="https://testnet.arcscan.io/tx/${payTx}" target="_blank" style="color:#81c784">${payTx.slice(0, 20)}...</a>`;
    resultEl.style.display = "block";
    resultJson.textContent = JSON.stringify({ endpoint: ep.name, payer: connectedAddress, paymentTx: payTx, result }, null, 2);

    // Refresh stats
    setTimeout(() => { loadStats(); loadPayments(); }, 2000);
  } catch (e) {
    statusEl.className = "error";
    statusEl.textContent = "Error: " + (e.message || e);
    statusEl.style.display = "block";
  }

  btn.disabled = false;
}

async function waitForTx(hash) {
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const receipt = await rpcCall("eth_getTransactionReceipt", [hash]);
      if (receipt && receipt.status === "0x1") return receipt;
      if (receipt && receipt.status === "0x0") throw new Error("Transaction reverted");
    } catch (e) {
      if (e.message === "Transaction reverted") throw e;
    }
  }
  throw new Error("Transaction timeout");
}

// --- Init ---

window.addEventListener("DOMContentLoaded", () => {
  loadEndpoints();
  loadStats();
  loadPayments();
});
