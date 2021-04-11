const MarsToken = artifacts.require('MarsToken')

const EVM_REVERT = 'VM Exception while processing transaction: revert'

require('chai')
  .use(require('chai-as-promised'))
  .should()

contract('MarsToken', ([deployer, user, masterPlanet]) => {
  beforeEach(async () => {
    this.token = await MarsToken.new()
    await this.token.transferOwnership(masterPlanet)
  })

  it('should define the token name', async () => {
    expect(await this.token.name()).to.be.eq('MARS Token')
  })

  it('should define the token symbol', async () => {
    expect(await this.token.symbol()).to.be.eq('MARS')
  })

  it('should define the token total supply', async () => {
    expect((await this.token.totalSupply()).toString()).to.eq('0')
    await this.token.mint(user, 10000, { from: masterPlanet })
    expect((await this.token.totalSupply()).toString()).to.eq('10000')
  })

  describe('Mint', () => {
    it('should be allowed to the token owner (MasterPlanet)', async () => {
      await this.token.mint(user, 100000, { from: masterPlanet })
      expect((await this.token.totalSupply()).toString()).to.eq('100000')
      expect((await this.token.balanceOf(user)).toString()).to.be.eq('100000')
    })

    it('should not be allowed to the deployer', async () => {
      await this.token.mint(user, 100000, { from: deployer }).should.be.rejectedWith(EVM_REVERT)
      expect((await this.token.balanceOf(user)).toString()).to.be.eq('0')
    })

    it('should not be allowed to a non-owner', async () => {
      await this.token.mint(user, 100000, { from: user }).should.be.rejectedWith(EVM_REVERT)
      expect((await this.token.balanceOf(user)).toString()).to.be.eq('0')
    })
  })
})
