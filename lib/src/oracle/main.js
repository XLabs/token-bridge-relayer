"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZERO_ADDRESS = void 0;
const ethers_1 = require("ethers");
const config_1 = require("./config");
const price_oracle_testnet_js_1 = require("../../cfg/price-oracle.testnet.js");
const token_addr_to_local_addr_priceoracle_testnet_1 = require("../../cfg/token_addr-to-local-addr.priceoracle.testnet");
const contracts_1 = require("./contracts");
const axios = require("axios"); // import breaks
require("dotenv").config();
// zero address
exports.ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
// supported chains
// signers
async function sleepFor(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function createCoingeckoString(relayerConfig) {
    // cache variables from relayer config
    let uniqueIds = [];
    for (const config of relayerConfig.supportedTokens) {
        if (!uniqueIds.includes(config.tokenId)) {
            uniqueIds.push(config.tokenId);
        }
    }
    return uniqueIds.join(",");
}
async function main() {
    // create coingeckoId string
    const coingeckoIds = createCoingeckoString(price_oracle_testnet_js_1.default);
    console.log(`Coingecko Id string: ${coingeckoIds}`);
    const { fetchPricesInterval, minPriceChangePercentage, maxPriceChangePercentage } = price_oracle_testnet_js_1.default;
    console.log(`New price update interval: ${fetchPricesInterval}`);
    console.log(`Price update minimum percentage change: ${minPriceChangePercentage}%`);
    console.log(`Price update maximum percentage change: ${maxPriceChangePercentage}%`);
    // native -> local token address mapping per chain
    // const nativeTokenMap = await generateTokenMap(pricingOracleConfig.relayers, contractConfig);
    console.log("Relayer Config");
    console.log(price_oracle_testnet_js_1.default);
    // confirm the price precision on each contract
    await (0, config_1.assertPricePrecisionSetOrThrow)(price_oracle_testnet_js_1.default.pricePrecision);
    // get er done
    while (true) {
        // fetch native and token prices
        const coingeckoPrices = await getCoingeckoPrices(coingeckoIds).catch((_) => null);
        if (coingeckoPrices === null) {
            console.error("Failed to fetch coingecko prices!");
            continue;
        }
        try {
            // format price updates
            const priceUpdates = formatPriceUpdates(price_oracle_testnet_js_1.default.supportedTokens, coingeckoPrices, price_oracle_testnet_js_1.default.pricePrecision);
            // update contract prices for each supported chain / token
            for (const supportedChainId of config_1.SUPPORTED_CHAINS) {
                // set up relayer contract
                const relayer = contracts_1.relayerContracts[supportedChainId];
                for (const config of price_oracle_testnet_js_1.default.supportedTokens) {
                    // local token address
                    // @ts-ignore
                    const token = token_addr_to_local_addr_priceoracle_testnet_1.default[supportedChainId][config.tokenContract];
                    const tokenId = config.tokenId;
                    // query the contract to fetch the current native swap price
                    const currentPrice = await relayer.swapRate(token);
                    const newPrice = priceUpdates.get(tokenId);
                    // compute percentage change
                    const percentageChange = ((newPrice.toNumber() - currentPrice.toNumber()) / currentPrice.toNumber()) * 100;
                    console.log(`Price update, chainId: ${supportedChainId}, nativeAddress: ${config.tokenContract}, localTokenAddress: ${token}, currentPrice: ${currentPrice}, newPrice: ${newPrice}`);
                    try {
                        const pricePercentageChange = Math.abs(percentageChange);
                        if (pricePercentageChange >= maxPriceChangePercentage) {
                            console.warn(`Price change larger than max, chainId: ${supportedChainId}, token: ${token}. Skipping update.`);
                            continue;
                        }
                        // update prices if they have changed by the minPriceChangePercentage
                        if (minPriceChangePercentage < pricePercentageChange && pricePercentageChange < maxPriceChangePercentage) {
                            // if (minPriceChangePercentage ≤ pricePercentageChange ≤ maxPriceChangePercentage)
                            const tx = await relayer.updateSwapRate(supportedChainId, token, newPrice);
                            const receipt = await tx.wait();
                            console.log(`Updated native price on chainId: ${supportedChainId}, token: ${token}, txhash: ${receipt.transactionHash}`);
                        }
                    }
                    catch (e) {
                        console.log(`Failed to update the swap rate`);
                        console.error(e);
                    }
                }
            }
        }
        catch (e) {
            console.error(e);
        }
        await sleepFor(fetchPricesInterval);
    }
}
function formatPriceUpdates(relayerConfigs, coingeckoPrices, pricePrecision) {
    // price mapping
    const priceUpdates = new Map();
    // loop through each config, compute conversion rates and save results
    for (let i = 0; i < relayerConfigs.length; ++i) {
        const config = relayerConfigs.at(i);
        const tokenId = config.tokenId;
        if (tokenId in coingeckoPrices) {
            // cache prices
            const tokenPrice = coingeckoPrices[tokenId].usd;
            // push native -> token swap rate
            priceUpdates.set(tokenId, ethers_1.ethers.utils.parseUnits(tokenPrice.toFixed(pricePrecision), pricePrecision));
        }
    }
    return priceUpdates;
}
async function getCoingeckoPrices(coingeckoIds) {
    const { data, status } = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoIds}&vs_currencies=usd`, {
        headers: {
            Accept: "application/json",
        },
    });
    if (status != 200) {
        return Promise.reject("status != 200");
    }
    return data;
}
main();
//# sourceMappingURL=main.js.map