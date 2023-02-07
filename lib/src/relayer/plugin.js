"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenBridgeDenormalizeAmount = exports.TokenBridgeRelayerPlugin = void 0;
const wh = require("@certusone/wormhole-sdk");
const wormhole_sdk_1 = require("@certusone/wormhole-sdk");
const ethers_1 = require("ethers");
const ethers_contracts_1 = require("@certusone/wormhole-sdk/lib/cjs/ethers-contracts");
class TokenBridgeRelayerPlugin {
    _;
    logger;
    pluginName = "TokenBridgeRelayerPlugin";
    maxRetries;
    pluginConfig;
    shouldRest;
    shouldSpy;
    static validateConfig(rawConfig) {
        const chainAddresses = new Map();
        for (const [chainId, addresses] of Object.entries(rawConfig)) {
            chainAddresses.set(Number(chainId), {
                bridge: ethers_1.ethers.utils.getAddress(addresses.bridge),
                wormhole: ethers_1.ethers.utils.getAddress(addresses.wormhole),
                relayer: ethers_1.ethers.utils.getAddress(addresses.relayer),
            });
        }
        return {
            addressMap: chainAddresses,
            shouldRest: false,
            shouldSpy: true,
        };
    }
    getFilters() {
        return Array.from(this.pluginConfig.addressMap.entries()).map(([chainId, addresses]) => ({
            emitterAddress: addresses.bridge,
            chainId,
        }));
    }
    constructor(_, pluginConfig, logger) {
        this._ = _;
        this.logger = logger;
        this.pluginConfig = pluginConfig;
        this.shouldRest = this.pluginConfig.shouldRest;
        this.shouldSpy = this.pluginConfig.shouldSpy;
    }
    async consumeEvent(vaa, stagingArea, providers) {
        // 1. Parse Token Bridge VAA Payload
        const payload3 = wh.parseTokenTransferPayload(vaa.payload);
        if (payload3.payloadType !== wh.TokenBridgePayload.TransferWithPayload) {
            // we only accept v3 payloads
            return;
        }
        let fromChain = vaa.emitterChain;
        const toChain = payload3.toChain;
        const fromAddress = ethers_1.ethers.utils.getAddress((0, wormhole_sdk_1.tryUint8ArrayToNative)(payload3.fromAddress, fromChain));
        const toAddress = ethers_1.ethers.utils.getAddress((0, wormhole_sdk_1.tryUint8ArrayToNative)(payload3.to, toChain)); // check, does the address come in wh native format? if so is this necessary?
        let sourceRelayerAddress = this.pluginConfig.addressMap.get(fromChain).relayer;
        let targetRelayerAddress = this.pluginConfig.addressMap.get(toChain).relayer;
        //2. Check the VAA was generated from our relayer and is going to our relayer
        if (fromAddress != sourceRelayerAddress) {
            this.logger.warn(`Unknown sender: ${fromAddress} for chainId: ${fromChain}, terminating relay.`);
            return;
        }
        if (toAddress !== targetRelayerAddress) {
            this.logger.warn(`Unknown target contract: ${toAddress} for chainId: ${toChain}, terminating relay.`);
            return;
        }
        // 3. fetch the local token address on the target chain
        const tokenChain = payload3.tokenChain;
        const tokenAddress = ethers_1.ethers.utils.getAddress((0, wormhole_sdk_1.tryUint8ArrayToNative)(payload3.tokenAddress, toChain));
        const tokenBridge = tokenBridgeContract(this.pluginConfig.addressMap.get(toChain).bridge, providers.evm[toChain]);
        const localTokenAddressOnTargetChain = await getLocalTokenAddress(tokenBridge, toChain, tokenAddress, tokenChain);
        // 3. fetch the token decimals
        const tokenDecimals = await getTokenDecimals(localTokenAddressOnTargetChain, providers.evm[toChain]);
        // 4. Denormalize amount (wh denormalizes to 8 decimals)
        const relayerPayload = parseRelayerPayload(payload3.tokenTransferPayload);
        const denormalizedToNativeAmount = tokenBridgeDenormalizeAmount(ethers_1.ethers.BigNumber.from(relayerPayload.toNativeTokenAmount), tokenDecimals).toString();
        return {
            workflowData: {
                toChain,
                targetRelayerAddress,
                localTokenAddressOnTargetChain,
                denormalizedToNativeAmount,
                vaaHex: `0x${(0, wormhole_sdk_1.uint8ArrayToHex)(vaa.bytes)}`,
            },
        };
    }
    async handleWorkflow(workflow, providers, execute) {
        // redeem the transfer on the target chain
        const { toChain, targetRelayerAddress, localTokenAddressOnTargetChain, denormalizedToNativeAmount, vaaHex } = workflow.data;
        try {
            await execute.onEVM({
                chainId: toChain,
                f: async (wallet) => {
                    const relayer = relayerContract(targetRelayerAddress, wallet.wallet);
                    // 5. determine how much native asset to supply to the relayer contract
                    // fetch weth address from the contract
                    const targetWethAddress = ethers_1.ethers.utils.getAddress(await relayer.WETH());
                    let nativeSwapQuote = ethers_1.ethers.BigNumber.from("0"); // We only want to change this if targetWethAddress !== localTokenAddressOnTargetChain
                    let maxNativeSwapAllowed;
                    if (targetWethAddress !== localTokenAddressOnTargetChain) {
                        // Fetch the max native swap amount from the contract.
                        [nativeSwapQuote, maxNativeSwapAllowed] = await Promise.all([
                            relayer.calculateNativeSwapAmountOut(localTokenAddressOnTargetChain, denormalizedToNativeAmount),
                            relayer.maxNativeSwapAmount(localTokenAddressOnTargetChain),
                        ]);
                        // Override the nativeSwapQuote with the max if the maxNativeSwapAllowed
                        // is less than the nativeSwapQuote. This will reduce the cost
                        // of the transaction.
                        if (maxNativeSwapAllowed.lt(nativeSwapQuote)) {
                            nativeSwapQuote = maxNativeSwapAllowed;
                        }
                    }
                    this.logger.info(`Native amount to swap with contract: ${ethers_1.ethers.utils.formatEther(nativeSwapQuote)}`);
                    // this.logger.log( `Relaying Wormhole message to: ${ targetRelayerAddress }, chainId: ${toChain}` );
                    const tx = await relayer.completeTransferWithRelay(vaaHex, { value: nativeSwapQuote });
                    const redeedReceipt = await tx.wait();
                    this.logger.info(`Redeemed transfer in txhash: ${redeedReceipt.transactionHash}`);
                },
            });
        }
        catch (e) {
            // TODO error handling
            this.logger.error(e);
        }
    }
}
exports.TokenBridgeRelayerPlugin = TokenBridgeRelayerPlugin;
async function getTokenDecimals(tokenAddress, provider) {
    const erc20Meta = ethers_contracts_1.IERC20Metadata__factory.connect(tokenAddress, provider);
    const tokenDecimals = await erc20Meta.decimals();
    return tokenDecimals;
}
async function getLocalTokenAddress(tokenBridge, chainId, tokenAddress, tokenChain) {
    let tokenAddressInChain;
    if (tokenChain == chainId) {
        tokenAddressInChain = tokenAddress;
    }
    else {
        tokenAddressInChain = await tokenBridge.wrappedAsset(tokenChain, "0x" + (0, wormhole_sdk_1.tryNativeToHexString)(tokenAddress, tokenChain));
    }
    return ethers_1.ethers.utils.getAddress(tokenAddressInChain);
}
function relayerContract(address, signer) {
    const contract = new ethers_1.Contract(address, [
        "function completeTransferWithRelay(bytes) payable",
        "function calculateNativeSwapAmountOut(address,uint256) view returns (uint256)",
        "function maxNativeSwapAmount(address) view returns (uint256)",
        "function WETH() view returns (address)",
    ], signer);
    return contract;
}
function tokenBridgeContract(address, signer) {
    return ethers_contracts_1.ITokenBridge__factory.connect(address, signer);
}
function tokenBridgeDenormalizeAmount(amount, decimals) {
    if (decimals > 8) {
        amount = amount.mul(10 ** (decimals - 8));
    }
    return amount;
}
exports.tokenBridgeDenormalizeAmount = tokenBridgeDenormalizeAmount;
function parseRelayerPayload(payload) {
    let index = 0;
    // parse the payloadId
    const payloadId = payload.readUint8(index);
    index += 1;
    // target relayer fee
    const targetRelayerFee = ethers_1.ethers.BigNumber.from(payload.subarray(index, index + 32)); // uint256
    index += 32;
    // amount of tokens to convert to native assets
    const toNativeTokenAmount = ethers_1.ethers.BigNumber.from(payload.subarray(index, index + 32)); // uint256
    index += 32;
    // recipient of the transfered tokens and native assets
    const targetRecipient = strip0x(ethers_1.ethers.utils.hexlify(payload.subarray(index, index + 32)));
    index += 32;
    if (index !== payload.length) {
        throw new Error("invalid message length");
    }
    return {
        payloadId,
        targetRelayerFee,
        targetRecipient,
        toNativeTokenAmount,
    };
}
const strip0x = (str) => (str.startsWith("0x") ? str.substring(2) : str);
//# sourceMappingURL=plugin.js.map