// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DeadMansSwitch
 * @notice A decentralized dead man's switch vault.
 * @dev The frontend prototype can derive a counterfactual account address, but
 *      it does not implement ERC-4337 UserOperations. State-changing calls use
 *      a connected wallet directly.
 */
contract DeadMansSwitch {


    // EVENTS
  
    event VaultCreated(address indexed owner, address indexed beneficiary, uint256 timePeriod);
    event VaultUpdated(address indexed owner, uint256 timestamp);
    event CheckIn(address indexed owner, uint256 timestamp);
    event VaultDeleted(address indexed owner);


  
    // DATA STRUCTURES

    struct Vault {
        string ipfsCid;         // IPFS CID of the AES-GCM encrypted file blob
        string encryptedKey;    // Password-wrapped random AES data key (base64)
        address beneficiary;    // Beneficiary's Smart Account address (counterfactual / CREATE2)
        uint256 timePeriod;     // Dead man's timer duration in seconds
        uint256 lastCheckIn;    // Timestamp of last check-in
        bool exists;
    }

    // Owner address => their Vault
    mapping(address => Vault) public vaults;

    // Beneficiary address => list of Owner addresses who left them a vault
    mapping(address => address[]) public vaultsIBenefitFrom;

    // 1. CREATE VAULT
 
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

    // 2. UPDATE VAULT (re-encrypt / change file)

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

   
    // 2.5 DELETE VAULT
 
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


    // 3. CHECK IN — "I Am Alive"
  
    function checkIn() public {
        require(vaults[msg.sender].exists, "You do not have a vault set up.");
        vaults[msg.sender].lastCheckIn = block.timestamp;

        emit CheckIn(msg.sender, block.timestamp);
    }

    
    // 4. CLAIM VAULT (Beneficiary)
    
    /**
     * @notice Beneficiary calls this to retrieve vault secrets after the timer expires.
     * @dev Read-only claim gate. It checks the caller and timer when requested;
     *      it does not make this public mapping cryptographically confidential.
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

   
    // 5. GET VAULTS I BENEFIT FROM

    function getAvailableVaults() public view returns (address[] memory) {
        return vaultsIBenefitFrom[msg.sender];
    }

  
    // 6. HELPER — Check timer expiry
  
    function isTimerExpired(address _owner) public view returns (bool) {
        Vault memory vault = vaults[_owner];
        if (!vault.exists) return false;
        return block.timestamp >= (vault.lastCheckIn + vault.timePeriod);
    }

    // 7. HELPER — Get remaining time in seconds

    function getTimeRemaining(address _owner) public view returns (uint256) {
        Vault memory vault = vaults[_owner];
        if (!vault.exists) return 0;
        uint256 expiry = vault.lastCheckIn + vault.timePeriod;
        if (block.timestamp >= expiry) return 0;
        return expiry - block.timestamp;
    }
}
