/** SigningRequest ABI and typedefs. */

export type AccountName = string /*name*/
export type ActionName = string /*name*/
export type PermissionName = string /*name*/
export type ChainAlias = number /*uint8*/
export type ChainId = string /*checksum256*/
export type VariantId = ['chain_alias', ChainAlias] | ['chain_id', ChainId]
export type VariantReq =
    | ['action', Action]
    | ['action[]', Action[]]
    | ['transaction', Transaction]
    | ['identity', Identity]

export interface PermissionLevel {
    actor: AccountName
    permission: PermissionName
}

export type RequestFlags = number
export const RequestFlagsNone = 0
export const RequestFlagsBroadcast = 1 << 0
export const RequestFlagsBackground = 1 << 1

export interface Action {
    account: AccountName
    name: ActionName
    authorization: PermissionLevel[]
    data: string | {[key: string]: any}
}

export interface Extension {
    type: number /*uint16*/
    data: string /*bytes*/
}

export interface TransactionHeader {
    expiration: string /*time_point_sec*/
    ref_block_num: number /*uint16*/
    ref_block_prefix: number /*uint32*/
    max_net_usage_words: number /*varuint32*/
    max_cpu_usage_ms: number /*uint8*/
    delay_sec: number /*varuint32*/
}

export interface Transaction extends TransactionHeader {
    context_free_actions: Action[]
    actions: Action[]
    transaction_extensions: Extension[]
}

export interface SigningRequest {
    chain_id: VariantId
    req: VariantReq
    flags: RequestFlags
    callback: string
    info: InfoPair[]
}

export interface InfoPair {
    key: string
    value: Uint8Array | string /*bytes*/
}

export interface Identity {
    permission: PermissionLevel | undefined | null
}

export interface RequestSignature {
    signer: AccountName
    signature: string
}

export const data = {
    version: 'eosio::abi/1.1',
    types: [
        {
            new_type_name: 'account_name',
            type: 'name',
        },
        {
            new_type_name: 'action_name',
            type: 'name',
        },
        {
            new_type_name: 'permission_name',
            type: 'name',
        },
        {
            new_type_name: 'chain_alias',
            type: 'uint8',
        },
        {
            new_type_name: 'chain_id',
            type: 'checksum256',
        },
        {
            new_type_name: 'request_flags',
            type: 'uint8',
        },
    ],
    structs: [
        {
            name: 'permission_level',
            fields: [
                {
                    name: 'actor',
                    type: 'account_name',
                },
                {
                    name: 'permission',
                    type: 'permission_name',
                },
            ],
        },
        {
            name: 'action',
            fields: [
                {
                    name: 'account',
                    type: 'account_name',
                },
                {
                    name: 'name',
                    type: 'action_name',
                },
                {
                    name: 'authorization',
                    type: 'permission_level[]',
                },
                {
                    name: 'data',
                    type: 'bytes',
                },
            ],
        },
        {
            name: 'extension',
            fields: [
                {
                    name: 'type',
                    type: 'uint16',
                },
                {
                    name: 'data',
                    type: 'bytes',
                },
            ],
        },
        {
            name: 'transaction_header',
            fields: [
                {
                    name: 'expiration',
                    type: 'time_point_sec',
                },
                {
                    name: 'ref_block_num',
                    type: 'uint16',
                },
                {
                    name: 'ref_block_prefix',
                    type: 'uint32',
                },
                {
                    name: 'max_net_usage_words',
                    type: 'varuint32',
                },
                {
                    name: 'max_cpu_usage_ms',
                    type: 'uint8',
                },
                {
                    name: 'delay_sec',
                    type: 'varuint32',
                },
            ],
        },
        {
            name: 'transaction',
            base: 'transaction_header',
            fields: [
                {
                    name: 'context_free_actions',
                    type: 'action[]',
                },
                {
                    name: 'actions',
                    type: 'action[]',
                },
                {
                    name: 'transaction_extensions',
                    type: 'extension[]',
                },
            ],
        },
        {
            name: 'info_pair',
            fields: [
                {
                    name: 'key',
                    type: 'string',
                },
                {
                    name: 'value',
                    type: 'bytes',
                },
            ],
        },
        {
            name: 'signing_request',
            fields: [
                {
                    name: 'chain_id',
                    type: 'variant_id',
                },
                {
                    name: 'req',
                    type: 'variant_req',
                },
                {
                    name: 'flags',
                    type: 'request_flags',
                },
                {
                    name: 'callback',
                    type: 'string',
                },
                {
                    name: 'info',
                    type: 'info_pair[]',
                },
            ],
        },
        {
            name: 'identity',
            fields: [
                {
                    name: 'permission',
                    type: 'permission_level?',
                },
            ],
        },
        {
            name: 'request_signature',
            fields: [
                {
                    name: 'signer',
                    type: 'name',
                },
                {
                    name: 'signature',
                    type: 'signature',
                },
            ],
        },
    ],
    variants: [
        {
            name: 'variant_id',
            types: ['chain_alias', 'chain_id'],
        },
        {
            name: 'variant_req',
            types: ['action', 'action[]', 'transaction', 'identity'],
        },
    ],
    actions: [
        {
            name: 'identity',
            type: 'identity',
        },
    ],
}
