import { EngineInitFn, PluginDefinition } from "@wormhole-foundation/relayer-engine";
import { TokenBridgeRelayerPlugin } from "./plugin";
export declare const SUPPORTED_CHAINS: (2 | 4 | 5 | 6 | 10 | 14)[];
export type SupportedChainId = (typeof SUPPORTED_CHAINS)[number];
export interface ChainAddresses {
    bridge: string;
    relayer: string;
    wormhole: string;
}
export interface TokenBridgeRelayerPluginConfig {
    addressMap: Map<SupportedChainId, ChainAddresses>;
    shouldSpy: boolean;
    shouldRest: boolean;
}
export declare class TokenBridgeRelayerDefinition implements PluginDefinition<TokenBridgeRelayerPluginConfig, TokenBridgeRelayerPlugin> {
    pluginName: string;
    constructor();
    init(pluginConfig: any): {
        fn: EngineInitFn<TokenBridgeRelayerPlugin>;
        pluginName: string;
    };
}
export declare const pluginDef: TokenBridgeRelayerDefinition;
