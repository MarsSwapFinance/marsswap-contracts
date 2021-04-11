const { time } = require('@openzeppelin/test-helpers')
const ethers = require('ethers')
const MarsToken = artifacts.require('MarsToken')
const MasterPlanet = artifacts.require('MasterPlanet')
const Timelock = artifacts.require('Timelock')
const GovernorAlpha = artifacts.require('GovernorAlpha')

const { BN } = require('@openzeppelin/test-helpers')
const { expect } = require('chai')
const { web3 } = require('@openzeppelin/test-helpers/src/setup')

require('chai')
  .use(require('chai-bn')(BN))
  .use(require('chai-as-promised'))
  .should()

contract('GovernorAlpha', ([deployer, alice, bob, carol, dev]) => {
  beforeEach(async () => {
    const currentBlock = await web3.eth.getBlockNumber()

    this.token = await MarsToken.new()
    await this.token.mint(alice, 100000)
    await this.token.mint(bob, 99900)
    await this.token.mint(carol, 100)

    this.masterPlanet = await MasterPlanet.new(this.token.address, deployer, deployer, '30000000000000000', currentBlock)
    this.timelock = await Timelock.new(86400) // timelock with delay of 1 day
    await this.masterPlanet.transferOwnership(this.timelock.address)
    this.governor = await GovernorAlpha.new(this.timelock.address, this.token.address, dev)
    await this.timelock.transferOwnership(this.governor.address)

    this.queueParams = [
      [this.masterPlanet.address],
      [0],
      ['updateEmissionRate(uint256)'],
      [ethers.utils.defaultAbiCoder.encode(['uint256'], ['100000000'])],
      'Proposal description'
    ]

    await this.token.delegate(alice, { from: alice })
    await this.token.delegate(bob, { from: bob })
    await this.token.delegate(carol, { from: carol })

    // to prevent proposals from using flash loans, the delegated balance at the previous block is checked
    await time.advanceBlock()
  })

  describe('quorumVotes', () => {
    it('should be 2% of total supply', async () => {
      expect((await this.governor.quorumVotes()).toString()).to.be.eq('4000')
    })
  })

  describe('proposalThreshold', () => {
    it('should be 0.1% of total supply', async () => {
      expect((await this.governor.proposalThreshold()).toString()).to.be.eq('200')
    })
  })

  describe('propose', () => {
    it('should allow proposals by an address with at least 2% of MARS supply', async () => {
      await this.governor.propose(...this.queueParams, { from: alice })
      expect((await this.governor.proposalCount()).toString()).to.be.eq('1')
      await time.advanceBlock()

      expect((await this.governor.state(1)).toString()).to.be.eq('0') // Pending
      await time.advanceBlock()
      expect((await this.governor.state(1)).toString()).to.be.eq('1') // Active
      expect((await this.governor.proposals(1)).proposer).to.be.eq(alice)
    })

    it('should not allow proposals by an address with less than 2% of MARS supply', async () => {
      await this.governor.propose(...this.queueParams, { from: carol })
        .should.be.rejectedWith('proposer votes below proposal threshold')
    })
  })

  describe('castVote', () => {
    it('should allow to vote on an active proposal', async () => {
      await this.governor.propose(...this.queueParams, { from: alice })
      await time.advanceBlock()
      await time.advanceBlock()

      await this.governor.castVote('1', true, { from: bob })
      expect(((await this.governor.proposals(1)).forVotes).toString()).to.be.eq('99900')
      expect(((await this.governor.proposals(1)).againstVotes).toString()).to.be.eq('0')

      await this.governor.castVote('1', false, { from: carol })
      expect(((await this.governor.proposals(1)).forVotes).toString()).to.be.eq('99900')
      expect(((await this.governor.proposals(1)).againstVotes).toString()).to.be.eq('100')
    })

    it('should not allow to vote on a non-active proposal', async () => {
      await this.governor.propose(...this.queueParams, { from: alice })
      await this.governor.castVote('1', true, { from: bob }).should.be.rejectedWith('voting is closed')
    })

    it('should not allow the same address to vote twice', async () => {
      await this.governor.propose(...this.queueParams, { from: alice })
      await time.advanceBlock()
      await time.advanceBlock()

      await this.governor.castVote('1', true, { from: bob })
      await this.governor.castVote('1', true, { from: bob }).should.be.rejectedWith('voter already voted')
    })
  })

  describe('queue', () => {
    beforeEach(async () => {
      await this.governor.propose(...this.queueParams, { from: alice })
      await time.advanceBlock()
      await time.advanceBlock()
    })

    it('should queue a succeeded proposal', async () => {
      await this.governor.castVote('1', true, { from: bob })
      const currentBlock = await web3.eth.getBlockNumber()
      await time.advanceBlockTo(currentBlock + 84000)

      await this.governor.queue(1)
      const currentTime = Number(await time.latest())
      expect(((await this.governor.proposals(1)).eta).toString()).to.be.eq('' + (currentTime + 86400))
    })

    it('should not allow to queue an active proposal', async () => {
      await this.governor.castVote('1', true, { from: bob })
      await this.governor.queue(1).should.be.rejectedWith('proposal can only be queued if it is succeeded')
    })

    it('should not allow to queue a failed proposal', async () => {
      await this.governor.castVote('1', false, { from: bob })
      const currentBlock = await web3.eth.getBlockNumber()
      await time.advanceBlockTo(currentBlock + 84000)
      await this.governor.queue(1).should.be.rejectedWith('proposal can only be queued if it is succeeded')
      expect(((await this.governor.proposals(1)).eta).toString()).to.be.eq('0')
    })
  })

  describe('execute', () => {
    beforeEach(async () => {
      await this.governor.propose(...this.queueParams, { from: alice })
      await time.advanceBlock()
      await time.advanceBlock()
    })

    it('should execute a queued proposal after timelock delay', async () => {
      await this.governor.castVote('1', true, { from: bob })
      const currentBlock = await web3.eth.getBlockNumber()
      await time.advanceBlockTo(currentBlock + 84000)
      await this.governor.queue(1)

      expect((await this.governor.proposals(1)).executed).to.be.eq(false)
      expect((await this.masterPlanet.marsPerBlock()).toString()).to.be.eq('30000000000000000')
      await time.increase(time.duration.days(2))
      await this.governor.execute(1)
      expect((await this.governor.proposals(1)).executed).to.be.eq(true)
      expect((await this.masterPlanet.marsPerBlock()).toString()).to.be.eq('100000000')
    })

    it('should not execute a queued proposal before timelock delay', async () => {
      await this.governor.castVote('1', true, { from: bob })
      const currentBlock = await web3.eth.getBlockNumber()
      await time.advanceBlockTo(currentBlock + 84000)
      await this.governor.queue(1)

      await this.governor.execute(1).should.be.rejectedWith('Transaction hasn\'t surpassed time lock')
      expect((await this.masterPlanet.marsPerBlock()).toString()).to.be.eq('30000000000000000')
    })

    it('should not allow to execute a non-queued proposal', async () => {
      await this.governor.execute(1).should.be.rejectedWith('proposal can only be executed if it is queued')
      expect((await this.masterPlanet.marsPerBlock()).toString()).to.be.eq('30000000000000000')
    })
  })
})
