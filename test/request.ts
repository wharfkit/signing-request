import * as assert from 'assert'
import 'mocha'
import {TextDecoder, TextEncoder} from 'util'
import {SigningRequest, SigningRequestEncodingOptions} from '../src'
import abiProvider from './utils/mock-abi-provider'
import zlib from './utils/node-zlib-provider'

const options: SigningRequestEncodingOptions = {
    abiProvider, zlib,
    textDecoder: new TextDecoder(),
    textEncoder: new TextEncoder(),
}

const timestamp = '2018-02-15T00:00:00.000'

describe('signing request', function() {

    it('should create from action', async function() {
        const request = await SigningRequest.create({
            action: {
                account: 'eosio.token',
                name: 'transfer',
                authorization: [{actor: 'foo', permission: 'active'}],
                data: {from: 'foo', to: 'bar', quantity: '1.000 EOS', memo: 'hello there'},
            },
        }, options)
        assert.deepStrictEqual(request.data, {
            chain_id: ['chain_alias', 1],
            req: ['action', {
                account: 'eosio.token',
                name: 'transfer',
                authorization: [{actor: 'foo', permission: 'active'}],
                data: '000000000000285D000000000000AE39E80300000000000003454F53000000000B68656C6C6F207468657265',
            }],
            callback: null,
            broadcast: true,
        })
    })

    it('should create from actions', async function() {
        const request = await SigningRequest.create({
            actions: [{
                account: 'eosio.token',
                name: 'transfer',
                authorization: [{actor: 'foo', permission: 'active'}],
                data: {from: 'foo', to: 'bar', quantity: '1.000 EOS', memo: 'hello there'},
            }, {
                account: 'eosio.token',
                name: 'transfer',
                authorization: [{actor: 'baz', permission: 'active'}],
                data: {from: 'baz', to: 'bar', quantity: '1.000 EOS', memo: 'hello there'},
            }],
        }, options)
        assert.deepStrictEqual(request.data, {
            chain_id: ['chain_alias', 1],
            req: ['action[]', [{
                account: 'eosio.token',
                name: 'transfer',
                authorization: [{actor: 'foo', permission: 'active'}],
                data: '000000000000285D000000000000AE39E80300000000000003454F53000000000B68656C6C6F207468657265',
            }, {
                account: 'eosio.token',
                name: 'transfer',
                authorization: [{actor: 'baz', permission: 'active'}],
                data: '000000000000BE39000000000000AE39E80300000000000003454F53000000000B68656C6C6F207468657265',
            }]],
            callback: null,
            broadcast: true,
        })
    })

    it('should create from transaction', async function() {
        const request = await SigningRequest.create({
            transaction: {
                delay_sec: 123,
                expiration: timestamp,
                max_cpu_usage_ms: 99,
                actions: [{
                    account: 'eosio.token',
                    name: 'transfer',
                    authorization: [{actor: 'foo', permission: 'active'}],
                    data: '000000000000285D000000000000AE39E80300000000000003454F53000000000B68656C6C6F207468657265',
                }],
            },
        }, options)
        assert.deepStrictEqual(request.data, {
            chain_id: ['chain_alias', 1],
            req: ['transaction', {
                actions: [{
                    account: 'eosio.token',
                    name: 'transfer',
                    authorization: [{actor: 'foo', permission: 'active'}],
                    data: '000000000000285D000000000000AE39E80300000000000003454F53000000000B68656C6C6F207468657265',
                }],
                context_free_actions: [],
                delay_sec: 123,
                expiration: timestamp,
                max_cpu_usage_ms: 99,
                max_net_usage_words: 0,
                ref_block_num: 0,
                ref_block_prefix: 0,
                transaction_extensions: [],
            }],
            callback: null,
            broadcast: true,
        })
    })

    it('should resolve to transaction', async function() {
        const request = await SigningRequest.create({
            action: {
                account: 'eosio.token',
                name: 'transfer',
                authorization: [{actor: 'foo', permission: 'active'}],
                data: {from: 'foo', to: 'bar', quantity: '1.000 EOS', memo: 'hello there'},
            },
        }, options)
        const tx = await request.getTransaction('foo@active', {
            timestamp,
            block_num: 1234,
            expire_seconds: 0,
            ref_block_prefix: 56789,
        })
        assert.deepStrictEqual(tx, {
            actions: [
              {
                account: 'eosio.token',
                name: 'transfer',
                authorization: [{actor: 'foo', permission: 'active'}],
                data: {from: 'foo', to: 'bar', quantity: '1.000 EOS', memo: 'hello there'},
              },
            ],
            context_free_actions: [],
            transaction_extensions: [],
            expiration: timestamp,
            ref_block_num: 1234,
            ref_block_prefix: 56789,
            max_cpu_usage_ms: 0,
            max_net_usage_words: 0,
            delay_sec: 0,
        })
    })

    it('should resolve with placeholder name', async function() {
        const request = await SigningRequest.create({
            action: {
                account: 'eosio.token',
                name: 'transfer',
                authorization: [{actor: '............1', permission: '............1'}],
                data: {from: '............1', to: 'bar', quantity: '1.000 EOS', memo: 'hello there'},
            },
        }, options)
        const tx = await request.getTransaction('foo@active', {
            timestamp,
            block_num: 1234,
            expire_seconds: 0,
            ref_block_prefix: 56789,
        })
        assert.deepStrictEqual(tx, {
            actions: [
              {
                account: 'eosio.token',
                name: 'transfer',
                authorization: [{actor: 'foo', permission: 'active'}],
                data: {from: 'foo', to: 'bar', quantity: '1.000 EOS', memo: 'hello there'},
              },
            ],
            context_free_actions: [],
            transaction_extensions: [],
            expiration: timestamp,
            ref_block_num: 1234,
            ref_block_prefix: 56789,
            max_cpu_usage_ms: 0,
            max_net_usage_words: 0,
            delay_sec: 0,
        })
    })

})
