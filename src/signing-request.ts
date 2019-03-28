/**
 * EOSIO URI Signing Request.
 */

import { Serialize } from 'eosjs'

import * as abi from './abi'
import * as base64u from './base64u'

const AbiTypes = Serialize.getTypesFromAbi(Serialize.createInitialTypes(), abi.data as any)

/** Interface that should be implemented by abi providers. */
export interface AbiProvider {
    /**
     * Return a promise that resolves to an abi object for the given account name,
     * e.g. the result of a rpc call to chain/get_abi.
     */
    getAbi: (account: string) => Promise<any>
}

/** Interface that should be implemented by zlib implementations. */
export interface ZlibProvider {
    /** Deflate data w/o adding zlib header. */
    deflateRaw: (data: Uint8Array) => Uint8Array
    /** Inflate data w/o requiring zlib header. */
    inflateRaw: (data: Uint8Array) => Uint8Array
}

/**
 * Context used to resolve a callback.
 * Compatible with the JSON response from a `push_transaction` call.
 */
export interface CallbackContext {
    /** The resulting transaction id. */
    transaction_id: string // 32-byte hex-encoded checksum
    processed: {
        /** The block id where transaction was included. */
        id: string // 32-byte hex-encoded checksum
        /** The block number where transaction was included. */
        block_num: number,
    }
}

/**
 * Context used to resolve a callback.
 * Compatible with the JSON response from a `push_transaction` call.
 */
export interface ResolvedCallback {
    /** The URL to hit. */
    url: string
    /**
     * Whether to run the request in the background. For a https url this
     * means POST in the background instead of a GET redirect.
     */
    background: boolean
    /**
     * The resolved context, for a https POST this should be included in
     * the request body as JSON.
     */
    ctx: { [key: string]: string }
}

/**
 * Context used to resolve a transaction.
 * Compatible with the JSON response from a `get_block` call.
 */
export interface TransactionContext {
    /** Timestamp expiration will be derived from. */
    timestamp?: string
    /**
     * How many seconds in the future to set expiration when deriving from timestamp.
     * Defaults to 60 seconds if unset.
     */
    expire_seconds?: number
    /** Block number ref_block_num will be derived from. */
    block_num?: number
    /** Reference block number, takes precedence over block_num if both is set. */
    ref_block_num?: number
    /** Reference block prefix. */
    ref_block_prefix?: number
    /** Expiration timestamp, takes precedence over timestamp and expire_seconds if set. */
    expiration?: string
}

/** Chain ID aliases. */
export enum ChainName {
    UNKNOWN = 0,
    EOS = 1,
    TELOS = 2,
    JUNGLE = 3,
    KYLIN = 4,
    WORBLI = 5,
    BOS = 6,
    MEETONE = 7,
    INSIGHTS = 8,
    BEOS = 9,
}

const ChainIdLookup = new Map<abi.ChainAlias, abi.ChainId>([
    [ChainName.EOS, 'aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906'],
    [ChainName.TELOS, '4667b205c6838ef70ff7988f6e8257e8be0e1284a2f59699054a018f743b1d11'],
    [ChainName.JUNGLE, 'e70aaab8997e1dfce58fbfac80cbbb8fecec7b99cf982a9444273cbc64c41473'],
    [ChainName.KYLIN, '5fff1dae8dc8e2fc4d5b23b2c7665c97f9e9d8edf2b6485a86ba311c25639191'],
    [ChainName.WORBLI, '73647cde120091e0a4b85bced2f3cfdb3041e266cbbe95cee59b73235a1b3b6f'],
    [ChainName.BOS, 'd5a3d18fbb3c084e3b1f3fa98c21014b5f3db536cc15d08f9f6479517c6a3d86'],
    [ChainName.MEETONE, 'cfe6486a83bad4962f232d48003b1824ab5665c36778141034d75e57b956e422'],
    [ChainName.INSIGHTS, 'b042025541e25a472bffde2d62edd457b7e70cee943412b1ea0f044f88591664'],
    [ChainName.BEOS, 'b912d19a6abd2b1b05611ae5be473355d64d95aeff0c09bedc8c166cd6468fe4'],
])

