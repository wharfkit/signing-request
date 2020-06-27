import {Checksum256, ChecksumType, TypeAlias, UInt8, Variant} from 'eosio-core'

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
    WAX = 10,
    PROTON = 11,
    FIO = 12,
}

@TypeAlias('chain_id')
export class ChainId extends Checksum256 {
    get chainVariant(): ChainIdVariant {
        let name = this.chainName
        if (name !== ChainName.UNKNOWN) {
            return ChainIdVariant.from(name, 'chain_alias')
        }
        return ChainIdVariant.from(this)
    }

    get chainName(): ChainName {
        const cid = this.hexString
        for (const [n, id] of ChainIdLookup) {
            if (id === cid) {
                return n
            }
        }
        return ChainName.UNKNOWN
    }
}

@TypeAlias('chain_alias')
export class ChainAlias extends UInt8 {
    value!: ChainName
}

@Variant.type('variant_id', [ChainAlias, ChainId])
export class ChainIdVariant extends Variant {
    value!: ChainId | ChainAlias

    get chainId(): ChainId {
        if (this.value instanceof ChainId) {
            return this.value
        }
        let id = ChainIdLookup.get(this.value.value)
        if (!id) {
            throw new Error('Unknown chain id alias')
        }
        return ChainId.from(id)
    }
}

const ChainIdLookup = new Map<ChainName, ChecksumType>([
    [ChainName.EOS, 'aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906'],
    [ChainName.TELOS, '4667b205c6838ef70ff7988f6e8257e8be0e1284a2f59699054a018f743b1d11'],
    [ChainName.JUNGLE, 'e70aaab8997e1dfce58fbfac80cbbb8fecec7b99cf982a9444273cbc64c41473'],
    [ChainName.KYLIN, '5fff1dae8dc8e2fc4d5b23b2c7665c97f9e9d8edf2b6485a86ba311c25639191'],
    [ChainName.WORBLI, '73647cde120091e0a4b85bced2f3cfdb3041e266cbbe95cee59b73235a1b3b6f'],
    [ChainName.BOS, 'd5a3d18fbb3c084e3b1f3fa98c21014b5f3db536cc15d08f9f6479517c6a3d86'],
    [ChainName.MEETONE, 'cfe6486a83bad4962f232d48003b1824ab5665c36778141034d75e57b956e422'],
    [ChainName.INSIGHTS, 'b042025541e25a472bffde2d62edd457b7e70cee943412b1ea0f044f88591664'],
    [ChainName.BEOS, 'b912d19a6abd2b1b05611ae5be473355d64d95aeff0c09bedc8c166cd6468fe4'],
    [ChainName.WAX, '1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4'],
    [ChainName.PROTON, '384da888112027f0321850a169f737c33e53b388aad48b5adace4bab97f437e0'],
    [ChainName.FIO, '21dcae42c0182200e93f954a074011f9048a7624c6fe81d3c9541a614a88bd1c'],
])
