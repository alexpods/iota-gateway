import { Transaction, Hash, Factory, Serializer } from 'iota-tangle'
import { Data } from '../src/gateway'
import { Transport } from '../src/transport'
import { Neighbor } from '../src/neighbor'

const serializer = new Serializer()
const factory = new Factory({ serializer })


export function generateTransaction(): Transaction {
  const buffer = Buffer.alloc(1604)

  buffer.write(String(Math.random()), 0, 18)

  return factory.createTransactionFromBytes(buffer)
}


export function generateHash(): Hash {
  const buffer = Buffer.alloc(49)

  buffer.write(String(Math.random()), 0, 18)

  return factory.createHashFromBytes(buffer)
}


export class NeighborStub extends Neighbor {
  private _address: string

  constructor(params: { address: string }) {
    super()
    this._address = params.address
  }

  get address(): string {
    return this._address
  }
}


export class TransportStub extends Transport {
  private _isRunning = false
  private _supports: Function

  get isRunning() {
    return this._isRunning
  }

  constructor(params: { supports: Function }) {
    super()
    this._supports = params.supports
  }

  supports(neighbor: Neighbor): boolean {
    return this._supports(neighbor)
  }

  async addNeighbor(neighbor: Neighbor): Promise<void> {}
  async removeNeighbor(neighbor: Neighbor): Promise<void> {}

  async send(data: Data, neighbor: Neighbor): Promise<void> {}

  async run(): Promise<void> {
    this._isRunning = true
  }

  async shutdown(): Promise<void> {
    this._isRunning = false
  }
}
