import { Transaction, Hash } from 'iota-tangle'

export interface ReceiveCallback {
  (transaction: Transaction, params: { neighbor: string, requestHash?: Hash }): void
}

export abstract class Transport {
  abstract async send(transaction: Transaction, { neighbor: string, requestHash: Hash }): Promise<void>
  abstract async run(cb: ReceiveCallback): Promise<void>
  abstract async stop(): Promise<void>
}
