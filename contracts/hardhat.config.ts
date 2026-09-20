// =====================================================
// SECTION 1: IMPORT HARDHAT TOOLS AND PLUGINS
// =====================================================
//
// The Viem toolbox keeps Viem, the Node Test Runner, Ignition, assertions, and
// Hardhat's encrypted keystore support available to this project.

import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

// =====================================================
// SECTION 2: DEFINE PROJECT CONFIGURATION
// =====================================================
//
// defineConfig validates this object against Hardhat 3's configuration types and
// preserves type-safe editor support. Reading this file only configures Hardhat; it
// does not compile, send a transaction, or deploy a contract by itself.

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],

  // =====================================================
  // SECTION 3: CONFIGURE THE SOLIDITY COMPILER
  // =====================================================
  //
  // Solidity 0.8.34 currently produces Osaka-targeted bytecode by default, which
  // matches Arc's documented EVM baseline. The production profile retains the
  // existing optimizer settings for intentional production builds.

  solidity: {
    profiles: {
      default: {
        version: "0.8.34",
      },
      production: {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },

  // =====================================================
  // SECTION 4: CONFIGURE LOCAL AND PUBLIC NETWORKS
  // =====================================================
  //
  // The two edr-simulated entries remain local, in-memory development networks.
  // An HTTP network connects Hardhat to a separate JSON-RPC node. The RPC URL is
  // the endpoint through which Hardhat reads chain state and submits signed
  // transactions; the chain ID lets Hardhat verify it reached the intended chain.

  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },

    // =====================================================
    // SECTION 5: CONFIGURE ARC TESTNET
    // =====================================================
    //
    // configVariable creates a lazy reference rather than reading a secret now.
    // Local compilation and tests therefore do not need Arc credentials. Hardhat
    // resolves these values only when a command selects this network with
    // `--network arcTestnet`.
    //
    // Neither an RPC credential nor a private key should be hardcoded here. The
    // accounts array identifies the development-only signing key Hardhat may use.
    // Its wallet pays deployment gas in Arc's native USDC, which uses 18 decimals
    // for native accounting. The Ignition module intentionally contains no key,
    // and the React frontend must never receive the deployment private key.

    arcTestnet: {
      type: "http",
      chainType: "l1",
      chainId: 5_042_002,
      url: configVariable("ARC_TESTNET_RPC_URL"),
      accounts: [configVariable("ARC_DEPLOYER_PRIVATE_KEY")],
      ignition: {
        // Arc currently requires maxFeePerGas to be at least 20 Gwei. No fixed gas
        // limit is needed because Hardhat and the RPC can estimate deployment gas.
        maxFeePerGas: 20_000_000_000n,
        explorerUrl: "https://explorer.testnet.arc.io",
      },
    },
  },
});
