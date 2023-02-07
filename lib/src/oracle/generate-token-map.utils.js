"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("../relayer/config");
const config_2 = require("./config");
const ethers_1 = require("ethers");
const wormhole_sdk_1 = require("@certusone/wormhole-sdk");
const main_1 = require("./main");
const contracts_1 = require("./contracts");
async function generateTokenMap(config, contractConfig) {
    // native -> local token address
    const addressMap = new Map();
    for (const chainId of config_1.SUPPORTED_CHAINS) {
        // instantiate token bridge contract
        const tokenBridge = (0, contracts_1.tokenBridgeContract)(contractConfig[chainId.toString()].bridge, config_2.SIGNERS[chainId]);
        const nativeToLocalTokenMap = new Map();
        for (const tokenConfig of config) {
            const token = ethers_1.ethers.utils.arrayify("0x" + tokenConfig.tokenContract);
            const tokenChain = tokenConfig.chainId;
            // find the token address on each chain (wrapped or native)
            let localTokenAddress;
            if (tokenChain == chainId) {
                localTokenAddress = (0, wormhole_sdk_1.tryUint8ArrayToNative)(token, tokenChain);
            }
            else {
                try {
                    localTokenAddress = await tokenBridge.wrappedAsset(tokenChain, token);
                }
                catch (e) {
                    console.log(e);
                    continue;
                }
            }
            // Exit if the relayer can't find the local token address. This means
            // the token is either not attested or not configured correctly.
            if (localTokenAddress == main_1.ZERO_ADDRESS) {
                console.error(`Failed to find localTokenAddress for chainId=${chainId}, token=${tokenConfig.tokenContract}`);
                process.exit(1);
            }
            nativeToLocalTokenMap.set(tokenConfig.tokenContract, localTokenAddress);
        }
        // add to mapping
        addressMap.set(chainId, nativeToLocalTokenMap);
    }
    return addressMap;
}
//# sourceMappingURL=generate-token-map.utils.js.map