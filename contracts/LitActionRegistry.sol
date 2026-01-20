// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title LitActionRegistry
/// @notice Stores the active child Lit Action IPFS CID.
contract LitActionRegistry {
    string private childIPFSCID;
    address public owner;

    event ChildIPFSCIDUpdated(string cid);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(string memory initialCID) {
        owner = msg.sender;
        childIPFSCID = initialCID;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "LitActionRegistry: not owner");
        _;
    }

    function setChildIPFSCID(string calldata cid) external onlyOwner {
        childIPFSCID = cid;
        emit ChildIPFSCIDUpdated(cid);
    }

    function getChildIPFSCID() external view returns (string memory) {
        return childIPFSCID;
    }

    function transferOwnership(address nextOwner) external onlyOwner {
        require(nextOwner != address(0), "LitActionRegistry: zero owner");
        emit OwnershipTransferred(owner, nextOwner);
        owner = nextOwner;
    }
}
