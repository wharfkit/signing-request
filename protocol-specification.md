# EOSIO URI Protocol Specification

The `eosio://` URI protocol uses the same binary format as the EOSIO blockchain, encoded using an url-safe Base64 variant ([Base64u](#base64u)).

### Example

The URI `eosio://gWNgZGBY1mTC_MoglIGBIVzX5uxZRqAQGMBoQxgDAjRiF2SwgVksrv7BIFqgOCOxKFUhMS9FITUvK79SkZEBAA` decodes to:

```json
{
  "header": 129,
  "data": {
    "req": [
      "action",
      {
        "account": "eosio.token",
        "name": "transfer",
        "authorization": [{
            "actor": "............1", "permission": "............1"
          }],
        "data": "0100000000000000000000000000285DA06806000000000004454F530000000010736861726520616E6420656E6A6F7921"
      }
    ],
    "chain_id": ["uint8", 1],
    "broadcast": true,
    "callback": null
  }
}
```

Which when resolved using the `bar@active` permission and TAPoS values of
`{ref_block_num: 1234, ref_block_prefix: 1234, expiration: '2019-01-01T00:00:00'}` looks like:

```json
{
  "chain_id": "aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906",
  "transaction": {
    "actions": [
      {
        "account": "eosio.token",
        "name": "transfer",
        "authorization": [{
            "actor": "banani", "permission": "poonani"
          }],
        "data": {
          "from": "banani",
          "to": "foo",
          "quantity": "42.0000 EOS",
          "memo": "share and enjoy!"
        }
      }
    ],
    "context_free_actions": [],
    "transaction_extensions": [],
    "expiration": "2019-01-01T00:00:00",
    "ref_block_num": 1234,
    "ref_block_prefix": 1234,
    "max_cpu_usage_ms": 0,
    "max_net_usage_words": 0,
    "delay_sec": 0
  }
}
```

## Request data

The request data is the Base64-decoded `eosio://` payload and consists of a 1-byte header and the EOSIO encoded request struct.

```
header  request
1000000100000000000000000000...
```

### Header

The header consists of 8 bits where the first 7 bits is the protocol version and the last bit denotes whether the data is compressed or not.

The protocol version this document describes is `1`, making the only valid headers `0x01` (uncompressed) and `0x81` (compressed).

### Request

The signing request payload.

  param       | description
 -------------|-------------
  `chain_id`  | 32-byte id of target chain or 1-byte alias (see [Chain Aliases](#chain-aliases))
  `req`       | the action, list of actions or full transaction that should be signed
  `broadcast` | whether the resulting transaction should be broadcast after signing
  `callback`  | the callback that should be hit after the transaction is broadcast or signed

Represented as a C++ struct:

```cpp
#include <eosiolib/eosio.hpp>
#include <eosiolib/action.hpp>
#include <eosiolib/transaction.hpp>

using namespace eosio;
using namespace std;

typedef checksum256 chain_id;
typedef uint8 chain_alias;

struct callback {
    string url;
    bool background;
};

struct signing_request {
    variant<chain_alias, chain_id> chain_id;
    variant<action, vector<action>, transaction> req;
    bool broadcast;
    optional<callback> callback;
}
```

Represented as an EOSIO ABI:

```json
{
  "version": "eosio::abi/1.1",
  "types": [
    {
      "new_type_name": "account_name",
      "type": "name"
    },
    {
      "new_type_name": "action_name",
      "type": "name"
    },
    {
      "new_type_name": "permission_name",
      "type": "name"
    },
    {
      "new_type_name": "chain_alias",
      "type": "uint8"
    },
    {
      "new_type_name": "chain_id",
      "type": "checksum256"
    }
  ],
  "structs": [
    {
      "name": "permission_level",
      "fields": [
        {
          "name": "actor",
          "type": "account_name"
        },
        {
          "name": "permission",
          "type": "permission_name"
        }
      ]
    },
    {
      "name": "action",
      "fields": [
        {
          "name": "account",
          "type": "account_name"
        },
        {
          "name": "name",
          "type": "action_name"
        },
        {
          "name": "authorization",
          "type": "permission_level[]"
        },
        {
          "name": "data",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "extension",
      "fields": [{
          "name": "type",
          "type": "uint16"
        }, {
          "name": "data",
          "type": "bytes"
        }]
    },
    {
      "name": "transaction_header",
      "fields": [
        {
          "name": "expiration",
          "type": "time_point_sec"
        },
        {
          "name": "ref_block_num",
          "type": "uint16"
        },
        {
          "name": "ref_block_prefix",
          "type": "uint32"
        },
        {
          "name": "max_net_usage_words",
          "type": "varuint32"
        },
        {
          "name": "max_cpu_usage_ms",
          "type": "uint8"
        },
        {
          "name": "delay_sec",
          "type": "varuint32"
        }
      ]
    },
    {
      "name": "transaction",
      "base": "transaction_header",
      "fields": [
        {
          "name": "context_free_actions",
          "type": "action[]"
        },
        {
          "name": "actions",
          "type": "action[]"
        },
        {
          "name": "transaction_extensions",
          "type": "extension[]"
        }
      ]
    },
    {
      "name": "callback",
      "fields": [{
          "name": "url",
          "type": "string"
        }, {
          "name": "background",
          "type": "bool"
        }]
    },
    {
      "name": "signing_request",
      "fields": [
        {
          "name": "chain_id",
          "type": "variant_id"
        },
        {
          "name": "req",
          "type": "variant_req"
        },
        {
          "name": "broadcast",
          "type": "bool"
        },
        {
          "name": "callback",
          "type": "callback?"
        }
      ]
    }
  ],
  "variants": [
    {
      "name": "variant_id",
      "types": ["chain_alias", "chain_id"]
    },
    {
      "name": "variant_req",
      "types": ["action", "action[]", "transaction"]
    }
  ]
}
```

## Base64u

An URL-safe version of Base64 where `+` is replaced by `-`, `/` by `_` and the padding (`=`) is trimmed.

```
base64
SGn+dGhlcmUh/k5pY2X+b2b+eW91/nRv/mRlY29kZf5tZf46KQ==
base64u
SGn-dGhlcmUh_k5pY2X-b2b-eW91_nRv_mRlY29kZf5tZf46KQ
```

## Compression

If the compression bit is set in the header the signing request data is compressed using zlib deflate.

Using compression is recommended since it generates much shorter URIs (and smaller QR codes) but left optional since when used in a contract bandwidth is often cheaper than CPU time.

Compressed: `eosio://gWNgZGBY1mTC_MoglIGBIVzX5uxZRqAQGMBoQxgDAjRiF2SwgVksrv7BIFqgOCOxKFUhMS9FITUvK79SkZEBAA`

Uncompressed: `eosio://AQABAACmgjQD6jBVAAAAVy08zc0BAQAAAAAAAAABAAAAAAAAADEBAAAAAAAAAAAAAAAAAChdoGgGAAAAAAAERU9TAAAAABBzaGFyZSBhbmQgZW5qb3khAQA
aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906`

## Callbacks

Requests can have an optional callback URL that the signer should hit after the transaction has been signed or broadcast.

```cpp
struct callback {
    string url;
    bool background;
};
```

If background is set and the URL protocol is `http` or `http` implementers should `POST` to the URL instead of redirecting/opening it. For other protocols background behavior is up to the implementer.

The callbacks also allow simple templating with some response parameters, the templating format is `{{param_name}}`, e.g. `https://myapp.com/wallet?tx={{tx}}&included_in={{bn}}` or `mymobileapp://signed/{{sig}}`

Callback template params:

  * `sig(N)` - Hex-encoded string containing the transaction signature where N signifies the signature 0-index if there are multiple. `sig` is an alias for `sig0`.
  * `tx` - Hex-encoded string containing transaction id*
  * `bn` - The block number the transaction was included in*
  * `bi` - Hex-encoded string containing the block id*

*Set to an empty string if unavailable (i.e. `request.broadcast` was set to `false`).


## Placeholder names

The name `............1` is reserved as the placeholder name and when resolving a transaction it should be replaced with the signing account name if used within an actions `permission[].actor` or anywhere inside the action `data` where the type is `name`. If used in the `permission[].level` it should be replaced by the signing account authority level.

Example:
```js
{ account: "eosio.token",
  name: "transfer",
  authorization: [{actor: "............1", permission: "............1"}],
  data: {
    from: "............1",
    to: "bar",
    quantity: "42.0000 EOS",
    memo: "Don't panic" }}
```

When signed by `foo@active` would resolve to:
```js
{ account: "eosio.token",
  name: "transfer",
  authorization: [{actor: "foo", permission: "active"}],
  data: {
    from: "foo",
    to: "bar",
    quantity: "42.0000 EOS",
    memo: "Don't panic" }}
```

## Chain Aliases

The following aliases are defined

  value  | name     | chain_id
 --------|----------|----------
  `0x00` | RESERVED |
  `0x01` | EOS      | `aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906`
  `0x02` | TELOS    | `4667b205c6838ef70ff7988f6e8257e8be0e1284a2f59699054a018f743b1d11`

TODO: add all known chains
