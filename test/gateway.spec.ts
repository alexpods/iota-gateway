import { expect, use }from 'chai'
import { spy, stub } from 'sinon'

use(require('chai-as-promised'))
use(require('sinon-chai'))

import { Gateway } from '../src/gateway'
import { Transport } from '../src/transport'
import { TransportStub } from './utils'

describe("Gateway", () => {
  let gateway: Gateway
  let transports: Transport[]


  beforeEach(() => {
    transports = [
      new TransportStub(),
      new TransportStub(),
    ]

    for (const transport of transports) {
      transport.run  = spy()
      transport.stop = spy()
    }

    gateway = new Gateway({ transports })
  })


  describe("run()", () => {
    it("should call run() method of all gateway's transports", async () => {
      for (let transport of transports) {
        expect(transport.run).to.not.have.been.called
      }

      await expect(gateway.run()).to.be.fulfilled

      for (let transport of transports) {
        expect(transport.run).to.have.been.called
      }
    })

    it("should be rejected if some of the transports run() calls was rejected", async () => {
      transports[0].run = stub().resolves()
      transports[1].run = stub().rejects()

      await expect(gateway.run()).to.be.rejected
    })

    it("should call stop() methods of all gateway's transports " +
       "if some of the transports run() calls was rejected", async () => {

      transports[0].run = stub().rejects()
      transports[1].run = stub().resolves()

      for (let transport of transports) {
        expect(transport.stop).to.not.have.been.called
      }

      await expect(gateway.run()).to.be.rejected

      for (let transport of transports) {
        expect(transport.stop).to.have.been.called
      }
    })

    it("should be rejected if server is already started", async () => {
      await expect(gateway.run()).to.not.be.rejected
      await expect(gateway.run()).to.be.rejected
    })
  })

  describe("stop()", () => {
    it("should call stop() method of all gateway's transports", async () => {
      await gateway.run()

      for (let transport of transports) {
        expect(transport.stop).to.not.have.been.called
      }

      await expect(gateway.stop()).to.be.fulfilled

      for (let transport of transports) {
        expect(transport.stop).to.have.been.called
      }
    })

    it("should be rejected if some of the transports stop() calls was rejected", async () => {
      transports[0].stop = stub().resolves()
      transports[1].stop = stub().rejects()

      await expect(gateway.stop()).to.be.rejected
    })

    it("should be rejected if the gateway is not running", async () => {
      await expect(gateway.stop()).to.be.rejected
    })

  })
})
