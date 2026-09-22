const hre = require("hardhat");

async function main() {
  const CaseAnchor = await hre.ethers.getContractFactory("CaseAnchor");
  const contract = await CaseAnchor.deploy();
  await contract.waitForDeployment();
  console.log("CaseAnchor deployed to:", await contract.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});