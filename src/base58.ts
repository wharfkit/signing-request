// TODO: vendor in a base58 version that does not use node buffers
import * as BaseX from 'base-x'
const Base58 = BaseX('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz')
export const base58Encode = (data: Uint8Array) => Base58.encode(Buffer.from(data))
export const base58Decode = (data: string) => new Uint8Array(Base58.decode(data))
