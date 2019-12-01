import {readdirSync as readdir, readFileSync as readfile} from 'fs'
import {join as joinPath} from 'path'
import {AbiProvider} from '../../src'

// To add an ABI for testing run (in project root):
// CONTRACT=eosio.token; cleos -u https://eos.greymass.com get abi $CONTRACT > test/abis/$CONTRACT.json

export class MockAbiProvider implements AbiProvider {
    constructor(public readonly abis: {[account: string]: any}) {}

    public async getAbi(account: string) {
        const abi = this.abis[account]
        if (!abi) {
            throw new Error(`No ABI for: ${account}`)
        }
        return abi
    }
}

function createTestProvider() {
    const dir = joinPath(__dirname, '../abis')
    const abis: {[account: string]: any} = {}
    readdir(dir).forEach((name) => {
        abis[name.slice(0, -5)] = JSON.parse(readfile(joinPath(dir, name)).toString('utf8'))
    })
    return new MockAbiProvider(abis)
}

export default createTestProvider()
