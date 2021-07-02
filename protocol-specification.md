---
EEP: 7
title: ESR (EOSIO Signing Request)
author: Aaron Cox (@aaroncox), Johan Nordberg (@jnordberg)
revision: 3
status: Draft
type: Standards Track
category: Interface
created: 2019-05-19
updated: 2021-02-05
---

**Table of Contents**

- [Introduction](#ESR---The--EOSIO-Signing-Request--protocol)
  - [Summary](#Summary)
  - [Abstract](#Abstract)
  - [Motivation](#Motivation)
- [Technical Specification](#Technical-Specification)
  - [Data Format](#Data-Format)
  - [Header](#Header)
  - [Payload](#Payload)
    - [`chain_id`](#chain_id)
    - [`req`](#req)
      - [`action | action[]`](#req---action--action)
      - [`transaction`](#req---transaction)
      - [`identity`](#req---identity)
    - [`flags`](#flags)
    - [`callback`](#callback)
    - [`info`](#info)
  - [Request Signatures (Optional)](#Request-Signatures)
- [EOSIO Client Integration](#EOSIO-Client-Integration)
  - [Implementation Guidelines](#Implementation-Guidelines)
  - [Signature Provider Workflow](#Signature-Provider-Workflow)
    1. [Resolving the Request](#1---Resolving-the-Request)
    2. [Signing the resolved request](#2---Signing-the-resolved-request)
    3. [Broadcasting the transaction](#3---Broadcasting-the-transaction)
    4. [Issuing Callbacks](#4---Issuing-Callbacks)
- [Use Cases](#Use-Cases)
- [Implementations](#Implementations)
  - [JS Client Frameworks](#JS-Client-Frameworks)
  - [JS Examples](#JS-Examples)
  - [JS Libraries](#JS-Libraries)
  - [Swift Libraries](#Swift-Libraries)
  - [Signature Providers](#Signature-Providers)
  - [User Interfaces](#User-Interfaces)
- [Test Cases](#Test-Cases)
- [Appendix](#Appendix)
  - [Base64u](#Base64u)
  - [Callback Proxies](#Callback-Proxies)
  - [Chain Aliases](#Chain-Aliases)
  - [Compression](#Compression)
  - [Identity Requests](#Identity-Requests)
    - [Identity Proof Action](#Identity-Proof-Action)
    - [Signing Identity Proof Actions](#Signing-Identity-Proof-Actions)
  - [MIME Type](#MIME-Type)
  - [Null transaction header](#Null-transaction-header)
  - [Signing Request - Placeholders](#Signing-Request---Placeholders)
  - [Signing Request - Schema](#Signing-Request---Schema)
    - [EOSIO ABI](#Signing-Request-represented-as-a-EOSIO-C-struct)
    - [EOSIO C++ struct](#Signing-Request-represented-as-an-EOSIO-ABI)
- [Backwards Compatibility](#Backwards-Compatibility)
- [Change Log](#Change-Log)
- [Acknowledgements](#Acknowledgements)
- [Copyright](#Copyright)

---

# ESR - The "EOSIO Signing Request" protocol

### Summary

A standard protocol for an EOSIO-based signing request payload to allow communication between applications and signature providers.

### Abstract

EOSIO Signing Requests encapsulate transaction data for transport within multiple mediums (e.g. QR codes and hyperlinks), providing a simple cross-application signaling method between very loosely coupled applications. A standardized request data payload allows instant invocation of specific transaction templates within the user's preferred EOSIO signature provider.

### Motivation

The ability to represent a transaction in a standardized signing request format has been a major factor in driving end user adoption within many blockchain ecosystems. Introducing a similar mechanism into the EOSIO ecosystem would speed up adoption by providing a versatile data format which allows requests across any medium.

While other protocols already exist within EOSIO for more intricate cross-application communication - this proposal seeks to establish a primitive request payload for use in any type of application on any device.

---

# Technical Specification

The following specification sets out to define the technical standards used and the actual composition of an EOSIO Signing Request payload.

> Note: Examples in this specification uses the JSON representation of the ABI data.

## Signing Request Specification

In its encapsulated form, an EOSIO Signing Request is a binary data structure which has been [compressed](#Compression) and converted to [base64u](#Base64u), and is representable as a string:

```
gmNgZGRkAIFXBqEFopc6760yugsVYWCA0YIwxgKjuxLSL6-mgmQA
```

The above payload is a signing request for a transaction on the EOS blockchain to perform the `voteproducer` action on the `eosio` contract. The data contained within the action itself also specifies the proxy of `greymassvote`.

Once decoded and inflated ([preview request](https://eosio.to/gmNgZGRkAIFXBqEFopc6760yugsVYWCA0YIwxgKjuxLSL6-mgmQA)) it will return the following data:

```jsonc
{
    "callback": "",
    "chain_id": ["chain_alias", 1],
    "flags": 1,
    "info": [],
    "req": [
        [
            "action",
            {
                "account": "eosio",
                "name": "voteproducer",
                "authorization": [
                    {
                        "actor": "............1",
                        "permission": "............2"
                    }
                ],
                "data": {
                    "voter": "............1",
                    "proxy": "greymassvote",
                    "producers": []
                }
            }
        ]
    ]
}
```

This decoded data can then be used to prompt action from the end user in their preferred signature provider. The signature provider can then [resolve the signing request](#Signature-Provider-Workflow), add a [signature for the transaction](#Signing-the-resolved-request), and potentially trigger a [callback](#callback) and/or broadcast the completed transaction to the blockchain. See the [EOSIO Client Integration](#EOSIO-Client-Integration) section for a more in-depth explanation.

### Data Format

The decoded payload of each Signing Request consists of three parts:

  - a 1-byte header
  - a N-byte payload
  - an optional 65-byte signature

```
header  request                 signature
1000001000000000000000000000...[00000000000000000000000000000000...]
```

### Header

The header is the 8 initial bits of the data, with the first 7 bits representing the protocol version and the last bit denoting if the data is compressed. Examples:

- `0x03` request version 3 with a uncompressed payload
- `0x82` request version 2 a compressed payload

### Payload

Data beyond the 1-byte header forms the representation of the request payload. This structure is as follows (in byte order):

  param                         | description
 -------------------------------|-------------
  [`chain_id`](#chain_id)       | Target chain id
  [`req`](#req)                 | The action/tx/identity being requested
  [`flags`](#flags)             | Various flags for how to process this transaction
  [`callback`](#callback)       | URL that should be triggered to after the transaction is signed
  [`info`](#info)               | Additional metadata to pass along with the request

A representation of this schema can be found in the Appendix as both an [EOSIO C++ struct](#signing-request-represented-as-a-eosio-c-struct) and an [EOSIO ABI Definition](#signing-request-represented-as-an-eosio-abi).

#### `chain_id`

The EOSIO blockchain this request is valid for.

This can be either a full 32-byte chain id:

```jsonc
{
    "chain_id": [ "chain_id", "aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906" ]
}
```

Or a 1-byte [chain alias](#chain-aliases) can be used (`1` being defined EOS):


```jsonc
{
    "chain_id": [ "chain_alias", 1 ]
}
```

As of version 3 a request can also specify the chain alias `0` to denote that the request is valid for any chain, see [multi chain requests](#multi-chain-requests).

```jsonc
{
    "chain_id": [ "chain_alias", 0 ]
}
```

#### `req`

The request data is a 2-part tuple, with the first part being the type and the second part being the data itself.

```jsonc
{
    "req": [
      'request_type',
      'request_data'
    ]
}
```

The data to be processed from the request can be one of the following request types:

  - `action` or `action[]`: a single action or a list of actions
  - `transaction`: a full EOSIO transaction
  - `identity`: a identity request

###### Request type: `action | action[]`

The most compact and simple form of a signing request is to just pass the action(s) that should be signed. When the request is resolved to a transaction, the client **MUST** create a valid transaction header (see [resolving requests](#resolving-signing-requests)).

Example:

```jsonc
{
    "req": [
        "action",
        {
            "account": "eosio.forum",
            "name": "vote",
            "authorization": [{"actor": "............1", "permission": "............2"}],
            "data": "0100000000000000000000204643BABA0100"
        }
    ]
}
```

###### Request type: `transaction`

A full transaction, TAPoS values and expiration can be defined or all be set to [null transaction header values](#null-transaction-header) to indicate that signature provider should insert appropriate values (see [resolving requests](#resolving-signing-requests)).

Example:

```jsonc
{
    "req": [
        "transaction",
        {
            "expiration": "1970-01-01T00:00:00", //
            "ref_block_num": 0,                  // the "null" header values
            "ref_block_prefix": 0,               //
            "max_net_usage_words": 0,
            "max_cpu_usage_ms": 10,
            "delay_sec": 10,
            "context_free_actions": [],
            "actions": [
                {
                    "account": "eosio.forum",
                    "name": "vote",
                    "authorization": [
                        {
                            "actor": "............1",
                            "permission": "............2"
                        }
                    ],
                    "data": "0100000000000000000000204643BABA0100"
                }
            ],
            "transaction_extensions": []
        }
    ]
}
```

###### Request type: `identity`

Off-chain identity proof that can be returned via callback, see [identity requests](#identity-requests) for more details.

#### `flags`

1-byte bit-field containing the request flags, available flags (in bit-order)

  1. Broadcast - if set the transaction **MUST** be broadcast after signing
  2. Background - if set the callback url (if any) **SHOULD** be sent via HTTP POST if the scheme is http or https

If the broadcast flag is set when the req data is of type `identity` the request **MUST** be rejected.

#### `callback`

Callback URL, if set client **SHOULD** attempt to deliver the [callback payload](#callback-payload) to it, see [callbacks](#issuing-callbacks) for more details.

#### `info`

Request metadata, key value pairs with arbitrary data that can be used to implement extended functionality.

Example:

```jsonc
{
    "info": [
        {
            "key": "hello",
            "value": "776f726c64" // utf-8 "world"
        }
    ]
}
```

### Request Signatures

Requests can optionally be signed to provide proof of the origin of the request. A signed request has the 8-byte signer account name and 65-byte signature appended to the end of the request data.

The signing digest is created with `sha256(request_version + utf8("request") + request_data)`. Example for a version 2 request:

```
sha256(
  0272657175657374
  __ request data __
)
```

---

## EOSIO Client Integration

### Implementation Guidelines

The following are a set of guidelines in which end user applications (e.g. signature providers) that handle EOSIO Signing Requests should respect.

- EOSIO clients **MUST NOT** automatically act upon the data contained within a Signing Request without the user's authorization.
- EOSIO clients **MUST** decode and present the transaction data in a human readable format for review before creating a signature.
- EOSIO clients **SHOULD** inform the user of any callback which will be executed upon completion of a signing request.
- EOSIO clients **SHOULD** register themselves as the handler for the `esr:` URI scheme by default so long as no other handlers already exist. If a registered handler already exists, they **MAY** prompt the user to change it upon request.
- EOSIO clients **SHOULD** use the [recommended MIME type](#MIME-type) when applicable in their implementations.

### Signature Provider Workflow

Signature providers (a.k.a "Wallets") will need to go through a series of steps in order to interpret and resolve an ESR payload before being able to sign the resulting transaction.

#### 1. Resolving the Request

To resolve a signing request to a transaction that can be signed the following steps are taken:

- [A) Create transaction from payload](#A--Create-transaction-from-payload)
- [B) Resolve authority/action placeholders](#B--Resolve-authority-action-placeholders)
- [C) Insert TAPoS values](#C--Insert-TAPoS-values)

###### A) Create transaction from payload

The payload should be inspected to determine the [request type](#req) and determine how to interpret the request data.

- Payloads with the `action` and `action[]` types should construct a transaction with the [null header](#null-transaction-header) and then insert the action(s) contained within the request.
- Payloads with type `identity` are resolved to the [identity proof](#identity-proof) action and then treated just like an `action` request.
- For the `transaction` type the full transaction is taken as-is.

###### B) Resolve authority/action placeholders

The action data and authorization is inspected and all fields with the `name` type that contain an [action placeholder](#action-placeholders) value is resolved.

 * `............1` (`uint64(1)`) - Is resolved to the signing account name, e.g. `foobarfoobar`
 * `............2` (`uint64(2)`) - Is resolved to the signing account permission, e.g. `active`

This is performed recursively until all fields have been visited. It is recommended that implementers enforce a max recursion depth of 100.

###### C) Insert TAPoS values

The transaction header is inspected and if it matches the [null transaction header](#null-transaction-header) and the payload type is NOT `identity` appropriate TAPoS and expiration values should be inserted.

```jsonc
{
  "expiration": "1970-01-01T00:00:00",
  "ref_block_num": 0,
  "ref_block_prefix": 0,
  // ...
}
// resolves to something like
{
  "expiration": "2020-02-02T20:20:20",
  "ref_block_num": 10444,
  "ref_block_prefix": 4158294815,
  // ...
}
```

**Note**: other header fields (e.g.`max_cpu_usage_ms` or `delay_sec`) must be left as-is.

Example: <esr://gmNgZGRkAIFXBqEFopc6760yugsVYWCA0YIwxgKjuxLSL6-mgmQA>

```jsonc
{
    "callback": "",
    "chain_id": ["chain_alias", 1],
    "flags": 1,
    "info": [],
    "req": [
        [
            "action",
            {
                "account": "eosio",
                "name": "voteproducer",
                "authorization": [
                    {
                        "actor": "............1",
                        "permission": "............2"
                    }
                ],
                "data": {
                    "voter": "............1",
                    "proxy": "greymassvote",
                    "producers": []
                }
            }
        ]
    ]
}
```

This request given the signer `foobarfoobar@active` and TAPoS values of `expiration=2020-02-02T20:20:20`, `ref_block_num=10444`, and `ref_block_prefix=4158294815` resolves to:

```jsonc
{
    "ref_block_num": 10444,
    "ref_block_prefix": 4158294815,
    "expiration": "2020-02-02T20:20:20",
    "max_cpu_usage_ms": 0,
    "max_net_usage_words": 0,
    "delay_sec": 0,
    "context_free_actions": [],
    "transaction_extensions": [],
    "actions": [
        {
            "account": "eosio",
            "name": "voteproducer",
            "authorization": [
                { "actor": "foobarfoobar", "permission": "active" }
            ],
            "data": {
                "voter": "foobarfoobar",
                "proxy": "greymassvote",
                "producers": []
            }
        }
    ]
}
```

### 2. Signing the resolved request

Now with a standard EOSIO transaction, the signature provider should use their native capabilities to create a signature for the transaction.

### 3. Broadcasting the transaction

Depending on the value of the [`broadcast`](#flags) flag in the request, the signature provider may be asked to broadcast this transaction directly to the appropriate blockchain before issuing the callback.

This flag should always be respected by the signature provider, as the application issuing the signing request may want to broadcast the transaction to a specific API endpoint for further processing.

### 4. Issuing Callbacks

An optional parameter of the signing request is the `callback`, which when set indicates how an EOSIO client should proceed after the transaction has been signed and potentially broadcast. The `callback` itself is a string containing a full URL. This URL will be triggered after the transaction has been either signed or broadcast based on the `flags` provided.

The `flags` value dictates the behavior of EOSIO client, indicating whether it should trigger the callback in the native OS handler (e.g. opening a web browser for `http` or `https`) or perform it in the background. If `background` is set to `true` and the URL protocol is either `http` or `https`, EOSIO clients should `POST` to the URL instead of redirecting/opening it in a web browser. For other protocols background behavior is up to the implementer.

The callback URL also includes simple templating with some response parameters. The templating format syntax is `{{param_name}}`, e.g.:

- `https://myapp.com/wallet?tx={{tx}}&included_in={{bn}}`
- `mymobileapp://signed/{{sig}}`

Available Parameters:

  - `bn`: Block number hint (only present if transaction was broadcast).
  - `ex`: Expiration time used when resolving request.
  - `rbn`: Reference block num used when resolving request.
  - `req`: The originating signing request encoded as a uri string.
  - `rid`: Reference block id used when resolving request.
  - `sa`: Signer authority string, aka account name.
  - `sp`: Signer permission string, e.g. "active".
  - `req`: The originating signing request packed as a uri string.
  - `sig`: The first signature.
  - `sigX`: All signatures are 0-indexed as `sig0`, `sig1`, etc.
  - `cid`: Chain id used when resolving the request.
  - `tx`: Transaction id used when resolving request.

When the callback is performed in the background all the parameters are included as a JSON object.

---

## Use Cases

The EOSIO Signing Request format enables many different methods of communication to convey request data from any application to any signature provider.

The following are a few examples of how these payloads could be transmitted.

### Custom URI Scheme Format

The EOSIO Signing Request in a custom URI scheme format uses the `scheme` and `path` components defined within [RFC 3986](https://www.ietf.org/rfc/rfc3986.txt).

```
esr:<signing_request>
\_/ \_______________/
 |         |
 scheme    path
```

The `scheme` that defines the URI format is `esr`. Any client application capable of handling EOSIO transactions can register itself as the default system handler for this scheme.

The `path` portion of the URI is a represents a "[Signing Request](#Signing-Request-Specification)". The data that makes up each request is serialized using the same binary format as the EOSIO blockchain. Each request is also encoded using a [url-safe Base64 variant](#base64u) and optionally [compressed using zlib deflate](#compression).

###### Format Example

The following is an example of a `voteproducer` action on the `eosio` contract within the `path` of the URI.

```
esr:gmNgZGRkAIFXBqEFopc6760yugsVYWCA0YIwxgKjuxLSL6-mgmQA
\_/ \__________________________________________________/
 |         |
 scheme    path
```

Once decoded/inflated ([preview request](https://eosio.to/gmNgZGRkAIFXBqEFopc6760yugsVYWCA0YIwxgKjuxLSL6-mgmQA)) it will return the following signing request:

```
{
  "callback": "",
  "chain_id": [ "chain_alias", 1 ],
  "flags": 1,
  "info": [],
  "req": [
    [
      "action[]",
      {
        "account": "eosio",
        "name": "voteproducer",
        "authorization": [
          {
            "actor": "............1",
            "permission": "............2"
          }
        ],
        "data": {
          "voter": "............1",
          "proxy": "greymassvote",
          "producers": []
        }
      }
    ]
  ]
}
```

### URI Usage

Many URI schemes are commonly used within hyperlinks (anchor tags) in HTML and QR codes to allow a camera-based transfer of information in mobile devices. Taking the transaction from the above example of a referendum vote action, with a URI of:

```
esr:gmNgZGRkAIFXBqEFopc6760yugsVYWCA0YIwxgKjuxLSL6-mgmQA
```

The transaction can be triggered with the following examples:

###### Hyperlink

Example:

```
<a href="esr:gmNgZGRkAIFXBqEFopc6760yugsVYWCA0YIwxgKjuxLSL6-mgmQA">
  Clickable Hyperlink
</a>
```

If a user were to click the above link with a EOSIO URI compatible application installed, the transaction would be triggered within the end users chosen EOSIO client.

### Custom QR Code Format

As well as being portable enough for usage within a URI/URL format, the same payload data can also be represented as a QR Code to be consumed by any device with QR scanning capabilities.

![qrcode:gmNgZGRkAIFXBqEFopc6760yugsVYWCA0YIwxgKjuxLSL6-mgmQA](../assets/eep-7/qrcode.png)

Scanning the above QR code on a device with QR Code capabilities could trigger the payload within the end user specified signature provider.

---

## Implementations

Existing implementation of the EOSIO URI Scheme (REV 2) include:

##### JS Client Session Frameworks

- [greymass/anchor-link](https://github.com/greymass/anchor-link) ([npm](https://www.npmjs.com/package/anchor-link)): A JavaScript library that uses ESR identity requests to create user sessions for bidirectional communication between applications and signature providers.
- [eosnewyork/eos-transit-anchorlink-provider](https://github.com/eosnewyork/eos-transit/tree/master/packages/eos-transit-anchorlink-provider) ([npm](https://www.npmjs.com/package/eos-transit-anchorlink-provider)): A JavaScript plugin for [eosnewyork/eos-transit](https://github.com/eosnewyork/eos-transit) that uses [greymass/anchor-link](https://github.com/greymass/anchor-link) to allow authentication and signing requests using the ESR protocol.
- [greymass/ual-anchor](https://github.com/greymass/ual-anchor) ([npm](https://www.npmjs.com/package/ual-anchor)): A JavaScript plugin for [EOSIO/universal-authenticator-library](https://github.com/EOSIO/universal-authenticator-library) that uses [greymass/anchor-link](https://github.com/greymass/anchor-link) to allow authentication and signing requests using the ESR protocol.

##### JS SDKs/Libraries
- [greymass/eosio-signing-request](https://github.com/greymass/eosio-signing-request) ([npm](https://www.npmjs.com/package/eosio-signing-request)): A JavaScript library to facilitate the creation and consumption of EOSIO Signing Requests.
- [greymass/anchor-link-browser-transport](https://github.com/greymass/anchor-link-browser-transport) ([npm](https://www.npmjs.com/package/anchor-link-browser-transport)): A transport layer and browser/UI toolkit that extends [greymass/anchor-link](https://github.com/greymass/anchor-link) for applications to integrate directly.
- [greymass/anchor-link-console-transport](https://github.com/greymass/anchor-link-console-transport) ([npm](https://www.npmjs.com/package/anchor-link-console-transport)): A transport layer for developers working with ESR to interact with [greymass/anchor-link](https://github.com/greymass/anchor-link) in a console environment.

##### JS Examples

- [greymass/anchor-link-demo](https://github.com/greymass/anchor-link-demo): A VueJS example webapp supporting a single account capable of signing any contract/action using the [greymass/anchor-link](https://github.com/greymass/anchor-link) library.
- [greymass/anchor-link-demo-multipass](https://github.com/greymass/anchor-link-demo-multipass): A ReactJS example webapp supporting multiple accounts and multiple blockchains using the [greymass/anchor-link](https://github.com/greymass/anchor-link) library.
- [greymass/eos-transit-demo-multipass](https://github.com/greymass/eos-transit-demo-multipass): A ReactJS example webapp supporting multiple accounts and multiple blockchains using the [eosnewyork/eos-transit-anchorlink-provider](https://github.com/eosnewyork/eos-transit/tree/master/packages/eos-transit-anchorlink-provider) library.
- [greymass/eosio-signing-request-demo](https://github.com/greymass/eosio-signing-request-demo): Example code using the base [greymass/eosio-signing-request](https://github.com/greymass/eosio-signing-request) library to create request payloads.
- [greymass/greymassfuel-transit-demo](https://github.com/greymass/greymassfuel-transit-demo): A VueJS example webapp using [eosnewyork/eos-transit](https://github.com/eosnewyork/eos-transit) and [eosnewyork/eos-transit-anchorlink-provider](https://github.com/eosnewyork/eos-transit/tree/master/packages/eos-transit-anchorlink-provider) to create example transactions that use OBFA action.
- [greymass/ual-anchor-demo](https://github.com/greymass/ual-anchor-demo): An example based on the [EOSIO/ual-plainjs-renderer](https://github.com/EOSIO/ual-plainjs-renderer/tree/master/examples) example, utilizing [greymass/ual-anchor](https://github.com/greymass/ual-anchor).
- [greymass/ual-reactjs-renderer-demo-multipass](https://github.com/greymass/ual-reactjs-renderer-demo-multipass): A ReactJS example webapp supporting multiple accounts and multiple blockchains using the [greymass/ual-anchor](https://github.com/greymass/ual-anchor) and [ual-reactjs-renderer](https://github.com/EOSIO/ual-reactjs-renderer) libraries.


##### Java Libraries

- [greymass/eosio-signing-request-java](https://github.com/greymass/eosio-signing-request-java) ([bintray](https://bintray.com/greymass/com.greymass.eosio-signing-request/eosio-signing-request-java)): A Java wrapper for [eosio-signing-request](https://github.com/greymass/eosio-signing-request) to facilitate the creation and consumption of EOSIO Signing Requests.

##### Swift Libraries
- [greymass/swift-eosio](https://github.com/greymass/swift-eosio): A library for working with EOSIO blockchains, which has built-in support for ESR requests similar to [greymass/eosio-signing-request](https://github.com/greymass/eosio-signing-request).

##### Signature Providers

- [Anchor](https://github.com/greymass/eos-voter): ESR compatible wallet/signature provider.

##### User Interfaces

- [EOSIO.to](https://eosio.to) ([source code](https://github.com/greymass/eosio.to)): Provides Signing Request verification and signature provider hooks.
- [EOSIO URI Builder](https://greymass.github.io/eosio-uri-builder/) ([source code](https://github.com/greymass/eosio-uri-builder)): User Interface to encode/decode EOSIO Signing Requests.

---

## Test Cases

**Note**: These examples all use [eosjs v20.0.0](https://github.com/EOSIO/eosjs/tree/v20.0.0) for its `Serialize` component.

#### Example - Transaction to encoded PATH

This example will take an EOSIO Signing Request and convert it into a compressed string.

[![Edit clever-heisenberg-gobmi](https://codesandbox.io/static/img/play-codesandbox.svg)](https://codesandbox.io/s/clever-heisenberg-gobmi?fontsize=14&hidenavigation=1&theme=dark)

```js
/*
  EOSIO URI Specification

  Example: Encoding an EOSIO Signing Request into a compressed payload
*/

const { Serialize } = require('eosjs');
const zlib = require('zlib');
const util = require('util');

const textEncoder = new util.TextEncoder();
const textDecoder = new util.TextDecoder();

// The signing request to be encoded
const signingRequest = {
  // "chain_id": [ "uint8", 1 ],
  "callback": "https://domain.com",
  "chain_id": [ "chain_id", "aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906"],
  "flags": 1,
  "info": [],
  "req": [
    "action[]",
    [
      {
        "account": "eosio.forum",
        "name": "vote",
        "authorization": [
          {
            "actor": "............1",
            "permission": "............2"
          }
        ],
        "data": "0100000000000000000000204643BABA0100"
      }
    ]
  ],
}

// The minified ABI struct used to deserialize the request
const abi = {version:"eosio::abi/1.1",types:[{new_type_name:"account_name",type:"name"},{new_type_name:"action_name",type:"name"},{new_type_name:"permission_name",type:"name"},{new_type_name:"chain_alias",type:"uint8"},{new_type_name:"chain_id",type:"checksum256"},{new_type_name:"request_flags",type:"uint8"}],structs:[{name:"permission_level",fields:[{name:"actor",type:"account_name"},{name:"permission",type:"permission_name"}]},{name:"action",fields:[{name:"account",type:"account_name"},{name:"name",type:"action_name"},{name:"authorization",type:"permission_level[]"},{name:"data",type:"bytes"}]},{name:"extension",fields:[{name:"type",type:"uint16"},{name:"data",type:"bytes"}]},{name:"transaction_header",fields:[{name:"expiration",type:"time_point_sec"},{name:"ref_block_num",type:"uint16"},{name:"ref_block_prefix",type:"uint32"},{name:"max_net_usage_words",type:"varuint32"},{name:"max_cpu_usage_ms",type:"uint8"},{name:"delay_sec",type:"varuint32"}]},{name:"transaction",base:"transaction_header",fields:[{name:"context_free_actions",type:"action[]"},{name:"actions",type:"action[]"},{name:"transaction_extensions",type:"extension[]"}]},{name:"info_pair",fields:[{name:"key",type:"string"},{name:"value",type:"bytes"}]},{name:"signing_request",fields:[{name:"chain_id",type:"variant_id"},{name:"req",type:"variant_req"},{name:"flags",type:"request_flags"},{name:"callback",type:"string"},{name:"info",type:"info_pair[]"}]},{name:"identity",fields:[{name:"permission",type:"permission_level?"}]},{name:"request_signature",fields:[{name:"signer",type:"name"},{name:"signature",type:"signature"}]}],variants:[{name:"variant_id",types:["chain_alias","chain_id"]},{name:"variant_req",types:["action","action[]","transaction","identity"]}],actions:[{name:"identity",type:"identity"}]};;

/**
* ------------------------------------------------
* Base64u encoding - URL-Safe Base64 variant no padding.
* Based on https://gist.github.com/jonleighton/958841
* ------------------------------------------------
*/

const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function encode(data) {
    const byteLength = data.byteLength;
    const byteRemainder = byteLength % 3;
    const mainLength = byteLength - byteRemainder;

    const parts = [];

    let a;
    let b;
    let c;
    let d;
    let chunk;

    // Main loop deals with bytes in chunks of 3
    for (let i = 0; i < mainLength; i += 3) {
        // Combine the three bytes into a single integer
        chunk = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];

        // Use bitmasks to extract 6-bit segments from the triplet
        a = (chunk & 16515072) >> 18; // 16515072 = (2^6 - 1) << 18
        b = (chunk & 258048) >> 12;   // 258048   = (2^6 - 1) << 12
        c = (chunk & 4032) >> 6;      // 4032     = (2^6 - 1) << 6
        d = chunk & 63;               // 63       =  2^6 - 1

        // Convert the raw binary segments to the appropriate ASCII encoding
        parts.push(charset[a] + charset[b] + charset[c] + charset[d]);
    }

    // Deal with the remaining bytes
    if (byteRemainder === 1) {
        chunk = data[mainLength]

        a = (chunk & 252) >> 2 // 252 = (2^6 - 1) << 2

        // Set the 4 least significant bits to zero
        b = (chunk & 3) << 4 // 3   = 2^2 - 1

        parts.push(charset[a] + charset[b])
    } else if (byteRemainder === 2) {
        chunk = (data[mainLength] << 8) | data[mainLength + 1]

        a = (chunk & 64512) >> 10 // 64512 = (2^6 - 1) << 10
        b = (chunk & 1008) >> 4   // 1008  = (2^6 - 1) << 4

        // Set the 2 least significant bits to zero
        c = (chunk & 15) << 2 // 15    = 2^4 - 1

        parts.push(charset[a] + charset[b] + charset[c])
    }

    return parts.join('')
}

const buffer = new Serialize.SerialBuffer({
    textEncoder: textEncoder,
    textDecoder: textDecoder,
})

const requestTypes = Serialize.getTypesFromAbi(Serialize.createInitialTypes(), abi);
const requestAbi = requestTypes.get('signing_request');
requestAbi.serialize(buffer, signingRequest);

let header = 2;
header |= 1 << 7;

const array = new Uint8Array(zlib.deflateRawSync(Buffer.from(buffer.asUint8Array())));

// Build the array containing the header as the first byte followed by the request
const data = new Uint8Array(array.byteLength + 1);
data[0] = header;
data.set(array, 1);

// base64u encode the array to a string
const encoded = encode(data);
console.log(encoded);

/* Output:

gmNcs7jsE9uOP6rL3rrcvpMWUmN27LCdleD836_eTzFz-vCSjZGRYcm-EsZXBqEMILDA6C5QBAKYoLQQTAAIFNycd-1iZGAUyigpKSi20tdPyc9NzMzTS87PZQAA

*/
```

#### Example - Encoded PATH to Transaction

This example will take a compressed payload string and convert it into an EOSIO Signing Request structure.

[![Edit mutable-wind-ccvvn](https://codesandbox.io/static/img/play-codesandbox.svg)](https://codesandbox.io/s/mutable-wind-ccvvn?fontsize=14&hidenavigation=1&theme=dark)

```js
/*
  EOSIO URI Specification

  Example: Decoding and inflating a encoded payload string
*/

const { Serialize } = require('eosjs');
const zlib = require('zlib');
const util = require('util');

const textEncoder = new util.TextEncoder();
const textDecoder = new util.TextDecoder();

// The URI path to be decoded
const uriPath = 'gmNcs7jsE9uOP6rL3rrcvpMWUmN27LCdleD836_eTzFz-vCSjZGRYcm-EsZXBqEMILDA6C5QBAKYoLQQTAAIFNycd-1iZGAUyigpKSi20tdPyc9NzMzTS87PZQAA';

// The minified ABI struct used to deserialize the request
const abi = {version:"eosio::abi/1.1",types:[{new_type_name:"account_name",type:"name"},{new_type_name:"action_name",type:"name"},{new_type_name:"permission_name",type:"name"},{new_type_name:"chain_alias",type:"uint8"},{new_type_name:"chain_id",type:"checksum256"},{new_type_name:"request_flags",type:"uint8"}],structs:[{name:"permission_level",fields:[{name:"actor",type:"account_name"},{name:"permission",type:"permission_name"}]},{name:"action",fields:[{name:"account",type:"account_name"},{name:"name",type:"action_name"},{name:"authorization",type:"permission_level[]"},{name:"data",type:"bytes"}]},{name:"extension",fields:[{name:"type",type:"uint16"},{name:"data",type:"bytes"}]},{name:"transaction_header",fields:[{name:"expiration",type:"time_point_sec"},{name:"ref_block_num",type:"uint16"},{name:"ref_block_prefix",type:"uint32"},{name:"max_net_usage_words",type:"varuint32"},{name:"max_cpu_usage_ms",type:"uint8"},{name:"delay_sec",type:"varuint32"}]},{name:"transaction",base:"transaction_header",fields:[{name:"context_free_actions",type:"action[]"},{name:"actions",type:"action[]"},{name:"transaction_extensions",type:"extension[]"}]},{name:"info_pair",fields:[{name:"key",type:"string"},{name:"value",type:"bytes"}]},{name:"signing_request",fields:[{name:"chain_id",type:"variant_id"},{name:"req",type:"variant_req"},{name:"flags",type:"request_flags"},{name:"callback",type:"string"},{name:"info",type:"info_pair[]"}]},{name:"identity",fields:[{name:"permission",type:"permission_level?"}]},{name:"request_signature",fields:[{name:"signer",type:"name"},{name:"signature",type:"signature"}]}],variants:[{name:"variant_id",types:["chain_alias","chain_id"]},{name:"variant_req",types:["action","action[]","transaction","identity"]}],actions:[{name:"identity",type:"identity"}]};;

/**
* Base64u - URL-Safe Base64 variant no padding.
* Based on https://gist.github.com/jonleighton/958841
*/

const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const lookup = new Uint8Array(256);
for (let i = 0; i < 64; i += 1) { lookup[charset.charCodeAt(i)] = i; }

function decode(input) {
  const byteLength = input.length * 0.75;
  const data = new Uint8Array(byteLength);

  let a;
  let b;
  let c;
  let d;
  let p = 0;

  for (let i = 0; i < input.length; i += 4) {
    a = lookup[input.charCodeAt(i)];
    b = lookup[input.charCodeAt(i + 1)];
    c = lookup[input.charCodeAt(i + 2)];
    d = lookup[input.charCodeAt(i + 3)];

    data[p++] = (a << 2) | (b >> 4);
    data[p++] = ((b & 15) << 4) | (c >> 2);
    data[p++] = ((c & 3) << 6) | (d & 63);
  }

  return data;
}

// Decode the URI Path string into a Uint8Array byte array
const data = decode(uriPath);

// Retrieve header byte and check protocol version
const header = data[0];
const version = header & ~(1 << 7);
if (version !== 2) {
  throw new Error('Invalid protocol version');
}

// Disregard data beyond header byte
let array = data.slice(1);

// Determine via header if zlib deflated and inflate if needed
if ((header & 1 << 7) !== 0) {
  array = new Uint8Array(zlib.inflateRawSync(Buffer.from(array)));
}

// Create buffer based on the decoded/decompressed byte array
const buffer = new Serialize.SerialBuffer({ textEncoder, textDecoder, array });

// Create and retrieve the signing_request abi
const requestTypes = Serialize.getTypesFromAbi(Serialize.createInitialTypes(), abi);
const requestAbi = requestTypes.get('signing_request');

// Deserialize the buffer using the signing_request abi and return request object
const signingRequest = requestAbi.deserialize(buffer);
console.log(util.inspect(signingRequest, { showHidden: false, depth: null }));

/* Output:

{
  chain_id: [
    'chain_id',
    'ACA376F206B8FC25A6ED44DBDC66547C36C6C33E3A119FFBEAEF943642F0E906'
  ],
  req: [
    'action[]',
    [
      {
        account: 'eosio.forum',
        name: 'vote',
        authorization: [ { actor: '............1', permission: '............2' } ],
        data: '0100000000000000000000204643BABA0100'
      }
    ]
  ],
  flags: 1,
  callback: 'https://domain.com',
  info: []
}

*/
````

---

## Appendix

##### Base64u

An URL-safe version of Base64 where `+` is replaced by `-`, `/` by `_` and the padding (`=`) is trimmed.

```
base64
SGn+dGhlcmUh/k5pY2X+b2b+eW91/nRv/mRlY29kZf5tZf46KQ==

base64u
SGn-dGhlcmUh_k5pY2X-b2b-eW91_nRv_mRlY29kZf5tZf46KQ
```

##### Callback Proxies

In an effort to help protect the privacy of EOSIO account holders, EOSIO clients which handle signing requests should allow a configurable proxy service to further anonymize outgoing callbacks.

When a callback is made directly from a signing application, the IP address and other identifiable information is sent along with that request could be potentially used in malicious ways. To prevent this, the use of a simple proxy/forwarder can be implemented within the EOSIO client.

For example, if a signing request specified a callback of:

```
https://example.com/signup?tx=ef82d7c2b81675554a4b58586dcf18c2a03a96ff3b8b408c50b34ed9380f94f5
```

This URL can be URI Encoded and passed to a trusted/no-log 3rd party service in order to forward the information. If a proxy service resided at `https://eosuriproxy.com/redirect/{{URL}}`, the callback URL could be then passed through the service as such:

```js
const proxyUri = `https://eosuriproxy.com/redirect/${encodeURIComponent(https://example.com/signup?tx=ef82d7c2b81675554a4b58586dcf18c2a03a96ff3b8b408c50b34ed9380f94f5)}`
```

The proxy service would intercept the callback and forward the request onto the destination URL.

##### Chain Aliases

The following aliases are predefined:

  value  | name     | chain_id
 --------|----------|----------
  `0x00` | RESERVED |
  `0x01` | EOS      | `aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906`
  `0x02` | TELOS    | `4667b205c6838ef70ff7988f6e8257e8be0e1284a2f59699054a018f743b1d11`
  `0x03` | JUNGLE   | `038f4b0fc8ff18a4f0842a8f0564611f6e96e8535901dd45e43ac8691a1c4dca`
  `0x04` | KYLIN    | `5fff1dae8dc8e2fc4d5b23b2c7665c97f9e9d8edf2b6485a86ba311c25639191`
  `0x05` | WORBLI   | `73647cde120091e0a4b85bced2f3cfdb3041e266cbbe95cee59b73235a1b3b6f`
  `0x06` | BOS      | `d5a3d18fbb3c084e3b1f3fa98c21014b5f3db536cc15d08f9f6479517c6a3d86`
  `0x07` | MEETONE  | `cfe6486a83bad4962f232d48003b1824ab5665c36778141034d75e57b956e422`
  `0x08` | INSIGHTS | `b042025541e25a472bffde2d62edd457b7e70cee943412b1ea0f044f88591664`
  `0x09` | BEOS     | `b912d19a6abd2b1b05611ae5be473355d64d95aeff0c09bedc8c166cd6468fe4`
  `0x10` | WAX      | `1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4`
  `0x11` | PROTON   | `384da888112027f0321850a169f737c33e53b388aad48b5adace4bab97f437e0`
  `0x12` | FIO      | `21dcae42c0182200e93f954a074011f9048a7624c6fe81d3c9541a614a88bd1c`

##### Compression

If the compression bit is set in the header the signing request data is compressed using zlib deflate.

Using compression is recommended since it generates much shorter URIs (and smaller QR codes) but left optional since when used in a contract bandwidth is often cheaper than CPU time.

The following example shows the same signing request, compressed vs uncompressed.

```
original:

esr:AQABAACmgjQD6jBVAAAAVy08zc0BAQAAAAAAAAABAAAAAAAAADEBAAAAAAAAAAAAAAAAAChdoGgGAAAAAAAERU9TAAAAABBzaGFyZSBhbmQgZW5qb3khAQA

zlib deflated:

esr:gWNgZGBY1mTC_MoglIGBIVzX5uxZRqAQGMBoQxgDAjRiF2SwgVksrv7BIFqgOCOxKFUhMS9FITUvK79SkZEBAA
```

##### Identity Requests

Identity requests can be issued to allow someone to prove ownership of a EOSIO account permission. They can either request a specific permission or any permission to be used as a login request.

This request type is not valid unless a callback is set since they can not be broadcast on-chain.

**Note that identity requests can only verify key auths, not account auths. E.g. you can not prove ownership of `bob@active` using `alice@active` even though bob has granted alice an account auth for that permission.**

###### Identity Proof Action

To create the identity proof the wallet signs a special EOSIO transaction that is not valid on-chain. The reason for it being a transaction and not just an arbitrary signature is that some hardware wallets do not support signing anything other than a EOSIO transaction.

To resolve a identity request to the identity proof action the optional account permssion from the request data is copied to the following action:

```jsonc
{
    "account": "", // uint64(0)
    "name": "identity",
    "authorization": [
        {
            "actor": "foobarfoobar",
            "permission": "active"
        }
    ],
    "data": {
        "scope": "mydapp",
        "permission": {
            "actor": "foobarfoobar",
            "permission": "active"
        }
    }
}
```

If the permission is not set in the request data the placeholder permission is used instead:

```jsonc
{
    "account": "",
    "name": "identity",
    "authorization": [
        {
            "actor": "............1",
            "permission": "............2"
        }
    ],
    "data": {
        "permission": {
            "actor": "............1",
            "permission": "............2"
        }
    }
}
```

###### Signing Identity Proof Actions

The signature is just a standard EOSIO transaction signature (chainId + serializedTx + 32bytePadding) but can also be thought of as a magic if a full EOSIO library isn't available at the verification point.

```
sign(sha256(
  <32-byte chain id>
  <4-byte expiration utc seconds>
  000000000000000000000100000000000000000000003ebb3c557201 // tx header
  <8-byte signer name>
  <8-byte signer permission>
  19 // action data len
  <8-byte scope>
  01 // permission present
  <8-byte signer name again>
  <8-byte signer permission again>
  00 // tx extensions
  0000000000000000000000000000000000000000000000000000000000000000 // zero padding
))
```

##### Multi-chain requests

When the chain id variant is set to the `0` (UNKNOWN) alias the signer may choose what chain id to use when resolving the request. Optionally the request can embed a `chain_ids` info key of the type `vector<variant<chain_id, chain_alias>>` to inform the signer which chains are available.

The signer must provide selected chain id as the `cid` parameter in the response payload for multi-chain requests.

##### MIME Type

In situations where a MIME type is applicable, the following should be used:

```
application/eosio-signing-request
```

If signing requests are being saved to files, the file type extension should be saved as `.esr`, e.g. `myfile.esr`.

##### Null transaction header

The "null" header consists of expiration date set to `1970-01-01T00:00:00` and ref block number and prefix set to zero and is used to denote that the resolver should fill in appropriate values.

```jsonc
{
  "expiration": "1970-01-01T00:00:00",
  "ref_block_num": 0,
  "ref_block_prefix": 0,
  // ...
}
```

##### Signing Request - Placeholders

Within the payload of a signing request, placeholders may be set in both `authorization` and `data` (sub)fields. REV 2 of the URI Specification defines two placeholders:

- `............1` represents the account name used to sign the transaction.
- `............2` represents the account permission used to sign the transaction.

These placeholders should be resolved within EOSIO Clients based on the data provided by the signer when resolving a transaction.

Given the following signing request example:

```js
{ account: "eosio.token",
  name: "transfer",
  authorization: [{actor: "............1", permission: "............2"}],
  data: {
    from: "............1",
    to: "bar",
    quantity: "42.0000 EOS",
    memo: "Don't panic" }}
```

The EOSIO Client handling the request should notice the placeholder values and resolve their values. In this instance, if it were being signed with the authority `foo@active`, the action would resolve to:


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

This allows the end user control over which account to trigger an action with and requires no knowledge of the account within a URI.

##### Signing Request - Schema

The data represented in a Signing Request can be represented in the following structures.

###### Signing Request represented as a EOSIO C++ struct:

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

struct identity {
    name scope;
    optional<permission_level> permission;
}

struct signing_request {
    variant<chain_alias, chain_id> chain_id;
    variant<action, vector<action>, transaction, identity> req;
    bool broadcast;
    optional<callback> callback;
}
```

###### Signing Request represented as an EOSIO ABI:

```js
{
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
                    name: 'scope',
                    type: 'name',
                },
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
```

---

## Backwards Compatibility

- Revision 2 of the ESR signing protocol introduces breaking changes from Revision 1.

---

## Change Log

- 2021/02/05: Revision 3, updated identity request data & multi-chain requests
- 2020/05/29: Add details on request resolution and & signatures
- 2020/05/20: Updated to Revision 2
- 2019/10/28: Added change log, MIME type recommendation

---

## Acknowledgements

This proposal is inspired by the Bitcoin's [BIP 0021](https://github.com/bitcoin/bips/blob/master/bip-0021.mediawiki), Ethereum's [ERC-67](https://github.com/ethereum/EIPs/issues/67), [EIP-681](https://eips.ethereum.org/EIPS/eip-681), [EIP-831](http://eips.ethereum.org/EIPS/eip-831), and Steem's [URI Spec](https://github.com/steemit/steem-uri-spec). Implementations of the URI protocol within these ecosystems pioneered the way by establishing a baseline for future adaptations like this.

---

## Copyright

Copyright and related rights waived via [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
