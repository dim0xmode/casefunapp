// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract CaseToken is ERC20, Ownable {
  constructor(string memory name_, string memory symbol_, address owner_) ERC20(name_, symbol_) Ownable(owner_) {}

  function mint(address to, uint256 amount) external onlyOwner {
    _mint(to, amount);
  }
}