/**
 * The placeholder name: `............1` aka `uint64(1)`.
 * If used in action data will be resolved to current signer.
 * If used in as an authorization permission will be resolved to
 * the signers permission level.
 *
 * Example action:
 * ```
 * { account: "eosio.token",
 *   name: "transfer",
 *   authorization: [{actor: "............1", permission: "............1"}],
 *   data: {
 *     from: "............1",
 *     to: "bar",
 *     quantity: "42.0000 EOS",
 *     memo: "Don't panic" }}
 * ```
 * When signed by `foo@active` would resolve to:
 * ```
 * { account: "eosio.token",
 *   name: "transfer",
 *   authorization: [{actor: "foo", permission: "active"}],
 *   data: {
 *     from: "foo",
 *     to: "bar",
 *     quantity: "42.0000 EOS",
 *     memo: "Don't panic" }}
 * ```
 */
export const PlaceholderName = '............1' // aka uint64(1)

export interface SigningRequestCreateArguments {
    /** Single action to create request with. */
    action?: abi.Action
    /** Multiple actions to create request with. */
    actions?: abi.Action[]
    /**
     * Full or partial transaction to create request with.
     * If TAPoS info is omitted it will be filled in when resolving the request.
     */
    transaction?: { actions: abi.Action[], [key: string]: any }
    /** Chain to use, defaults to EOS main-net if omitted. */
    chainId?: abi.ChainAlias | abi.ChainAlias
    /** Whether wallet should broadcast tx, defaults to true. */
    broadcast?: boolean
    /**
     * Optional callback URL the signer should hit after
     * broadcasting or signing. Passing a string means background = false.
     */
    callback?: string | { url: string, background: boolean }
}

export interface SigningRequestEncodingOptions {
    /** UTF-8 text encoder, required when using node.js. */
    textEncoder?: TextEncoder
    /** UTF-8 text decoder, required when using node.js. */
    textDecoder?: TextDecoder
    /** Optional zlib, if provided the request will be compressed when encoding. */
    zlib?: ZlibProvider
    /** Abi provider, required if the arguments contain un-encoded actions. */
    abiProvider?: AbiProvider
}

export class SigningRequest {
    public static type = AbiTypes.get('signing_request')!

    /** Create a new signing request. */
    public static async create(args: SigningRequestCreateArguments, options: SigningRequestEncodingOptions = {}) {
        const textEncoder = options.textEncoder || new TextEncoder()
        const textDecoder = options.textDecoder || new TextDecoder()

        async function serializeAction(action: abi.Action) {
            if (typeof action.data === 'string') {
                return action
            }
            if (!options.abiProvider) {
                throw new Error('Missing abi provider')
            }
            const contractAbi = await options.abiProvider.getAbi(action.account)
            const contract = getContract(contractAbi)
            return Serialize.serializeAction(
                contract,
                action.account, action.name, action.authorization, action.data,
                textEncoder, textDecoder,
            )
        }

        const data: any = {}

        // set the request data
        if (args.action && !args.actions && !args.transaction) {
            data.req = ['action', await serializeAction(args.action)]
        } else if (args.actions && !args.action && !args.transaction) {
            data.req = ['action[]', await Promise.all(args.actions.map(serializeAction))]
        } else if (args.transaction && !args.action && !args.actions) {
            const tx = args.transaction
            // set default values if missing
            if (tx.expiration === undefined) { tx.expiration = '1970-01-01T00:00:00.000' }
            if (tx.ref_block_num === undefined) { tx.ref_block_num = 0 }
            if (tx.ref_block_prefix === undefined) { tx.ref_block_prefix = 0 }
            if (tx.context_free_actions === undefined) { tx.context_free_actions = [] }
            if (tx.transaction_extensions === undefined) { tx.transaction_extensions = [] }
            if (tx.delay_sec === undefined) { tx.delay_sec = 0 }
            if (tx.max_cpu_usage_ms === undefined) { tx.max_cpu_usage_ms = 0 }
            if (tx.max_net_usage_words === undefined) { tx.max_net_usage_words = 0 }
            // encode actions if needed
            tx.actions = await Promise.all(tx.actions.map(serializeAction))
            data.req = ['transaction', tx]
        } else {
            throw new TypeError('Invalid arguments: Must have exactly one of action, actions or transaction')
        }

        // set the chain id
        if (!args.chainId || typeof args.chainId === 'number') {
            data.chain_id = ['chain_alias', args.chainId || ChainName.EOS]
        } else {
            // resolve known chain id's to their aliases
            for (const [n, id] of ChainIdLookup) {
                if (id === args.chainId) {
                    data.chain_id = ['chain_alias', n]
                    break
                }
            }
            if (!data.chain_id) {
                data.chain_id = ['chain_id', args.chainId]
            }
        }

        // set the request options
        data.broadcast = args.broadcast !== undefined ? args.broadcast : true
        if (args.callback) {
            if (typeof args.callback === 'string') {
                data.callback = { url: args.callback, background: false }
            } else {
                data.callback = args.callback
            }
        } else {
            data.callback = null
        }

        return new SigningRequest(
            1, data, textEncoder, textDecoder, options.zlib, options.abiProvider,
        )
    }

