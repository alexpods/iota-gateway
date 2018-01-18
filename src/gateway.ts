import { Transaction, Hash } from 'iota-tangle'
import { EventEmitter } from 'events'
import { Neighbor } from './neighbor'
import { Transport } from './transport'

export interface Data { transaction: Transaction, requestHash: Hash }

interface TransportListeners {
  onReceive:  (data: Data, neighbor: Neighbor, address: string) => void
  onNeighbor: (newNeighbor: Neighbor) => void
  onError:    (error: any) => void
}

export class Gateway extends EventEmitter {
  private _neighbors: Set<Neighbor>
  private _transports: Set<Transport>

  private _neighborsTransportsMap: Map<Neighbor, Transport>

  private _isRunning: boolean = false

  private _transportsListeners = new Map<Transport, TransportListeners>()

  constructor(params: {
    neighbors?: Neighbor[]
    transports?: Transport[]
  }) {
    super()
    const transports = params.transports || []
    const neighbors = params.neighbors || []

    if (!transports.length) {
      throw new Error('You should provide at least one transport for the gateway!')
    }

    const neighborsTransportsMap = new Map<Neighbor, Transport>()

    NEIGHBOR_LOOP: for (const neighbor of neighbors) {
      for (const transport of transports) {
        if (transport.supports(neighbor)) {
          neighborsTransportsMap.set(neighbor, transport)
          continue NEIGHBOR_LOOP
        }
      }

      throw new Error(`Couldn't find a transport for the neighbor '${neighbor.address}'!`)
    }

    this._transports = new Set(transports)
    this._neighbors = new Set(neighbors)

    this._neighborsTransportsMap = neighborsTransportsMap
  }

  get isRunning(): boolean {
    return this._isRunning
  }

  getNeighbor(neighborAddress: string): Neighbor | null {
    for (const neighbor of this._neighbors) {
      if (neighbor.match(neighborAddress)) {
        return neighbor
      }
    }

    return null
  }

  async addNeighbor(neighbor: Neighbor): Promise<void> {
    if (this._neighborsTransportsMap.has(neighbor)) {
      throw new Error(`Couldn't add a neighbor: the neighbor '${neighbor.address}' already exists!`)
    }

    for (const transport of this._transports) {
      if (transport.supports(neighbor)) {
        if (this._isRunning) {
          await transport.addNeighbor(neighbor)
        }

        this._neighborsTransportsMap.set(neighbor, transport)
        this._neighbors.add(neighbor)
        return
      }
    }

    throw new Error(`Couldn't find a transport for the neighbor '${neighbor.address}'!`)
  }

  async removeNeighbor(neighbor: Neighbor): Promise<void> {
    if (!this._neighborsTransportsMap.has(neighbor)) {
      throw new Error(`Couldn't remove a neighbor: the neighbor '${neighbor.address}' doesn't exists!`)
    }

    if (this._isRunning) {
      await this._neighborsTransportsMap.get(neighbor).removeNeighbor(neighbor)
    }

    this._neighborsTransportsMap.delete(neighbor)
    this._neighbors.delete(neighbor)
  }

  async run(): Promise<void> {
    if (this._isRunning) {
      throw new Error('The gateway is already running!')
    }

    try {
      await Promise.all(Array.from(this._transports).map(async (transport: Transport) => {
        await transport.run()
      }))

      await Promise.all(Array.from(this._neighbors).map(async (neighbor: Neighbor) => {
        await this._neighborsTransportsMap.get(neighbor).addNeighbor(neighbor)
      }))

      for (const transport of this._transports) {
        let onReceive, onNeighbor, onError

        transport.on('receive', onReceive = (data: Data, neighbor: Neighbor, address) => {
          this.emit('receive', data, address)
        })

        transport.on('neighbor', onNeighbor = (newNeighbor: Neighbor) => {
          this._neighborsTransportsMap.set(newNeighbor, transport)
          this._neighbors.add(newNeighbor)
          this.emit('neighbor', newNeighbor)
        })

        transport.on('error', onError = (error: any) => {
          this.emit('error', error)
        })

        this._transportsListeners.set(transport, { onReceive, onNeighbor, onError })
      }

    } catch (error) {
      await Promise.all(Array.from(this._neighbors).map(async (neighbor: Neighbor) => {
        try {
          await this._neighborsTransportsMap.get(neighbor).removeNeighbor(neighbor)
        } catch (error) { /* ignore any errors */ }
      }))

      await Promise.all(Array.from(this._transports).map(async (transport: Transport) => {
        try {
          await transport.shutdown()
        } catch (error) { /* ignore any errors */ }
      }))

      throw error
    }

    this.emit('run')
    this._isRunning = true
  }

  async shutdown(): Promise<void> {
    if (!this._isRunning) {
      throw new Error('The gateway is not running!')
    }

    await Promise.all(Array.from(this._neighbors).map((neighbor: Neighbor) => {
      return this._neighborsTransportsMap.get(neighbor).removeNeighbor(neighbor)
    }))

    await Promise.all(Array.from(this._transports).map((transport: Transport) => {
      return transport.shutdown()
    }))

    for (const transport of this._transports) {
      const { onReceive, onNeighbor, onError } = this._transportsListeners.get(transport)

      transport.removeListener('receive',  onReceive)
      transport.removeListener('neighbor', onNeighbor)
      transport.removeListener('error',    onError)

      this._transportsListeners.delete(transport)
    }

    this.emit('shutdown')
    this._isRunning = false
  }

  async send(data: Data, neighborAddress: string): Promise<void> {
    if (!this._isRunning) {
      throw new Error("Can't send a data: the gateway is not running!")
    }

    const neighbor = this.getNeighbor(neighborAddress)

    if (!neighbor) {
      throw new Error(`Neighbor is not found for address '${neighborAddress}'!`)
    }

    await this._neighborsTransportsMap.get(neighbor).send(data, neighbor, neighborAddress)
  }
}
