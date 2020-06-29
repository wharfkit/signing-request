/**
 * EOSIO Signing Request (ESR).
 */

import {
    ABI,
    ABIDecoder,
    ABIEncoder,
    Action,
    Bytes,
    BytesType,
    ChecksumType,
    Name,
    NameType,
    PermissionLevel,
    PermissionLevelType,
    Serializer,
    TimePointSec,
    Transaction,
    UInt16,
    UInt32,
} from 'eosio-core'

import {Identity, InfoPair, RequestData, RequestFlags, RequestSignature} from './abi'
import * as base64u from './base64u'
import {ChainId, ChainIdVariant, ChainName} from './chain-id'

const ProtocolVersion = 2

const identityAbi = (() => {
    const abi = Serializer.synthesize(Identity)
    abi.actions = [{name: 'identity', type: 'identity', ricardian_contract: ''}]
    return abi
})() // fixme make this lazy

interface AnyAction {
    account: NameType
    name: NameType
    authorization: PermissionLevelType[]
    data: any
}

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

/** Interface that should be implemented by signature providers. */
export interface SignatureProvider {
    /** Sign 32-byte hex-encoded message and return signer name and signature string. */
    sign: (message: string) => {signer: string; signature: string}
}

/**
 * The callback payload sent to background callbacks.
 */
