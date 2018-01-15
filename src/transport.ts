import { EventEmitter } from 'events'
import { Data } from './gateway'
import { Neighbor } from './neighbor'

export abstract class Transport extends EventEmitter {
  abstract get isRunning (): boolean

  abstract supports (neighbor: Neighbor): boolean

  abstract async run (): Promise<void>
  abstract async shutdown (): Promise<void>

  abstract async addNeighbor (neighbor: Neighbor): Promise<void>
  abstract async removeNeighbor (neighbor: Neighbor): Promise<void>

  abstract async send (data: Data, neighbor: Neighbor): Promise<void>
}
