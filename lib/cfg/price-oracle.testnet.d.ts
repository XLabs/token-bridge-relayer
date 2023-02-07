declare namespace _default {
    const fetchPricesInterval: number;
    const minPriceChangePercentage: number;
    const maxPriceChangePercentage: number;
    const pricePrecision: number;
    const supportedTokens: {
        chainId: number;
        tokenId: string;
        tokenContract: string;
    }[];
}
export default _default;
