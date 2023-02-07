"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const relayerEngine = require("@wormhole-foundation/relayer-engine");
const config_1 = require("./config");
async function main() {
    // load plugin config
    const pluginConfig = (await relayerEngine.loadFileAndParseToObject(`./cfg/token-bridge-plugin.testnet.json`));
    const mode = process.env.RELAYER_ENGINE_MODE?.toUpperCase() || relayerEngine.Mode.BOTH;
    // run relayer engine
    await relayerEngine.run({
        configs: "./relayer-engine-config",
        plugins: [config_1.pluginDef.init(pluginConfig)],
        mode,
    });
}
// allow main to be an async function and block until it rejects or resolves
main().catch((e) => {
    console.error(e);
    console.error(e.stackTrace);
    process.exit(1);
});
//# sourceMappingURL=main.js.map