import { createConnection, Socket } from 'net'
import { expect } from 'chai'
import { spy, SinonSpy } from 'sinon'
import { Factory, Serializer, Transaction, Hash } from 'iota-tangle'
import { Packer } from '../src/packer'
import { TcpTransport } from '../src/tcp-transport'
import { generateTransaction, generateHash } from './utils'
import { request } from 'http';

const BlockStream = require('block-stream')

process.on('uncaughtException', (error) => {
  console.log(error.stack)
})

process.on('unhandledRejection', (error) => {
  console.log(error.stack)
})

describe('TcpTransport', () => {
  let serializer: Serializer
  let factory: Factory
  let packer: Packer
  let transport: TcpTransport
  let port = 3050

  let transaction: Transaction
  let requestHash: Hash
  let packet: Buffer

  async function connect(): Promise<Socket> {
    let socket: Socket

    await new Promise((resolve) => {
      socket = createConnection({ port }, resolve)
    })

    return socket
  }

  beforeEach(() => {
    serializer = new Serializer()
    factory    = new Factory({ serializer })
    packer     = new Packer({ factory })
    transport  = new TcpTransport({ port, packer })

    transaction = generateTransaction()
    requestHash = generateHash()
    packet = packer.pack({ transaction, requestHash })
  })

  afterEach(async () => {
    if (transport.isRunning) {
      await transport.stop()
    }
  })

  describe('run(cb)', () => {
    let receiveCallback: SinonSpy
    let socket: Socket

    beforeEach(async () => {
      receiveCallback = spy()
      await transport.run(receiveCallback)
      socket = await connect()
    })

    afterEach(async () => {
      socket.destroy()
    })

    it('should start receiving tcp packets', async () => {
      const { address } = socket.address()

      expect(receiveCallback).to.not.have.been.called
      await new Promise(resolve => socket.write(packet, resolve))
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(receiveCallback).to.have.been.called

      const [receivedTransaction, params] = receiveCallback.args[0]

      expect(receivedTransaction.bytes.equals(transaction.bytes)).to.be.true
      expect(params.neighbor).to.equal(address)
      expect(params.requestHash.bytes.equals(requestHash.bytes.slice(0, 46))).to.be.true
    })
  })

  describe('stop()', () => {
    xit('should stop receiving tcp packets and disconnect all sockets', async () => {
      const connectCallback = spy()
      const closeCallback = spy()

      await transport.run(() => {})

      const socket = await connect()

      socket.on('connect', connectCallback)
      socket.on('close', closeCallback)
      socket.on('error', (error) => {})

      expect(connectCallback).to.not.have.been.called
      expect(closeCallback).to.not.have.been.called

      await transport.stop()
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(connectCallback).to.not.have.been.called
      expect(closeCallback).to.have.been.called
    })
  })

  describe('send(transaction, { neighbor, requestHash })', () => {
    let socket: Socket

    beforeEach(async () => {
      await transport.run(() => {})
      socket = await connect()
      await new Promise(resolve => setTimeout(resolve, 20))
    })

    afterEach(async () => {
      socket.destroy()
    })

    it('should send the specified transaction to the specified neighbor', async () => {
      const dataCallbackSpy = spy()
      const errorCallbackSpy = spy()

      socket.pipe(new BlockStream(packer.packetSize))
        .on('data',  dataCallbackSpy)
        .on('error', errorCallbackSpy)

      const { address } = socket.address()

      await transport.send(transaction, { neighbor: address, requestHash })
      await new Promise(resolve => setTimeout(resolve, 20))

      expect(dataCallbackSpy).to.have.been.called
      expect(errorCallbackSpy).to.not.have.been.called

      const receivedData = packer.unpack(dataCallbackSpy.args[0][0])

      expect(receivedData.transaction.bytes.equals(transaction.bytes)).to.be.true
      expect(receivedData.requestHash.bytes.equals(requestHash.bytes.slice(0, 46))).to.be.true
    })
  })
})
