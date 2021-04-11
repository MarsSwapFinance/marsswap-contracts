const EVM_REVERT = 'VM Exception while processing transaction: revert';

const MAINNET_ADDR = {
	chainId: 56,
	factory: '0xBCfCcbde45cE874adCB698cC183deBcF17952812',
	router: '0x05ff2b0db69458a0750badebc4f9e13add608c7f',
	busd: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
	bnb: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
	mamzn: '0x3947B992DC0147D2D89dF0392213781b04B25075',
	mqqq: '0x1Cb4183Ac708e07511Ac57a2E45A835F048D7C56',
};

const TESTNET_ADDR = {
	chainId: 97,
	factory: '0x6725F303b657a9451d8BA641348b6761A6CC7a17',
	router: '0xD99D1c33F9fC3444f8101754aBC46c52416550D1',
	busd: '0xed24fc36d5ee211ea25a80239fb8c4cfd80f12ee',
	bnb: '0xae13d989dac2f0debff460ac112a837c89baa7cd',
	mamzn: '0xfBC94545AD2ff3F7B009258FB43F2EAb46744767',
	mqqq: '0x1Ad3354B2E7C0F7D5A370a03CAf439DD345437a9',
};

const Token = artifacts.require("MarsToken");
const MasterChefV2 = artifacts.require('MasterChefV2');
const factoryAbi = require('./abi/factoryAbi.js');


require('chai')
  .use(require('chai-as-promised'))
  .should()


contract("MarsToken", ([deployer, user, network]) => {
    let tokenInstance;

    beforeEach(async () => {
      token = await Token.deployed();
      masterChef = await MasterChefV2.deployed();    
      tokenNew = await Token.new();
      const addr = network === 'testnet' ? TESTNET_ADDR : MAINNET_ADDR
      const factorycontract = new web3.eth.Contract(factoryAbi, addr.factory);
    });


    describe('testing init token contract...', () => {

      describe('success', () => {
        it('checking token name', async () => {
          expect(await token.name()).to.be.eq('MARS Token');
        });
        it('checking token symbol', async () => {
          expect(await token.symbol()).to.be.eq('MARS');
        });
        it('checking token (initial) total supply', async () => {
          expect(Number(await tokenNew.totalSupply())).to.eq(0);
        });
        it('checking token (real) total supply', async () => {
          expect(Number(await token.totalSupply())).to.eq(100000000000000000000000);
        });        
      });
    });


    describe('testing initial minting...', () => {

      describe('failure', () => {
        it('minting should be rejected. owner is masterchef', async () =>{      
          await token.mint('100000000000000000000000').should.be.rejectedWith(EVM_REVERT); //wrong user
        });
      });

      describe('success', () => {
        it('checking initial (100k) minting', async () => {
          const deployerbalance = await token.balanceOf(deployer);
          expect(deployerbalance.toString()).to.be.eq('100000000000000000000000');
        });
      });
    });

    //describe('injecting liq into PCS...', () => {
    //});

    
      


});