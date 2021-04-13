const { time } = require('@openzeppelin/test-helpers')
const MarsToken = artifacts.require('MarsToken')
const MasterPlanet = artifacts.require('MasterPlanet')
const Referral = artifacts.require('Referral')
const MockBEP20 = artifacts.require('libs/MockBEP20')

const { BN } = require('@openzeppelin/test-helpers')

require('chai')
  .use(require('chai-bn')(BN))
  .use(require('chai-as-promised'))
  .should()

contract('MasterPlanet', ([deployer, alice, bob, carol, governor]) => {

  beforeEach(async () => {
    const currentBlock = await web3.eth.getBlockNumber()
    this.token = await MarsToken.new()
    this.masterPlanet = await MasterPlanet.new(this.token.address, deployer, deployer, '30000000000000000', currentBlock)
    await this.masterPlanet.transferOwnership(governor)
    const referral = await Referral.new()
    await this.masterPlanet.setReferral(referral.address, { from: governor })
    await referral.updateOperator(this.masterPlanet.address, true)
    await this.token.transferOwnership(this.masterPlanet.address)

    this.lp1 = await MockBEP20.new('LP Token 1', 'LP1', '1000000', { from: governor })
    await this.lp1.transfer(alice, '5000', { from: governor })
    await this.lp1.transfer(bob, '5000', { from: governor })

    this.masterPlanet.add(1000, this.lp1.address, 0, true, { from: governor })
    this.lp1pid = await this.masterPlanet.poolLength() - 1
  })

  describe('Deposit', () => {
    it('should record deposits', async () => {
      await this.lp1.approve(this.masterPlanet.address, '3000', { from: alice })

      await this.masterPlanet.deposit(this.lp1pid, '1000', governor, { from: alice })
      const userInfo = await this.masterPlanet.userInfo(this.lp1pid, alice)
      expect(userInfo.amount.toString()).to.be.eq('1000')
      expect((await this.lp1.balanceOf(alice)).toString()).to.be.eq('4000')

      await this.masterPlanet.deposit(this.lp1pid, '2000', governor, { from: alice })
      const userInfo2 = await this.masterPlanet.userInfo(this.lp1pid, alice)
      expect(userInfo2.amount.toString()).to.be.eq('3000')
      expect((await this.lp1.balanceOf(alice)).toString()).to.be.eq('2000')
    })

    it('should not accept a deposit if depositer has not enough balance', async () => {
      await this.lp1.approve(this.masterPlanet.address, 1e10, { from: bob })
      await this.masterPlanet.deposit(this.lp1pid, 1e10, governor, { from: bob })
        .should.be.rejectedWith('transfer amount exceeds balance.')
      expect((await this.lp1.balanceOf(bob)).toString()).to.be.eq('5000')
    })
  })

  describe('Withdraw', () => {
    // Alice and Bob deposited tokens; Carol referred both of them
    beforeEach(async () => {
      await this.lp1.approve(this.masterPlanet.address, '1000', { from: alice })
      await this.masterPlanet.deposit(this.lp1pid, '1000', carol, { from: alice })

      await this.lp1.approve(this.masterPlanet.address, '300', { from: bob })
      await this.masterPlanet.deposit(this.lp1pid, '300', carol, { from: bob })
    })

    it('should return the tokens', async () => {
      await this.masterPlanet.withdraw(this.lp1pid, '200', { from: alice })
      const aliceInfo = await this.masterPlanet.userInfo(this.lp1pid, alice)
      expect(aliceInfo.amount.toString()).to.be.eq('800')
      expect((await this.lp1.balanceOf(alice)).toString()).to.be.eq('4200')

      await this.masterPlanet.withdraw(this.lp1pid, '300', { from: bob })
      const bobInfo = await this.masterPlanet.userInfo(this.lp1pid, bob)
      expect(bobInfo.amount.toString()).to.be.eq('0')
      expect((await this.lp1.balanceOf(bob)).toString()).to.be.eq('5000')
    })

    it('should not return more tokens than deposited', async () => {
      await this.masterPlanet.withdraw(this.lp1pid, '1000', { from: alice })
      await this.masterPlanet.withdraw(this.lp1pid, '1', { from: alice }).should.be.rejectedWith('withdraw: not good.')
      await this.masterPlanet.withdraw(this.lp1pid, '301', { from: bob }).should.be.rejectedWith('withdraw: not good.')
      await this.masterPlanet.withdraw(this.lp1pid, '1', { from: carol }).should.be.rejectedWith('withdraw: not good.')
    })

    it('should return the rewards', async () => {
      await time.increase(time.duration.days(2))
      await this.masterPlanet.withdraw(this.lp1pid, '0', { from: alice })
      expect((await this.lp1.balanceOf(alice)).toString()).to.be.eq('4000')
      expect((await this.token.balanceOf(alice)).toString()).to.have.length(18)
    })

    it('should pay referral commissions', async () => {
      await time.increase(time.duration.days(2))
      await this.masterPlanet.withdraw(this.lp1pid, '0', { from: alice })
      expect((await this.token.balanceOf(carol)).toString()).to.have.length.above(14)
    })
  })

  describe('PendingMars', () => {
    // Alice and Bob deposited tokens, but Carol didn't
    beforeEach(async () => {
      await this.lp1.approve(this.masterPlanet.address, '1000', { from: alice })
      await this.masterPlanet.deposit(this.lp1pid, '1000', governor, { from: alice })

      await this.lp1.approve(this.masterPlanet.address, '300', { from: bob })
      await this.masterPlanet.deposit(this.lp1pid, '300', governor, { from: bob })
    })

    it('should return the rewards after 2 days', async () => {
      await time.increase(time.duration.days(2))
      await this.masterPlanet.updatePool(this.lp1pid)
      const pendingMars = await this.masterPlanet.pendingMars(this.lp1pid, alice)
      expect(pendingMars.toString()).to.have.length.above(16)
    })
  })

  describe('Update MARS emission', () => {
    it('should update MARS token emission rate', async () => {
      expect((await this.masterPlanet.marsPerBlock()).toString()).to.be.eq('30000000000000000')
      await this.masterPlanet.updateEmissionRate('100000000', { from: governor })
      expect((await this.masterPlanet.marsPerBlock()).toString()).to.be.eq('100000000')
    })

    it('should not allow a different address from Governor to update emission rate', async () => {
      await this.masterPlanet.updateEmissionRate('100000000', { from: alice })
        .should.be.rejectedWith('caller is not the owner')
      expect((await this.masterPlanet.marsPerBlock()).toString()).to.be.eq('30000000000000000')
    })
  })

  describe('Safe MARS Upgrade', () => {
    it('should upgrade the owner of the MARS token to a new Master Planet', async () => {
      const currentBlock = await web3.eth.getBlockNumber()
      const newMasterPlanet = await MasterPlanet.new(this.token.address, deployer, deployer, '1', currentBlock)
      expect(await this.masterPlanet.ownsMars()).to.be.eq(true)
      expect(await this.token.getOwner()).to.be.eq(this.masterPlanet.address)

      await this.masterPlanet.safeMarsUpgrade(newMasterPlanet.address, { from: governor })
      expect(await this.masterPlanet.ownsMars()).to.be.eq(false)
      expect(await this.token.getOwner()).to.be.eq(newMasterPlanet.address)
    })

    it('should allow to withdraw LPs after the ownership of MARS token was transferred', async () => {
      const currentBlock = await web3.eth.getBlockNumber()
      const newMasterPlanet = await MasterPlanet.new(this.token.address, deployer, deployer, '1', currentBlock)

      await this.lp1.approve(this.masterPlanet.address, '5000', { from: alice })
      await this.masterPlanet.deposit(this.lp1pid, '5000', governor, { from: alice })
      expect((await this.lp1.balanceOf(alice)).toString()).to.be.eq('0')

      await this.masterPlanet.safeMarsUpgrade(newMasterPlanet.address, { from: governor })
      await this.masterPlanet.withdraw(this.lp1pid, '5000', { from: alice })
      expect((await this.lp1.balanceOf(alice)).toString()).to.be.eq('5000')
    })

    it('should not allow a different address from Governor to upgrade MARS token', async () => {
      const currentBlock = await web3.eth.getBlockNumber()
      const newMasterPlanet = await MasterPlanet.new(this.token.address, deployer, deployer, '1', currentBlock)

      await this.masterPlanet.safeMarsUpgrade(newMasterPlanet.address, { from: alice })
        .should.be.rejectedWith('caller is not the owner')
      expect(await this.masterPlanet.ownsMars()).to.be.eq(true)
      expect(await this.token.getOwner()).to.be.eq(this.masterPlanet.address)
    })
  })
})
