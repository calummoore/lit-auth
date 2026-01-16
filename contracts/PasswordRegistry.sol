// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PasswordRegistry
/// @notice Stores a hashed password for a username and owner address. The Lit Action
///         will read this contract to verify if a provided password is valid.
contract PasswordRegistry {
    struct Entry {
        bytes32 passwordHash;
        address owner;
    }

    mapping(string => Entry) private entries;

    event PasswordUpdated(string indexed username, address indexed owner, bytes32 passwordHash);

    /// @notice Create or update the password hash for a username.
    /// @dev If the username has never been set, msg.sender becomes the owner.
    ///      Only the recorded owner can update the hash.
    /// @param username Username key.
    /// @param passwordHash keccak256 or other hash of the password computed client-side.
    function setPasswordHash(string calldata username, bytes32 passwordHash) external {
        Entry storage entry = entries[username];

        if (entry.owner == address(0)) {
            entry.owner = msg.sender;
        } else {
            require(entry.owner == msg.sender, "PasswordRegistry: not owner");
        }

        entry.passwordHash = passwordHash;
        emit PasswordUpdated(username, entry.owner, passwordHash);
    }

    /// @notice Read the stored hash for a username.
    function getPasswordHash(string calldata username) external view returns (bytes32) {
        return entries[username].passwordHash;
    }

    /// @notice Read the recorded owner for a username.
    function getOwner(string calldata username) external view returns (address) {
        return entries[username].owner;
    }
}
