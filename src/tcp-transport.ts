import { Server, Socket } from 'net'
import { Transaction, Hash } from 'iota-tangle'
import { Transport, ReceiveCallback } from './transport'
import { Packer, PACKET_SIZE } from './packer';

const BlockStream = require('block-stream')

export class TcpTransport extends Transport {
  private _port:   number
  private _server: Server
  private _packer: Packer

  private _receiveCallback: ReceiveCallback
  private _sockets: { [address: string]: Socket } = {}

  private _isRunning = false

  private _onConnection = (socket: Socket) => {
    this._initSocket(socket)
  }

  private _onClose = () => {
    for (let address in this._sockets) {
      this._destroySocket(this._sockets[address])
    }
  }

  constructor(params: {
    port:   number
    packer: Packer
  }) {
    super()
    this._port   = params.port
    this._packer = params.packer
    this._server = new Server()
  }

  get isRunning(): boolean {
    return this._isRunning
  }

  async send(transaction: Transaction, params: { neighbor: string, requestHash: Hash }): Promise<void> {
    const socket = this._sockets[params.neighbor]
    const packet = this._packer.pack({ transaction, requestHash: params.requestHash })

    await new Promise(resolve => socket.write(packet, resolve))
  }

  async run(cb: ReceiveCallback): Promise<void> {
    if (this._isRunning) {
      throw new Error("Can't start the TCP transport. It's already running!")
    }

    this._receiveCallback = cb

    this._server.on('connection', this._onConnection)
    this._server.on('close',      this._onClose)

    await new Promise((resolve) => {
      this._server.listen({ port: this._port }, () => {
        resolve()
      })
    })

    this._isRunning = true
  }

  async stop(): Promise<void> {
    if (!this._isRunning) {
      throw new Error("Can't stop the TCP transport. It's not running!")
    }

    this._server.close()

    this._server.removeListener('connection', this._onConnection)
    this._server.removeListener('close',      this._onClose)

    this._isRunning = false
  }

  private _initSocket(socket: Socket): void {
    let onData, onClose

    let { port, address, family } = socket.address()

    const neighbor = family === 'IPv6' ? address.split(':').pop() : address

    socket.pipe(new BlockStream(PACKET_SIZE))
      .on('data', onData = (packet: Buffer) => {
        const data = this._packer.unpack(packet)

        this._receiveCallback(data.transaction, { neighbor, requestHash: data.requestHash })
      })
      .on('error', (error) => {
        console.error(error)
      })
      .on('close', onClose = () => {
        socket.removeListener('data',  onData)
        socket.removeListener('close', onClose)
        delete this._sockets[address]
      })

    this._sockets[neighbor] = socket
  }

  private _destroySocket(socket: Socket): void {
    socket.destroy()
  }
}