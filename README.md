
eosio-uri
=========

URI protocol for facilitating signing of EOSIO transactions.

### Example Data

**Sample Data**

```
{
    callback: 'https://dapp.greymass.com',
    actions: [{
        account: 'eosio.token',
        name: 'transfer',
        authorization: [{ actor: 'teamgreymass', permission: 'active' }],
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
eosio:23NcfRWj7pN3ea4b58SDtkHKMnPNccjPcmPnRgK4psydL5gYLrVbAvpe2J5KbJTA9kVeqfTxPx29ykwJKZLo3o1phYrxwCqjUBotHGwFAiFUm7wyCNjV2TMVy
```

### Example Code

```
const util = require('util')
const zlib = require('zlib')
const eosjs = require('eosjs')

const { SigningRequest } = require("eosio-uri")

const textEncoder = new util.TextEncoder()
const textDecoder = new util.TextDecoder()

// create an instances of eosjs for rpc calls
const rpc = Eos({
    httpEndpoint: 'https://eos.greymass.com'
});

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
        getAbi: async (account) => {
            return (await rpc.get_abi(account)).abi
        }
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
    let req = await SigningRequest.create({
        callback: 'https://dapp.greymass.com',
        actions: [{
            account: 'eosio.token',
            name: 'transfer',
            authorization: [{ actor: 'teamgreymass', permission: 'active' }],
            data: {
                from: 'teamgreymass',
                to: 'dapp',
                quantity: '42.0000 EOS',
                memo: 'share and enjoy!',
            }
        }]
    }, opts)

    // encode signing request as string
    let uri = req.encode()
    console.log(`URI: ${ uri }`)

    // reinterpret from encoded string
    req = SigningRequest.from(uri, opts)
    console.log(`Actions\n${ util.inspect(await req.getActions()) }`)
    console.log(`Transaction\n${ util.inspect(req.getTransaction()) }`)
    console.log(`Callback\n${ util.inspect(req.getCallback()) }`)
}

main().catch(console.error)
```