export interface CallbackPayload {
    /** The first signature. */
    sig: string
    /** Transaction ID as HEX-encoded string. */
    tx: string
    /** Block number hint (only present if transaction was broadcast). */
    bn?: string
    /** Signer authority, aka account name. */
    sa: string
    /** Signer permission, e.g. "active". */
    sp: string
    /** Reference block num used when resolving request. */
    rbn: string
    /** Reference block id used when resolving request. */
    rid: string
    /** The originating signing request packed as a uri string. */
    req: string
    /** Expiration time used when resolving request. */
    ex: string
    /** All signatures 0-indexed as `sig0`, `sig1`, etc. */
    [sig0: string]: string | undefined
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
     * The callback payload as a object that should be encoded to JSON
     * and POSTed to background callbacks.
     */
    payload: CallbackPayload
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

/** Placeholder that will resolve to signer permission name. */
export const PlaceholderPermission = '............2' // aka uint64(2)

export const PlaceholderAuth = {
    actor: PlaceholderName,
    permission: PlaceholderPermission,
}

export type CallbackType = string | {url: string; background: boolean}

export interface SigningRequestCreateArguments {
    /** Single action to create request with. */
    action?: AnyAction
    /** Multiple actions to create request with. */
    actions?: AnyAction[]
    /**
     * Full or partial transaction to create request with.
     * If TAPoS info is omitted it will be filled in when resolving the request.
     */
    transaction?: {actions: AnyAction[]; [key: string]: any}
    /** Create an identity request. */
    identity?: {permission?: PermissionLevelType}
    /** Chain to use, defaults to EOS main-net if omitted. */
    chainId?: string | number
    /** Whether wallet should broadcast tx, defaults to true. */
    broadcast?: boolean
    /**
     * Optional callback URL the signer should hit after
     * broadcasting or signing. Passing a string means background = false.
     */
    callback?: CallbackType
    /** Optional metadata to pass along with the request. */
    info?: {[key: string]: BytesType}
}

export interface SigningRequestCreateIdentityArguments {
    /**
     * Callback where the identity should be delivered.
     */
    callback: CallbackType
    /** Chain to use, defaults to EOS if omitted. */
    chainId?: string | number
    /**
     * Requested account name of identity.
     * Defaults to placeholder (any identity) if omitted.
     */
    account?: string
    /**
     * Requested account permission.
     * Defaults to placeholder (any permission) if omitted.
     */
    permission?: string
    /** Optional metadata to pass along with the request. */
    info?: {[key: string]: string | Uint8Array}
}

export interface SigningRequestEncodingOptions {
    /** UTF-8 text encoder, required when using node.js. */
    textEncoder?: any
    /** UTF-8 text decoder, required when using node.js. */
    textDecoder?: any
    /** Optional zlib, if provided the request will be compressed when encoding. */
    zlib?: ZlibProvider
    /** Abi provider, required if the arguments contain un-encoded actions. */
    abiProvider?: AbiProvider
    /** Optional signature provider, will be used to create a request signature if provided. */
    signatureProvider?: SignatureProvider
}

export type AbiMap = Map<string, any>

export class SigningRequest {
    /** Create a new signing request. */
    public static async create(
        args: SigningRequestCreateArguments,
        options: SigningRequestEncodingOptions = {}
    ) {
        const textEncoder = options.textEncoder || new TextEncoder()
        const textDecoder = options.textDecoder || new TextDecoder()
        const data: any = {}

        const serialize = (action: AnyAction) => {
            return serializeAction(action, options.abiProvider)
        }

        // set the request data
        if (args.identity !== undefined) {
            data.req = ['identity', args.identity]
        } else if (args.action && !args.actions && !args.transaction) {
            data.req = ['action', await serialize(args.action)]
        } else if (args.actions && !args.action && !args.transaction) {
            if (args.actions.length === 1) {
                data.req = ['action', await serialize(args.actions[0])]
            } else {
                data.req = ['action[]', await Promise.all(args.actions.map(serialize))]
            }
        } else if (args.transaction && !args.action && !args.actions) {
            const tx = args.transaction
            // set default values if missing
            if (tx.expiration === undefined) {
                tx.expiration = '1970-01-01T00:00:00.000'
            }
            if (tx.ref_block_num === undefined) {
                tx.ref_block_num = 0
            }
            if (tx.ref_block_prefix === undefined) {
                tx.ref_block_prefix = 0
            }
            if (tx.context_free_actions === undefined) {
                tx.context_free_actions = []
            }
            if (tx.transaction_extensions === undefined) {
                tx.transaction_extensions = []
            }
            if (tx.delay_sec === undefined) {
                tx.delay_sec = 0
            }
            if (tx.max_cpu_usage_ms === undefined) {
                tx.max_cpu_usage_ms = 0
            }
            if (tx.max_net_usage_words === undefined) {
                tx.max_net_usage_words = 0
            }
            // encode actions if needed
            tx.actions = await Promise.all(tx.actions.map(serialize))
            data.req = ['transaction', tx]
        } else {
            throw new TypeError(
                'Invalid arguments: Must have exactly one of action, actions or transaction'
            )
        }

        // set the chain id
        data.chain_id = ChainIdVariant.from(
            args.chainId || ChainName.EOS,
            typeof args.chainId === 'string' ? 'chain_id' : 'chain_alias'
        )
        data.flags = 0

        const broadcast = args.broadcast !== undefined ? args.broadcast : true
        if (broadcast) {
            data.flags |= RequestFlags.broadcast
        }
        if (typeof args.callback === 'string') {
            data.callback = args.callback
        } else if (typeof args.callback === 'object') {
            data.callback = args.callback.url
            if (args.callback.background) {
                data.flags |= RequestFlags.background
            }
        } else {
            data.callback = ''
        }

        data.info = []
        if (typeof args.info === 'object') {
            for (const key in args.info) {
                if (args.info.hasOwnProperty(key)) {
                    let value = args.info[key]
                    if (typeof key !== 'string') {
                        throw new Error('Invalid info dict, keys must be strings')
                    }
                    if (typeof value === 'string') {
                        value = textEncoder.encode(value)
                    }
                    data.info.push({key, value})
                }
            }
        }
        const req = new SigningRequest(
            ProtocolVersion,
            RequestData.from(data),
            options.zlib,
            options.abiProvider
        )

        // sign the request if given a signature provider
        if (options.signatureProvider) {
            req.sign(options.signatureProvider)
        }

        return req
    }

