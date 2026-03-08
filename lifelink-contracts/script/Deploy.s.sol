// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

import "../src/core/HospitalRegistry.sol";
import "../src/core/DoctorRegistry.sol";
import "../src/access/ConsentManager.sol";
import "../src/finance/InsuranceEscrow.sol";
import "../src/records/MedicalRecords.sol";

contract Deploy is Script {

    function run() external {

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy HospitalRegistry
        HospitalRegistry hospitalRegistry =
            new HospitalRegistry(msg.sender);

        // Deploy DoctorRegistry
        DoctorRegistry doctorRegistry =
            new DoctorRegistry(
                address(hospitalRegistry),
                msg.sender
            );

        // Deploy ConsentManager
        ConsentManager consentManager =
            new ConsentManager(msg.sender);

        // Deploy InsuranceEscrow
        InsuranceEscrow escrow =
            new InsuranceEscrow(msg.sender);

        // Deploy MedicalRecords
        MedicalRecords records =
            new MedicalRecords(
                address(consentManager),
                address(doctorRegistry),
                msg.sender
            );

        vm.stopBroadcast();
    }
}