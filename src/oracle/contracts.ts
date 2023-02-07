import { ITokenBridge__factory } from "@certusone/wormhole-sdk/lib/cjs/ethers-contracts";
import { Contract, ethers } from "ethers";

export function tokenBridgeContract(
  address: string,
  signer: ethers.Signer | ethers.providers.Provider
): ethers.Contract {
  return ITokenBridge__factory.connect(address, signer);
}

export function relayerContract(address: string, signer: ethers.Signer): ethers.Contract {
  const contract = new Contract(
    address,
    [
      "function swapRate(address) public view returns (uint256)",
      "function updateSwapRate(uint16,address,uint256) public",
      "function swapRatePrecision() public view returns (uint256)",
    ],
    signer
  );
  return contract;
}