    /** Creates an identity request. */
    public static identity(
        args: SigningRequestCreateIdentityArguments,
        options: SigningRequestEncodingOptions = {}
    ) {
        let permission: PermissionLevelType | undefined = {
            actor: args.account || PlaceholderName,
            permission: args.permission || PlaceholderPermission,
        }
        if (
            permission.actor === PlaceholderName &&
            permission.permission === PlaceholderPermission
        ) {
            permission = undefined
        }
        return this.create(
            {
                identity: {
                    permission,
                },
                broadcast: false,
                callback: args.callback,
                info: args.info,
            },
            options
        )
    }

    /**
     * Create a request from a chain id and serialized transaction.
     * @param chainId The chain id where the transaction is valid.
     * @param serializedTransaction The serialized transaction.
     * @param options Creation options.
     */
    public static fromTransaction(
        chainId: ChecksumType,
        serializedTransaction: BytesType,
        options: SigningRequestEncodingOptions = {}
    ) {
        const id = ChainId.from(chainId)
        serializedTransaction = Bytes.from(serializedTransaction)

        const encoder = new ABIEncoder()
        encoder.writeUint8(2) // header
        encoder.writeBytes(Serializer.encode({object: id.chainVariant}).array)
        encoder.writeUint8(2) // transaction variant
        encoder.writeBytes(Bytes.from(serializedTransaction).array)
        encoder.writeUint8(RequestFlags.broadcast)
        encoder.writeUint8(0) // callback
        encoder.writeUint8(0) // info

        return SigningRequest.fromData(encoder.getData(), options)
    }

    /** Creates a signing request from encoded `esr:` uri string. */
    public static from(uri: string, options: SigningRequestEncodingOptions = {}) {
        if (typeof uri !== 'string') {
            throw new Error('Invalid request uri')
        }
        const [scheme, path] = uri.split(':')
        if (scheme !== 'esr' && scheme !== 'web+esr') {
            throw new Error('Invalid scheme')
        }
        const data = base64u.decode(path.startsWith('//') ? path.slice(2) : path)
        return SigningRequest.fromData(data, options)
    }

    public static fromData(data: BytesType, options: SigningRequestEncodingOptions = {}) {
        data = Bytes.from(data)
        const header = data.array[0]
        const version = header & ~(1 << 7)
        if (version !== ProtocolVersion) {
            throw new Error('Unsupported protocol version')
        }
        let payload = data.droppingFirst(1)
        if ((header & (1 << 7)) !== 0) {
            if (!options.zlib) {
                throw new Error('Compressed URI needs zlib')
            }
            payload = Bytes.from(options.zlib.inflateRaw(payload.array))
        }
        const decoder = new ABIDecoder(payload.array)
        const req = Serializer.decode({data: decoder, type: RequestData}) as RequestData
        let sig: RequestSignature | undefined
        if (decoder.canRead(1)) {
            sig = Serializer.decode({data: decoder, type: RequestSignature}) as RequestSignature
        }
        return new SigningRequest(version, req, options.zlib, options.abiProvider, sig)
    }

    /** The signing request version. */
    public version: number

    /** The raw signing request data. */
    public data: RequestData

    /** The request signature. */
    public signature?: RequestSignature

    private zlib?: ZlibProvider
    private abiProvider?: AbiProvider

    /**
     * Create a new signing request.
     * Normally not used directly, see the `create` and `from` class methods.
     */
    constructor(
        version: number,
        data: RequestData,
        zlib?: ZlibProvider,
        abiProvider?: AbiProvider,
        signature?: RequestSignature
    ) {
        if (data.flags.broadcast && data.req.toJSON()[0] === 'identity') {
            throw new Error('Invalid request (identity request cannot be broadcast)')
        }
        if (!data.flags.broadcast && data.callback.length === 0) {
            throw new Error('Invalid request (nothing to do, no broadcast or callback set)')
        }
        this.version = version
        this.data = data
        this.zlib = zlib
        this.abiProvider = abiProvider
        this.signature = signature
    }

    /**
     * Sign the request, mutating.
     * @param signatureProvider The signature provider that provides a signature for the signer.
     */
    public sign(signatureProvider: SignatureProvider) {
        const message = this.getSignatureDigest()
        this.signature = RequestSignature.from(signatureProvider.sign(message.hexString))
    }

