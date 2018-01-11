import { Transaction, Hash } from 'iota-tangle'

import { Transport } from './transport'
import { Packer } from './packer'

export class Gateway {

  private _isRunning: boolean = false
  private _transports: Transport[]

  constructor(params: {
    transports: Transport[]
  }) {
    this._transports = params.transports
  }

  async send(transaction: Transaction, params: { neighbor: string, requestHash: Hash }): Promise<void> {

  }

  async run(): Promise<void> {
    if (this._isRunning) {
      throw new Error('The gateway is already running!')
    }

    try {
      await Promise.all(this._transports.map(t => t.run(() => {})))
    } catch (error) {
      await Promise.all(this._transports.map(t => t.stop()))
      throw error
    }

    this._isRunning = true
  }

  async stop(): Promise<void> {
    if (!this._isRunning) {
      throw new Error('The gateway is not running!')
    }

    await Promise.all(this._transports.map(t => t.stop()))

    this._isRunning = false
  }
}
