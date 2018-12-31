/** SigningRequest ABI and typedefs. */

export type AccountName = string /*name*/
export type ActionName = string /*name*/
export type PermissionName = string /*name*/
export type VariantId = ['uint8', number /*uint8*/] | ['checksum256', string /*checksum256*/]
export type VariantReq = ['action', Action] | ['action[]', Action[]] | ['transaction', Transaction]

export interface PermissionLevel {
    actor: AccountName
    permission: PermissionName
}

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

export interface Callback {
    url: string /*string*/
    background: boolean
}

export interface SigningRequest {
    chain_id: VariantId
    req: VariantReq
    broadcast: boolean
    callback: Callback | undefined
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
            name: 'callback',
            fields: [
                {
                    name: 'url',
                    type: 'string',
                },
                {
                    name: 'background',
                    type: 'bool',
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
                    name: 'broadcast',
                    type: 'bool',
                },
                {
                    name: 'callback',
                    type: 'callback?',
                },
            ],
        },
    ],
    variants: [
        {
            name: 'variant_id',
            types: ['uint8', 'checksum256'],
        },
        {
            name: 'variant_req',
            types: ['action', 'action[]', 'transaction'],
        },
    ],
}
