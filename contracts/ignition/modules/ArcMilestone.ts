// =====================================================
// STEP 1: IMPORT HARDHAT IGNITION
// =====================================================
//
// Hardhat Ignition is Hardhat's declarative deployment system. Instead of writing
// a script that manually sends deployment transactions, we describe the desired
// deployment and let Ignition plan, execute, and track it.
//
// buildModule creates that reusable deployment description. This file contains no
// RPC URL, wallet address, private key, or .env value. Network configuration and
// account secrets belong outside deployment modules and a private key must never
// be written here.

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// =====================================================
// STEP 2: DEFINE THE DEPLOYMENT MODULE
// =====================================================
//
// A deployment module groups the contracts and actions that Ignition should
// manage. "ArcMilestoneModule" is the module's unique name in Ignition's
// deployment records; it is not a Solidity contract name.
//
// The callback parameter m is Ignition's module builder. It provides methods for
// describing deployments and related onchain actions without performing them as
// soon as this TypeScript file is imported.

const ArcMilestoneModule = buildModule("ArcMilestoneModule", (m) => {
  // =====================================================
  // STEP 3: DESCRIBE THE CONTRACT DEPLOYMENT
  // =====================================================
  //
  // m.contract("ArcMilestone") tells Ignition to deploy the compiled Solidity
  // contract named ArcMilestone. The string must exactly match the declaration
  // `contract ArcMilestone` so Hardhat can find the correct compilation artifact.
  //
  // The current contract has no constructor parameters, so no constructor argument
  // array is supplied. This call creates a contract future: a description of a
  // deployment that Ignition will execute later, not an immediate deployment while
  // this module is being imported.
  //
  // When executed on a selected network, deploying this future creates a new
  // contract address. Running it on Hardhat's local simulated network does not
  // automatically deploy anything to Arc mainnet or any other public network.

  const arcMilestone = m.contract("ArcMilestone");

  // =====================================================
  // STEP 4: RETURN THE DEPLOYED CONTRACT
  // =====================================================
  //
  // Returning the future exposes it as this module's result. After deployment,
  // Hardhat Ignition resolves the future, reports and records the deployed address,
  // and makes the deployed contract available to other modules or integrations.
  // React will later need that network-specific address together with the contract
  // ABI, but frontend configuration is deliberately outside this deployment module.

  return { arcMilestone };
});

export default ArcMilestoneModule;
