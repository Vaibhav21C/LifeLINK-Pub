// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IConsentManager {
    function hasAccess(address _patient, address _doctor)
        external
        view
        returns (bool);
}

interface IDoctorRegistry {
    function isDoctorVerified(address _doctor)
        external
        view
        returns (bool);
}

contract MedicalRecords is Ownable {

    struct Record {
        uint256 recordId;
        address doctor;
        address patient;
        string recordType;
        string ipfsHash;
        uint256 timestamp;
        uint256 version;
    }

    uint256 public recordCounter;

    mapping(address => Record[]) private recordsByPatient;
    mapping(address => mapping(string => uint256)) public versionByType;

    IConsentManager public consentManager;
    IDoctorRegistry public doctorRegistry;

    event RecordAdded(
        uint256 indexed recordId,
        address indexed patient,
        address indexed doctor,
        string recordType,
        string ipfsHash
    );

    constructor(
        address _consentManager,
        address _doctorRegistry,
        address initialOwner
    )
        Ownable(initialOwner)
    {
        consentManager = IConsentManager(_consentManager);
        doctorRegistry = IDoctorRegistry(_doctorRegistry);
    }

    function addRecord(
        address _patient,
        string memory _recordType,
        string memory _ipfsHash
    )
        external
    {
        require(
            doctorRegistry.isDoctorVerified(msg.sender),
            "Doctor not verified"
        );

        require(
            consentManager.hasAccess(_patient, msg.sender),
            "Access denied"
        );

        recordCounter++;
        uint256 newVersion = ++versionByType[_patient][_recordType];

        recordsByPatient[_patient].push(
            Record({
                recordId: recordCounter,
                doctor: msg.sender,
                patient: _patient,
                recordType: _recordType,
                ipfsHash: _ipfsHash,
                timestamp: block.timestamp,
                version: newVersion
            })
        );

        emit RecordAdded(
            recordCounter,
            _patient,
            msg.sender,
            _recordType,
            _ipfsHash
        );
    }

    function getRecords(address _patient)
        external
        view
        returns (Record[] memory)
    {
        require(
            msg.sender == _patient ||
            consentManager.hasAccess(_patient, msg.sender),
            "Access denied"
        );

        return recordsByPatient[_patient];
    }
}