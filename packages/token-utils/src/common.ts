/**
 * This file is a port of serum-common, which was built for web3.js 0.x.
 */

import type { Provider } from "@saberhq/solana-contrib";
import type { AccountInfo, MintInfo } from "@solana/spl-token";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { TransactionInstruction } from "@solana/web3.js";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import type BN from "bn.js";

import { deserializeAccount, deserializeMint } from ".";

export * as token from "./token";

export const SPL_SHARED_MEMORY_ID = new PublicKey(
  "shmem4EWT2sPdVGvTZCzXXRAURL9G5vpPxNwSeKhHUL"
);

export async function createMint(
  provider: Provider,
  authority?: PublicKey,
  decimals?: number
): Promise<PublicKey> {
  if (authority === undefined) {
    authority = provider.wallet.publicKey;
  }
  const mint = Keypair.generate();
  const instructions = await createMintInstructions(
    provider,
    authority,
    mint.publicKey,
    decimals
  );

  const tx = new Transaction();
  tx.add(...instructions);

  await provider.send(tx, [mint]);

  return mint.publicKey;
}

export async function createMintInstructions(
  provider: Provider,
  authority: PublicKey,
  mint: PublicKey,
  decimals = 6
): Promise<TransactionInstruction[]> {
  const instructions = [
    SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: mint,
      space: 82,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(82),
      programId: TOKEN_PROGRAM_ID,
    }),
    Token.createInitMintInstruction(
      TOKEN_PROGRAM_ID,
      mint,
      decimals,
      authority,
      null
    ),
  ];
  return instructions;
}

export async function createMintAndVault(
  provider: Provider,
  amount: BN,
  owner?: PublicKey,
  decimals?: number
): Promise<[PublicKey, PublicKey]> {
  if (owner === undefined) {
    owner = provider.wallet.publicKey;
  }
  const mint = Keypair.generate();
  const vault = Keypair.generate();
  const tx = new Transaction();
  tx.add(
    ...(await createMintInstructions(
      provider,
      provider.wallet.publicKey,
      mint.publicKey,
      decimals
    )),
    SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: vault.publicKey,
      space: 165,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(
        165
      ),
      programId: TOKEN_PROGRAM_ID,
    }),
    Token.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      mint.publicKey,
      vault.publicKey,
      owner
    ),
    Token.createMintToInstruction(
      TOKEN_PROGRAM_ID,
      mint.publicKey,
      vault.publicKey,
      provider.wallet.publicKey,
      [],
      amount
    )
  );
  await provider.send(tx, [mint, vault]);
  return [mint.publicKey, vault.publicKey];
}

export async function createTokenAccountInstrs(
  provider: Provider,
  newAccountPubkey: PublicKey,
  mint: PublicKey,
  owner: PublicKey,
  lamports?: number
): Promise<TransactionInstruction[]> {
  if (lamports === undefined) {
    lamports = await provider.connection.getMinimumBalanceForRentExemption(165);
  }
  return [
    SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey,
      space: 165,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    Token.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      mint,
      newAccountPubkey,
      owner
    ),
  ];
}

export async function createAccountRentExempt(
  provider: Provider,
  programId: PublicKey,
  size: number
): Promise<Keypair> {
  const acc = Keypair.generate();
  const tx = new Transaction();
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: acc.publicKey,
      space: size,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(
        size
      ),
      programId,
    })
  );
  await provider.send(tx, [acc]);
  return acc;
}

export async function getMintInfo(
  provider: Provider,
  addr: PublicKey
): Promise<MintInfo> {
  const depositorAccInfo = await provider.connection.getAccountInfo(addr);
  if (depositorAccInfo === null) {
    throw new Error("Failed to find token account");
  }
  return deserializeMint(depositorAccInfo.data);
}

export async function getTokenAccount(
  provider: Provider,
  addr: PublicKey
): Promise<Omit<AccountInfo, "address">> {
  const depositorAccInfo = await provider.connection.getAccountInfo(addr);
  if (depositorAccInfo === null) {
    throw new Error("Failed to find token account");
  }
  return deserializeAccount(depositorAccInfo.data);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ProgramAccount<T> = {
  publicKey: PublicKey;
  account: T;
};
