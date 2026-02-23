// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GuardianRegistry
/// @notice Stores guardian recovery configuration per user address.
contract GuardianRegistry {
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant ADD_GUARDIAN_TYPEHASH =
        keccak256(
            "AddGuardian(address user,bytes32 guardianCIDHash,bytes32 authValueHash,bytes32 cipherHash,uint256 nonce,uint256 deadline)"
        );
    bytes32 private constant REMOVE_GUARDIAN_TYPEHASH =
        keccak256("RemoveGuardian(address user,bytes32 guardianCIDHash,uint256 nonce,uint256 deadline)");
    bytes32 private constant SET_THRESHOLD_TYPEHASH =
        keccak256("SetThreshold(address user,uint256 threshold,uint256 nonce,uint256 deadline)");

    struct GuardianType {
        string name;
        bool isUniqueAuthValue;
        bool exists;
    }

    struct GuardianConfig {
        uint256 threshold;
        bytes32[] guardianCIDs;
        mapping(bytes32 => bytes32) guardianEntries;
        mapping(bytes32 => uint256) guardianIndex;
        bytes32 cipherHash;
    }

    mapping(address => GuardianConfig) private guardianConfigs;
    mapping(bytes32 => address) private authToAddress;
    mapping(address => uint256) public nonces;
    mapping(bytes32 => GuardianType) private guardianTypes;

    address public owner;

    event GuardianAdded(address indexed user, bytes32 indexed guardianCIDHash, bytes32 authValueHash);
    event CipherHashSet(address indexed user, bytes32 cipherHash);
    event GuardianRemoved(address indexed user, bytes32 indexed guardianCIDHash);
    event ThresholdUpdated(address indexed user, uint256 threshold);
    event GuardianTypeSet(bytes32 indexed guardianCIDHash, string name, bool isUniqueAuthValue);
    event OwnerUpdated(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "GuardianRegistry: not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnerUpdated(address(0), msg.sender);
    }

    function setOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "GuardianRegistry: invalid owner");
        emit OwnerUpdated(owner, newOwner);
        owner = newOwner;
    }

    function addGuardian(bytes32 guardianCIDHash, bytes32 authValueHash, bytes32 cipherHash) external {
        _addGuardian(msg.sender, guardianCIDHash, authValueHash, cipherHash);
    }

    function addGuardianWithSig(
        address user,
        bytes32 guardianCIDHash,
        bytes32 authValueHash,
        bytes32 cipherHash,
        uint256 nonce,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        _requireValidSig(
            user,
            _hashAddGuardian(user, guardianCIDHash, authValueHash, cipherHash, nonce, deadline),
            nonce,
            deadline,
            v,
            r,
            s
        );
        _addGuardian(user, guardianCIDHash, authValueHash, cipherHash);
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

    function setThreshold(uint256 threshold) external {
        _setThreshold(msg.sender, threshold);
    }

    function setThresholdWithSig(
        address user,
        uint256 threshold,
        uint256 nonce,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        _requireValidSig(
            user,
            _hashSetThreshold(user, threshold, nonce, deadline),
            nonce,
            deadline,
            v,
            r,
            s
        );
        _setThreshold(user, threshold);
    }

    function getGuardianConfig(address user)
        external
        view
        returns (uint256 threshold, bytes32[] memory guardianCIDs, bytes32 cipherHash)
    {
        GuardianConfig storage config = guardianConfigs[user];
        return (config.threshold, config.guardianCIDs, config.cipherHash);
    }

    function getGuardianCIDs(address user) external view returns (bytes32[] memory) {
        return guardianConfigs[user].guardianCIDs;
    }

    function getGuardianEntry(address user, bytes32 guardianCIDHash) external view returns (bytes32) {
        return guardianConfigs[user].guardianEntries[guardianCIDHash];
    }

    function getCipherHash(address user) external view returns (bytes32) {
        return guardianConfigs[user].cipherHash;
    }

    function getAuthOwner(bytes32 authHash) external view returns (address) {
        return authToAddress[authHash];
    }

    function getThreshold(address user) external view returns (uint256) {
        return guardianConfigs[user].threshold;
    }

    function setGuardianType(
        bytes32 guardianCIDHash,
        string calldata name,
        bool isUniqueAuthValue
    ) external onlyOwner {
        require(guardianCIDHash != bytes32(0), "GuardianRegistry: invalid CID hash");
        guardianTypes[guardianCIDHash] = GuardianType({
            name: name,
            isUniqueAuthValue: isUniqueAuthValue,
            exists: true
        });
        emit GuardianTypeSet(guardianCIDHash, name, isUniqueAuthValue);
    }

    function getGuardianType(bytes32 guardianCIDHash)
        external
        view
        returns (string memory name, bool isUniqueAuthValue, bool exists)
    {
        GuardianType storage gType = guardianTypes[guardianCIDHash];
        return (gType.name, gType.isUniqueAuthValue, gType.exists);
    }

    function _authHash(bytes32 guardianCIDHash, bytes32 authValueHash)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(guardianCIDHash, authValueHash));
    }

    function _updateThreshold(GuardianConfig storage config, address user) internal {
        uint256 n = config.guardianCIDs.length;
        uint256 nextThreshold = n <= 1 ? n : (n + 1) / 2;
        config.threshold = nextThreshold;
        emit ThresholdUpdated(user, nextThreshold);
    }

    function _setThreshold(address user, uint256 threshold) internal {
        GuardianConfig storage config = guardianConfigs[user];
        uint256 n = config.guardianCIDs.length;
        if (n == 0) {
            require(threshold == 0, "GuardianRegistry: invalid threshold");
        } else {
            require(threshold > 0 && threshold <= n, "GuardianRegistry: invalid threshold");
        }
        config.threshold = threshold;
        emit ThresholdUpdated(user, threshold);
    }

    function _addGuardian(
        address user,
        bytes32 guardianCIDHash,
        bytes32 authValueHash,
        bytes32 cipherHash
    ) internal {
        require(guardianCIDHash != bytes32(0), "GuardianRegistry: invalid CID hash");
        require(authValueHash != bytes32(0), "GuardianRegistry: invalid auth hash");
        require(cipherHash != bytes32(0), "GuardianRegistry: invalid cipher hash");
        GuardianConfig storage config = guardianConfigs[user];
        require(config.guardianIndex[guardianCIDHash] == 0, "GuardianRegistry: guardian exists");

        if (config.cipherHash == bytes32(0)) {
            config.cipherHash = cipherHash;
            emit CipherHashSet(user, cipherHash);
        } else {
            require(config.cipherHash == cipherHash, "GuardianRegistry: cipher hash mismatch");
        }

        config.guardianCIDs.push(guardianCIDHash);
        config.guardianIndex[guardianCIDHash] = config.guardianCIDs.length;
        config.guardianEntries[guardianCIDHash] = authValueHash;
        bytes32 authHash = _authHash(guardianCIDHash, authValueHash);

        GuardianType storage gType = guardianTypes[guardianCIDHash];
        if (gType.isUniqueAuthValue) {
            require(
                authToAddress[authHash] == address(0),
                "GuardianRegistry: auth already used"
            );
            authToAddress[authHash] = user;
        }

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
            bytes32 authHash = _authHash(guardianCIDHash, authValueHash);
            delete authToAddress[authHash];
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
        bytes32 cipherHash,
        uint256 nonce,
        uint256 deadline
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                ADD_GUARDIAN_TYPEHASH,
                user,
                guardianCIDHash,
                authValueHash,
                cipherHash,
                nonce,
                deadline
            )
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

    function _hashSetThreshold(
        address user,
        uint256 threshold,
        uint256 nonce,
        uint256 deadline
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(SET_THRESHOLD_TYPEHASH, user, threshold, nonce, deadline));
    }
}
