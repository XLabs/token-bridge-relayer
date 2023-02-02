"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// import { Logger } from "winston";
// import {
//   ActionExecutor,
//   assertBool,
//   CommonPluginEnv,
//   ContractFilter,
//   ParsedVaaWithBytes,
//   Plugin,
//   Providers,
//   StagingAreaKeyLock,
//   Workflow,
//   WorkflowOptions,
// } from "@wormhole-foundation/relayer-engine";
// import * as wh from "@certusone/wormhole-sdk";
// import {
//   ChainId,
//   TokenTransfer,
//   tryNativeToHexString,
//   uint8ArrayToHex,
// } from "@certusone/wormhole-sdk";
// import { Contract, ethers } from "ethers";
// import { IERC20Metadata__factory } from "@certusone/wormhole-sdk/lib/esm/ethers-contracts";
// import { ITokenBridge__factory } from "@certusone/wormhole-sdk/lib/cjs/ethers-contracts";
// import {
//   ChainAddresses,
//   SupportedChainId,
//   TokenBridgeRelayerPluginConfig,
// } from "./config";
//
// export interface WorkflowPayload {
//   relayerPayload: string;
//   targetTokenAddress: string;
//   denormalizedToNativeAmount: string;
//   vaaBytes: string; //base64
// }
//
// export interface TransferWithRelay {
//   payloadId: number; // == 1  // uint8
//   targetRelayerFee: string; // uint256
//   toNativeTokenAmount: string; // uint256
//   targetRecipient: string; // bytes32
// }
//
// export class TokenBridgeRelayerPlugin implements Plugin<WorkflowPayload> {
//   pluginName = "TokenBridgeRelayerPlugin";
//   maxRetries?: number | undefined;
//   pluginConfig: TokenBridgeRelayerPluginConfig;
//   shouldRest: boolean;
//   shouldSpy: boolean;
//
//   static validateConfig(
//     rawConfig: Record<string, any>
//   ): TokenBridgeRelayerPluginConfig {
//     const chainAddresses = new Map<SupportedChainId, ChainAddresses>();
//     for (const [chainId, addresses] of Object.entries(rawConfig)) {
//       chainAddresses.set(Number(chainId) as SupportedChainId, {
//         bridge: ethers.utils.getAddress(addresses.bridge),
//         wormhole: ethers.utils.getAddress(addresses.wormhole),
//         relayer: ethers.utils.getAddress(addresses.relayer),
//       });
//     }
//     return {
//       addressMap: chainAddresses,
//       shouldRest: false,
//       shouldSpy: assertBool(rawConfig.shouldSpy),
//     };
//   }
//
//   getFilters(): ContractFilter[] {
//     return Array.from(this.pluginConfig.addressMap.entries()).map(
//       ([chainId, addresses]) => ({ emitterAddress: addresses.relayer, chainId })
//     );
//   }
//
//   constructor(
//     readonly engineConfig: CommonPluginEnv,
//     pluginConfig: TokenBridgeRelayerPluginConfig,
//     private readonly logger: Logger
//   ) {
//     this.pluginConfig = pluginConfig;
//     this.shouldRest = this.pluginConfig.shouldRest;
//     this.shouldSpy = this.pluginConfig.shouldSpy;
//   }
//
//   async consumeEvent(
//     vaa: ParsedVaaWithBytes,
//     stagingArea: StagingAreaKeyLock,
//     providers: Providers,
//     extraData?: any[] | undefined
//   ): Promise<
//     | { workflowData: WorkflowPayload; workflowOptions?: WorkflowOptions }
//     | undefined
//   > {
//     const payload3 = parseTokenBridgePayload(vaa.payload);
//     const relayerPayload = parseRelayerPayload(payload3.tokenTransferPayload);
//
//     let fromChain = vaa.emitterChain as SupportedChainId;
//     const toChain = payload3.toChain as SupportedChainId;
//     const toAddress = ethers.utils.getAddress(relayerPayload.targetRecipient); // check, does the address come in wh native format? if so is this necessary?
//     const fromAddress = ethers.utils.getAddress(
//       vaa.emitterAddress.toString("hex")
//     );
//
//     let sourceRelayerAddress =
//       this.pluginConfig.addressMap.get(fromChain)!.relayer;
//     let targetRelayerAddress =
//       this.pluginConfig.addressMap.get(toChain)!.relayer;
//
//     //1. Check that it's coming from our relayer and going to our relayer.
//     if (toAddress !== targetRelayerAddress) {
//       this.logger.warn(
//         `Unknown target contract: ${toAddress} for chainId: ${toChain}, terminating relay.`
//       );
//       return;
//     }
//
//     if (fromAddress != sourceRelayerAddress) {
//       this.logger.warn(
//         `Unknown sender: ${fromAddress} for chainId: ${fromChain}, terminating relay.`
//       );
//       return;
//     }
//
//     const { tokenChain, tokenAddress } = payload3;
//
//     const tokenBridge = tokenBridgeContract(
//       this.pluginConfig.addressMap.get(toChain)!.bridge,
//       providers.evm[toChain]
//     );
//     // 2. fetch the local token address on the target chain
//     const targetTokenAddress = await getTargetTokenAddress(
//       tokenBridge,
//       toChain as SupportedChainId,
//       tokenAddress,
//       tokenChain
//     );
//
//     // 3. fetch the token decimals
//     const erc20Meta = IERC20Metadata__factory.connect(
//       targetTokenAddress,
//       providers.evm[toChain]
//     );
//     const tokenDecimals = await erc20Meta.decimals();
//
//     // 4. Denormalize amount (wh denormalizes to 8 decimals)
//     const denormalizedToNativeAmount = tokenBridgeDenormalizeAmount(
//       ethers.BigNumber.from(relayerPayload.toNativeTokenAmount),
//       tokenDecimals
//     ).toString();
//     return {
//       workflowData: {
//         relayerPayload,
//         targetTokenAddress,
//         denormalizedToNativeAmount,
//         vaaBytes: vaa.bytes.toString("base64"),
//       },
//     };
//   }
//
//   async handleWorkflow(
//     workflow: Workflow<WorkflowPayload>,
//     providers: Providers,
//     execute: ActionExecutor
//   ): Promise<void> {
//     // redeem the transfer on the target chain
//     let chainId = workflow.data.toChain as ChainId;
//     const { targetRelayerAddress } = workflow.data;
//     try {
//       await execute.onEVM({
//         chainId,
//         f: async (wallet) => {
//           // create relayer contract instance
//           const relayer = relayerContract(targetRelayerAddress, wallet.wallet);
//
//           // fetch weth address from the contract
//           const targetWethAddress = await relayer.WETH();
//
//           // determine how much native asset to supply to the relayer contract
//           let nativeSwapQuote: ethers.BigNumber;
//           if (
//             ethers.utils.getAddress(targetWethAddress) ===
//             ethers.utils.getAddress(localTokenAddress)
//           ) {
//             console.log(
//               "WETH transfer detected, setting nativeSwapQuote to zero."
//             );
//             nativeSwapQuote = ethers.BigNumber.from("0");
//           } else {
//             nativeSwapQuote = await relayer.calculateNativeSwapAmountOut(
//               localTokenAddress,
//               denormalizedToNativeAmount
//             );
//
//             // Fetch the max native swap amount from the contract. Override
//             // the nativeSwapQuote with the max if the maxNativeSwapAllowed
//             // is less than the nativeSwapQuote. This will reduce the cost
//             // of the transaction.
//             const maxNativeSwapAllowed = await relayer.maxNativeSwapAmount(
//               localTokenAddress
//             );
//             if (maxNativeSwapAllowed.lt(nativeSwapQuote)) {
//               nativeSwapQuote = maxNativeSwapAllowed;
//             }
//           }
//
//           console.log(
//             `Native amount to swap with contract: ${ethers.utils.formatEther(
//               nativeSwapQuote
//             )}`
//           );
//           // this.logger.log( `Relaying Wormhole message to: ${ targetRelayerAddress }, chainId: ${toChain}` );
//           const tx = await relayer.completeTransferWithRelay(
//             `0x${uint8ArrayToHex(vaaBytes)}`,
//             { value: nativeSwapQuote }
//           );
//           const redeedReceipt = await tx.wait();
//           console.log(
//             `Redeemed transfer in txhash: ${redeedReceipt.transactionHash}`
//           );
//         },
//       });
//     } catch (e) {
//       // TODO error handling
//       this.logger.error(e);
//     }
//   }
// }
//
// async function getTargetTokenAddress(
//   tokenBridge: ethers.Contract,
//   chainId: ChainId,
//   tokenAddress: string,
//   tokenChain: number
// ): Promise<string> {
//   let localTokenAddress;
//   if (tokenChain == chainId) {
//     localTokenAddress = tokenAddress;
//   } else {
//     localTokenAddress = await tokenBridge.wrappedAsset(
//       tokenChain,
//       "0x" + tryNativeToHexString(tokenAddress, tokenChain as ChainId)
//     );
//   }
//
//   return localTokenAddress;
// }
//
// function relayerContract(
//   address: string,
//   signer: ethers.Signer
// ): ethers.Contract {
//   const contract = new Contract(
//     address,
//     [
//       "function completeTransferWithRelay(bytes) payable",
//       "function calculateNativeSwapAmountOut(address,uint256) view returns (uint256)",
//       "function maxNativeSwapAmount(address) view returns (uint256)",
//       "function WETH() view returns (address)",
//     ],
//     signer
//   );
//   return contract;
// }
//
// function tokenBridgeContract(
//   address: string,
//   signer: ethers.providers.Provider
// ): ethers.Contract {
//   return ITokenBridge__factory.connect(address, signer);
// }
//
// function parseTokenBridgePayload(payload: Buffer): TokenTransfer {
//   return wh.parseTokenTransferPayload(payload);
// }
//
// export function tokenBridgeDenormalizeAmount(
//   amount: ethers.BigNumber,
//   decimals: number
// ): ethers.BigNumber {
//   if (decimals > 8) {
//     amount = amount.mul(10 ** (decimals - 8));
//   }
//   return amount;
// }
//
// function parseRelayerPayload(payload: Buffer): TransferWithRelay {
//   let index = 0;
//
//   // parse the payloadId
//   const payloadId = payload.readUint8(index);
//   index += 1;
//
//   // target relayer fee
//   const targetRelayerFee = payload.subarray(index, index + 32);
//   index += 32;
//
//   // amount of tokens to convert to native assets
//   const toNativeTokenAmount = payload.subarray(index, index + 32);
//   index += 32;
//
//   // recipient of the transfered tokens and native assets
//   const targetRecipient = payload.subarray(index, index + 32).toString("hex"); // TODO ok?
//   index += 32;
//
//   if (index !== payload.length) {
//     throw new Error("invalid message length");
//   }
//   return {
//     payloadId,
//     targetRelayerFee,
//     targetRecipient,
//     toNativeTokenAmount,
//   };
// }
//# sourceMappingURL=index.js.map