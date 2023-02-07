import { Logger } from "winston";
import { ActionExecutor, CommonPluginEnv, ContractFilter, ParsedVaaWithBytes, Plugin, Providers, StagingAreaKeyLock, Workflow, WorkflowOptions } from "@wormhole-foundation/relayer-engine";
import { ethers } from "ethers";
import { SupportedChainId, TokenBridgeRelayerPluginConfig } from "./config";
export interface WorkflowPayload {
    toChain: SupportedChainId;
    targetRelayerAddress: string;
    localTokenAddressOnTargetChain: string;
    denormalizedToNativeAmount: string;
    vaaHex: string;
}
export interface TransferWithRelay {
    payloadId: number;
    targetRelayerFee: ethers.BigNumber;
    toNativeTokenAmount: ethers.BigNumber;
    targetRecipient: string;
}
export declare class TokenBridgeRelayerPlugin implements Plugin<WorkflowPayload> {
    readonly _: CommonPluginEnv;
    private readonly logger;
    pluginName: string;
    maxRetries?: number | undefined;
    pluginConfig: TokenBridgeRelayerPluginConfig;
    shouldRest: boolean;
    shouldSpy: boolean;
    static validateConfig(rawConfig: Record<string, any>): TokenBridgeRelayerPluginConfig;
    getFilters(): ContractFilter[];
    constructor(_: CommonPluginEnv, pluginConfig: TokenBridgeRelayerPluginConfig, logger: Logger);
    consumeEvent(vaa: ParsedVaaWithBytes, stagingArea: StagingAreaKeyLock, providers: Providers): Promise<{
        workflowData: WorkflowPayload;
        workflowOptions?: WorkflowOptions;
    } | undefined>;
    handleWorkflow(workflow: Workflow<WorkflowPayload>, providers: Providers, execute: ActionExecutor): Promise<void>;
}
export declare function tokenBridgeDenormalizeAmount(amount: ethers.BigNumber, decimals: number): ethers.BigNumber;
