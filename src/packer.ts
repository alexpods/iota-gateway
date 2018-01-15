import { Transaction, Factory } from 'iota-tangle'
import { Data } from './gateway'

export const TRANSCTION_OFFSET = 0
export const TRANSACTION_SIZE = Transaction.BYTES_SIZE

export const REQUEST_HASH_OFFSET = TRANSCTION_OFFSET + TRANSACTION_SIZE
export const REQUEST_HASH_SIZE = 46

export const PACKET_SIZE = TRANSACTION_SIZE + REQUEST_HASH_SIZE

export class Packer {
  private _factory: Factory

  constructor (params: { factory: Factory }) {
    this._factory = params.factory
  }

  get packetSize (): number {
    return PACKET_SIZE
  }

  pack (data: Data): Buffer {
    const buffer = Buffer.alloc(PACKET_SIZE)

    data.transaction.bytes.copy(buffer, TRANSCTION_OFFSET, 0, TRANSACTION_SIZE)
    data.requestHash.bytes.copy(buffer, REQUEST_HASH_OFFSET, 0, REQUEST_HASH_SIZE)

    return buffer
  }

  unpack (packet: Buffer): Data {
    const transactionBytes = packet.slice(TRANSCTION_OFFSET, TRANSCTION_OFFSET + TRANSACTION_SIZE)
    const hashBytes = packet.slice(REQUEST_HASH_OFFSET, REQUEST_HASH_OFFSET + REQUEST_HASH_SIZE)

    return {
      transaction: this._factory.createTransactionFromBytes(transactionBytes),
      requestHash: this._factory.createHashFromBytes(hashBytes)
    }
  }
}
