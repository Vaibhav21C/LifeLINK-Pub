// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract ConsentManager is Ownable {

    mapping(address => mapping(address => bool)) public doctorAccess;
    mapping(address => mapping(address => uint256)) public emergencyAccessUntil;

    event AccessGranted(address indexed patient, address indexed doctor);
    event AccessRevoked(address indexed patient, address indexed doctor);
    event EmergencyAccessGranted(address indexed patient, address indexed doctor, uint256 expiresAt);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function grantAccess(address _doctor) external {
        doctorAccess[msg.sender][_doctor] = true;
        emit AccessGranted(msg.sender, _doctor);
    }

    function revokeAccess(address _doctor) external {
        doctorAccess[msg.sender][_doctor] = false;
        emit AccessRevoked(msg.sender, _doctor);
    }

    function grantEmergencyAccess(address _patient, address _doctor, uint256 duration)
        external
        onlyOwner
    {
        uint256 expiresAt = block.timestamp + duration;

        emergencyAccessUntil[_patient][_doctor] = expiresAt;

        emit EmergencyAccessGranted(_patient, _doctor, expiresAt);
    }

    function hasAccess(address _patient, address _doctor)
        public
        view
        returns (bool)
    {
        if (doctorAccess[_patient][_doctor]) {
            return true;
        }

        if (emergencyAccessUntil[_patient][_doctor] > block.timestamp) {
            return true;
        }

        return false;
    }
}