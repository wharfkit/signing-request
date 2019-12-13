eosio-signing-request (rev.2)
=========

Signing protocol to facilitate the signing of EOSIO transactions.

### Example Data

**Sample Data**

```
{
    actions: [{
        account: 'eosio.token',
        name: 'transfer',
        authorization: [{ actor: '............1', permission: '............1' }],
        data: {
            from: 'teamgreymass',
            to: 'dapp',
            quantity: '42.0000 EOS',
            memo: 'share and enjoy!',
        }
    }]
}
```

**URI Generated**

```
esr://23NcfRWj7pN3ea4b58SDtkHKMnPNccjPcmPnRgK4psydL5gYLrVbAvpe2J5KbJTA9kVeqfTxPx29ykwJKZLo3o1phYrxwCqjUBotHGwFAiFUm7wyCNjV2TMVy
```

### Example Code

```
const { JsonRpc, Api } = require('eosjs')

const fetch = require('node-fetch')
const util = require('util')
const zlib = require('zlib')

const textEncoder = new util.TextEncoder()
const textDecoder = new util.TextDecoder()

const rpc = new JsonRpc('https://eos.greymass.com', {
    // only needed if running in nodejs
    fetch
})
const eos = new Api({
    rpc,
    textDecoder,
    textEncoder,
})

// const { SigningRequest } = require("eosio-signing-request")
const { SigningRequest } = require(".")

// opts for the signing request
const opts = {
    // string encoder
    textEncoder,
    // string decoder
    textDecoder,
    // string compression
    zlib: {
        deflateRaw: (data) => {
            return new Uint8Array(zlib.deflateRawSync(Buffer.from(data)))
        },
        inflateRaw: (data) => {
            return new Uint8Array(zlib.inflateRawSync(Buffer.from(data)))
        },
    },
    // provider to retrieve contract abi
    abiProvider: {
        getAbi: async (account) => (await eos.getAbi(account))
    }
}

async function main() {
    /*
      creating a signing request

      parameters (all optional):
          - action: object, single action
          - actions: array, multiple actions
          - transaction: object, whole transaction
          - chainId: string, either the chainId or a named string (predefined, EOS|TELOS)
          - broadcast: boolean, whether or not to broadcast this transaction after signing
          - callback: string|object | either a URL callback or object ({url: string, background: boolean})
    */

    const req = await SigningRequest.create({
        actions: [{
            account: 'eosio.token',
            name: 'transfer',
            // '............1' = placeholder for signer
            authorization: [{ actor: '............1', permission: '............1' }],
            data: {
                from: 'teamgreymass',
                to: 'dapp',
                quantity: '42.0000 EOS',
                memo: 'share and enjoy!',
            }
        }]
    }, opts)


    // encode signing request as string
    const uri = req.encode();
    console.log(`URI: ${ uri }`)

    // reinterpret from encoded string
    const decoded = SigningRequest.from(uri, opts)
    console.log(`\nDecoded Signing Request\n\n${ util.inspect(decoded, false, null, true) }`)

    // Get reference block material
    const head = (await rpc.get_info(true)).head_block_num;
    const block = await rpc.get_block(head);
    // Fetch the ABIs needed to decode
    const abis = await decoded.fetchAbis();
    // Resolve the transaction as a specific user
    const authorization = {
        actor: 'teamgreymass',
        permission: 'active',
    }
    const resolved = decoded.resolve(abis, authorization, block);

    console.log(`\n\nResolved Signing Request\n\n${ util.inspect(resolved.request, false, null, true) }`)
    console.log(`\n\nResolved Transaction\n\n${ util.inspect(resolved.transaction, false, null, true) }`)
}

main().catch(console.error)

```
