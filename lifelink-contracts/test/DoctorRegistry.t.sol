// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/core/HospitalRegistry.sol";
import "../src/core/DoctorRegistry.sol";

contract DoctorRegistryTest is Test {

    HospitalRegistry hospitalRegistry;
    DoctorRegistry doctorRegistry;

    address owner = address(1);
    address hospital = address(2);
    address doctor = address(3);

    function setUp() public {
        vm.startPrank(owner);

        hospitalRegistry = new HospitalRegistry(owner);

        hospitalRegistry.registerHospital(
            hospital,
            "AIIMS",
            "Delhi",
            true
        );

        hospitalRegistry.verifyHospital(hospital);

        doctorRegistry = new DoctorRegistry(
            address(hospitalRegistry),
            owner
        );

        vm.stopPrank();
    }

    function testRegisterDoctor() public {
        vm.prank(owner);

        doctorRegistry.registerDoctor(
            doctor,
            "Dr. Strange",
            "Neurosurgery",
            hospital
        );

        (string memory name,, address linkedHospital, bool verified) =
            doctorRegistry.doctors(doctor);

        assertEq(name, "Dr. Strange");
        assertEq(linkedHospital, hospital);
        assertFalse(verified);
    }

    function testVerifyDoctor() public {
        vm.startPrank(owner);

        doctorRegistry.registerDoctor(
            doctor,
            "Dr. Strange",
            "Neurosurgery",
            hospital
        );

        doctorRegistry.verifyDoctor(doctor);
        vm.stopPrank();

        bool verified = doctorRegistry.isDoctorVerified(doctor);
        assertTrue(verified);
    }

    function test_RevertIfHospitalNotVerified() public {
    address fakeHospital = address(99);

    vm.prank(owner);

    vm.expectRevert("Hospital not verified");

    doctorRegistry.registerDoctor(
        doctor,
        "Fake Doctor",
        "Unknown",
        fakeHospital
    );
}
    
}