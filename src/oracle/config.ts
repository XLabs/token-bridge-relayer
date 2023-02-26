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
import addresses from "../../cfg/addresses.both.json";
import supportedTokens from "../../cfg/supported-tokens.oracle.json";

const strip0x = (str: string) => (str.startsWith("0x") ? str.substring(2) : str);

// shared EVM private key
const ethKey = process.env.PRIVATE_KEYS_CHAIN_2;
if (!ethKey) {
  console.error("ETH KEY is required! Set it by doing: export PRIVATE_KEYS_CHAIN_2=YOUR_PRIVATE_KEY");
  process.exit(1);
}

const PK = new Uint8Array(Buffer.from(strip0x(ethKey), "hex"));

const signers = {
  [CHAIN_ID_ETH]: new Wallet(PK, getRpc("ETH_RPC_HTTP")),
  [CHAIN_ID_AVAX]: new Wallet(PK, getRpc("AVAX_RPC_HTTP")),
  [CHAIN_ID_BSC]: new Wallet(PK, getRpc("BSC_RPC_HTTP")),
  [CHAIN_ID_FANTOM]: new Wallet(PK, getRpc("FTM_RPC_HTTP")),
  [CHAIN_ID_CELO]: new Wallet(PK, getRpc("CELO_RPC_HTTP")),
  [CHAIN_ID_POLYGON]: new Wallet(PK, getRpc("POLYGON_RPC_HTTP")),
};

// receives an object with chainIds and a Wallet object and returns an object with ChainId to RelayerContract objects
const signersToRelayerContracts = (signers: { [s: string]: Wallet }) =>
  Object.fromEntries(
    // @ts-ignore
    Object.entries(signers).map(([chainId, pk]) => [chainId, relayerContract(addresses[chainId].relayer, pk)])
  );

// receives an object with chainIds and a Wallet object and returns an object with ChainId to TokenBridgeContract objects
const signersToTokenBridgeContracts = (signers: { [s: string]: Wallet }) =>
  Object.fromEntries(
    // @ts-ignore
    Object.entries(signers).map(([chainId, pk]) => [chainId, tokenBridgeContract(addresses[chainId].bridge, pk)])
  );

const supportedTokenIds: string[] = Array.from(new Set(supportedTokens.map((t) => t.tokenId)));

export const config = {
  env: process.env.ENVIRONMENT || "local",
  logLevel: process.env.LOG_LEVEL || "debug",

  fetchPricesInterval: Number(process.env.FETCH_PRICE_INTERVAL_IN_MS) || 60000, // how often to poll for pricing changes.
  minPriceChangePercentage: Number(process.env.UPDATE_PRICE_CHANGE_PCT) || 2, // what's the minimum amount the price must change for us to update it.
  maxPriceChangePercentage: Number(process.env.UPDATE_PRICE_CHANGE_PCT_CAP) || 25, // if the price changed too much, avoid updating.
  pricePrecision: 8, // decimal places for price precision.

  signers,

  relayerContracts: signersToRelayerContracts(signers),
  tokenBridgeContracts: signersToTokenBridgeContracts(signers),

  supportedTokens,
  supportedTokenIds,
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

export interface TokenInfo {
  chainId: number; // Original ChainId
  tokenId: string;
  tokenContract: string;
}

function getRpc(rpcEvnVariable: any): ethers.providers.JsonRpcProvider {
  const rpc = process.env[rpcEvnVariable];
  if (!rpc || !rpc.startsWith("https")) {
    console.log(rpc);
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
