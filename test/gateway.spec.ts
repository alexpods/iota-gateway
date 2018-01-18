import { expect, use }from 'chai'
import { spy, stub, SinonSpy } from 'sinon'

use(require('chai-as-promised'))
use(require('sinon-chai'))

import { Transaction, Hash } from 'iota-tangle'
import { Gateway, Data } from '../src/gateway'
import { Transport } from '../src/transport'
import { Neighbor } from '../src/neighbor'
import { TransportStub, NeighborStub, generateHash, generateTransaction } from './utils'
import { setTimeout } from 'timers'

describe('Gateway', () => {
  let gateway: Gateway
  let transports: Transport[]
  let neighbors: Neighbor[]

  beforeEach(() => {
    neighbors = [
      new NeighborStub({ address: 'address1' }),
      new NeighborStub({ address: 'address2' })
    ]

    transports = [
      new TransportStub({ supports: (n) => n === neighbors[0] }),
      new TransportStub({ supports: (n) => n === neighbors[1] || n.address.startsWith('1234') })
    ]

    gateway = new Gateway({ neighbors, transports })
  })

  describe('run()', () => {
    let runEventCallback: SinonSpy
    let receiveEventCallback: SinonSpy
    let neighborEventCallback: SinonSpy
    let errorEventCallback: SinonSpy

    beforeEach(() => {
      for (const transport of transports) {
        spy(transport, 'run')
        spy(transport, 'addNeighbor')
        spy(transport, 'removeNeighbor')
        spy(transport, 'shutdown')
      }

      gateway.on('run',      runEventCallback = spy())
      gateway.on('receive',  receiveEventCallback = spy())
      gateway.on('neighbor', neighborEventCallback = spy())
      gateway.on('error',    errorEventCallback = spy())
    })

    it('should launch all transports', async () => {
      for (const transport of transports) {
        expect(transport.run).to.not.have.been.called
      }

      await expect(gateway.run()).to.be.fulfilled

      for (let transport of transports) {
        expect(transport.run).to.have.been.calledWith()
      }
    })

    it('should make isRunning flag return true', async () => {
      expect(gateway.isRunning).to.be.false
      await expect(gateway.run()).to.be.fulfilled
      expect(gateway.isRunning).to.be.true
    })

    it('should add neighbors to transports', async () => {
      for (const transport of transports) {
        expect(transport.addNeighbor).to.not.have.been.called
      }

      await expect(gateway.run()).to.be.fulfilled

      expect(transports[0].addNeighbor).to.have.been.calledWith(neighbors[0])
      expect(transports[1].addNeighbor).to.have.been.calledWith(neighbors[1])

      expect(transports[0].addNeighbor).to.not.have.been.calledWith(neighbors[1])
      expect(transports[1].addNeighbor).to.not.have.been.calledWith(neighbors[0])
    })

    it("should emit 'run' event", async () => {
      expect(runEventCallback).to.not.have.been.called

      await expect(gateway.run()).to.be.fulfilled

      expect(runEventCallback).to.have.been.called
    })

    it('should start receiving data from transports', async () => {
      await expect(gateway.run()).to.be.fulfilled

      expect(receiveEventCallback).to.not.have.been.called

      const data = { transaction: generateTransaction(), requestHash: generateHash() }
      const neighbor = neighbors[0]

      transports[0].emit('receive', data, neighbor, neighbor.address)

      expect(receiveEventCallback).to.have.been.called

      const [emittedData, emittedNeighborAddress] = receiveEventCallback.args[0]

      expect(emittedData).to.equal(data)
      expect(emittedNeighborAddress).to.equal(neighbor.address)
    })

    it('should start receiving new neighbors from transports', async () => {
      await expect(gateway.run()).to.be.fulfilled

      const newNeighbor = new NeighborStub({ address: 'address3' })

      expect(gateway.getNeighbor(newNeighbor.address)).to.not.be.ok
      expect(neighborEventCallback).to.not.have.been.called

      transports[1].emit('neighbor', newNeighbor)

      expect(gateway.getNeighbor(newNeighbor.address)).to.be.ok
      expect(neighborEventCallback).to.have.been.called

      const [emittedNewNeighbor] = neighborEventCallback.args[0]

      expect(emittedNewNeighbor).to.equal(newNeighbor)
    })

    it('should start receiving errors from transports', async () => {
      await expect(gateway.run()).to.be.fulfilled

      expect(errorEventCallback).to.not.have.been.called

      const error = new Error('Some error')

      transports[0].emit('error', error)

      expect(errorEventCallback).to.have.been.called

      const [emittedError] = errorEventCallback.args[0]

      expect(emittedError).to.equal(error)
    })

    it('should be rejected if some of the transports run() calls was rejected', async () => {
      transports[0].run = stub().resolves()
      transports[1].run = stub().rejects()

      await expect(gateway.run()).to.be.rejected
    })

    it("should shutdown all the gateway's transports " +
       'if there were an error while lanching the gatway', async () => {

      transports[0].run = stub().rejects()
      transports[1].run = stub().resolves()

      for (let transport of transports) {
        expect(transport.removeNeighbor).to.not.have.been.called
      }

      await expect(gateway.run()).to.be.rejected

      for (let transport of transports) {
        expect(transport.shutdown).to.have.been.called
      }
    })

    it('should remove neighbors from all transports ' +
       'if there were an error while lanching the gatway', async () => {

      transports[0].addNeighbor = stub().rejects()
      transports[1].addNeighbor = stub().resolves()

      for (let transport of transports) {
        expect(transport.removeNeighbor).to.not.have.been.called
      }

      await expect(gateway.run()).to.be.rejected

      expect(transports[0].removeNeighbor).to.have.been.calledWith(neighbors[0])
      expect(transports[1].removeNeighbor).to.have.been.calledWith(neighbors[1])

      expect(transports[0].removeNeighbor).to.not.have.been.calledWith(neighbors[1])
      expect(transports[1].removeNeighbor).to.not.have.been.calledWith(neighbors[0])
    })

    it('should be rejected if server is already started', async () => {
      await expect(gateway.run()).to.not.be.rejected
      await expect(gateway.run()).to.be.rejected
    })
  })

  describe('shutdown()', () => {
    let receiveEventCallback: SinonSpy
    let errorEventCallback: SinonSpy
    let shutdownEventCallback: SinonSpy

    beforeEach(async () => {
      await gateway.run()
    })

    beforeEach(() => {
      for (const transport of transports) {
        spy(transport, 'removeNeighbor')
        spy(transport, 'shutdown')
      }

      gateway.on('receive',   receiveEventCallback = spy())
      gateway.on('error',     errorEventCallback = spy())
      gateway.on('shutdown',  shutdownEventCallback = spy())
    })

    it("should shutdown all the gateway's transports", async () => {
      for (let transport of transports) {
        expect(transport.shutdown).to.not.have.been.called
      }

      await expect(gateway.shutdown()).to.be.fulfilled

      for (let transport of transports) {
        expect(transport.shutdown).to.have.been.called
      }
    })

    it('should make isRunning flag return false', async () => {
      expect(gateway.isRunning).to.be.true
      await expect(gateway.shutdown()).to.be.fulfilled
      expect(gateway.isRunning).to.be.false
    })

    it('should remove neighbors from all transports ', async () => {
      for (let transport of transports) {
        expect(transport.removeNeighbor).to.not.have.been.called
      }

      await expect(gateway.shutdown()).to.be.fulfilled

      expect(transports[0].removeNeighbor).to.have.been.calledWith(neighbors[0])
      expect(transports[1].removeNeighbor).to.have.been.calledWith(neighbors[1])

      expect(transports[0].removeNeighbor).to.not.have.been.calledWith(neighbors[1])
      expect(transports[1].removeNeighbor).to.not.have.been.calledWith(neighbors[0])
    })

    it('should stop receiving data from transports', async () => {
      await expect(gateway.shutdown()).to.be.fulfilled

      expect(receiveEventCallback).to.not.have.been.called

      const data = { transaction: generateTransaction(), requestHash: generateHash() }
      const neighbor = neighbors[0]

      transports[0].emit('receive', data, neighbor)

      expect(receiveEventCallback).to.not.have.been.called
    })

    it('should stop receiving errors from transports', async () => {
      await expect(gateway.shutdown()).to.be.fulfilled

      expect(errorEventCallback).to.not.have.been.called

      const error = new Error('Some error')

      transports[0].once('error', () => {})
      transports[0].emit('error', error)

      expect(errorEventCallback).to.not.have.been.called
    })

    it("should emit 'shutdown' event", async () => {
      expect(shutdownEventCallback).to.not.have.been.called

      await expect(gateway.shutdown()).to.be.fulfilled

      expect(shutdownEventCallback).to.have.been.called
    })

    it('should be rejected if some of the transports shutdown() method calls was rejected', async () => {
      transports[0].shutdown = stub().resolves()
      transports[1].shutdown = stub().rejects()

      await expect(gateway.shutdown()).to.be.rejected
    })

    it('should be rejected if the gateway is not running', async () => {
      await expect(gateway.shutdown()).to.be.fulfilled
      await expect(gateway.shutdown()).to.be.rejected
    })
  })

  describe('send(data, neighbor)', () => {
    let data: Data
    let receiveEventCallback: SinonSpy
    let errorEventCallback: SinonSpy
    let shutdownEventCallback: SinonSpy

    beforeEach(async () => {
      data = { transaction: generateTransaction(), requestHash: generateHash() }

      await gateway.run()
    })

    beforeEach(() => {
      for (const transport of transports) {
        spy(transport, 'send')
      }
    })

    it('should delegate sending of data to the specified neighbor', async () => {
      expect(transports[0].send).to.not.have.been.called
      expect(transports[0].send).to.not.have.been.called

      await expect(gateway.send(data, neighbors[0].address)).to.have.been.fulfilled

      expect(transports[0].send).to.have.been.calledWith(data, neighbors[0])
      expect(transports[1].send).to.not.have.been.called
    })

    it("shoudl be rejected if the gateway is not running'", async () => {
      await expect(gateway.shutdown()).to.have.been.fulfilled
      await expect(gateway.send(data, neighbors[0].address)).to.have.been.rejected
    })

    it("should be rejected if a neighbor doesn't exist for specified address", async () => {
      await expect(gateway.send(data, '1234.1234.1234.1243')).to.have.been.rejected

      for (const transport of transports) {
        expect(transport.send).to.not.have.been.called
      }
    })
  })

  describe('addNeighbor(neighbor)', () => {
    let neighbor: Neighbor

    beforeEach(async () => {
      neighbor = new NeighborStub({ address: '1234.1234.1234.1234' })

      await gateway.run()

      for (const transport of transports) {
        spy(transport, 'addNeighbor')
      }
    })

    it('should add neighbor to the gateway', async () => {
      expect(gateway.getNeighbor(neighbor.address)).to.be.null

      await expect(gateway.addNeighbor(neighbor)).to.be.fulfilled

      expect(gateway.getNeighbor(neighbor.address)).to.equal(neighbor)
    })

    it('should add specified neighbor to the transport if the gateway is running', async () => {
      expect(transports[0].addNeighbor).to.not.have.been.called
      expect(transports[1].addNeighbor).to.not.have.been.called

      await expect(gateway.addNeighbor(neighbor)).to.be.fulfilled

      expect(transports[0].addNeighbor).to.not.have.been.called
      expect(transports[1].addNeighbor).to.have.been.calledWith(neighbor)
    })

    it('should not add specified neighbor to the transport if the gateway is not running', async () => {
      await expect(gateway.shutdown()).to.be.fulfilled

      expect(transports[0].addNeighbor).to.not.have.been.called
      expect(transports[1].addNeighbor).to.not.have.been.called

      await expect(gateway.addNeighbor(neighbor)).to.be.fulfilled

      expect(transports[0].addNeighbor).to.not.have.been.called
      expect(transports[1].addNeighbor).to.not.have.been.called
    })

    it('should be rejected if there were an error while adding neighbor to the transport ', async () => {
      transports[1].addNeighbor = stub().rejects()

      expect(transports[0].addNeighbor).to.not.have.been.called
      expect(transports[1].addNeighbor).to.not.have.been.called

      await expect(gateway.addNeighbor(neighbor)).to.be.rejected

      expect(transports[0].addNeighbor).to.not.have.been.called
      expect(transports[1].addNeighbor).to.have.been.calledWith(neighbor)
    })

    it('should be rejected if there is no transport that supports specified neighbor', async () => {
      await expect(gateway.addNeighbor(new NeighborStub({ address: '4321.12.12.12' }))).to.be.rejected
    })

    it('should be rejected if there specified neighbor has been already added to the gateway', async () => {
      await expect(gateway.addNeighbor(neighbor)).to.be.fulfilled
      await expect(gateway.addNeighbor(neighbor)).to.be.rejected
    })
  })

  describe('removeNeighbor(neighbor)', () => {
    let neighbor: Neighbor

    beforeEach(async () => {
      neighbor = new NeighborStub({ address: '1234.1234.1234.1234' })

      await gateway.addNeighbor(neighbor)

      for (const transport of transports) {
        spy(transport, 'removeNeighbor')
      }
    })

    it('should remove the neighbor from the gateway', async () => {
      expect(gateway.getNeighbor(neighbor.address)).to.equal(neighbor)

      await expect(gateway.removeNeighbor(neighbor)).to.be.fulfilled

      expect(gateway.getNeighbor(neighbor.address)).to.be.null
    })

    it("should be rejected if specified neighbor doesn't exist", async () => {
      await expect(gateway.removeNeighbor(new NeighborStub({ address: '1234.555.55.55' }))).to.be.rejected
    })

    it('should remove the neighbor from the transport if the gateway is running', async () => {
      await expect(gateway.run()).to.be.fulfilled

      expect(transports[0].removeNeighbor).to.not.have.been.called
      expect(transports[1].removeNeighbor).to.not.have.been.called

      await expect(gateway.removeNeighbor(neighbor)).to.be.fulfilled

      expect(transports[0].removeNeighbor).to.not.have.been.called
      expect(transports[1].removeNeighbor).to.have.been.calledWith(neighbor)
    })

    it('should be rejected if there were an error while removing the neighbor from the transport', async () => {
      transports[1].removeNeighbor = stub().rejects()

      await expect(gateway.run()).to.be.fulfilled

      expect(transports[0].removeNeighbor).to.not.have.been.called
      expect(transports[1].removeNeighbor).to.not.have.been.called

      await expect(gateway.removeNeighbor(neighbor)).to.be.rejected

      expect(transports[0].removeNeighbor).to.not.have.been.called
      expect(transports[1].removeNeighbor).to.have.been.calledWith(neighbor)
    })

    it('should not remove the neighbor from the transport if the gateway is not running', async () => {
      expect(transports[0].removeNeighbor).to.not.have.been.called
      expect(transports[1].removeNeighbor).to.not.have.been.called

      await expect(gateway.removeNeighbor(neighbor)).to.be.fulfilled

      expect(transports[0].removeNeighbor).to.not.have.been.called
      expect(transports[1].removeNeighbor).to.not.have.been.called
    })
  })
})