    /**
     * Get the signature digest for this request.
     */
    public getSignatureDigest() {
        // protocol version + utf8 "request"
        const prefix = [this.version, 0x72, 0x65, 0x71, 0x75, 0x65, 0x73, 0x74]
        return new Bytes().appending(prefix).appending(this.getData()).sha256Digest
    }

    /**
     * Set the signature data for this request, mutating.
     * @param signer Account name of signer.
     * @param signature The signature string.
     */
    public setSignature(signer: string, signature: string) {
        this.signature = RequestSignature.from({signer, signature})
    }

    /**
     * Set the request callback, mutating.
     * @param url Where the callback should be sent.
     * @param background Whether the callback should be sent in the background.
     */
    public setCallback(url: string, background: boolean) {
        this.data.callback = url
        this.data.flags.background = background
    }

    /**
     * Set broadcast flag.
     * @param broadcast Whether the transaction should be broadcast by receiver.
     */
    public setBroadcast(broadcast: boolean) {
        this.data.flags.broadcast = broadcast
    }

    /**
     * Encode this request into an `esr:` uri.
     * @argument compress Whether to compress the request data using zlib,
     *                    defaults to true if omitted and zlib is present;
     *                    otherwise false.
     * @argument slashes Whether add slashes after the protocol scheme, i.e. `esr://`.
     *                   Defaults to true.
     * @returns An esr uri string.
     */
    public encode(compress?: boolean, slashes?: boolean): string {
        const shouldCompress = compress !== undefined ? compress : this.zlib !== undefined
        if (shouldCompress && this.zlib === undefined) {
            throw new Error('Need zlib to compress')
        }
        let header = this.version
        const data = this.getData()
        const sigData = this.getSignatureData()
        let array = new Uint8Array(data.byteLength + sigData.byteLength)
        array.set(data, 0)
        array.set(sigData, data.byteLength)
        if (shouldCompress) {
            const deflated = this.zlib!.deflateRaw(array)
            if (array.byteLength > deflated.byteLength) {
                header |= 1 << 7
                array = deflated
            }
        }
        const out = new Uint8Array(1 + array.byteLength)
        out[0] = header
        out.set(array, 1)
        let scheme = 'esr:'
        if (slashes !== false) {
            scheme += '//'
        }
        return scheme + base64u.encode(out)
    }

    /** Get the request data without header or signature. */
    public getData(): Uint8Array {
        return Serializer.encode({object: this.data}).array
    }

    /** Get signature data, returns an empty array if request is not signed. */
    public getSignatureData(): Uint8Array {
        if (!this.signature) {
            return new Uint8Array(0)
        }
        return Serializer.encode({object: this.signature}).array
    }

    /** ABI definitions required to resolve request. */
    public getRequiredAbis() {
        return this.getRawActions()
            .filter((action) => !isIdentity(action))
            .map((action) => action.account)
            .filter((value, index, self) => self.indexOf(value) === index)
    }

    /** Whether TaPoS values are required to resolve request. */
    public requiresTapos() {
        const tx = this.getRawTransaction()
        return !this.isIdentity() && !hasTapos(tx)
    }

    /** Resolve required ABI definitions. */
    public async fetchAbis(abiProvider?: AbiProvider): Promise<AbiMap> {
        const provider = abiProvider || this.abiProvider
        if (!provider) {
            throw new Error('Missing ABI provider')
        }
        const abis = new Map<string, any>()
        await Promise.all(
            this.getRequiredAbis().map(async (account) => {
                abis.set(account.toString(), await provider.getAbi(account.toString()))
            })
        )
        return abis
    }