    /** Creates a signing request from encoded `eosio:` uri string. */
    public static from(uri: string, options: SigningRequestEncodingOptions = {}) {
        const [scheme, path] = uri.split(':')
        if (scheme !== 'eosio' && scheme !== 'web+eosio') {
            throw new Error('Invalid scheme')
        }
        const data = base64u.decode(path)
        const header = data[0]
        const version = header & ~(1 << 7)
        if (version !== 1) {
            throw new Error('Invalid protocol version')
        }
        let array = data.slice(1)
        if ((header & 1 << 7) !== 0) {
            if (!options.zlib) {
                throw new Error('Compressed URI needs zlib')
            }
            array = options.zlib.inflateRaw(array)
        }
        const textEncoder = options.textEncoder || new TextEncoder()
        const textDecoder = options.textDecoder || new TextDecoder()
        const buffer = new Serialize.SerialBuffer({
            textEncoder, textDecoder, array,
        })
        const req = SigningRequest.type.deserialize(buffer)
        return new SigningRequest(
            version, req, textEncoder, textDecoder, options.zlib, options.abiProvider,
        )
    }

    /**
     * Pattern used to resolve callback URLs.
     * sig(N) = signature string, always present
     *          where N signifies the signature 0-index if there are multiple
     *          omitting the N is equivalent to sig0
     * bi = block id string, present if broadcast
     * bn = block number, present if broadcast
     * tx = transaction id string, present if broadcast
     */
    private static CALLBACK_PATTERN = /({{(sig\d*|bi|bn|tx)}})/g

    /** The signing request version. */
    public version: number

    /** The raw signing request data. */
    public data: abi.SigningRequest

    private textEncoder: TextEncoder
    private textDecoder: TextDecoder
    private zlib?: ZlibProvider
    private abiProvider?: AbiProvider

    /**
     * Create a new signing request.
     * Normally not used directly, see the `create` and `from` class methods.
     */
    constructor(
        version: number,
        data: abi.SigningRequest,
        textEncoder: TextEncoder,
        textDecoder: TextDecoder,
        zlib?: ZlibProvider,
        abiProvider?: AbiProvider,
    ) {
        this.version = version
        this.data = data
        this.textEncoder = textEncoder
        this.textDecoder = textDecoder
        this.zlib = zlib
        this.abiProvider = abiProvider
    }

