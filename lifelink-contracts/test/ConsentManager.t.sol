// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/access/ConsentManager.sol";

contract ConsentManagerTest is Test {

    ConsentManager consent;

    address owner = address(1);
    address patient = address(2);
    address doctor = address(3);

    function setUp() public {
        vm.prank(owner);
        consent = new ConsentManager(owner);
    }

    function testGrantAccess() public {
        vm.prank(patient);
        consent.grantAccess(doctor);

        bool access = consent.hasAccess(patient, doctor);
        assertTrue(access);
    }

    function testRevokeAccess() public {
        vm.prank(patient);
        consent.grantAccess(doctor);

        vm.prank(patient);
        consent.revokeAccess(doctor);

        bool access = consent.hasAccess(patient, doctor);
        assertFalse(access);
    }

    function testEmergencyAccess() public {
        vm.prank(owner);
        consent.grantEmergencyAccess(patient, doctor, 1 hours);

        bool access = consent.hasAccess(patient, doctor);
        assertTrue(access);

        // Move time forward
        vm.warp(block.timestamp + 2 hours);

        access = consent.hasAccess(patient, doctor);
        assertFalse(access);
    }
}