import { Socket, createSocket } from 'dgram'
import { parse as parseUrl } from 'url'
import { Transaction, Hash } from 'iota-tangle'
import { Packer, PacketData } from '../src/packer'
import { Transport, ReceiveCallback } from './transport'

export class UdpTransport extends Transport {
  private _port: number
  private _packer: Packer
  private _socket: Socket|null = null
  private _receiveCallback: ReceiveCallback

  private _isRunning = false

  constructor(params: {
    port: number
    packer: Packer
  }) {
    super()
    this._port   = params.port
    this._packer = params.packer
  }

  get isRunning(): boolean {
    return this._isRunning
  }

  async send(transaction: Transaction, params: { neighbor: string, requestHash: Hash }): Promise<void> {
    const { hostname, port } = parseUrl(params.neighbor)
    const packet = this._packer.pack({ transaction, requestHash: params.requestHash })

    await new Promise(resolve => this._socket.send(packet, Number(port), hostname, resolve))
  }

  async run(cb: ReceiveCallback): Promise<void> {
    if (this._isRunning) {
      throw new Error("Can't start the UDP transport. It's not running!")
    }

    const socket = createSocket('udp4')

    let onMessage, onClose, onError

    socket.on('message', onMessage = (message: Buffer, rinfo) => {
      let data: PacketData

      try {
        data = this._packer.unpack(message)
      } catch (error) {}

      if (data) {
        this._receiveCallback(data.transaction, {
          neighbor: rinfo.address,
          requestHash: data.requestHash
        })
      }
    })

    socket.on('error', onError = (error: any) => {
      console.error(error)
    })

    socket.on("close", onClose = () => {
      socket.removeListener('message', onMessage)
      socket.removeListener('error',   onError)
      socket.removeListener('close',   onClose)
      this._socket = null
    })

    await new Promise(resolve => socket.bind(this._port, resolve))

    this._socket = socket
    this._receiveCallback = cb
    this._isRunning = true
  }

  async stop(): Promise<void> {
    if (!this._isRunning) {
      throw new Error("Can't stop the UDP transport. It's not running!")
    }

    await new Promise(resolve => this._socket.close(resolve))

    this._isRunning = false
  }
}
