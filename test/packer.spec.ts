import { expect } from 'chai'
import { Transaction, Hash, Factory, Serializer } from 'iota-tangle'
import { Packer, REQUEST_HASH_OFFSET, REQUEST_HASH_SIZE, TRANSACTION_SIZE, TRANSCTION_OFFSET } from '../src/packer'
import { generateTransaction, generateHash } from './utils'

describe('Packer', () => {
  let serializer: Serializer
  let factory: Factory
  let packer: Packer

  let transaction: Transaction
  let requestHash: Hash

  beforeEach(() => {
    serializer = new Serializer()
    factory = new Factory({ serializer })
    packer = new Packer({ factory })

    transaction = generateTransaction()
    requestHash = generateHash()
  })

  describe('pack(packetData)', () => {
    it('should pack the specified transaction and transaction hash into a packet of bytes', () => {
      const packet = packer.pack({ transaction, requestHash })

      expect(packet).to.be.an.instanceOf(Buffer)
      expect(packet.length).to.equal(1650)

      const packetTransactionBytes = packet.slice(0,    1604)
      const packetRequestHashBytes = packet.slice(1604, 1650)

      expect(packetTransactionBytes.equals(transaction.bytes)).to.be.true
      expect(packetRequestHashBytes.equals(requestHash.bytes.slice(0, REQUEST_HASH_SIZE))).to.be.true
    })
  })

  describe('unpack(packet)', () => {
    it('should unpack the specified packet', () => {
      const packet = packer.pack({ transaction, requestHash })
      const data   = packer.unpack(packet)

      expect(data).to.have.property('transaction')
      expect(data).to.have.property('requestHash')
      expect(data.transaction.bytes.equals(transaction.bytes)).to.be.true
      expect(data.requestHash.bytes.equals(requestHash.bytes.slice(0, 46))).to.be.true
    })
  })
})
