import type {
  Address,
  BN,
  Context as AnchorContext,
  Program as AProgram,
} from "@project-serum/anchor";
import type {
  Idl,
  IdlAccountItem,
  IdlAccounts,
  IdlEvent,
  IdlEventField,
  IdlField,
  IdlInstruction,
  IdlType,
  IdlTypeDef,
  IdlTypeDefTyStruct,
} from "@project-serum/anchor/dist/cjs/idl";
import type {
  AccountClient,
  ProgramAccount,
  StateClient,
} from "@project-serum/anchor/dist/cjs/program/namespace";
import type {
  AccountMeta,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
} from "@solana/web3.js";

type InstructionsParsed = Record<
  string,
  {
    accounts: IdlAccountItem[];
    args: Array<unknown>;
  }
>;

export type ContextAccounts<A extends IdlAccountItem[]> = {
  [K in A[number]["name"]]: A[number] & { name: K } extends IdlAccounts
    ? ContextAccounts<
        NonNullable<(A[number] & { name: K } & IdlAccounts)["accounts"]>
      >
    : Address;
};

type Context<A extends IdlAccountItem[]> = Omit<AnchorContext, "accounts"> & {
  accounts: ContextAccounts<A>;
};

type MakeInstructionsNamespace<
  R extends InstructionsParsed,
  Ret,
  Mk extends { [M in keyof R]: unknown } = { [M in keyof R]: unknown }
> = {
  [M in keyof R]: ((
    ...args: [...R[M]["args"], Context<R[M]["accounts"]>]
  ) => Ret) &
    Mk[M];
};

type RpcNamespace<R extends InstructionsParsed> = MakeInstructionsNamespace<
  R,
  Promise<TransactionSignature>
>;

type InstructionNamespace<R extends InstructionsParsed> =
  MakeInstructionsNamespace<
    R,
    TransactionInstruction,
    {
      [M in keyof R]: {
        accounts: (ctx: ContextAccounts<R[M]["accounts"]>) => AccountMeta[];
      };
    }
  >;

type TransactionNamespace<R extends InstructionsParsed> =
  MakeInstructionsNamespace<R, Transaction>;

type StateNamespace<R extends InstructionsParsed, S> = Omit<
  StateClient,
  "rpc" | "fetch" | "instruction"
> & {
  rpc: RpcNamespace<R>;
  fetch: () => Promise<S>;
  instruction: InstructionNamespace<R>;
};

type AccountsNamespace<A> = {
  [K in keyof A]: Omit<AccountClient, "fetch" | "all" | "associated"> & {
    /**
     * Returns a deserialized account.
     *
     * @param address The address of the account to fetch.
     */
    fetch: (address: PublicKey) => Promise<A[K]>;
    /**
     * Returns all instances of this account type for the program.
     */
    all: (filter?: Buffer) => Promise<ProgramAccount<A[K]>[]>;
    /**
     * @deprecated since version 14.0.
     *
     * Function returning the associated account. Args are keys to associate.
     * Order matters.
     */
    associated: (...args: PublicKey[]) => Promise<A[K]>;
  };
};

type TypeMap = {
  publicKey: PublicKey;
  u64: BN;
  i64: BN;
  u128: BN;
  i128: BN;
} & {
  [K in "u8" | "i8" | "u16" | "i16" | "u32" | "i32"]: number;
};

type DecodeType<T extends IdlType, Defined> = T extends keyof TypeMap
  ? TypeMap[T]
  : T extends { defined: keyof Defined }
  ? Defined[T["defined"]]
  : T extends { option: { defined: keyof Defined } }
  ? Defined[T["option"]["defined"]] | null
  : T extends { option: keyof TypeMap }
  ? TypeMap[T["option"]] | null
  : T extends { vec: { defined: keyof Defined } }
  ? Defined[T["vec"]["defined"]][]
  : T extends { vec: keyof TypeMap }
  ? TypeMap[T["vec"]][]
  : T extends { array: [idlType: keyof TypeMap, size: number] }
  ? TypeMap[T["array"][0]][]
  : unknown;

