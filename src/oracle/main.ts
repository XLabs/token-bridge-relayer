import { ethers } from "ethers";
import { assertPricePrecisionSetOrThrow, config, SUPPORTED_CHAINS, TokenInfo } from "./config";
import { getCoingeckoPrices } from "./coingecko";
import * as winston from "winston";

require("dotenv").config();
async function sleepFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const logger = winston.createLogger({
    level: config.logLevel,
    format: config.env != "local" ? winston.format.json() : winston.format.cli(),
    defaultMeta: { service: "token-bridge-price-oracle" },
    transports: [new winston.transports.Console()],
  });
  const tokens = config.supportedTokenIds;
  logger.info(`Coingecko Id string: ${tokens.join(",")}`);

  const {
    supportedTokens,
    fetchPricesInterval,
    minPriceChangePercentage,
    maxPriceChangePercentage,
    pricePrecision,
    relayerContracts,
  } = config;

  logger.info(`New price update interval: ${fetchPricesInterval}`);
  logger.info(`Price update minimum percentage change: ${minPriceChangePercentage}%`);
  logger.info(`Price update maximum percentage change: ${maxPriceChangePercentage}%`);

  // confirm the price precision on each contract
  await assertPricePrecisionSetOrThrow(pricePrecision);

  // get er done
  while (true) {
    // fetch native and token prices
    const coingeckoPrices = await getCoingeckoPrices(tokens).catch((_) => null);

    if (coingeckoPrices === null) {
      logger.error("Failed to fetch coingecko prices!");
      continue;
    }

    try {
      // format price updates
      const priceUpdates = formatPriceUpdates(supportedTokens, coingeckoPrices, pricePrecision);

      // update contract prices for each supported chain / token
      for (const supportedChainId of SUPPORTED_CHAINS) {
        // set up relayer contract
        const relayer = relayerContracts[supportedChainId];

        for (const supportedToken of supportedTokens) {
          // @ts-ignore
          // local token address in supportedChainId
          const token = supportedTokens[supportedChainId][supportedToken.tokenContract];
          const tokenId = supportedToken.tokenId;

          // query the contract to fetch the current native swap price
          const currentPrice: ethers.BigNumber = await relayer.swapRate(token);
          const newPrice = priceUpdates.get(tokenId)!;

          // compute percentage change
          const percentageChange = ((newPrice.toNumber() - currentPrice.toNumber()) / currentPrice.toNumber()) * 100;

          logger.info(
            `Price update, chainId: ${supportedChainId}, nativeAddress: ${supportedToken.tokenContract}, localTokenAddress: ${token}, currentPrice: ${currentPrice}, newPrice: ${newPrice}`
          );

          try {
            const pricePercentageChange = Math.abs(percentageChange);

            if (pricePercentageChange >= maxPriceChangePercentage) {
              logger.warn(
                `Price change larger than max, chainId: ${supportedChainId}, token: ${token}. Skipping update.`
              );
              continue;
            }

            // update prices if they have changed by the minPriceChangePercentage
            if (minPriceChangePercentage < pricePercentageChange && pricePercentageChange < maxPriceChangePercentage) {
              // if (minPriceChangePercentage ≤ pricePercentageChange ≤ maxPriceChangePercentage)
              const tx = await relayer.updateSwapRate(supportedChainId, token, newPrice);
              const receipt = await tx.wait();
              logger.info(
                `Updated native price on chainId: ${supportedChainId}, token: ${token}, txhash: ${receipt.transactionHash}`
              );
            }
          } catch (e) {
            logger.error(`Failed to update the swap rate`);
            logger.error(e);
          }
        }
      }
    } catch (e) {
      logger.error(e);
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
