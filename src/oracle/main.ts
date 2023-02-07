import { ethers } from "ethers";
import {
  assertPricePrecisionSetOrThrow,
  relayerContracts,
  SUPPORTED_CHAINS,
  supportedTokenIds,
  TokenInfo,
} from "./config";
import pricingOracleConfig from "../../cfg/price-oracle.testnet.js";
import nativeTokenMap from "../../cfg/token_addr-to-local-addr.priceoracle.testnet";
import { getCoingeckoPrices } from "./coingecko";

require("dotenv").config();

// zero address
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

async function sleepFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const tokens = supportedTokenIds;
  console.log(`Coingecko Id string: ${tokens.join(",")}`);

  const { fetchPricesInterval, minPriceChangePercentage, maxPriceChangePercentage } = pricingOracleConfig;

  console.log(`New price update interval: ${fetchPricesInterval}`);
  console.log(`Price update minimum percentage change: ${minPriceChangePercentage}%`);
  console.log(`Price update maximum percentage change: ${maxPriceChangePercentage}%`);

  // confirm the price precision on each contract
  await assertPricePrecisionSetOrThrow(pricingOracleConfig.pricePrecision);

  // get er done
  while (true) {
    // fetch native and token prices
    const coingeckoPrices = await getCoingeckoPrices(tokens).catch((_) => null);

    if (coingeckoPrices === null) {
      console.error("Failed to fetch coingecko prices!");
      continue;
    }

    try {
      // format price updates
      const priceUpdates = formatPriceUpdates(
        pricingOracleConfig.supportedTokens,
        coingeckoPrices,
        pricingOracleConfig.pricePrecision
      );

      // update contract prices for each supported chain / token
      for (const supportedChainId of SUPPORTED_CHAINS) {
        // set up relayer contract
        const relayer = relayerContracts[supportedChainId];

        for (const config of pricingOracleConfig.supportedTokens) {
          // @ts-ignore
          // local token address in supportedChainId
          const token = nativeTokenMap[supportedChainId][config.tokenContract];
          const tokenId = config.tokenId;

          // query the contract to fetch the current native swap price
          const currentPrice: ethers.BigNumber = await relayer.swapRate(token);
          const newPrice = priceUpdates.get(tokenId)!;

          // compute percentage change
          const percentageChange = ((newPrice.toNumber() - currentPrice.toNumber()) / currentPrice.toNumber()) * 100;

          console.log(
            `Price update, chainId: ${supportedChainId}, nativeAddress: ${config.tokenContract}, localTokenAddress: ${token}, currentPrice: ${currentPrice}, newPrice: ${newPrice}`
          );

          try {
            const pricePercentageChange = Math.abs(percentageChange);

            if (pricePercentageChange >= maxPriceChangePercentage) {
              console.warn(
                `Price change larger than max, chainId: ${supportedChainId}, token: ${token}. Skipping update.`
              );
              continue;
            }

            // update prices if they have changed by the minPriceChangePercentage
            if (minPriceChangePercentage < pricePercentageChange && pricePercentageChange < maxPriceChangePercentage) {
              // if (minPriceChangePercentage ≤ pricePercentageChange ≤ maxPriceChangePercentage)
              const tx = await relayer.updateSwapRate(supportedChainId, token, newPrice);
              const receipt = await tx.wait();
              console.log(
                `Updated native price on chainId: ${supportedChainId}, token: ${token}, txhash: ${receipt.transactionHash}`
              );
            }
          } catch (e) {
            console.log(`Failed to update the swap rate`);
            console.error(e);
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
    await sleepFor(fetchPricesInterval);
  }
}

function formatPriceUpdates(relayerConfigs: TokenInfo[], coingeckoPrices: any, pricePrecision: number) {
  // price mapping
  const priceUpdates = new Map<string, ethers.BigNumber>();

  // loop through each config, compute conversion rates and save results
  for (let i = 0; i < relayerConfigs.length; ++i) {
    const config = relayerConfigs.at(i)!;
    const tokenId = config.tokenId;

    if (tokenId in coingeckoPrices) {
      // cache prices
      const tokenPrice = coingeckoPrices[tokenId].usd;

      // push native -> token swap rate
      priceUpdates.set(tokenId, ethers.utils.parseUnits(tokenPrice.toFixed(pricePrecision), pricePrecision));
    }
  }
  return priceUpdates;
}

main();
