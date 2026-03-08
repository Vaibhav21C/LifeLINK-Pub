// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

import "../src/core/HospitalRegistry.sol";
import "../src/core/DoctorRegistry.sol";
import "../src/access/ConsentManager.sol";
import "../src/records/MedicalRecords.sol";
import "../src/finance/InsuranceEscrow.sol";

contract SimulateFlow is Script {

    struct Actors {
        uint256 deployerKey;
        uint256 hospitalKey;
        uint256 doctorKey;
        uint256 patientKey;
        uint256 insuranceKey;

        address deployer;
        address hospital;
        address doctor;
        address patient;
        address insurance;
    }

    struct Contracts {
        HospitalRegistry hospitalRegistry;
        DoctorRegistry doctorRegistry;
        ConsentManager consentManager;
        InsuranceEscrow escrow;
        MedicalRecords records;
    }

    function run() external {

        Actors memory a = loadActors();
        Contracts memory c = deployContracts(a);

        setupHospitalAndDoctor(a, c);
        executeMedicalFlow(a, c);
    }

    function loadActors() internal view returns (Actors memory a) {
        a.deployerKey  = vm.envUint("PRIVATE_KEY");
        a.hospitalKey  = vm.envUint("HOSPITAL_KEY");
        a.doctorKey    = vm.envUint("DOCTOR_KEY");
        a.patientKey   = vm.envUint("PATIENT_KEY");
        a.insuranceKey = vm.envUint("INSURANCE_KEY");

        a.deployer  = vm.addr(a.deployerKey);
        a.hospital  = vm.addr(a.hospitalKey);
        a.doctor    = vm.addr(a.doctorKey);
        a.patient   = vm.addr(a.patientKey);
        a.insurance = vm.addr(a.insuranceKey);
    }

    function deployContracts(Actors memory a)
        internal
        returns (Contracts memory c)
    {
        vm.startBroadcast(a.deployerKey);

        c.hospitalRegistry = new HospitalRegistry(a.deployer);

        c.doctorRegistry =
            new DoctorRegistry(address(c.hospitalRegistry), a.deployer);

        c.consentManager = new ConsentManager(a.deployer);

        c.escrow = new InsuranceEscrow(a.deployer);

        c.records = new MedicalRecords(
            address(c.consentManager),
            address(c.doctorRegistry),
            a.deployer
        );

        vm.stopBroadcast();
    }

    function setupHospitalAndDoctor(
        Actors memory a,
        Contracts memory c
    ) internal {

        vm.startBroadcast(a.deployerKey);

        c.hospitalRegistry.registerHospital(
            a.hospital,
            "AIIMS",
            "Delhi",
            true
        );

        c.hospitalRegistry.verifyHospital(a.hospital);

        c.doctorRegistry.registerDoctor(
            a.doctor,
            "Dr Strange",
            "Neuro",
            a.hospital
        );

        c.doctorRegistry.verifyDoctor(a.doctor);

        vm.stopBroadcast();
    }

    function executeMedicalFlow(
        Actors memory a,
        Contracts memory c
    ) internal {

        vm.startBroadcast(a.patientKey);
        c.consentManager.grantAccess(a.doctor);
        vm.stopBroadcast();

        vm.startBroadcast(a.doctorKey);
        c.records.addRecord(
            a.patient,
            "XRay",
            "QmExampleHash"
        );
        vm.stopBroadcast();

        vm.startBroadcast(a.patientKey);
        uint256 escrowId =
            c.escrow.lockFunds{value: 1 ether}(a.hospital, a.insurance);
        vm.stopBroadcast();

        vm.startBroadcast(a.hospitalKey);
        c.escrow.approveByHospital(escrowId);
        vm.stopBroadcast();

        vm.startBroadcast(a.insuranceKey);
        c.escrow.approveByInsurance(escrowId);
        vm.stopBroadcast();
    }
}