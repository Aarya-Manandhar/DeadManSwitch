// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DeadMansSwitch
 * @notice A decentralized dead man's switch vault.
 * @dev ERC-4337 Account Abstraction Compatible:
 *      When a user interacts via a Smart Contract Wallet (e.g., SimpleAccount),
 *      `msg.sender` equals the Smart Account address — NOT the raw EOA.
 *      This is CORRECT behavior: the Smart Account IS the user's on-chain identity.
 *      The React frontend uses the Smart Account address as the vault key.
 */
contract DeadMansSwitch {

    // ==========================================
    // EVENTS
    // ==========================================
    event VaultCreated(address indexed owner, address indexed beneficiary, uint256 timePeriod);
    event VaultUpdated(address indexed owner, uint256 timestamp);
    event CheckIn(address indexed owner, uint256 timestamp);
    event VaultClaimed(address indexed owner, address indexed beneficiary);
    event VaultDeleted(address indexed owner);


    // ==========================================
    // DATA STRUCTURES
    // ==========================================
    struct Vault {
        string ipfsCid;         // IPFS CID of the AES-GCM encrypted file blob
        string encryptedKey;    // PBKDF2-wrapped AES key (base64), stored for the beneficiary
        address beneficiary;    // Beneficiary's Smart Account address (counterfactual / CREATE2)
        uint256 timePeriod;     // Dead man's timer duration in seconds
        uint256 lastCheckIn;    // Timestamp of last check-in
        bool exists;
    }

    // Owner address => their Vault
    mapping(address => Vault) public vaults;

    // Beneficiary address => list of Owner addresses who left them a vault
    mapping(address => address[]) public vaultsIBenefitFrom;

    // ==========================================
    // 1. CREATE VAULT
    // ==========================================
    function createVault(
        string memory _ipfsCid,
        string memory _encryptedKey,
        address _beneficiary,
        uint256 _seconds
    ) public {
        require(!vaults[msg.sender].exists, "Vault already exists. Use updateVault() to modify it.");
        require(_beneficiary != address(0), "Beneficiary address cannot be zero.");
        require(_beneficiary != msg.sender, "You cannot be your own beneficiary.");
        require(_seconds > 0, "Timer must be greater than zero seconds.");

        vaults[msg.sender] = Vault({
            ipfsCid: _ipfsCid,
            encryptedKey: _encryptedKey,
            beneficiary: _beneficiary,
            timePeriod: _seconds,
            lastCheckIn: block.timestamp,
            exists: true
        });

        vaultsIBenefitFrom[_beneficiary].push(msg.sender);

        emit VaultCreated(msg.sender, _beneficiary, _seconds);
    }

    // ==========================================
    // 2. UPDATE VAULT (re-encrypt / change file)
    // ==========================================
    function updateVault(
        string memory _newIpfsCid,
        string memory _newEncryptedKey
    ) public {
        require(vaults[msg.sender].exists, "You do not have a vault to update.");

        vaults[msg.sender].ipfsCid = _newIpfsCid;
        vaults[msg.sender].encryptedKey = _newEncryptedKey;
        vaults[msg.sender].lastCheckIn = block.timestamp;

        emit VaultUpdated(msg.sender, block.timestamp);
    }

    // ==========================================
    // 2.5 DELETE VAULT
    // ==========================================
    function deleteVault() public {
        require(vaults[msg.sender].exists, "Vault does not exist.");
        address beneficiary = vaults[msg.sender].beneficiary;

        // Remove from beneficiary's list
        address[] storage list = vaultsIBenefitFrom[beneficiary];
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == msg.sender) {
                list[i] = list[list.length - 1];
                list.pop();
                break;
            }
        }

        delete vaults[msg.sender];
        emit VaultDeleted(msg.sender);
    }


    // ==========================================
    // 3. CHECK IN — "I Am Alive"
    // ==========================================
    function checkIn() public {
        require(vaults[msg.sender].exists, "You do not have a vault set up.");
        vaults[msg.sender].lastCheckIn = block.timestamp;

        emit CheckIn(msg.sender, block.timestamp);
    }

    // ==========================================
    // 4. CLAIM VAULT (Beneficiary)
    // ==========================================
    /**
     * @notice Beneficiary calls this to retrieve vault secrets after the timer expires.
     * @dev Pure view — no gas required from a paymaster for reading.
     *      AA-compatible: msg.sender must equal the stored beneficiary Smart Account address.
     */
    function claimVault(address _owner) public view returns (string memory, string memory) {
        Vault memory vault = vaults[_owner];

        require(vault.exists, "This vault does not exist.");
        require(msg.sender == vault.beneficiary, "You are not the designated beneficiary.");
        require(
            block.timestamp >= (vault.lastCheckIn + vault.timePeriod),
            "The owner is still alive. Timer has not expired yet."
        );

        return (vault.ipfsCid, vault.encryptedKey);
    }

    // ==========================================
    // 5. GET VAULTS I BENEFIT FROM
    // ==========================================
    function getAvailableVaults() public view returns (address[] memory) {
        return vaultsIBenefitFrom[msg.sender];
    }

    // ==========================================
    // 6. HELPER — Check timer expiry
    // ==========================================
    function isTimerExpired(address _owner) public view returns (bool) {
        Vault memory vault = vaults[_owner];
        if (!vault.exists) return false;
        return block.timestamp >= (vault.lastCheckIn + vault.timePeriod);
    }

    // ==========================================
    // 7. HELPER — Get remaining time in seconds
    // ==========================================
    function getTimeRemaining(address _owner) public view returns (uint256) {
        Vault memory vault = vaults[_owner];
        if (!vault.exists) return 0;
        uint256 expiry = vault.lastCheckIn + vault.timePeriod;
        if (block.timestamp >= expiry) return 0;
        return expiry - block.timestamp;
    }
}