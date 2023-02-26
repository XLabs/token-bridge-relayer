import supportedTokens from "../../cfg/supported-tokens.oracle.json";
import { SUPPORTED_CHAINS, SupportedChainId } from "../relayer/config";
import { config, TokenInfo } from "./config";
import { ethers } from "ethers";
import { tryUint8ArrayToNative } from "@certusone/wormhole-sdk";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

async function generateTokenMap(tokenInfos: TokenInfo[]) {
  // native -> local token address
  const addressMap = <Record<SupportedChainId, Record<string, string>>>{};

  for (const chainId of SUPPORTED_CHAINS) {
    // instantiate token bridge contract
    const tokenBridge: ethers.Contract = config.tokenBridgeContracts[chainId];

    const nativeToLocalTokenMap = <Record<string, string>>{};

    for (const tokenConfig of tokenInfos) {
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
  let map = await generateTokenMap(supportedTokens);
  console.error(JSON.stringify(map, null, 2));
}

main();
