import { ethers } from "ethers";
export declare const SUPPORTED_CHAINS: (2 | 4 | 5 | 6 | 10 | 14)[];
export type SupportedChainId = (typeof SUPPORTED_CHAINS)[number];
export interface TokenInfo {
    chainId: number;
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
export declare const SIGNERS: {
    2: ethers.Wallet;
    6: ethers.Wallet;
    4: ethers.Wallet;
    10: ethers.Wallet;
    14: ethers.Wallet;
    5: ethers.Wallet;
};
export declare function assertPricePrecisionSetOrThrow(expectedPrecision: number): Promise<void>;
