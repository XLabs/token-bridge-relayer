import pricingOracleConfig from "../../cfg/price-oracle.testnet";
import { SUPPORTED_CHAINS, SupportedChainId } from "../relayer/config";
import { tokenBridgeContracts, TokenInfo } from "./config";
import { ethers } from "ethers";
import { tryUint8ArrayToNative } from "@certusone/wormhole-sdk";
import { ZERO_ADDRESS } from "./main";

async function generateTokenMap(config: TokenInfo[]) {
  // native -> local token address
  const addressMap = <Record<SupportedChainId, Record<string, string>>>{};

  for (const chainId of SUPPORTED_CHAINS) {
    // instantiate token bridge contract
    const tokenBridge: ethers.Contract = tokenBridgeContracts[chainId];

    const nativeToLocalTokenMap = <Record<string, string>>{};

    for (const tokenConfig of config) {
      const token = ethers.utils.arrayify("0x" + tokenConfig.tokenContract);
      const tokenChain = tokenConfig.chainId;

      // find the token address on each chain (wrapped or native)
      let localTokenAddress: string;
      if (tokenChain == chainId) {
        localTokenAddress = tryUint8ArrayToNative(token, tokenChain);
      } else {
        try {
          localTokenAddress = await tokenBridge.wrappedAsset(tokenChain, token);
        } catch (e) {
          console.log(e);
          continue;
        }
      }

      // Exit if the relayer can't find the local token address. This means
      // the token is either not attested or not configured correctly.
      if (localTokenAddress == ZERO_ADDRESS) {
        console.error(`Failed to find localTokenAddress for chainId=${chainId}, token=${tokenConfig.tokenContract}`);
        process.exit(1);
      }
      nativeToLocalTokenMap[tokenConfig.tokenContract] = localTokenAddress;
    }
    // add to mapping
    addressMap[chainId] = nativeToLocalTokenMap;
  }
  return addressMap;
}

async function main() {
  let map = await generateTokenMap(pricingOracleConfig.supportedTokens);
  console.log(JSON.stringify(map, null, 2));
}

main();