    /**
     * Decode raw actions actions to object representations.
     * @param abis ABI defenitions required to decode all actions.
     * @param signer Placeholders in actions will be resolved to signer if set.
     */
    public resolveActions(abis: AbiMap, signer?: PermissionLevelType): AnyAction[] {
        return this.getRawActions().map((rawAction) => {
            let abi: ABI
            if (isIdentity(rawAction)) {
                abi = identityAbi
            } else {
                const rawAbi = abis.get(rawAction.account.toString())
                if (!rawAbi) {
                    throw new Error(`Missing ABI definition for ${rawAction.account}`)
                }
                abi = ABI.from(rawAbi)
            }
            const type = abi.getActionType(rawAction.name)
            if (!type) {
                throw new Error(
                    `Missing type for action ${rawAction.account}:${rawAction.name} in ABI`
                )
            }
            let data = rawAction.decodeData(type, abi)
            let authorization = rawAction.authorization
            if (signer) {
                const signerPerm = PermissionLevel.from(signer)
                const resolve = (value: any): any => {
                    if (value instanceof Name) {
                        switch (value.toString()) {
                            case PlaceholderName:
                                return signerPerm.actor
                            case PlaceholderPermission:
                                return signerPerm.permission
                            default:
                                return value
                        }
                    } else if (Array.isArray(value)) {
                        return value.map(resolve)
                    } else if (typeof value === 'object' && value !== null) {
                        for (const key of Object.keys(value)) {
                            value[key] = resolve(value[key])
                        }
                        return value
                    } else {
                        return value
                    }
                }
                data = resolve(data)
                authorization = authorization.map((auth) => {
                    let {actor, permission} = auth
                    if (actor.toString() === PlaceholderName) {
                        actor = signerPerm.actor
                    }
                    if (permission.toString() === PlaceholderPermission) {
                        permission = signerPerm.permission
                    }
                    // backwards compatibility, actor placeholder will also resolve to permission when used in auth
                    if (permission.toString() === PlaceholderName) {
                        permission = signerPerm.permission
                    }
                    return PermissionLevel.from({actor, permission})
                })
            }
            return {
                ...rawAction,
                authorization,
                data,
            }
        })
    }

    public resolveTransaction(
        abis: AbiMap,
        signer: PermissionLevelType,
        ctx: TransactionContext = {}
    ) {
        const tx = this.getRawTransaction()
        if (!this.isIdentity() && !hasTapos(tx)) {
            if (
                ctx.expiration !== undefined &&
                ctx.ref_block_num !== undefined &&
                ctx.ref_block_prefix !== undefined
            ) {
                tx.expiration = TimePointSec.from(ctx.expiration)
                tx.ref_block_num = UInt16.from(ctx.ref_block_num)
                tx.ref_block_prefix = UInt32.from(ctx.ref_block_prefix)
            } else if (
                ctx.block_num !== undefined &&
                ctx.ref_block_prefix !== undefined &&
                ctx.timestamp !== undefined
            ) {
                const sec = ctx.expire_seconds !== undefined ? ctx.expire_seconds : 60
                const expMs = TimePointSec.from(ctx.timestamp).toMilliseconds() + sec * 1000
                tx.expiration = TimePointSec.fromMilliseconds(expMs)
                tx.ref_block_num = UInt16.from(ctx.block_num & 0xffff)
                tx.ref_block_prefix = UInt32.from(ctx.ref_block_prefix)
            } else {
                throw new Error(
                    'Invalid transaction context, need either a reference block or explicit TaPoS values'
                )
            }
        }
        const actions = this.resolveActions(abis, signer)
        return {...tx, actions}
    }

    public resolve(abis: AbiMap, signer: PermissionLevelType, ctx: TransactionContext = {}) {
        const tx = this.resolveTransaction(abis, signer, ctx)
        const actions = tx.actions.map((action) => {
            let contractAbi: any
            if (isIdentity(action)) {
                contractAbi = identityAbi
            } else {
                contractAbi = abis.get(action.account.toString())
            }
            if (!contractAbi) {
                throw new Error(`Missing ABI definition for ${action.account}`)
            }
            const abi = ABI.from(contractAbi)
            const type = abi.getActionType(action.name)
            const data = Serializer.encode({object: action.data, type, abi})
            return Action.from({...action, data})
        })
        const transaction = Transaction.from({...tx, actions})
        const serialized = Serializer.encode({object: transaction})
        const serializedTransaction = serialized.array
        return new ResolvedSigningRequest(
            this,
            PermissionLevel.from(signer),
            tx,
            serializedTransaction
        )
    }

