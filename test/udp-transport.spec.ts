import { expect } from 'chai'
import { createSocket, Socket } from 'dgram'
import { spy, SinonSpy} from 'sinon'
import { Factory, Serializer, Transaction, Hash } from 'iota-tangle'
import { Packer } from '../src/packer'
import { UdpTransport } from '../src/udp-transport'
import { generateTransaction, generateHash } from './utils'

describe('UdpTransport', () => {
  let serializer: Serializer
  let factory: Factory
  let packer: Packer
  let transport: UdpTransport
  let port = 3050
  let clientPort = 3060

  let transaction: Transaction
  let requestHash: Hash

  beforeEach(() => {
    serializer = new Serializer()
    factory = new Factory({ serializer })
    packer = new Packer({ factory })
    transport = new UdpTransport({ port, packer })

    transaction = generateTransaction()
    requestHash = generateHash()
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
      socket = createSocket('udp4')
    })

    afterEach(async () => {
      await new Promise(resolve => socket.close(resolve))
      await transport.stop()
    })

    it('should start receiving udp packets', async () => {
      const packet = packer.pack({ transaction, requestHash })

      expect(receiveCallback).to.not.have.been.called
      await new Promise(resolve => socket.send(packet, port, '127.0.0.1', resolve))
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(receiveCallback).to.have.been.called

      const [receivedTransaction, params] = receiveCallback.args[0]

      expect(receivedTransaction.bytes.equals(transaction.bytes)).to.be.true
      expect(params.neighbor).to.equal('127.0.0.1')
      expect(params.requestHash.bytes.equals(requestHash.bytes.slice(0, 46))).to.be.true
    })
  })

  describe('stop()', () => {
    let receiveCallback: SinonSpy
    let socket: Socket

    beforeEach(async () => {
      receiveCallback = spy()
      await transport.run(receiveCallback)
      socket = createSocket('udp4')
    })

    afterEach(async () => {
      await new Promise(resolve => socket.close(resolve))
    })

    it('should stop receiving udp packets', async () => {
      const packet = packer.pack({ transaction, requestHash })

      await transport.stop()

      expect(receiveCallback).to.not.have.been.called
      await new Promise(resolve => socket.send(packet, port, '127.0.0.1', resolve))
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(receiveCallback).to.not.have.been.called
    })
  })

  describe('send(transaction, { neighbor, requestHash })', () => {
    let socket: Socket

    beforeEach(async () => {
      await transport.run(() => {})
      socket = createSocket('udp4')
    })

    afterEach(async () => {
      await new Promise(resolve => socket.close(resolve))
      await transport.stop()
    })

    it('should send the specified transaction to the specified neighbor', async () => {
      const packet = packer.pack({ transaction, requestHash })

      const messageCallbackSpy = spy()
      const errorCallbackSpy = spy()

      socket.on('message', messageCallbackSpy)
      socket.on('error',   errorCallbackSpy)

      await new Promise(resolve => socket.bind(clientPort, resolve))

      expect(messageCallbackSpy).to.not.have.been.called
      expect(errorCallbackSpy).to.not.have.been.called

      await transport.send(transaction, { neighbor: `udp://127.0.0.1:${clientPort}`, requestHash })
      await new Promise(resolve => setTimeout(resolve, 20))

      expect(messageCallbackSpy).to.have.been.called
      expect(errorCallbackSpy).to.not.have.been.called

      const receivedData = packer.unpack(messageCallbackSpy.args[0][0])

      expect(receivedData.transaction.bytes.equals(transaction.bytes)).to.be.true
      expect(receivedData.requestHash.bytes.equals(requestHash.bytes.slice(0, 46))).to.be.true
    })
  })
})
