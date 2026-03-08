// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";

import "../src/core/HospitalRegistry.sol";
import "../src/core/DoctorRegistry.sol";
import "../src/access/ConsentManager.sol";
import "../src/records/MedicalRecords.sol";

contract MedicalRecordsTest is Test {

    HospitalRegistry hospitalRegistry;
    DoctorRegistry doctorRegistry;
    ConsentManager consent;
    MedicalRecords records;

    address owner = address(1);
    address hospital = address(2);
    address doctor = address(3);
    address patient = address(4);

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

        doctorRegistry.registerDoctor(
            doctor,
            "Dr. Strange",
            "Neuro",
            hospital
        );

        doctorRegistry.verifyDoctor(doctor);

        consent = new ConsentManager(owner);

        records = new MedicalRecords(
            address(consent),
            address(doctorRegistry),
            owner
        );

        vm.stopPrank();
    }

    function testAddRecordWithVerifiedDoctorAndConsent() public {

        vm.prank(patient);
        consent.grantAccess(doctor);

        vm.prank(doctor);
        records.addRecord(
            patient,
            "XRay",
            "QmHash123"
        );

        vm.prank(patient);
        MedicalRecords.Record[] memory recs =
            records.getRecords(patient);

        assertEq(recs.length, 1);
        assertEq(recs[0].recordType, "XRay");
    }

    function testRevertIfDoctorNotVerified() public {

        address fakeDoctor = address(99);

        vm.prank(patient);
        consent.grantAccess(fakeDoctor);

        vm.prank(fakeDoctor);

        vm.expectRevert("Doctor not verified");

        records.addRecord(
            patient,
            "XRay",
            "QmHash123"
        );
    }
}