const { time } = require('@openzeppelin/test-helpers')
const MarsToken = artifacts.require('MarsToken')
const MasterChefV2 = artifacts.require('MasterChefV2')
const MockBEP20 = artifacts.require('libs/MockBEP20')

const { BN } = require('@openzeppelin/test-helpers')

require('chai')
  .use(require('chai-bn')(BN))
  .use(require('chai-as-promised'))
  .should()

contract('MasterChef', ([deployer, alice, bob, carol, dev]) => {

  beforeEach(async () => {
    this.token = await MarsToken.deployed()
    this.masterChef = await MasterChefV2.deployed()

    this.lp1 = await MockBEP20.new('LP Token 1', 'LP1', '1000000', { from: dev })
    await this.lp1.transfer(alice, '5000', { from: dev })
    await this.lp1.transfer(bob, '5000', { from: dev })

    this.masterChef.add(1000, this.lp1.address, 0, true)
    this.lp1pid = await this.masterChef.poolLength() - 1
  })

  describe('Deposit', () => {
    it('should record deposits', async () => {
      await this.lp1.approve(this.masterChef.address, '3000', { from: alice })

      await this.masterChef.deposit(this.lp1pid, '1000', dev, { from: alice })
      const userInfo = await this.masterChef.userInfo(this.lp1pid, alice)
      expect(userInfo.amount.toString()).to.be.eq('1000')
      expect((await this.lp1.balanceOf(alice)).toString()).to.be.eq('4000')

      await this.masterChef.deposit(this.lp1pid, '2000', dev, { from: alice })
      const userInfo2 = await this.masterChef.userInfo(this.lp1pid, alice)
      expect(userInfo2.amount.toString()).to.be.eq('3000')
      expect((await this.lp1.balanceOf(alice)).toString()).to.be.eq('2000')
    })

    it('should not accept a deposit if depositer has not enough balance', async () => {
      await this.lp1.approve(this.masterChef.address, 1e10, { from: bob })
      await this.masterChef.deposit(this.lp1pid, 1e10, dev, { from: bob })
        .should.be.rejectedWith('transfer amount exceeds balance.')
      expect((await this.lp1.balanceOf(bob)).toString()).to.be.eq('5000')
    })
  })

  describe('Withdraw', () => {
    // Alice and Bob deposited tokens; Carol referred both of them
    beforeEach(async () => {
      await this.lp1.approve(this.masterChef.address, '1000', { from: alice })
      await this.masterChef.deposit(this.lp1pid, '1000', carol, { from: alice })

      await this.lp1.approve(this.masterChef.address, '300', { from: bob })
      await this.masterChef.deposit(this.lp1pid, '300', carol, { from: bob })
    })

    it('should return the tokens', async () => {
      await this.masterChef.withdraw(this.lp1pid, '200', { from: alice })
      const aliceInfo = await this.masterChef.userInfo(this.lp1pid, alice)
      expect(aliceInfo.amount.toString()).to.be.eq('800')
      expect((await this.lp1.balanceOf(alice)).toString()).to.be.eq('4200')

      await this.masterChef.withdraw(this.lp1pid, '300', { from: bob })
      const bobInfo = await this.masterChef.userInfo(this.lp1pid, bob)
      expect(bobInfo.amount.toString()).to.be.eq('0')
      expect((await this.lp1.balanceOf(bob)).toString()).to.be.eq('5000')
    })

    it('should not return more tokens than deposited', async () => {
      await this.masterChef.withdraw(this.lp1pid, '1000', { from: alice })
      await this.masterChef.withdraw(this.lp1pid, '1', { from: alice }).should.be.rejectedWith('withdraw: not good.')
      await this.masterChef.withdraw(this.lp1pid, '301', { from: bob }).should.be.rejectedWith('withdraw: not good.')
      await this.masterChef.withdraw(this.lp1pid, '1', { from: carol }).should.be.rejectedWith('withdraw: not good.')
    })

    it('should return the rewards', async () => {
      await time.increase(time.duration.days(2))
      await this.masterChef.withdraw(this.lp1pid, '0', { from: alice })
      expect((await this.lp1.balanceOf(alice)).toString()).to.be.eq('4000')
      expect((await this.token.balanceOf(alice)).toString()).to.have.length(18)
    })

    it('should pay referral commissions', async () => {
      await time.increase(time.duration.days(2))
      await this.masterChef.withdraw(this.lp1pid, '0', { from: alice })
      expect((await this.token.balanceOf(carol)).toString()).to.have.length.above(14)
    })
  })

  describe('PendingMars', () => {
    // Alice and Bob deposited tokens, but Carol didn't
    beforeEach(async () => {
      await this.lp1.approve(this.masterChef.address, '1000', { from: alice })
      await this.masterChef.deposit(this.lp1pid, '1000', dev, { from: alice })

      await this.lp1.approve(this.masterChef.address, '300', { from: bob })
      await this.masterChef.deposit(this.lp1pid, '300', dev, { from: bob })
    })

    it('should return the rewards after 2 days', async () => {
      await time.increase(time.duration.days(2))
      await this.masterChef.updatePool(this.lp1pid)
      const pendingMars = await this.masterChef.pendingMars(this.lp1pid, alice)
      expect(pendingMars.toString()).to.have.length.above(16)
    })
  })
})
