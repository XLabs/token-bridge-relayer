import * as relayerEngine from "@wormhole-foundation/relayer-engine";
import { TokenBridgeRelayerDefinition, TokenBridgeRelayerPluginConfig, pluginDef } from "./config";

async function main() {
  // load plugin config
  const pluginConfig = (await relayerEngine.loadFileAndParseToObject(
    `./cfg/token-bridge-plugin.testnet.json`
  )) as TokenBridgeRelayerPluginConfig;

  const mode = (process.env.RELAYER_ENGINE_MODE?.toUpperCase() as relayerEngine.Mode) || relayerEngine.Mode.BOTH;

  // run relayer engine
  await relayerEngine.run({
    configs: "./relayer-engine-config",
    plugins: [pluginDef.init(pluginConfig)],
    mode,
  });
}

// allow main to be an async function and block until it rejects or resolves
main().catch((e) => {
  console.error(e);
  console.error(e.stackTrace);
  process.exit(1);
});
