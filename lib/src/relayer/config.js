"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pluginDef = exports.TokenBridgeRelayerDefinition = exports.SUPPORTED_CHAINS = void 0;
const wormhole_sdk_1 = require("@certusone/wormhole-sdk");
const plugin_1 = require("./plugin");
exports.SUPPORTED_CHAINS = [
    wormhole_sdk_1.CHAIN_ID_ETH,
    wormhole_sdk_1.CHAIN_ID_AVAX,
    wormhole_sdk_1.CHAIN_ID_BSC,
    wormhole_sdk_1.CHAIN_ID_FANTOM,
    wormhole_sdk_1.CHAIN_ID_CELO,
    wormhole_sdk_1.CHAIN_ID_POLYGON,
];
class TokenBridgeRelayerDefinition {
    pluginName = "TokenBridgeRelayer";
    constructor() { }
    init(pluginConfig) {
        const pluginConfigParsed = plugin_1.TokenBridgeRelayerPlugin.validateConfig(pluginConfig);
        return {
            fn: (env, logger) => new plugin_1.TokenBridgeRelayerPlugin(env, pluginConfigParsed, logger),
            pluginName: this.pluginName,
        };
    }
}
exports.TokenBridgeRelayerDefinition = TokenBridgeRelayerDefinition;
exports.pluginDef = new TokenBridgeRelayerDefinition();
//# sourceMappingURL=config.js.map