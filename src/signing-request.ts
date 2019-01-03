/**
 * EOSIO URI Signing Request.
 */

import {Serialize} from 'eosjs'

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

/** Interface that should be iplemented by zlib implementations. */
export interface ZlibProvider {
    /** Deflate data w/o adding zlib header. */
    deflateRaw: (data: Uint8Array) => Uint8Array
    /** Inflate data w/o requring zlib header. */
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
    ctx: {[key: string]: string}
}

/** A 32-byte hex-encoded string representing a chain id. */
export type ChainId = string

/** Chain ID aliases. */
export enum ChainName {
    UNKNOWN = 0,
    EOS = 1,
    TELOS = 2,
}

const ChainIdLookup = new Map<ChainName, ChainId>([
    [ChainName.EOS, 'aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906'],
    [ChainName.TELOS, '4667b205c6838ef70ff7988f6e8257e8be0e1284a2f59699054a018f743b1d11'],
])

export interface SigningRequestCreateArguments {
    /** Single action to create request with. */
    action?: abi.Action
    /** Multiple actions to create request with. */
    actions?: abi.Action[]
    /**
     * Full or partial transaction to create request with.
     * If TAPoS info is omitted it will be filled in when resolving the request.
     */
    transaction?: {actions: abi.Action[], [key: string]: any}
    /** Chain to use, defaults to EOS main-net if omitted. */
    chainId?: ChainId | ChainName
    /** Whether wallet should broadcast tx, defaults to true. */
    broadcast?: boolean
    /**
     * Optional callback URL the signer should hit after
     * broadcasting or signing. Passing a string means background = false.
     */
    callback?: string | {url: string, background: boolean}
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
            // TODO: handle partial transactions, should set default values (options?)
            //       and also set TAPoS values to something invalid that can be detected later
            //       and serialize the actions if they are not already
            data.req = ['transaction', args.transaction]
        } else {
            throw new TypeError('Invalid arguments: Must have exactly one of action, actions or transaction')
        }

        // set the chain id
        if (!args.chainId || typeof args.chainId === 'number') {
            data.chain_id = ['uint8', args.chainId || ChainName.EOS]
        } else {
            // resolve known chain id's to their aliases
            for (const [n, id] of ChainIdLookup) {
                if (id === args.chainId) {
                    data.chain_id = ['uint8', n]
                    break
                }
            }
            if (!data.chain_id) {
                data.chain_id = ['checksum256', args.chainId]
            }
        }

        // set the request options
        data.broadcast = args.broadcast !== undefined ? args.broadcast : true
        if (args.callback) {
            if (typeof args.callback === 'string') {
                data.callback = {url: args.callback, background: false}
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

    /** Creates a signing request from encoded eosio:// uri string. */
    public static from(uri: string, options: SigningRequestEncodingOptions = {}) {
        const [proto, encoded] = uri.split('//')
        if (proto !== 'eosio:' && proto !== 'web+eosio:') {
            throw new Error('Invalid protocol')
        }
        const data = base64u.decode(encoded)
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
     * Encode this request into an eosio:// uri.
     * @argument compress Whether to compress the request data using zlib,
     *                    defaults to true if omitted and zlib is present;
     *                    otherwise false.
     * @returns An eosio:// uri string.
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
        return 'eosio://' + base64u.encode(data)
    }

    /** Resolve request into a transaction that can be signed. */
    public getTransaction() {
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
                    // TODO: options for these?
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
            // TODO: add TAPoS values. require pass in every time or use a "BlockProvider" interface?
        }
        for (const action of tx.actions) {
            // TODO: resolve authorirty name placeholders
            //       is there a name that can be safely used to indicate placeholder
            //       or does the protocol need to be extended to say what name is the placeholder?
        }
        return tx
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
        if (signatures.length === 0) {
            throw new Error('Must have at least one signature to resolve callback')
        }
        const ctx: {[key: string]: string} = {
            sig: signatures[0],
        }
        for (const [n, sig] of signatures.entries()) {
            ctx[`sig${ n }`] = sig
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
    public getChainId() {
        const id = this.data.chain_id
        switch (id[0]) {
            case 'checksum256':
                return id[1]
            case 'uint8':
                if (ChainIdLookup.has(id[1])) {
                    return ChainIdLookup.get(id[1])
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
        const actions = this.getRawActions().map((action) => {
            return this.deserializeAction(action, provider)
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

    /** Helper that resolves the contract abi and deserializes the action. */
    private async deserializeAction(action: abi.Action, provider: AbiProvider) {
        const contractAbi = await provider.getAbi(action.account)
        const contract = getContract(contractAbi)
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
