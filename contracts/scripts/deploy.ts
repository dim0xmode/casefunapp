import { ethers } from 'hardhat';

const main = async () => {
  const [deployer] = await ethers.getSigners();

  const Treasury = await ethers.getContractFactory('Treasury');
  const treasury = await Treasury.deploy(deployer.address);
  await treasury.waitForDeployment();

  const TokenFactory = await ethers.getContractFactory('TokenFactory');
  const tokenFactory = await TokenFactory.deploy(deployer.address, await treasury.getAddress());
  await tokenFactory.waitForDeployment();

  console.log('Deployer:', deployer.address);
  console.log('Treasury:', await treasury.getAddress());
  console.log('TokenFactory:', await tokenFactory.getAddress());
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
