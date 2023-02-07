"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertPricePrecisionSetOrThrow = exports.SIGNERS = exports.SUPPORTED_CHAINS = void 0;
const wormhole_sdk_1 = require("@certusone/wormhole-sdk");
const ethers_1 = require("ethers");
const contracts_1 = require("./contracts");
exports.SUPPORTED_CHAINS = [
    wormhole_sdk_1.CHAIN_ID_AVAX,
    wormhole_sdk_1.CHAIN_ID_ETH,
    wormhole_sdk_1.CHAIN_ID_BSC,
    wormhole_sdk_1.CHAIN_ID_FANTOM,
    wormhole_sdk_1.CHAIN_ID_CELO,
    wormhole_sdk_1.CHAIN_ID_POLYGON,
];
function getRpc(rpcEvnVariable) {
    const rpc = rpcEvnVariable;
    if (!rpc || !rpc.startsWith("https")) {
        console.error(`${rpcEvnVariable} required!`);
        process.exit(1);
    }
    return new ethers_1.ethers.providers.JsonRpcProvider(rpc);
}
const strip0x = (str) => (str.startsWith("0x") ? str.substring(2) : str);
// shared EVM private key
const ethKey = process.env.ETH_KEY;
if (!ethKey) {
    console.error("ETH_KEY is required!");
    process.exit(1);
}
const PK = new Uint8Array(Buffer.from(strip0x(ethKey), "hex"));
exports.SIGNERS = {
    [wormhole_sdk_1.CHAIN_ID_ETH]: new ethers_1.Wallet(PK, getRpc(process.env.ETH_RPC_HTTP)),
    [wormhole_sdk_1.CHAIN_ID_AVAX]: new ethers_1.Wallet(PK, getRpc(process.env.AVAX_RPC_HTTP)),
    [wormhole_sdk_1.CHAIN_ID_BSC]: new ethers_1.Wallet(PK, getRpc(process.env.BSC_RPC_HTTP)),
    [wormhole_sdk_1.CHAIN_ID_FANTOM]: new ethers_1.Wallet(PK, getRpc(process.env.FTM_RPC_HTTP)),
    [wormhole_sdk_1.CHAIN_ID_CELO]: new ethers_1.Wallet(PK, getRpc(process.env.CELO_RPC_HTTP)),
    [wormhole_sdk_1.CHAIN_ID_POLYGON]: new ethers_1.Wallet(PK, getRpc(process.env.POLYGON_RPC_HTTP)),
};
async function assertPricePrecisionSetOrThrow(expectedPrecision) {
    const pricePrecisionBN = ethers_1.ethers.utils.parseUnits("1", expectedPrecision);
    for (const chainId of exports.SUPPORTED_CHAINS) {
        const relayer = contracts_1.relayerContracts[chainId];
        // fetch the contracts swap rate precision
        const swapRatePrecision = await relayer.swapRatePrecision();
        // compare it to the configured precision
        if (!swapRatePrecision.eq(pricePrecisionBN)) {
            console.error(`Swap Rate Precision does not match config chainId=${chainId}`);
            process.exit(1);
        }
    }
}
exports.assertPricePrecisionSetOrThrow = assertPricePrecisionSetOrThrow;
//# sourceMappingURL=config.js.map