/** SigningRequest ABI and typedefs. */

import {
    Action,
    Bytes,
    Name,
    Signature,
    Struct,
    Transaction,
    TypeAlias,
    UInt8,
    Variant,
} from 'eosio-core'

import {ChainIdVariant} from './chain-id'

@TypeAlias('account_name')
export class AccountName extends Name {}

@TypeAlias('permission_name')
export class PermissionName extends Name {}

@Struct.type('permission_level')
export class PermissionLevel extends Struct {
    @Struct.field(AccountName) actor!: AccountName
    @Struct.field(PermissionName) permission!: PermissionName
}

@Struct.type('identity')
export class Identity extends Struct {
    @Struct.field(PermissionLevel, {optional: true}) permission?: PermissionLevel
}

@Variant.type('variant_req', [Action, {type: Action, array: true}, Transaction, Identity])
export class RequestVariant extends Variant {
    value!: Action | Action[] | Transaction | Identity
}

@TypeAlias('request_flags')
export class RequestFlags extends UInt8 {
    static broadcast = 1 << 0
    static background = 1 << 1

    get broadcast() {
        return (this.value & RequestFlags.broadcast) !== 0
    }
    set broadcast(enabled: boolean) {
        this.setFlag(RequestFlags.broadcast, enabled)
    }

    get background() {
        return (this.value & RequestFlags.background) !== 0
    }
    set background(enabled: boolean) {
        this.setFlag(RequestFlags.background, enabled)
    }

    private setFlag(flag: number, enabled: boolean) {
        if (enabled) {
            this.value &= ~flag
        } else {
            this.value |= flag
        }
    }
}

@Struct.type('info_pair')
export class InfoPair extends Struct {
    @Struct.field('string') key!: string
    @Struct.field('bytes') value!: Bytes
}

@Struct.type('signing_request')
export class RequestData extends Struct {
    @Struct.field(ChainIdVariant) chain_id!: ChainIdVariant
    @Struct.field(RequestVariant) req!: RequestVariant
    @Struct.field(RequestFlags) flags!: RequestFlags
    @Struct.field('string') callback!: string
    @Struct.field(InfoPair, {array: true}) info!: InfoPair[]
}

@Struct.type('request_signature')
export class RequestSignature extends Struct {
    @Struct.field('name') signer!: Name
    @Struct.field('signature') signature!: Signature
}
