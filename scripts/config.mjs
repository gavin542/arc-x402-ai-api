// Shared config and helpers
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { createPublicClient, createWalletClient, http } from "viem";
import dotenv from "dotenv";
dotenv.config();

export const ARC_RPC = "https://rpc.testnet.arc.network";
export const USDC_ARC = "0x3600000000000000000000000000000000000000";
export const CONTRACT = process.env.PAYABLE_API_CONTRACT;

export const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

export const publicClient = createPublicClient({
  transport: http(ARC_RPC),
});

export const PAYABLE_API_ABI = [
  { name: "addEndpoint", type: "function", stateMutability: "nonpayable", inputs: [{ name: "name", type: "string" }, { name: "price", type: "uint256" }], outputs: [] },
  { name: "payForAPI", type: "function", stateMutability: "nonpayable", inputs: [{ name: "endpointId", type: "uint256" }], outputs: [] },
  { name: "recordPayment", type: "function", stateMutability: "nonpayable", inputs: [{ name: "payer", type: "address" }, { name: "amount", type: "uint256" }, { name: "endpoint", type: "string" }], outputs: [] },
  { name: "totalPayments", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "totalEndpoints", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "getPayment", type: "function", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ name: "payer", type: "address" }, { name: "amount", type: "uint256" }, { name: "endpoint", type: "string" }, { name: "timestamp", type: "uint256" }] },
  { name: "getEndpoint", type: "function", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ name: "name", type: "string" }, { name: "price", type: "uint256" }, { name: "active", type: "bool" }] },
  { name: "userPaymentCount", type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "userTotalSpent", type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "totalRevenue", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];

// API endpoint definitions (mirror of on-chain)
export const API_ENDPOINTS = [
  { id: 0, name: "summarize",  price: 1000, description: "Summarize text into key points" },
  { id: 1, name: "sentiment",  price: 1000, description: "Analyze text sentiment (positive/negative/neutral)" },
  { id: 2, name: "translate",  price: 2000, description: "Translate text to target language" },
  { id: 3, name: "keywords",   price: 1000, description: "Extract keywords from text" },
];
