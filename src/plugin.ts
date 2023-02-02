import { Logger } from "winston";
import {
  ActionExecutor,
  assertBool,
  CommonPluginEnv,
  ContractFilter,
  ParsedVaaWithBytes,
  Plugin,
  Providers,
  StagingAreaKeyLock,
  Workflow,
  WorkflowOptions,
} from "@wormhole-foundation/relayer-engine";
import * as wh from "@certusone/wormhole-sdk";
import {
  ChainId,
  TokenTransfer,
  tryNativeToHexString,
  tryUint8ArrayToNative,
  uint8ArrayToHex,
} from "@certusone/wormhole-sdk";
import { Contract, ethers } from "ethers";
import { IERC20Metadata__factory } from "@certusone/wormhole-sdk/lib/cjs/ethers-contracts";
import { ITokenBridge__factory } from "@certusone/wormhole-sdk/lib/cjs/ethers-contracts";
import { ChainAddresses, SupportedChainId, TokenBridgeRelayerPluginConfig } from "./config";

export interface WorkflowPayload {
  toChain: SupportedChainId;
  targetRelayerAddress: string;
  localTokenAddressOnTargetChain: string;
  denormalizedToNativeAmount: string;
  vaaHex: string;
}

export interface TransferWithRelay {
  payloadId: number; // == 1  // uint8
  targetRelayerFee: ethers.BigNumber; // uint256
  toNativeTokenAmount: ethers.BigNumber; // uint256
  targetRecipient: string; // bytes32 wormhole hex formatted addr
}

export class TokenBridgeRelayerPlugin implements Plugin<WorkflowPayload> {
  pluginName = "TokenBridgeRelayerPlugin";
  maxRetries?: number | undefined;
  pluginConfig: TokenBridgeRelayerPluginConfig;
  shouldRest: boolean;
  shouldSpy: boolean;

  static validateConfig(rawConfig: Record<string, any>): TokenBridgeRelayerPluginConfig {
    const chainAddresses = new Map<SupportedChainId, ChainAddresses>();
    for (const [chainId, addresses] of Object.entries(rawConfig)) {
      chainAddresses.set(Number(chainId) as SupportedChainId, {
        bridge: ethers.utils.getAddress(addresses.bridge),
        wormhole: ethers.utils.getAddress(addresses.wormhole),
        relayer: ethers.utils.getAddress(addresses.relayer),
      });
    }
    return {
      addressMap: chainAddresses,
      shouldRest: false,
      shouldSpy: true,
    };
  }

  getFilters(): ContractFilter[] {
    return Array.from(this.pluginConfig.addressMap.entries()).map(([chainId, addresses]) => ({
      emitterAddress: addresses.relayer,
      chainId,
    }));
  }

  constructor(
    readonly engineConfig: CommonPluginEnv,
    pluginConfig: TokenBridgeRelayerPluginConfig,
    private readonly logger: Logger
  ) {
    this.pluginConfig = pluginConfig;
    this.shouldRest = this.pluginConfig.shouldRest;
    this.shouldSpy = this.pluginConfig.shouldSpy;
  }

  async consumeEvent(
    vaa: ParsedVaaWithBytes,
    stagingArea: StagingAreaKeyLock,
    providers: Providers,
    extraData?: any[] | undefined
  ): Promise<{ workflowData: WorkflowPayload; workflowOptions?: WorkflowOptions } | undefined> {
    const payload3 = wh.parseTokenTransferPayload(vaa.payload);
    if (payload3.payloadType !== wh.TokenBridgePayload.TransferWithPayload) {
      return;
    }
    const relayerPayload = parseRelayerPayload(payload3.tokenTransferPayload);

    let fromChain = vaa.emitterChain as SupportedChainId;
    const fromAddress = ethers.utils.getAddress(tryUint8ArrayToNative(payload3.fromAddress!, fromChain));
    const toChain = payload3.toChain as SupportedChainId;
    const toAddress = ethers.utils.getAddress(tryUint8ArrayToNative(payload3.to, toChain)); // check, does the address come in wh native format? if so is this necessary?

    let sourceRelayerAddress = this.pluginConfig.addressMap.get(fromChain)!.relayer;
    let targetRelayerAddress = this.pluginConfig.addressMap.get(toChain)!.relayer;

    //1. Check that it's coming from our relayer and going to our relayer.
    if (toAddress !== targetRelayerAddress) {
      this.logger.warn(`Unknown target contract: ${toAddress} for chainId: ${toChain}, terminating relay.`);
      return;
    }

    if (fromAddress != sourceRelayerAddress) {
      this.logger.warn(`Unknown sender: ${fromAddress} for chainId: ${fromChain}, terminating relay.`);
      return;
    }

    const tokenChain = payload3.tokenChain as SupportedChainId;
    const tokenAddress = ethers.utils.getAddress(tryUint8ArrayToNative(payload3.tokenAddress, toChain));

    const tokenBridge = tokenBridgeContract(this.pluginConfig.addressMap.get(toChain)!.bridge, providers.evm[toChain]);
    // 2. fetch the local token address on the target chain
    const localTokenAddressOnTargetChain = await getLocalTokenAddress(
      tokenBridge,
      toChain as SupportedChainId,
      tokenAddress,
      tokenChain
    );

    // 3. fetch the token decimals
    const erc20Meta = IERC20Metadata__factory.connect(localTokenAddressOnTargetChain, providers.evm[toChain]);
    const tokenDecimals = await erc20Meta.decimals();

    // 4. Denormalize amount (wh denormalizes to 8 decimals)
    const denormalizedToNativeAmount = tokenBridgeDenormalizeAmount(
      ethers.BigNumber.from(relayerPayload.toNativeTokenAmount),
      tokenDecimals
    ).toString();
    return {
      workflowData: {
        toChain,
        targetRelayerAddress,
        localTokenAddressOnTargetChain,
        denormalizedToNativeAmount,
        vaaHex: `0x${uint8ArrayToHex(vaa.bytes)}`,
      },
    };
  }