    /**
     * Encode this request into an `eosio:` uri.
     * @argument compress Whether to compress the request data using zlib,
     *                    defaults to true if omitted and zlib is present;
     *                    otherwise false.
     * @returns An `eosio:` uri string.
     */
    public encode(compress?: boolean): string {
        const shouldCompress = compress !== undefined ? compress : this.zlib !== undefined
        if (shouldCompress && this.zlib === undefined) {
            throw new Error('Need zlib to compress')
        }
        const buffer = new Serialize.SerialBuffer({
            textEncoder: this.textEncoder,
            textDecoder: this.textDecoder,
        })
        SigningRequest.type.serialize(buffer, this.data)
        let header = this.version
        let array = buffer.asUint8Array()
        if (shouldCompress) {
            header |= 1 << 7
            array = this.zlib!.deflateRaw(array)
        }
        const data = new Uint8Array(array.byteLength + 1)
        data[0] = header
        data.set(array, 1)
        return 'eosio:' + base64u.encode(data)
    }

    /**
     * Resolve request into a transaction that can be signed.
     * @param signer The auth that will sign the transaction, in the format
     *               `account@level` or {actor: 'account', permission: 'level'}.
     * @param ctx The TAPoS values to use when resolving the transaction.
     * @param abiProvider The abi provider to use to decode action data,
     *                    will use the instance abiProvider if unset.
     */
    public async getTransaction(
        signer: string | abi.PermissionLevel,
        ctx: TransactionContext,
        abiProvider?: AbiProvider,
    ) {
        if (typeof signer === 'string') {
            const [actor, permission] = signer.split('@')
            signer = { actor, permission }
        }
        if (
            typeof signer !== 'object' ||
            typeof signer.actor !== 'string' ||
            typeof signer.permission !== 'string'
        ) {
            throw new TypeError('Invalid signer')
        }
        const req = this.data.req
        let tx: abi.Transaction
        switch (req[0]) {
            case 'action':
            case 'action[]':
                tx = {
                    actions: req[0] === 'action' ? [req[1]] : req[1],
                    context_free_actions: [],
                    transaction_extensions: [],
                    expiration: '1970-01-01T00:00:00.000',
                    ref_block_num: 0,
                    ref_block_prefix: 0,
                    max_cpu_usage_ms: 0,
                    max_net_usage_words: 0,
                    delay_sec: 0,
                }
                break
            case 'transaction':
                tx = req[1]
                break
            default:
                throw new Error('Invalid signing request data')
        }
        if (tx.expiration === '1970-01-01T00:00:00.000' && tx.ref_block_num === 0 && tx.ref_block_prefix === 0) {
            if (
                ctx.expiration !== undefined &&
                ctx.ref_block_num !== undefined &&
                ctx.ref_block_prefix !== undefined
            ) {
                tx.expiration = ctx.expiration
                tx.ref_block_num = ctx.ref_block_num
                tx.ref_block_prefix = ctx.ref_block_prefix
            } else if (
                ctx.block_num !== undefined &&
                ctx.ref_block_prefix !== undefined &&
                ctx.timestamp !== undefined
            ) {
                const header = Serialize.transactionHeader(ctx as any, ctx.expire_seconds || 60)
                tx.expiration = header.expiration
                tx.ref_block_num = header.ref_block_num
                tx.ref_block_prefix = header.ref_block_prefix
            } else {
                throw new Error('Invalid transaction context, need either a reference block or explicit TAPoS values')
            }
        }
        const provider = abiProvider || this.abiProvider
        if (!provider) {
            throw new Error('Missing ABI provider')
        }
        const actions = await Promise.all(tx.actions.map(async (rawAction) => {
            const contractAbi = await provider.getAbi(rawAction.account)
            const contract = getContract(contractAbi)
            // hook into eosjs name decoder and return the signing account if we encounter the placeholder
            // this is fine because getContract re-creates the initial types each time
            contract.types.get('name')!.deserialize = (buffer: Serialize.SerialBuffer) => {
                const name = buffer.getName()
                if (name === PlaceholderName) {
                    return (signer as abi.PermissionLevel).actor
                } else {
                    return name
                }
            }
            const action = this.deserializeAction(contract, rawAction)
            action.authorization = action.authorization.map((val) => {
                const auth = { ...val }
                if (auth.actor === PlaceholderName) {
                    auth.actor = (signer as abi.PermissionLevel).actor
                }
                if (auth.permission === PlaceholderName) {
                    auth.permission = (signer as abi.PermissionLevel).permission
                }
                return auth
            })
            return action
        }))
        return { ...tx, actions }
    }

