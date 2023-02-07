"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenBridgeContracts = exports.relayerContracts = exports.relayerContract = exports.tokenBridgeContract = void 0;
const ethers_contracts_1 = require("@certusone/wormhole-sdk/lib/cjs/ethers-contracts");
const ethers_1 = require("ethers");
const config_1 = require("./config");
function tokenBridgeContract(address, signer) {
    return ethers_contracts_1.ITokenBridge__factory.connect(address, signer);
}
exports.tokenBridgeContract = tokenBridgeContract;
function relayerContract(address, signer) {
    const contract = new ethers_1.Contract(address, [
        "function swapRate(address) public view returns (uint256)",
        "function updateSwapRate(uint16,address,uint256) public",
        "function swapRatePrecision() public view returns (uint256)",
    ], signer);
    return contract;
}
exports.relayerContract = relayerContract;
exports.relayerContracts = Object.fromEntries(
// @ts-ignore
Object.entries(config_1.SIGNERS).map(([chainId, pk]) => [chainId, relayerContract(contractConfig[chainId].relayer, pk)]));
exports.tokenBridgeContracts = Object.fromEntries(
// @ts-ignore
Object.entries(config_1.SIGNERS).map(([chainId, pk]) => [chainId, tokenBridgeContract(contractConfig[chainId].bridge, pk)]));
//# sourceMappingURL=contracts.js.map