  async handleWorkflow(
    workflow: Workflow<WorkflowPayload>,
    providers: Providers,
    execute: ActionExecutor
  ): Promise<void> {
    // redeem the transfer on the target chain
    const { toChain, targetRelayerAddress, localTokenAddressOnTargetChain, denormalizedToNativeAmount, vaaHex } =
      workflow.data;
    try {
      await execute.onEVM({
        chainId: toChain,
        f: async (wallet) => {
          const relayer = relayerContract(targetRelayerAddress, wallet.wallet);

          // 5. determine how much native asset to supply to the relayer contract

          // fetch weth address from the contract
          const targetWethAddress = ethers.utils.getAddress(await relayer.WETH());
          let nativeSwapQuote: ethers.BigNumber;
          if (targetWethAddress === localTokenAddressOnTargetChain) {
            console.log("WETH transfer detected, setting nativeSwapQuote to zero.");
            nativeSwapQuote = ethers.BigNumber.from("0");
          } else {
            nativeSwapQuote = await relayer.calculateNativeSwapAmountOut(
              localTokenAddressOnTargetChain,
              denormalizedToNativeAmount
            );

            // Fetch the max native swap amount from the contract. Override
            // the nativeSwapQuote with the max if the maxNativeSwapAllowed
            // is less than the nativeSwapQuote. This will reduce the cost
            // of the transaction.
            const maxNativeSwapAllowed = await relayer.maxNativeSwapAmount(localTokenAddressOnTargetChain);
            if (maxNativeSwapAllowed.lt(nativeSwapQuote)) {
              nativeSwapQuote = maxNativeSwapAllowed;
            }
          }

          this.logger.info(`Native amount to swap with contract: ${ethers.utils.formatEther(nativeSwapQuote)}`);
          // this.logger.log( `Relaying Wormhole message to: ${ targetRelayerAddress }, chainId: ${toChain}` );
          const tx = await relayer.completeTransferWithRelay(vaaHex, { value: nativeSwapQuote });
          const redeedReceipt = await tx.wait();
          this.logger.info(`Redeemed transfer in txhash: ${redeedReceipt.transactionHash}`);
        },
      });
    } catch (e) {
      // TODO error handling
      this.logger.error(e);
    }
  }
}

async function getLocalTokenAddress(
  tokenBridge: ethers.Contract,
  chainId: ChainId,
  tokenAddress: string,
  tokenChain: number
): Promise<string> {
  let tokenAddressInChain;
  if (tokenChain == chainId) {
    tokenAddressInChain = tokenAddress;
  } else {
    tokenAddressInChain = await tokenBridge.wrappedAsset(
      tokenChain,
      "0x" + tryNativeToHexString(tokenAddress, tokenChain as ChainId)
    );
  }

  return ethers.utils.getAddress(tokenAddressInChain);
}

function relayerContract(address: string, signer: ethers.Signer): ethers.Contract {
  const contract = new Contract(
    address,
    [
      "function completeTransferWithRelay(bytes) payable",
      "function calculateNativeSwapAmountOut(address,uint256) view returns (uint256)",
      "function maxNativeSwapAmount(address) view returns (uint256)",
      "function WETH() view returns (address)",
    ],
    signer
  );
  return contract;
}

function tokenBridgeContract(address: string, signer: ethers.providers.Provider): ethers.Contract {
  return ITokenBridge__factory.connect(address, signer);
}

export function tokenBridgeDenormalizeAmount(amount: ethers.BigNumber, decimals: number): ethers.BigNumber {
  if (decimals > 8) {
    amount = amount.mul(10 ** (decimals - 8));
  }
  return amount;
}

function parseRelayerPayload(payload: Buffer): TransferWithRelay {
  let index = 0;

  // parse the payloadId
  const payloadId = payload.readUint8(index);
  index += 1;

  // target relayer fee
  const targetRelayerFee = ethers.BigNumber.from(payload.subarray(index, index + 32)); // uint256
  index += 32;

  // amount of tokens to convert to native assets
  const toNativeTokenAmount = ethers.BigNumber.from(payload.subarray(index, index + 32)); // uint256
  index += 32;

  // recipient of the transfered tokens and native assets
  const targetRecipient = strip0x(ethers.utils.hexlify(payload.subarray(index, index + 32)));
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

const strip0x = (str: string) => (str.startsWith("0x") ? str.substring(2) : str);
