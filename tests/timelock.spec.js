const { time } = require('@openzeppelin/test-helpers')
const ethers = require('ethers')
const MarsToken = artifacts.require('MarsToken')
const MasterPlanet = artifacts.require('MasterPlanet')
const Timelock = artifacts.require('Timelock')

const { BN } = require('@openzeppelin/test-helpers')
const { expect } = require('chai')
const { web3 } = require('@openzeppelin/test-helpers/src/setup')

require('chai')
  .use(require('chai-bn')(BN))
  .use(require('chai-as-promised'))
  .should()

contract('Timelock', ([deployer, alice, bob, carol, governor]) => {
  beforeEach(async () => {
    const currentBlock = await web3.eth.getBlockNumber()
    const currentTime = Number(await time.latest())
    this.token = await MarsToken.new()
    this.masterPlanet = await MasterPlanet.new(this.token.address, deployer, deployer, '30000000000000000', currentBlock)
    this.timelock = await Timelock.new(86400) // timelock with delay of 1 day
    await this.masterPlanet.transferOwnership(this.timelock.address)

    this.queueParams = [
      this.masterPlanet.address,
      0,
      'updateEmissionRate(uint256)',
      ethers.utils.defaultAbiCoder.encode(['uint256'], ['100000000']),
      currentTime + 86460
    ]
  })

  describe('queueTransaction', () => {
    it('should queue a transaction without executing it', async () => {
      const txHash = await this.timelock.queueTransaction.call(...this.queueParams)
      expect(await this.timelock.queuedTransactions(txHash)).to.be.eq(false)
      await this.timelock.queueTransaction(...this.queueParams)
      expect(await this.timelock.queuedTransactions(txHash)).to.be.eq(true)
      expect((await this.masterPlanet.marsPerBlock()).toString()).to.be.eq('30000000000000000')
    })
  })

  describe('executeTransaction', () => {
    it('should allow to execute a queued transaction after the delay', async () => {
      await this.timelock.queueTransaction(...this.queueParams)
      expect((await this.masterPlanet.marsPerBlock()).toString()).to.be.eq('30000000000000000')
      await time.increase(time.duration.days(2))
      await this.timelock.executeTransaction(...this.queueParams)
      expect((await this.masterPlanet.marsPerBlock()).toString()).to.be.eq('100000000')
    })

    it('should not allow to execute a queued transaction before the delay', async () => {
      await this.timelock.queueTransaction(...this.queueParams)
      expect((await this.masterPlanet.marsPerBlock()).toString()).to.be.eq('30000000000000000')
      await this.timelock.executeTransaction(...this.queueParams)
        .should.be.rejectedWith('Transaction hasn\'t surpassed time lock')
    })
  })

  describe('cancelTransaction', () => {
    it('should cancel a queued transaction', async () => {
      const txHash = await this.timelock.queueTransaction.call(...this.queueParams)
      await this.timelock.queueTransaction(...this.queueParams)
      expect(await this.timelock.queuedTransactions(txHash)).to.be.eq(true)
      await this.timelock.cancelTransaction(...this.queueParams)
      expect(await this.timelock.queuedTransactions(txHash)).to.be.eq(false)
    })
  })
})