    /**
     * Resolve callback.
     * @argument signatures The signature(s) of the resolved transaction.
     * @argument context The result of the push_transaction call if transaction was broadcast.
     * @returns An object containing the resolved URL and context or null if no callback is present.
     */
    public getCallback(signatures: string | string[], context?: CallbackContext): ResolvedCallback | null {
        const callback = this.data.callback
        if (!callback) { return null }
        if (this.data.broadcast && !context) {
            throw new Error('Must provide callback context for broadcast request')
        }
        if (typeof signatures === 'string') {
            signatures = [signatures]
        }
        if (!signatures || signatures.length === 0) {
            throw new Error('Must have at least one signature to resolve callback')
        }
        const ctx: { [key: string]: string } = {
            sig: signatures[0],
        }
        for (const [n, sig] of signatures.entries()) {
            ctx[`sig${n}`] = sig
        }
        if (context) {
            ctx.tx = context.transaction_id
            ctx.bi = context.processed.id
            ctx.bn = String(context.processed.block_num)
        }
        const url = callback.url.replace(SigningRequest.CALLBACK_PATTERN, (_1, _2, m) => {
            return ctx[m] || ''
        })
        return {
            background: callback.background,
            ctx,
            url,
        }
    }

    /**
     * Get the id of the chain where this request is valid.
     * @returns The 32-byte chain id as hex encoded string.
     */
    public getChainId(): abi.ChainId {
        const id = this.data.chain_id
        switch (id[0]) {
            case 'chain_id':
                return id[1]
            case 'chain_alias':
                if (ChainIdLookup.has(id[1])) {
                    return ChainIdLookup.get(id[1])!
                } else {
                    throw new Error('Unknown chain id alias')
                }
            default:
                throw new Error('Invalid signing request data')
        }
    }

    /** Return the actions in this request with their data decoded. */
    public async getActions(abiProvider?: AbiProvider) {
        const provider = abiProvider || this.abiProvider
        if (!provider) {
            throw new Error('Missing ABI provider')
        }
        const actions = this.getRawActions().map(async (action) => {
            const contractAbi = await provider.getAbi(action.account)
            const contract = getContract(contractAbi)
            return this.deserializeAction(contract, action)
        })
        return Promise.all(actions)
    }

    /** Return the actions in this request with action data encoded. */
    public getRawActions() {
        const req = this.data.req
        switch (req[0]) {
            case 'action':
                return [req[1]]
            case 'action[]':
                return req[1]
            case 'transaction':
                return req[1].actions
            default:
                throw new Error('Invalid signing request data')
        }
    }

    // Convenience methods.
    public toString() { return this.encode() }
    public toJSON() { return this.encode() }

    /** Helper that decodes the action data using provided contract. */
    private deserializeAction(contract: Serialize.Contract, action: abi.Action) {
        return Serialize.deserializeAction(
            contract,
            action.account, action.name, action.authorization, action.data as any,
            this.textEncoder, this.textDecoder,
        )
    }
}

/** Internal helper that creates a contract representation from an abi for the eosjs serializer. */
function getContract(contractAbi: any): Serialize.Contract {
    const types = Serialize.getTypesFromAbi(Serialize.createInitialTypes(), contractAbi)
    const actions = new Map<string, Serialize.Type>()
    for (const { name, type } of contractAbi.actions) {
        actions.set(name, Serialize.getType(types, type))
    }
    return { types, actions }
}
