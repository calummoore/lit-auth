// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GuardianRegistry
/// @notice Stores guardian recovery configuration per user address.
contract GuardianRegistry {
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant ADD_GUARDIAN_TYPEHASH =
        keccak256(
            "AddGuardian(address user,bytes32 guardianCIDHash,bytes32 authValueHash,uint256 nonce,uint256 deadline)"
        );
    bytes32 private constant REMOVE_GUARDIAN_TYPEHASH =
        keccak256("RemoveGuardian(address user,bytes32 guardianCIDHash,uint256 nonce,uint256 deadline)");

    struct GuardianConfig {
        uint256 threshold;
        bytes32[] guardianCIDs;
        mapping(bytes32 => bytes32) guardianEntries;
        mapping(bytes32 => uint256) guardianIndex;
    }

    mapping(address => GuardianConfig) private guardianConfigs;
    mapping(bytes32 => address) private authValueToAddress;
    mapping(address => uint256) public nonces;

    event GuardianAdded(address indexed user, bytes32 indexed guardianCIDHash, bytes32 authValueHash);
    event GuardianRemoved(address indexed user, bytes32 indexed guardianCIDHash);
    event ThresholdUpdated(address indexed user, uint256 threshold);

    function addGuardian(bytes32 guardianCIDHash, bytes32 authValueHash) external {
        _addGuardian(msg.sender, guardianCIDHash, authValueHash);
    }

    function addGuardianWithSig(
        address user,
        bytes32 guardianCIDHash,
        bytes32 authValueHash,
        uint256 nonce,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        _requireValidSig(
            user,
            _hashAddGuardian(user, guardianCIDHash, authValueHash, nonce, deadline),
            nonce,
            deadline,
            v,
            r,
            s
        );
        _addGuardian(user, guardianCIDHash, authValueHash);
    }

    function removeGuardian(bytes32 guardianCIDHash) external {
        _removeGuardian(msg.sender, guardianCIDHash);
    }

    function removeGuardianWithSig(
        address user,
        bytes32 guardianCIDHash,
        uint256 nonce,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        _requireValidSig(
            user,
            _hashRemoveGuardian(user, guardianCIDHash, nonce, deadline),
            nonce,
            deadline,
            v,
            r,
            s
        );
        _removeGuardian(user, guardianCIDHash);
    }

    function getGuardianConfig(address user)
        external
        view
        returns (uint256 threshold, bytes32[] memory guardianCIDs)
    {
        GuardianConfig storage config = guardianConfigs[user];
        return (config.threshold, config.guardianCIDs);
    }

    function getGuardianCIDs(address user) external view returns (bytes32[] memory) {
        return guardianConfigs[user].guardianCIDs;
    }

    function getGuardianEntry(address user, bytes32 guardianCIDHash) external view returns (bytes32) {
        return guardianConfigs[user].guardianEntries[guardianCIDHash];
    }

    function getAuthValueOwner(bytes32 authValueHash) external view returns (address) {
        return authValueToAddress[authValueHash];
    }

    function getThreshold(address user) external view returns (uint256) {
        return guardianConfigs[user].threshold;
    }

    function _updateThreshold(GuardianConfig storage config, address user) internal {
        uint256 n = config.guardianCIDs.length;
        uint256 nextThreshold = n <= 1 ? n : (n + 1) / 2;
        config.threshold = nextThreshold;
        emit ThresholdUpdated(user, nextThreshold);
    }

    function _addGuardian(address user, bytes32 guardianCIDHash, bytes32 authValueHash) internal {
        require(guardianCIDHash != bytes32(0), "GuardianRegistry: invalid CID hash");
        require(authValueHash != bytes32(0), "GuardianRegistry: invalid auth hash");
        GuardianConfig storage config = guardianConfigs[user];
        require(config.guardianIndex[guardianCIDHash] == 0, "GuardianRegistry: guardian exists");

        config.guardianCIDs.push(guardianCIDHash);
        config.guardianIndex[guardianCIDHash] = config.guardianCIDs.length;
        config.guardianEntries[guardianCIDHash] = authValueHash;

        authValueToAddress[authValueHash] = user;

        _updateThreshold(config, user);
        emit GuardianAdded(user, guardianCIDHash, authValueHash);
    }

    function _removeGuardian(address user, bytes32 guardianCIDHash) internal {
        GuardianConfig storage config = guardianConfigs[user];
        uint256 idxPlusOne = config.guardianIndex[guardianCIDHash];
        require(idxPlusOne != 0, "GuardianRegistry: guardian missing");

        uint256 idx = idxPlusOne - 1;
        uint256 lastIdx = config.guardianCIDs.length - 1;
        if (idx != lastIdx) {
            bytes32 lastCid = config.guardianCIDs[lastIdx];
            config.guardianCIDs[idx] = lastCid;
            config.guardianIndex[lastCid] = idx + 1;
        }
        config.guardianCIDs.pop();
        delete config.guardianIndex[guardianCIDHash];

        bytes32 authValueHash = config.guardianEntries[guardianCIDHash];
        delete config.guardianEntries[guardianCIDHash];
        if (authValueHash != bytes32(0)) {
            delete authValueToAddress[authValueHash];
        }

        _updateThreshold(config, user);
        emit GuardianRemoved(user, guardianCIDHash);
    }

    function _requireValidSig(
        address user,
        bytes32 structHash,
        uint256 nonce,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal {
        require(user != address(0), "GuardianRegistry: invalid user");
        require(nonce == nonces[user], "GuardianRegistry: invalid nonce");
        if (deadline != 0) {
            require(block.timestamp <= deadline, "GuardianRegistry: signature expired");
        }
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        address recovered = ecrecover(digest, v, r, s);
        require(recovered != address(0) && recovered == user, "GuardianRegistry: invalid signature");
        nonces[user] = nonce + 1;
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("GuardianRegistry")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function _hashAddGuardian(
        address user,
        bytes32 guardianCIDHash,
        bytes32 authValueHash,
        uint256 nonce,
        uint256 deadline
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(ADD_GUARDIAN_TYPEHASH, user, guardianCIDHash, authValueHash, nonce, deadline)
        );
    }

    function _hashRemoveGuardian(
        address user,
        bytes32 guardianCIDHash,
        uint256 nonce,
        uint256 deadline
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(REMOVE_GUARDIAN_TYPEHASH, user, guardianCIDHash, nonce, deadline)
        );
    }
}
