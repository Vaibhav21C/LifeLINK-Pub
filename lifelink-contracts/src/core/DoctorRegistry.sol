// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IHospitalRegistry {
    function isHospitalVerified(address _hospital) external view returns (bool);
}

contract DoctorRegistry is Ownable {

    struct Doctor {
        string name;
        string specialization;
        address hospital;
        bool isVerified;
    }

    mapping(address => Doctor) public doctors;

    IHospitalRegistry public hospitalRegistry;

    event DoctorRegistered(address indexed doctor, address indexed hospital);
    event DoctorVerified(address indexed doctor);

    constructor(address _hospitalRegistry, address initialOwner)
        Ownable(initialOwner)
    {
        hospitalRegistry = IHospitalRegistry(_hospitalRegistry);
    }

    modifier onlyVerifiedHospital(address _hospital) {
        require(
            hospitalRegistry.isHospitalVerified(_hospital),
            "Hospital not verified"
        );
        _;
    }

    function registerDoctor(
        address _doctorAddr,
        string memory _name,
        string memory _specialization,
        address _hospital
    ) external onlyOwner onlyVerifiedHospital(_hospital) {

        require(bytes(doctors[_doctorAddr].name).length == 0, "Already registered");

        doctors[_doctorAddr] = Doctor({
            name: _name,
            specialization: _specialization,
            hospital: _hospital,
            isVerified: false
        });

        emit DoctorRegistered(_doctorAddr, _hospital);
    }

    function verifyDoctor(address _doctorAddr) external onlyOwner {
        require(bytes(doctors[_doctorAddr].name).length > 0, "Doctor not registered");
        doctors[_doctorAddr].isVerified = true;

        emit DoctorVerified(_doctorAddr);
    }

    function isDoctorVerified(address _doctor) external view returns (bool) {
        return doctors[_doctor].isVerified;
    }
}