    /**
     * Get the id of the chain where this request is valid.
     * @returns The 32-byte chain id as hex encoded string.
     */
    public getChainId(): ChainId {
        return this.data.chain_id.chainId
    }

    /** Return the actions in this request with action data encoded. */
    public getRawActions(): Action[] {
        const req = this.data.req
        switch (req.variantName) {
            case 'action':
                return [req.value as Action]
            case 'action[]':
                return req.value as Action[]
            case 'identity':
                const id = req.value as Identity
                let data: BytesType = '0101000000000000000200000000000000' // placeholder permission
                let authorization: PermissionLevelType[] = [PlaceholderAuth]
                if (id.permission) {
                    data = Serializer.encode({object: id})
                    authorization = [id.permission]
                }
                return [
                    Action.from({
                        account: '',
                        name: 'identity',
                        authorization,
                        data,
                    }),
                ]
            case 'transaction':
                return (req.value as Transaction).actions
            default:
                throw new Error('Invalid signing request data')
        }
    }

    /** Unresolved transaction. */
    public getRawTransaction(): Transaction {
        const req = this.data.req
        switch (req.variantName) {
            case 'transaction':
                return Transaction.from({...(req.value as Transaction)})
            case 'action':
            case 'action[]':
            case 'identity':
                return Transaction.from({
                    actions: this.getRawActions(),
                    context_free_actions: [],
                    transaction_extensions: [],
                    expiration: '1970-01-01T00:00:00.000',
                    ref_block_num: 0,
                    ref_block_prefix: 0,
                    max_cpu_usage_ms: 0,
                    max_net_usage_words: 0,
                    delay_sec: 0,
                })
            default:
                throw new Error('Invalid signing request data')
        }
    }

    /** Whether the request is an identity request. */
    public isIdentity(): boolean {
        return this.data.req.variantName === 'identity'
    }

    /** Whether the request should be broadcast by signer. */
    public shouldBroadcast(): boolean {
        if (this.isIdentity()) {
            return false
        }
        return this.data.flags.broadcast
    }

    /**
     * Present if the request is an identity request and requests a specific account.
     * @note This returns `nil` unless a specific identity has been requested,
     *       use `isIdentity` to check id requests.
     */
    public getIdentity(): string | null {
        if (!this.isIdentity()) {
            return null
        }
        const id = this.data.req.value as Identity
        if (id.permission && id.permission.actor.toString() !== PlaceholderName) {
            return id.permission.actor.toString()
        }
        return null
    }

    /**
     * Present if the request is an identity request and requests a specific permission.
     * @note This returns `nil` unless a specific permission has been requested,
     *       use `isIdentity` to check id requests.
     */
    public getIdentityPermission(): string | null {
        if (!this.isIdentity()) {
            return null
        }
        const id = this.data.req.value as Identity
        if (id.permission && id.permission.permission.toString() !== PlaceholderPermission) {
            return id.permission.permission.toString()
        }
        return null
    }

    /** Get raw info dict */
    public getRawInfo(): {[key: string]: Uint8Array} {
        const rv: {[key: string]: Uint8Array} = {}
        for (const {key, value} of this.data.info) {
            rv[key] = value.array
        }
        return rv
    }

    /** Get metadata values as strings. */
    public getInfo(): {[key: string]: string} {
        const rv: {[key: string]: string} = {}
        const raw = this.getRawInfo()
        for (const key of Object.keys(raw)) {
            rv[key] = new TextDecoder().decode(raw[key])
        }
        return rv
    }

