import { createHash } from 'crypto';
import nacl from 'tweetnacl';
import { AppError } from '../middleware/errorHandler.js';

interface TonProof {
  timestamp: number;
  domain: { lengthBytes: number; value: string };
  payload: string;
  signature: string;
  stateInit?: string;
  publicKey?: string;
}

const TON_PROOF_MAX_AGE_SECONDS = 300;

const tonProofPrefix = 'ton-proof-item-v2/';
const tonConnectPrefix = 'ton-connect';

export const verifyTonProof = async (
  walletAddress: string,
  proof: TonProof | undefined
): Promise<void> => {
  if (!proof) {
    throw new AppError('TON proof is required', 400);
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - proof.timestamp) > TON_PROOF_MAX_AGE_SECONDS) {
    throw new AppError('TON proof expired', 401);
  }

  if (!proof.signature || !proof.publicKey) {
    throw new AppError('TON proof signature or public key missing', 400);
  }

  try {
    const addressBytes = Buffer.from(walletAddress, 'utf-8');
    const domainLenBuf = Buffer.alloc(4);
    domainLenBuf.writeUInt32LE(proof.domain.lengthBytes);
    const domainBuf = Buffer.from(proof.domain.value, 'utf-8');
    const timestampBuf = Buffer.alloc(8);
    timestampBuf.writeBigUInt64LE(BigInt(proof.timestamp));
    const payloadBuf = Buffer.from(proof.payload, 'utf-8');

    const message = Buffer.concat([
      Buffer.from(tonProofPrefix, 'utf-8'),
      addressBytes,
      domainLenBuf,
      domainBuf,
      timestampBuf,
      payloadBuf,
    ]);

    const messageHash = createHash('sha256').update(message).digest();

    const fullMsg = Buffer.concat([
      Buffer.from([0xff, 0xff]),
      Buffer.from(tonConnectPrefix, 'utf-8'),
      messageHash,
    ]);

    const fullMsgHash = createHash('sha256').update(fullMsg).digest();

    const signatureBytes = Buffer.from(proof.signature, 'base64');
    const publicKeyBytes = Buffer.from(proof.publicKey, 'hex');

    const isValid = nacl.sign.detached.verify(
      new Uint8Array(fullMsgHash),
      new Uint8Array(signatureBytes),
      new Uint8Array(publicKeyBytes)
    );

    if (!isValid) {
      throw new AppError('Invalid TON proof signature', 401);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('TON proof verification failed', 401);
  }
};
