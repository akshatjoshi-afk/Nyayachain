import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';

const CONTRACT_ABI = [
  'function anchorHash(string caseId, string chainHash) public',
  'function getAnchor(string caseId) public view returns (string)',
];

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private provider?: ethers.JsonRpcProvider;
  private wallet?: ethers.Wallet;
  private contract?: ethers.Contract;

  constructor() {
    const rpcUrl = process.env.BLOCKCHAIN_RPC_URL;
    const contractAddress = process.env.BLOCKCHAIN_CONTRACT_ADDRESS;
    const privateKey = process.env.HARDHAT_PRIVATE_KEY;

    this.logger.debug(`RPC_URL: ${rpcUrl}`);
    this.logger.debug(`CONTRACT_ADDRESS: ${contractAddress}`);
    this.logger.debug(
      `PRIVATE_KEY set: ${!!privateKey}, length: ${privateKey?.length}`,
    );

    // Blockchain is optional. If it is not configured,
    // the backend continues running without blockchain functionality.
    if (!rpcUrl || !contractAddress || !privateKey) {
      this.logger.warn(
        'Blockchain is not configured; running without blockchain',
      );
      return;
    }

    this.provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
      staticNetwork: true,
    });

    this.wallet = new ethers.Wallet(privateKey, this.provider);

    this.contract = new ethers.Contract(
      contractAddress,
      CONTRACT_ABI,
      this.wallet,
    );

    this.logger.log('Blockchain service initialized successfully');
  }

  async anchorCaseHash(
    caseId: string,
    chainHash: string,
  ): Promise<string | null> {
    if (!this.contract) {
      this.logger.debug(
        `Blockchain disabled; skipping anchor for case ${caseId}`,
      );
      return null;
    }

    try {
      const tx = await this.contract.anchorHash(caseId, chainHash);
      await tx.wait();
      return tx.hash;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Blockchain anchor failed, continuing without it: ${message}`,
      );
      return null;
    }
  }

  async getOnChainAnchor(caseId: string): Promise<string | null> {
    if (!this.contract) {
      this.logger.debug(
        `Blockchain disabled; skipping on-chain lookup for case ${caseId}`,
      );
      return null;
    }

    try {
      return await this.contract.getAnchor(caseId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Blockchain read failed: ${message}`);
      return null;
    }
  }
}