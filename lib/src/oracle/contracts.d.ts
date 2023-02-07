import { Contract, ethers } from "ethers";
export declare function tokenBridgeContract(address: string, signer: ethers.Signer | ethers.providers.Provider): ethers.Contract;
export declare function relayerContract(address: string, signer: ethers.Signer): ethers.Contract;
export declare const relayerContracts: {
    [k: string]: Contract;
};
export declare const tokenBridgeContracts: {
    [k: string]: Contract;
};
