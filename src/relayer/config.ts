import {
  CHAIN_ID_AVAX,
  CHAIN_ID_BSC,
  CHAIN_ID_CELO,
  CHAIN_ID_ETH,
  CHAIN_ID_FANTOM,
  CHAIN_ID_POLYGON,
} from "@certusone/wormhole-sdk";
import { EngineInitFn, PluginDefinition } from "@wormhole-foundation/relayer-engine";
import { TokenBridgeRelayerPlugin } from "./plugin";

export const SUPPORTED_CHAINS = [
  CHAIN_ID_ETH,
  CHAIN_ID_AVAX,
  CHAIN_ID_BSC,
  CHAIN_ID_FANTOM,
  CHAIN_ID_CELO,
  CHAIN_ID_POLYGON,
];

export type SupportedChainId = (typeof SUPPORTED_CHAINS)[number];

export interface ChainAddresses {
  bridge: string;
  relayer: string;
}

export interface TokenBridgeRelayerPluginConfig {
  addressMap: Map<SupportedChainId, ChainAddresses>;
  shouldSpy: boolean;
  shouldRest: boolean;
}

export class TokenBridgeRelayerDefinition
  implements PluginDefinition<TokenBridgeRelayerPluginConfig, TokenBridgeRelayerPlugin>
{
  pluginName: string = "TokenBridgeRelayer";

  constructor() {}

  init(pluginConfig: any): { fn: EngineInitFn<TokenBridgeRelayerPlugin>; pluginName: string } {
    const pluginConfigParsed: TokenBridgeRelayerPluginConfig = TokenBridgeRelayerPlugin.validateConfig(pluginConfig);
    return {
      fn: (env, logger) => new TokenBridgeRelayerPlugin(env, pluginConfigParsed, logger),
      pluginName: this.pluginName,
    };
  }
}

export const pluginDef = new TokenBridgeRelayerDefinition();
