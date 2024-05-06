import BN from "bn.js";

import { SignerWalletAdapter } from "@solana/wallet-adapter-base";
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { ContractError } from "@streamflow/common";
import { ConfirmationParams, signAndExecuteTransaction, ThrottleParams } from "@streamflow/common/solana";

import { fromTxError } from "./generated/errors";

export function getDistributorPda(programId: PublicKey, mint: PublicKey, version: number): PublicKey {
  // Constructing the seed for the PDA
  const seeds = [
    Buffer.from("MerkleDistributor"),
    mint.toBuffer(),
    Buffer.from(new Uint8Array(new BigUint64Array([BigInt(version)]).buffer)),
  ];

  // Finding the PDA
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

export function getClaimantStatusPda(programId: PublicKey, distributor: PublicKey, claimant: PublicKey): PublicKey {
  // Constructing the seed for the PDA
  const seeds = [Buffer.from("ClaimStatus"), claimant.toBuffer(), distributor.toBuffer()];

  // Finding the PDA
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

export function getEventAuthorityPda(programId: PublicKey): PublicKey {
  // Constructing the seed for the PDA
  const seeds = [Buffer.from("__event_authority")];

  // Finding the PDA
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

export async function wrappedSignAndExecuteTransaction(
  connection: Connection,
  invoker: Keypair | SignerWalletAdapter,
  tx: Transaction | VersionedTransaction,
  confirmationParams: ConfirmationParams,
  throttleParams: ThrottleParams,
): Promise<string> {
  try {
    return await signAndExecuteTransaction(connection, invoker, tx, confirmationParams, throttleParams);
  } catch (err: any) {
    if (err instanceof Error) {
      const parsed = fromTxError(err);
      if (parsed) {
        throw new ContractError(err, parsed.name, parsed.msg);
      }
    }
    throw err;
  }
}

interface ICalculateUnlockedAmount {
  lockedAmount: BN;
  startTs: BN;
  endTs: BN;
  currTs: BN;
  unlockPeriod: BN;
}

interface ICalculateAmountPerUnlock {
  lockedAmount: BN;
  startTs: BN;
  endTs: BN;
  unlockPeriod: BN;
}

export const calculateLockedAmountAvailable = ({
  lockedAmount,
  startTs,
  endTs,
  currTs,
  unlockPeriod,
}: ICalculateUnlockedAmount): BN => {
  if (startTs.lt(currTs.sub(unlockPeriod))) return new BN(0);
  if (startTs.gte(endTs)) return lockedAmount;

  const timeIntoUnlock = currTs.sub(startTs);
  const unlocksPassed = timeIntoUnlock.div(unlockPeriod);
  const amountPerUnlock = calculateAmountPerUnlock({ lockedAmount, startTs, endTs, unlockPeriod });
  return unlocksPassed.mul(amountPerUnlock);
};

export const calculateAmountPerUnlock = ({
  lockedAmount,
  startTs,
  endTs,
  unlockPeriod,
}: ICalculateAmountPerUnlock): BN => {
  if (lockedAmount.eqn(0)) return new BN(0);

  const totalDuration = endTs.sub(startTs);
  if (unlockPeriod.gte(totalDuration)) return lockedAmount;

  const totalUnlocks = totalDuration.div(unlockPeriod);
  return lockedAmount.div(totalUnlocks);
};
