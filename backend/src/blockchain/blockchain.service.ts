import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';

const CONTRACT_ABI = [
  'function anchorHash(string caseId, string chainHash) public',
  'function getAnchor(string caseId) public view returns (string)',
];

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;

  constructor() {
    this.logger.debug(`RPC_URL: ${process.env.BLOCKCHAIN_RPC_URL}`);
    this.logger.debug(`CONTRACT_ADDRESS: ${process.env.BLOCKCHAIN_CONTRACT_ADDRESS}`);
    this.logger.debug(`PRIVATE_KEY set: ${!!process.env.HARDHAT_PRIVATE_KEY}, length: ${process.env.HARDHAT_PRIVATE_KEY?.length}`);

    this.provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL, undefined, {
      staticNetwork: true,
    });
    this.wallet = new ethers.Wallet(process.env.HARDHAT_PRIVATE_KEY!, this.provider);
    this.contract = new ethers.Contract(
      process.env.BLOCKCHAIN_CONTRACT_ADDRESS!,
      CONTRACT_ABI,
      this.wallet,
    );
  }

  async anchorCaseHash(caseId: string, chainHash: string): Promise<string | null> {
    try {
      const tx = await this.contract.anchorHash(caseId, chainHash);
      await tx.wait();
      return tx.hash;
    } catch (err) {
      this.logger.warn(`Blockchain anchor failed, continuing without it: ${err.message}`);
      return null;
    }
  }

  async getOnChainAnchor(caseId: string): Promise<string | null> {
    try {
      return await this.contract.getAnchor(caseId);
    } catch (err) {
      this.logger.warn(`Blockchain read failed: ${err.message}`);
      return null;
    }
  }
}