type MakeArgs<A extends IdlField[], Defined> = {
  [K in keyof A]: A[K] extends IdlField
    ? DecodeType<A[K]["type"], Defined>
    : unknown;
};

type MakeInstructions<I extends IdlInstruction[], Defined> = {
  [K in I[number]["name"]]: {
    accounts: (I[number] & { name: K })["accounts"];
    args: MakeArgs<(I[number] & { name: K })["args"], Defined> & unknown[];
  };
};

export type AnchorProgram<
  IDL extends Idl,
  A,
  Defined = AnchorDefined<IDL>,
  RPCInstructions extends MakeInstructions<
    IDL["instructions"],
    Defined
  > = MakeInstructions<IDL["instructions"], Defined>,
  Methods extends MakeInstructions<
    NonNullable<IDL["state"]>["methods"],
    Defined
  > = MakeInstructions<NonNullable<IDL["state"]>["methods"], Defined>
> = Omit<
  AProgram,
  "rpc" | "state" | "account" | "transaction" | "instruction"
> & {
  rpc: RpcNamespace<RPCInstructions>;
  state: StateNamespace<Methods, AnchorState<IDL, Defined>>;
  account: AccountsNamespace<A>;
  transaction: TransactionNamespace<RPCInstructions & Methods>;
  instruction: InstructionNamespace<RPCInstructions & Methods>;
};

export type AnchorError<T extends Idl> = NonNullable<T["errors"]>[number];

type FieldsOfType<I extends IdlTypeDef> = I extends {
  type: IdlTypeDefTyStruct;
}
  ? NonNullable<I["type"]["fields"]>[number]
  : never;

type AnchorTypeDef<I extends IdlTypeDef, Defined> = {
  [F in FieldsOfType<I>["name"]]: DecodeType<
    (FieldsOfType<I> & { name: F })["type"],
    Defined
  >;
};

type AnchorTypeDefs<T extends IdlTypeDef[], Defined> = {
  [K in T[number]["name"]]: AnchorTypeDef<T[number] & { name: K }, Defined>;
};

export type AnchorDefined<
  T extends Idl,
  D = Record<string, never>
> = AnchorTypeDefs<NonNullable<T["types"]>, D>;

export type AnchorAccounts<T extends Idl, Defined> = AnchorTypeDefs<
  NonNullable<T["accounts"]>,
  Defined
>;

export type AnchorState<T extends Idl, Defined> = AnchorTypeDef<
  NonNullable<T["state"]>["struct"],
  Defined
>;

export type AnchorTypes<
  T extends Idl,
  AccountMap = Record<string, never>,
  D = Record<string, never>,
  DEF = AnchorDefined<T, D>
> = {
  Defined: DEF;
  Accounts: AnchorAccounts<T, DEF>;
  State: AnchorState<T, DEF>;
  Error: AnchorError<T>;
  Program: AnchorProgram<T, AccountMap, DEF>;
  Instructions: MakeInstructions<T["instructions"], DEF>;
  Methods: MakeInstructions<NonNullable<T["state"]>["methods"], DEF>;
  Events: AnchorEvents<NonNullable<T["events"]>[number], DEF>;
};

type ErrorMap<T extends Idl> = {
  [K in AnchorError<T>["name"]]: AnchorError<T> & { name: K };
};

/**
 * Generates the error mapping
 * @param idl
 * @returns
 */
export const generateErrorMap = <T extends Idl>(idl: T): ErrorMap<T> => {
  return (idl.errors?.reduce((acc, err) => {
    return {
      ...acc,
      [err.name]: err,
    };
  }, {}) ?? {}) as ErrorMap<T>;
};

type AnchorEvent<T extends IdlEventField, Defined> = {
  [N in T["name"]]: DecodeType<(T & { name: N })["type"], Defined>;
};

type AnchorEvents<T extends IdlEvent, Defined> = {
  [K in T["name"]]: {
    name: K;
    data: AnchorEvent<(T & { name: K })["fields"][number], Defined>;
  };
};
