import {
  CHAIN_ID_AVAX,
  CHAIN_ID_BSC,
  CHAIN_ID_CELO,
  CHAIN_ID_ETH,
  CHAIN_ID_FANTOM,
  CHAIN_ID_POLYGON,
} from "@certusone/wormhole-sdk";
import { ethers, Wallet } from "ethers";
import { relayerContract, tokenBridgeContract } from "./contracts";
import * as contractConfig from "../../cfg/token-bridge-relayer.testnet.json";
import pricingOracleConfig from "../../cfg/price-oracle.testnet";

const strip0x = (str: string) => (str.startsWith("0x") ? str.substring(2) : str);

// shared EVM private key
const ethKey = process.env.ETH_KEY;
if (!ethKey) {
  console.error("ETH_KEY is required!");
  process.exit(1);
}

const PK = new Uint8Array(Buffer.from(strip0x(ethKey), "hex"));

const signers = {
  [CHAIN_ID_ETH]: new Wallet(PK, getRpc(process.env.ETH_RPC_HTTP)),
  [CHAIN_ID_AVAX]: new Wallet(PK, getRpc(process.env.AVAX_RPC_HTTP)),
  [CHAIN_ID_BSC]: new Wallet(PK, getRpc(process.env.BSC_RPC_HTTP)),
  [CHAIN_ID_FANTOM]: new Wallet(PK, getRpc(process.env.FTM_RPC_HTTP)),
  [CHAIN_ID_CELO]: new Wallet(PK, getRpc(process.env.CELO_RPC_HTTP)),
  [CHAIN_ID_POLYGON]: new Wallet(PK, getRpc(process.env.POLYGON_RPC_HTTP)),
};

export const config = {
  env: process.env.ENVIRONMENT || "local",
  logLevel: process.env.LOG_LEVEL || "debug",

  signers,
  relayerContracts: Object.fromEntries(
    // @ts-ignore
    Object.entries(signers).map(([chainId, pk]) => [chainId, relayerContract(contractConfig[chainId].relayer, pk)])
  ),
  tokenBridgeContracts: Object.fromEntries(
    // @ts-ignore
    Object.entries(signers).map(([chainId, pk]) => [chainId, tokenBridgeContract(contractConfig[chainId].bridge, pk)])
  ),
};

export const SUPPORTED_CHAINS = [
  CHAIN_ID_AVAX,
  CHAIN_ID_ETH,
  CHAIN_ID_BSC,
  CHAIN_ID_FANTOM,
  CHAIN_ID_CELO,
  CHAIN_ID_POLYGON,
];
export type SupportedChainId = (typeof SUPPORTED_CHAINS)[number];

export const supportedTokenIds: string[] = Array.from(
  new Set(pricingOracleConfig.supportedTokens.map((t) => t.tokenId))
);

export interface TokenInfo {
  chainId: number; // Original ChainId
  tokenId: string;
  tokenContract: string;
}

export interface PriceConfig {
  fetchPricesInterval: number;
  minPriceChangePercentage: number;
  maxPriceChangePercentage: number;
  pricePrecision: number;
  supportedTokens: TokenInfo[];
}

function getRpc(rpcEvnVariable: any): ethers.providers.JsonRpcProvider {
  const rpc = rpcEvnVariable;
  if (!rpc || !rpc.startsWith("https")) {
    console.error(`${rpcEvnVariable} required!`);
    process.exit(1);
  }
  return new ethers.providers.JsonRpcProvider(rpc);
}

export async function assertPricePrecisionSetOrThrow(expectedPrecision: number) {
  const pricePrecisionBN = ethers.utils.parseUnits("1", expectedPrecision);

  for (const chainId of SUPPORTED_CHAINS) {
    const relayer = config.relayerContracts[chainId];

    // fetch the contracts swap rate precision
    const swapRatePrecision: ethers.BigNumber = await relayer.swapRatePrecision();

    // compare it to the configured precision
    if (!swapRatePrecision.eq(pricePrecisionBN)) {
      console.error(`Swap Rate Precision does not match config chainId=${chainId}`);
      process.exit(1);
    }
  }
}
