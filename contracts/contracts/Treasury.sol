// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ICaseToken {
  function mint(address to, uint256 amount) external;
}

contract Treasury is Ownable {
  constructor(address owner_) Ownable(owner_) {}

  receive() external payable {}

  function withdraw(address payable to, uint256 amount) external onlyOwner {
    require(to != address(0), "Treasury: zero address");
    require(address(this).balance >= amount, "Treasury: insufficient ETH");
    to.transfer(amount);
  }

  function transferToken(address token, address to, uint256 amount) external onlyOwner {
    require(to != address(0), "Treasury: zero address");
    IERC20(token).transfer(to, amount);
  }

  function mintToken(address token, address to, uint256 amount) external onlyOwner {
    require(to != address(0), "Treasury: zero address");
    ICaseToken(token).mint(to, amount);
  }
}
