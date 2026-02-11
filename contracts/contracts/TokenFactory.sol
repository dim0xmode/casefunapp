// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CaseToken } from "./CaseToken.sol";

contract TokenFactory is Ownable {
  address public treasury;

  event TokenDeployed(address indexed token, string name, string symbol);

  constructor(address owner_, address treasury_) Ownable(owner_) {
    treasury = treasury_;
  }

  function setTreasury(address nextTreasury) external onlyOwner {
    require(nextTreasury != address(0), "TokenFactory: zero address");
    treasury = nextTreasury;
  }

  function createToken(string memory name_, string memory symbol_) external onlyOwner returns (address) {
    require(treasury != address(0), "TokenFactory: treasury not set");
    CaseToken token = new CaseToken(name_, symbol_, treasury);
    emit TokenDeployed(address(token), name_, symbol_);
    return address(token);
  }
}