    /** Set a metadata key. */
    public setInfoKey(key: string, value: string | boolean) {
        let pair = this.data.info.find((pair) => {
            return pair.key === key
        })
        let encodedValue: Uint8Array
        switch (typeof value) {
            case 'string':
                encodedValue = new TextEncoder().encode(value)
                break
            case 'boolean':
                encodedValue = new Uint8Array([value ? 1 : 0])
                break
            default:
                throw new TypeError('Invalid value type, expected string or boolean.')
        }
        if (!pair) {
            pair = InfoPair.from({key, value: encodedValue})
            this.data.info.push(pair)
        } else {
            pair.value = Bytes.from(encodedValue)
        }
    }

    /** Return a deep copy of this request. */
    public clone(): SigningRequest {
        let signature: RequestSignature | undefined
        if (this.signature) {
            signature = RequestSignature.from(JSON.parse(JSON.stringify(this.signature)))
        }
        const data = RequestData.from(JSON.parse(JSON.stringify(this.data)))
        return new SigningRequest(this.version, data, this.zlib, this.abiProvider, signature)
    }

    // Convenience methods.

    public toString() {
        return this.encode()
    }

    public toJSON() {
        return this.encode()
    }
}

export class ResolvedSigningRequest {
    /** Recreate a resolved request from a callback payload. */
    static async fromPayload(
        payload: CallbackPayload,
        options: SigningRequestEncodingOptions = {}
    ): Promise<ResolvedSigningRequest> {
        const request = SigningRequest.from(payload.req, options)
        const abis = await request.fetchAbis()
        return request.resolve(
            abis,
            {actor: payload.sa, permission: payload.sp},
            {
                ref_block_num: Number(payload.rbn),
                ref_block_prefix: Number(payload.rid),
                expiration: payload.ex,
            }
        )
    }

    public readonly request: SigningRequest
    public readonly signer: PermissionLevel
    public readonly transaction: any
    public readonly serializedTransaction: Uint8Array

    constructor(
        request: SigningRequest,
        signer: PermissionLevel,
        transaction: any,
        serializedTransaction: Uint8Array
    ) {
        this.request = request
        this.signer = signer
        this.transaction = transaction
        this.serializedTransaction = serializedTransaction
    }

    public getTransactionId(): string {
        return Bytes.from(this.serializedTransaction).sha256Digest.hexString
    }

    public getCallback(signatures: string[], blockNum?: number): ResolvedCallback | null {
        const {callback, flags} = this.request.data
        if (!callback || callback.length === 0) {
            return null
        }
        if (!signatures || signatures.length === 0) {
            throw new Error('Must have at least one signature to resolve callback')
        }
        const payload: CallbackPayload = {
            sig: signatures[0],
            tx: this.getTransactionId(),
            rbn: String(this.transaction.ref_block_num.value),
            rid: String(this.transaction.ref_block_prefix.value),
            ex: this.transaction.expiration.toString(),
            req: this.request.encode(),
            sa: this.signer.actor.toString(),
            sp: this.signer.permission.toString(),
        }
        for (const [n, sig] of signatures.slice(1).entries()) {
            payload[`sig${n}`] = sig
        }
        if (blockNum) {
            payload.bn = String(blockNum)
        }
        const url = callback.replace(/({{([a-z0-9]+)}})/g, (_1, _2, m) => {
            return payload[m] || ''
        })
        return {
            background: flags.background,
            payload,
            url,
        }
    }
}

async function serializeAction(action: AnyAction, abiProvider?: AbiProvider) {
    if (Bytes.isBytes(action.data) || action.data.constructor.abiName !== undefined) {
        return Action.from(action)
    }
    if (isIdentity(action)) {
        return Action.from({...action, data: Identity.from(action.data)})
    } else if (abiProvider) {
        const abiData = await abiProvider.getAbi(Name.from(action.account).toString())
        return Action.from(action, abiData)
    } else {
        throw new Error('Missing abi provider')
    }
}

function isIdentity(action: AnyAction) {
    const account = Name.from(action.account)
    const name = Name.from(action.name)
    return account.toString() === '' && name.toString() === 'identity'
}

function hasTapos(tx: Transaction) {
    return !(
        tx.expiration.value.value === 0 &&
        tx.ref_block_num.value === 0 &&
        tx.ref_block_prefix.value === 0
    )
}
